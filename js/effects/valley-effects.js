/**
 * Valley — a procedural painterly landscape behind the dashboard.
 *
 * The renderer is deliberately decorative: Tezos data remains accessible DOM
 * content. Existing app events only tune bounded atmospheric targets, and the
 * scene never starts its own network request.
 */

const CANVAS_ID = 'valley-background-canvas';
// The scenery is intentionally soft and painterly, so a 1x decorative raster
// preserves the look while keeping high-DPI displays from multiplying the
// full-viewport paint cost. All readable dashboard content remains DOM-native.
const DPR_CAP = 1;
const FRAME_INTERVAL_MS = 1000 / 30;
const GRASS_DENSITY_MULTIPLIER = 3;
const GRASS_SWAY_DISTANCE_BASE = 0.08;
const GRASS_SWAY_DISTANCE_WIND = 0.25;
const GRASS_WAVE_SPEED_BASE = 0.9;
const GRASS_WAVE_SPEED_WIND = 0.75;
const TREE_SWAY_RATIO = 0.2;
const EXTRA_GRASS_SEED_SALT = 0x9E3779B9;
const TAU = Math.PI * 2;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + ((to - from) * amount);
const finite = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

function normalize(value, min, max) {
    if (!Number.isFinite(value) || max <= min) return null;
    return clamp((value - min) / (max - min));
}

function normalizeLog(value, min, max) {
    if (!Number.isFinite(value) || value < 0) return null;
    const safeMin = Math.log10(Math.max(1, min));
    const safeMax = Math.log10(Math.max(min + 1, max));
    return clamp((Math.log10(Math.max(1, value)) - safeMin) / (safeMax - safeMin));
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function roundedPolygon(ctx, points) {
    if (!points.length) return;
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        ctx.quadraticCurveTo(
            current[0],
            current[1],
            (current[0] + next[0]) / 2,
            (current[1] + next[1]) / 2
        );
    }
    ctx.closePath();
}

class ValleyEffect {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.started = false;
        this.animationId = null;
        this.resizeAnimationId = null;
        this.lastPaint = 0;
        this.sceneTime = 0;
        this.frameCount = 0;
        this.blockImpulses = 0;
        this.blockImpulse = 0;
        this.blockOrigin = 0.5;
        this.statsRevision = 0;
        this.width = 0;
        this.height = 0;
        this.dpr = 1;
        this.grass = [];
        this.grassCandidateCount = 0;
        this.pathwayPath = null;
        this.trees = [];
        this.clouds = [];
        this.seeds = [];
        this.paused = true;
        this.contextLost = false;

        this.targets = {
            energy: 0.38,
            wind: 0.42,
            cycle: 0.45,
            stake: 0.45
        };
        this.current = { ...this.targets };

        this.handleResize = this.handleResize.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleStatsUpdated = this.handleStatsUpdated.bind(this);
        this.handleBlockPulse = this.handleBlockPulse.bind(this);
        this.handleContextLost = this.handleContextLost.bind(this);
        this.handleContextRestored = this.handleContextRestored.bind(this);
        this.animate = this.animate.bind(this);
    }

    start() {
        if (this.started) return this;

        document.getElementById(CANVAS_ID)?.remove();

        const canvas = document.createElement('canvas');
        canvas.id = CANVAS_ID;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.setAttribute('role', 'presentation');
        canvas.style.position = 'fixed';
        canvas.style.inset = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '-2';
        canvas.style.opacity = '0.96';
        canvas.style.pointerEvents = 'none';
        canvas.style.contain = 'strict';

        let context = null;
        try {
            context = canvas.getContext('2d', { alpha: false, desynchronized: true });
        } catch (_error) {
            context = null;
        }
        if (!context) {
            canvas.remove();
            return this;
        }

        this.canvas = canvas;
        this.ctx = context;
        this.started = true;
        document.body.prepend(canvas);

        window.addEventListener('resize', this.handleResize, { passive: true });
        window.addEventListener('stats-updated', this.handleStatsUpdated);
        window.addEventListener('block-pulse', this.handleBlockPulse);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        canvas.addEventListener('contextlost', this.handleContextLost);
        canvas.addEventListener('contextrestored', this.handleContextRestored);

        this.resize();
        this.drawScene(0, true);
        this.updateDebugState();

        if (document.visibilityState === 'visible') {
            this.resume();
        }
        return this;
    }

    stop() {
        this.started = false;
        this.pause();
        if (this.resizeAnimationId !== null) {
            cancelAnimationFrame(this.resizeAnimationId);
            this.resizeAnimationId = null;
        }

        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('stats-updated', this.handleStatsUpdated);
        window.removeEventListener('block-pulse', this.handleBlockPulse);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        this.canvas?.removeEventListener('contextlost', this.handleContextLost);
        this.canvas?.removeEventListener('contextrestored', this.handleContextRestored);
        this.canvas?.remove();

        this.canvas = null;
        this.ctx = null;
        this.grass = [];
        this.grassCandidateCount = 0;
        this.pathwayPath = null;
        this.trees = [];
        this.clouds = [];
        this.seeds = [];
    }

    pause() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.paused = true;
        this.updateDebugState();
    }

    resume() {
        if (!this.started || !this.ctx || this.contextLost || this.animationId !== null) return;
        this.paused = false;
        this.lastPaint = performance.now();
        this.updateDebugState();
        this.animationId = requestAnimationFrame(this.animate);
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            this.pause();
        } else {
            this.resume();
        }
    }

    handleContextLost(event) {
        event.preventDefault?.();
        this.contextLost = true;
        if (this.canvas) this.canvas.dataset.valleyFallback = 'context-lost';
        this.pause();
    }

    handleContextRestored() {
        if (!this.canvas) return;
        this.contextLost = false;
        this.canvas.dataset.valleyFallback = '';
        this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (!this.ctx) return;
        this.resize();
        this.drawScene(0, true);
        if (document.visibilityState === 'visible') this.resume();
    }

    handleResize() {
        if (!this.started) return;
        if (this.resizeAnimationId !== null) cancelAnimationFrame(this.resizeAnimationId);
        this.resizeAnimationId = requestAnimationFrame(() => {
            this.resizeAnimationId = null;
            this.resize();
            this.drawScene(0, true);
        });
    }

    handleStatsUpdated(event) {
        const stats = event?.detail?.stats;
        if (!stats || typeof stats !== 'object') return;

        const next = {};
        const stakingRatio = finite(stats.stakingRatio);
        const cycleProgress = finite(stats.cycleProgress);
        const activity = finite(
            stats.contractCalls24h
            ?? stats.transactionVolume24h
            ?? stats.transactions24h
        );

        if (stakingRatio !== null) next.stake = normalize(stakingRatio, 15, 60);
        if (cycleProgress !== null) next.cycle = normalize(cycleProgress, 0, 100);
        if (activity !== null) next.activity = normalizeLog(activity, 500, 2_000_000);

        if (!Object.values(next).some((value) => value !== null && Number.isFinite(value))) return;

        if (next.stake !== undefined && next.stake !== null) {
            this.targets.stake = next.stake;
        }
        if (next.cycle !== undefined && next.cycle !== null) {
            this.targets.cycle = next.cycle;
        }
        if (next.activity !== undefined && next.activity !== null) {
            this.targets.energy = clamp(0.2 + (next.activity * 0.55));
            this.targets.wind = clamp(0.28 + (next.activity * 0.42));
        }

        this.statsRevision += 1;
        this.updateDebugState();
    }

    seedStats(detail) {
        if (detail) this.handleStatsUpdated({ detail });
        return this;
    }

    handleBlockPulse() {
        this.blockImpulses = Math.min(64, this.blockImpulses + 1);
        this.blockImpulse = clamp(this.blockImpulse + 0.58);
        this.blockOrigin = (0.17 + ((this.blockImpulses * 0.61803398875) % 0.72));
        this.updateDebugState();
    }

    updateDebugState() {
        if (!this.canvas) return;
        this.canvas.dataset.valleyFrame = String(this.frameCount);
        this.canvas.dataset.valleyImpulses = String(this.blockImpulses);
        this.canvas.dataset.valleyPaused = String(this.paused);
        this.canvas.dataset.valleyStatsRevision = String(this.statsRevision);
        this.canvas.dataset.valleyEnergyTarget = this.targets.energy.toFixed(4);
        this.canvas.dataset.valleyWindTarget = this.targets.wind.toFixed(4);
        this.canvas.dataset.valleyCycleNormalized = this.targets.cycle.toFixed(4);
        this.canvas.dataset.valleyStakeNormalized = this.targets.stake.toFixed(4);
        this.canvas.dataset.valleyDpr = this.dpr.toFixed(2);
        this.canvas.dataset.valleyGrass = String(this.grass.length);
        this.canvas.dataset.valleyGrassCandidates = String(this.grassCandidateCount);
        this.canvas.dataset.valleyDestination = 'hilltop-bench';
        this.canvas.dataset.valleyBench = 'three-quarter-wood';
        this.canvas.dataset.valleyGrassProfile = 'full-depth-meadow';
        this.canvas.dataset.valleyFrontMountain = 'opaque';
        this.canvas.dataset.valleyTreeSwayRatio = TREE_SWAY_RATIO.toFixed(2);
    }

    resize() {
        if (!this.canvas || !this.ctx) return;

        this.width = Math.max(1, window.innerWidth);
        this.height = Math.max(1, window.innerHeight);
        this.dpr = Math.max(1, Math.min(DPR_CAP, window.devicePixelRatio || 1));
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = true;
        this.buildScene();
        this.updateDebugState();
    }

    createGrassBlade(random, index, compact) {
        const depthLane = index % 6;
        const depth = depthLane === 0
            ? random() * 0.2
            : depthLane === 1
                ? 0.12 + (random() * 0.32)
                : depthLane === 2
                    ? 0.32 + (random() * 0.3)
                    : random();
        const baseY = lerp(this.height * 0.485, this.height * 1.035, Math.pow(depth, 1.08));
        const perspective = clamp((baseY - (this.height * 0.47)) / (this.height * 0.565));
        return {
            x: random() * this.width,
            y: baseY + ((random() - 0.5) * this.height * 0.025),
            length: lerp(compact ? 7 : 9, compact ? 34 : 48, Math.pow(perspective, 0.92))
                * lerp(0.76, 1.18, random()),
            phase: random() * TAU,
            width: lerp(0.58, compact ? 1.2 : 1.55, perspective) * lerp(0.75, 1.15, random()),
            depth: perspective,
            seedHead: index % (compact ? 37 : 31) === 0 && perspective > 0.2
        };
    }

    getHilltop() {
        return {
            x: this.width * 0.59,
            y: this.height * 0.595
        };
    }

    buildLandscapeGeometry() {
        const hilltop = this.getHilltop();
        const pathEndY = hilltop.y;
        const mouthX = hilltop.x;
        const bottomX = this.width * 0.42;
        const bottomHalfWidth = this.width * (this.width < 640 ? 0.24 : 0.19);
        const pathwayPath = new Path2D();
        pathwayPath.moveTo(mouthX - (this.width * 0.012), pathEndY);
        pathwayPath.bezierCurveTo(
            this.width * 0.57,
            this.height * 0.68,
            bottomX + (this.width * 0.12),
            this.height * 0.79,
            bottomX - bottomHalfWidth,
            this.height + 20
        );
        pathwayPath.lineTo(bottomX + bottomHalfWidth, this.height + 20);
        pathwayPath.bezierCurveTo(
            bottomX + (this.width * 0.03),
            this.height * 0.82,
            this.width * 0.63,
            this.height * 0.67,
            mouthX + (this.width * 0.012),
            pathEndY
        );
        pathwayPath.closePath();

        this.pathwayPath = pathwayPath;
    }

    buildScene() {
        const sceneSeed = (
            (Math.round(this.width) * 73856093) ^ (Math.round(this.height) * 19349663)
        ) >>> 0;
        const random = seededRandom(sceneSeed);
        const compact = this.width < 640;
        const medium = this.width < 1100;
        const grassCount = compact ? 480 : medium ? 780 : 1250;
        const treeCount = compact ? 13 : medium ? 20 : 28;
        const cloudCount = compact ? 4 : 7;
        const seedCount = compact ? 12 : 24;

        this.buildLandscapeGeometry();
        const baseGrass = Array.from(
            { length: grassCount },
            (_value, index) => this.createGrassBlade(random, index, compact)
        );

        this.trees = Array.from({ length: treeCount }, (_value, index) => {
            const sideBias = index % 3 === 0 ? random() * 0.25 : 0.17 + (random() * 0.78);
            const depth = random();
            return {
                x: sideBias * this.width,
                y: lerp(this.height * 0.47, this.height * 0.57, depth),
                size: lerp(compact ? 13 : 18, compact ? 36 : 56, depth) * lerp(0.78, 1.2, random()),
                lean: (random() - 0.5) * 0.18,
                phase: random() * TAU,
                tone: index % 4
            };
        })
            .filter((tree) => !this.ctx.isPointInPath(this.pathwayPath, tree.x, tree.y))
            .sort((left, right) => left.y - right.y);

        this.clouds = Array.from({ length: cloudCount }, () => ({
            x: random() * this.width,
            y: lerp(this.height * 0.09, this.height * 0.34, random()),
            width: lerp(this.width * 0.08, this.width * 0.22, random()),
            height: lerp(10, compact ? 28 : 42, random()),
            speed: lerp(0.35, 0.9, random()),
            alpha: lerp(0.025, 0.09, random())
        }));

        this.seeds = Array.from({ length: seedCount }, () => ({
            x: random() * this.width,
            y: lerp(this.height * 0.46, this.height * 0.9, random()),
            phase: random() * TAU,
            speed: lerp(0.35, 1.1, random()),
            size: lerp(0.6, 1.8, random())
        }));

        const extraGrassRandom = seededRandom((sceneSeed ^ EXTRA_GRASS_SEED_SALT) >>> 0);
        const extraGrassCount = grassCount * (GRASS_DENSITY_MULTIPLIER - 1);
        const extraGrass = Array.from(
            { length: extraGrassCount },
            (_value, index) => this.createGrassBlade(extraGrassRandom, grassCount + index, compact)
        );
        const grassCandidates = [...baseGrass, ...extraGrass];
        this.grassCandidateCount = grassCandidates.length;
        this.grass = grassCandidates
            .filter((blade) => !this.ctx.isPointInPath(this.pathwayPath, blade.x, blade.y))
            .sort((left, right) => left.depth - right.depth);
    }

    animate(timestamp) {
        this.animationId = null;
        if (!this.started || this.paused || !this.ctx || this.contextLost) return;

        const elapsed = timestamp - this.lastPaint;
        if (elapsed >= FRAME_INTERVAL_MS) {
            const delta = Math.min(elapsed, 100);
            this.lastPaint = timestamp - (elapsed % FRAME_INTERVAL_MS);
            this.sceneTime += delta / 1000;
            this.drawScene(delta, false);
            this.frameCount += 1;
            this.updateDebugState();
        }

        if (this.started && !this.paused) {
            this.animationId = requestAnimationFrame(this.animate);
        }
    }

    drawScene(deltaMs, staticFrame) {
        const ctx = this.ctx;
        if (!ctx || !this.width || !this.height) return;

        const settle = staticFrame ? 1 : 1 - Math.exp(-Math.max(1, deltaMs) / 1150);
        for (const key of Object.keys(this.current)) {
            this.current[key] = lerp(this.current[key], this.targets[key], settle);
        }
        if (!staticFrame) {
            this.blockImpulse *= Math.exp(-Math.max(1, deltaMs) / 1350);
        }

        const time = this.sceneTime;
        const cameraX = staticFrame ? 0 : Math.sin(time * 0.09) * this.width * 0.006;
        const cameraY = staticFrame ? 0 : Math.sin((time * 0.07) + 1.4) * this.height * 0.003;

        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.translate(cameraX, cameraY);

        this.drawSky(ctx, time);
        this.drawClouds(ctx, time, staticFrame);
        this.drawMountains(ctx);
        this.drawHills(ctx, time);
        this.drawPathway(ctx);
        this.drawTrees(ctx, time, staticFrame);
        this.drawHilltopBench(ctx);
        this.drawGrass(ctx, time, staticFrame);
        this.drawSeeds(ctx, time, staticFrame);
        this.drawAtmosphere(ctx);

        ctx.restore();
    }

    drawSky(ctx, time) {
        const horizon = this.height * 0.56;
        const cycleWarmth = this.current.cycle;
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#53696F');
        sky.addColorStop(0.42, '#82918A');
        sky.addColorStop(0.78, '#C4A878');
        sky.addColorStop(1, '#D5B476');
        ctx.fillStyle = sky;
        ctx.fillRect(-40, -40, this.width + 80, horizon + 90);

        const sunX = this.width * lerp(0.68, 0.82, cycleWarmth);
        const sunY = this.height * lerp(0.18, 0.12, cycleWarmth);
        const sunRadius = Math.max(55, Math.min(this.width, this.height) * 0.14);
        const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
        sun.addColorStop(0, 'rgba(255, 238, 184, 0.88)');
        sun.addColorStop(0.12, 'rgba(255, 222, 143, 0.52)');
        sun.addColorStop(0.46, 'rgba(232, 171, 95, 0.16)');
        sun.addColorStop(1, 'rgba(232, 171, 95, 0)');
        ctx.fillStyle = sun;
        ctx.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);

        ctx.fillStyle = `rgba(255, 224, 166, ${0.025 + (this.current.energy * 0.035)})`;
        const hazeOffset = Math.sin(time * 0.025) * this.width * 0.02;
        ctx.fillRect(hazeOffset - 30, horizon * 0.66, this.width + 60, horizon * 0.42);
    }

    drawClouds(ctx, time, staticFrame) {
        for (const cloud of this.clouds) {
            const travel = staticFrame ? 0 : (time * cloud.speed * 4);
            const x = ((cloud.x + travel + (cloud.width * 1.5)) % (this.width + (cloud.width * 3))) - (cloud.width * 1.5);
            ctx.save();
            ctx.translate(x, cloud.y);
            ctx.fillStyle = `rgba(246, 226, 189, ${cloud.alpha})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, cloud.width * 0.42, cloud.height * 0.62, -0.05, 0, TAU);
            ctx.ellipse(cloud.width * 0.3, cloud.height * 0.08, cloud.width * 0.5, cloud.height * 0.72, 0.04, 0, TAU);
            ctx.ellipse(-cloud.width * 0.32, cloud.height * 0.12, cloud.width * 0.35, cloud.height * 0.5, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
    }

    drawMountains(ctx) {
        const horizon = this.height * 0.53;
        const layers = [
            { color: '#56675A', alpha: 0.66, y: horizon - (this.height * 0.09), amp: this.height * 0.075, phase: 0.8 },
            { color: '#445844', alpha: 1, y: horizon - (this.height * 0.035), amp: this.height * 0.062, phase: 2.4 }
        ];

        for (const layer of layers) {
            ctx.beginPath();
            ctx.moveTo(-40, this.height);
            ctx.lineTo(-40, layer.y);
            for (let x = -40; x <= this.width + 40; x += Math.max(36, this.width / 24)) {
                const ridge = Math.sin((x / this.width) * 8.4 + layer.phase)
                    + (Math.sin((x / this.width) * 17.8 + (layer.phase * 0.7)) * 0.35);
                ctx.lineTo(x, layer.y - (ridge * layer.amp));
            }
            ctx.lineTo(this.width + 40, this.height);
            ctx.closePath();
            ctx.globalAlpha = layer.alpha;
            ctx.fillStyle = layer.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawHills(ctx, time) {
        const wind = this.current.wind;
        const hillLayers = [
            { y: 0.57, color: '#69754A', amp: 0.028, phase: 0.2 },
            { y: 0.64, color: '#4D5C36', amp: 0.035, phase: 2.1 },
            { y: 0.73, color: '#344329', amp: 0.042, phase: 4.2 }
        ];

        for (const [index, hill] of hillLayers.entries()) {
            const baseY = this.height * hill.y;
            ctx.beginPath();
            ctx.moveTo(-50, this.height + 40);
            ctx.lineTo(-50, baseY);
            for (let x = -50; x <= this.width + 50; x += Math.max(42, this.width / 26)) {
                const wave = Math.sin((x / this.width) * 7.4 + hill.phase)
                    + (Math.sin((x / this.width) * 14.2 + hill.phase) * 0.22);
                const livingShift = Math.sin(time * 0.08 + (x * 0.002)) * wind * (index + 1) * 0.5;
                ctx.lineTo(x, baseY - (wave * this.height * hill.amp) + livingShift);
            }
            ctx.lineTo(this.width + 50, this.height + 40);
            ctx.closePath();
            ctx.fillStyle = hill.color;
            ctx.fill();
        }
    }

    drawPathway(ctx) {
        const hilltop = this.getHilltop();
        const pathEndY = hilltop.y;
        const mouthX = hilltop.x;
        const bottomX = this.width * 0.42;
        const bottomHalfWidth = this.width * (this.width < 640 ? 0.24 : 0.19);
        if (!this.pathwayPath) return;

        ctx.save();
        const earth = ctx.createLinearGradient(0, pathEndY, 0, this.height);
        earth.addColorStop(0, '#96815B');
        earth.addColorStop(0.3, '#746746');
        earth.addColorStop(0.68, '#514B36');
        earth.addColorStop(1, '#33362C');
        ctx.fillStyle = earth;
        ctx.fill(this.pathwayPath);
        ctx.clip(this.pathwayPath);

        for (let index = 0; index < 33; index += 1) {
            const noise = (Math.sin(index * 12.9898) + 1) * 0.5;
            const progress = clamp(((index + (noise * 0.84)) / 33), 0.02, 0.98);
            const perspective = Math.pow(progress, 1.42);
            const y = lerp(pathEndY + 3, this.height + 4, perspective);
            const centerX = lerp(mouthX, bottomX, progress)
                + Math.sin((progress * 5.1) + 0.7) * this.width * 0.025;
            const pathHalfWidth = lerp(this.width * 0.005, bottomHalfWidth * 0.82, Math.pow(progress, 1.55));
            const x = centerX + ((noise - 0.5) * pathHalfWidth * 1.35);
            const radiusX = lerp(1.2, 17, perspective) * lerp(0.62, 1.28, noise);
            const radiusY = lerp(0.7, 5.5, perspective) * lerp(0.72, 1.16, 1 - noise);
            ctx.fillStyle = index % 3 === 0
                ? 'rgba(222, 190, 126, 0.105)'
                : 'rgba(34, 43, 31, 0.115)';
            ctx.beginPath();
            ctx.ellipse(x, y, radiusX, radiusY, (noise - 0.5) * 0.7, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }

    drawHilltopBench(ctx) {
        const hilltop = this.getHilltop();
        const compact = this.width < 640;
        const size = clamp(
            Math.min(this.width, this.height) * 0.048,
            compact ? 17 : 24,
            compact ? 26 : 38
        );
        const left = -size * 0.94;
        const right = size * 0.78;
        const seatY = -size * 0.3;
        const farLift = size * 0.14;
        const depthX = size * 0.2;
        const legGroundY = size * 0.08;

        ctx.save();
        ctx.translate(hilltop.x, hilltop.y);

        const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.25);
        shadow.addColorStop(0, 'rgba(20, 25, 17, 0.42)');
        shadow.addColorStop(1, 'rgba(24, 29, 20, 0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.03, size * 1.25, size * 0.25, -0.06, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = '#32291F';
        ctx.lineWidth = Math.max(1.5, size * 0.09);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(left + (size * 0.18), seatY);
        ctx.lineTo(left + (size * 0.13), legGroundY);
        ctx.moveTo(right - (size * 0.08), seatY - (size * 0.04));
        ctx.lineTo(right - (size * 0.02), legGroundY - (size * 0.02));
        ctx.stroke();

        const seat = ctx.createLinearGradient(left, seatY, right + depthX, seatY - farLift);
        seat.addColorStop(0, '#4A3928');
        seat.addColorStop(0.48, '#6A5033');
        seat.addColorStop(1, '#80603A');
        ctx.fillStyle = seat;
        ctx.beginPath();
        ctx.moveTo(left, seatY);
        ctx.lineTo(right, seatY - (size * 0.05));
        ctx.lineTo(right + depthX, seatY - farLift);
        ctx.lineTo(left + depthX, seatY - (farLift * 0.62));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#3B3024';
        ctx.beginPath();
        ctx.moveTo(left, seatY);
        ctx.lineTo(right, seatY - (size * 0.05));
        ctx.lineTo(right, seatY + (size * 0.07));
        ctx.lineTo(left, seatY + (size * 0.1));
        ctx.closePath();
        ctx.fill();

        const backLeft = left + (size * 0.12);
        const backRight = right + (size * 0.11);
        const backBottom = seatY - (size * 0.22);
        const backTop = seatY - (size * 0.86);
        ctx.strokeStyle = '#352B20';
        ctx.lineWidth = Math.max(1.7, size * 0.095);
        ctx.beginPath();
        ctx.moveTo(backLeft, seatY + (size * 0.02));
        ctx.lineTo(backLeft + (size * 0.03), backTop - (size * 0.06));
        ctx.moveTo(backRight, seatY - (size * 0.08));
        ctx.lineTo(backRight + (size * 0.02), backTop - (size * 0.12));
        ctx.stroke();

        const back = ctx.createLinearGradient(backLeft, backTop, backRight, backBottom);
        back.addColorStop(0, '#58432D');
        back.addColorStop(0.62, '#6F5233');
        back.addColorStop(1, '#463728');
        ctx.strokeStyle = back;
        ctx.lineWidth = Math.max(2.4, size * 0.13);
        ctx.lineCap = 'round';
        for (let plank = 0; plank < 3; plank += 1) {
            const plankY = backTop + (plank * size * 0.205);
            const leftInset = plank === 1 ? size * 0.015 : 0;
            const rightInset = plank === 2 ? size * 0.025 : 0;
            ctx.beginPath();
            ctx.moveTo(backLeft + leftInset, plankY);
            ctx.lineTo(backRight - rightInset, plankY - (size * 0.09));
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(219, 170, 94, 0.34)';
        ctx.lineWidth = Math.max(0.55, size * 0.025);
        ctx.beginPath();
        ctx.moveTo(left + (size * 0.08), seatY - (size * 0.015));
        ctx.lineTo(right - (size * 0.05), seatY - (size * 0.06));
        ctx.moveTo(backLeft + (size * 0.05), backTop + (size * 0.025));
        ctx.lineTo(backRight - (size * 0.05), backTop - (size * 0.055));
        ctx.stroke();

        ctx.restore();
    }

    drawLake(ctx, time, staticFrame) {
        if (!this.lakePath || !this.lakeGeometry) return;
        const {
            farX,
            farY,
            farHalfWidth,
            midHalfWidth,
            mouthX,
            nearY,
            nearHalfWidth
        } = this.lakeGeometry;

        ctx.save();
        ctx.strokeStyle = 'rgba(82, 96, 52, 0.78)';
        ctx.lineWidth = Math.max(5, this.height * 0.011);
        ctx.stroke(this.lakePath);
        ctx.restore();

        ctx.save();
        const water = ctx.createLinearGradient(0, farY, 0, nearY);
        water.addColorStop(0, '#778B81');
        water.addColorStop(0.38, '#58736B');
        water.addColorStop(1, '#34534F');
        ctx.fillStyle = water;
        ctx.fill(this.lakePath);
        ctx.clip(this.lakePath);

        const reflectedSky = ctx.createRadialGradient(
            farX - (farHalfWidth * 0.4),
            farY + (this.height * 0.025),
            0,
            farX - (farHalfWidth * 0.4),
            farY + (this.height * 0.025),
            midHalfWidth * 1.45
        );
        reflectedSky.addColorStop(0, `rgba(252, 222, 154, ${0.18 + (this.current.cycle * 0.12)})`);
        reflectedSky.addColorStop(0.42, 'rgba(218, 190, 125, 0.09)');
        reflectedSky.addColorStop(1, 'rgba(107, 151, 137, 0)');
        ctx.fillStyle = reflectedSky;
        ctx.fillRect(
            farX - (midHalfWidth * 1.9),
            farY,
            midHalfWidth * 3.2,
            nearY - farY
        );

        ctx.lineCap = 'round';
        for (let index = 0; index < 8; index += 1) {
            const noise = (Math.sin((index + 3) * 9.173) + 1) * 0.5;
            const progress = clamp(
                ((index + 1) / 10) + (Math.cos((index + 1) * 2.11) * 0.025),
                0.08,
                0.92
            );
            const y = lerp(farY + (this.height * 0.018), nearY, progress)
                + ((noise - 0.5) * this.height * 0.006);
            const centerX = lerp(farX, mouthX, progress);
            const localHalfWidth = lerp(farHalfWidth, nearHalfWidth, Math.pow(progress, 0.88));
            const width = localHalfWidth * lerp(0.12, 0.46, noise);
            const drift = staticFrame ? 0 : Math.sin((time * 0.42) + index) * lerp(0.25, 1.8, progress);
            const x = centerX + ((noise - 0.5) * localHalfWidth * 0.86) + drift;
            ctx.strokeStyle = index % 3 === 0
                ? `rgba(246, 216, 158, ${0.08 + (this.current.energy * 0.08)})`
                : 'rgba(198, 215, 192, 0.075)';
            ctx.lineWidth = lerp(0.45, 1.25, progress);
            ctx.beginPath();
            ctx.ellipse(
                x,
                y,
                Math.max(1.5, width),
                lerp(0.45, 1.4, progress),
                (noise - 0.5) * 0.12,
                0.08 * Math.PI,
                0.92 * Math.PI
            );
            ctx.stroke();
        }

        const reflectionOffsets = [-0.42, 0.56, -0.68, 0.24, 0.7, -0.5];
        for (let index = 0; index < 6; index += 1) {
            const progress = clamp(
                ((index + 1) / 8) + (Math.sin((index + 2) * 2.37) * 0.04),
                0.08,
                0.9
            );
            const phase = (index * 1.71) + 0.4;
            const flutter = staticFrame ? 0.64 : 0.38 + (Math.abs(Math.sin((time * 3.8) + phase)) * 0.62);
            const y = lerp(farY + (this.height * 0.026), nearY - (this.height * 0.02), progress)
                + (Math.cos(phase * 1.8) * this.height * 0.004);
            const centerX = lerp(farX, mouthX, progress);
            const localHalfWidth = lerp(farHalfWidth, nearHalfWidth, Math.pow(progress, 0.9));
            const x = centerX + (localHalfWidth * reflectionOffsets[index]);
            const glowRadius = lerp(1.6, 4.6, progress) * flutter;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius * 2.4);
            glow.addColorStop(0, `rgba(255, 235, 170, ${0.5 + (this.current.energy * 0.22)})`);
            glow.addColorStop(0.28, 'rgba(250, 209, 112, 0.32)');
            glow.addColorStop(1, 'rgba(250, 209, 112, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.ellipse(x, y, glowRadius * 2.4, glowRadius, 0, 0, TAU);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(64, 81, 47, 0.32)';
        ctx.lineWidth = Math.max(0.9, this.height * 0.0014);
        ctx.stroke(this.lakePath);
        ctx.strokeStyle = 'rgba(139, 142, 87, 0.22)';
        ctx.lineWidth = Math.max(0.65, this.height * 0.0009);
        ctx.stroke(this.lakePath);
        ctx.restore();

        this.drawSpringCascade(ctx, time, staticFrame);
    }

    drawSpringCascade(ctx, time, staticFrame) {
        if (!this.lakeGeometry) return;
        const { farX, farY, farHalfWidth } = this.lakeGeometry;
        const fallTop = farY - (this.height * 0.01);
        const shimmer = staticFrame ? 0.62 : 0.45 + (Math.sin(time * 2.1) * 0.17);
        const sourceX = farX + (farHalfWidth * 0.62);

        ctx.save();
        ctx.fillStyle = 'rgba(70, 85, 52, 0.66)';
        ctx.beginPath();
        ctx.moveTo(sourceX - (farHalfWidth * 0.52), fallTop - (this.height * 0.003));
        ctx.lineTo(sourceX + (farHalfWidth * 0.48), fallTop - (this.height * 0.006));
        ctx.lineTo(sourceX + (farHalfWidth * 0.74), farY + (this.height * 0.002));
        ctx.lineTo(sourceX - (farHalfWidth * 0.24), farY + (this.height * 0.006));
        ctx.closePath();
        ctx.fill();

        const cascade = ctx.createLinearGradient(0, fallTop, 0, farY + (this.height * 0.012));
        cascade.addColorStop(0, 'rgba(225, 232, 203, 0.08)');
        cascade.addColorStop(0.46, `rgba(255, 225, 157, ${0.24 + (shimmer * 0.16)})`);
        cascade.addColorStop(1, 'rgba(168, 205, 186, 0.34)');
        ctx.strokeStyle = cascade;
        ctx.lineCap = 'round';
        for (let strand = 0; strand < 2; strand += 1) {
            const offset = strand * farHalfWidth * 0.11;
            const drift = staticFrame ? 0 : Math.sin((time * 1.7) + strand) * farHalfWidth * 0.05;
            ctx.lineWidth = strand === 0
                ? Math.max(1.05, farHalfWidth * 0.1)
                : Math.max(0.6, farHalfWidth * 0.055);
            ctx.beginPath();
            ctx.moveTo(sourceX + offset, fallTop + (strand * this.height * 0.0015));
            ctx.bezierCurveTo(
                sourceX - (farHalfWidth * 0.08) + drift,
                lerp(fallTop, farY, 0.42),
                farX + (farHalfWidth * 0.22) - drift,
                lerp(fallTop, farY, 0.78),
                farX + (farHalfWidth * 0.05) + (offset * 0.16),
                farY + (this.height * 0.008)
            );
            ctx.stroke();
        }

        const springGlow = ctx.createRadialGradient(
            farX,
            farY + (this.height * 0.01),
            0,
            farX,
            farY + (this.height * 0.01),
            farHalfWidth * 1.5
        );
        springGlow.addColorStop(0, `rgba(255, 224, 143, ${0.16 + (shimmer * 0.15)})`);
        springGlow.addColorStop(1, 'rgba(255, 224, 143, 0)');
        ctx.fillStyle = springGlow;
        ctx.beginPath();
        ctx.ellipse(
            farX,
            farY + (this.height * 0.01),
            farHalfWidth * 1.5,
            this.height * 0.013,
            0,
            0,
            TAU
        );
        ctx.fill();
        ctx.restore();
    }

    drawWildfireMeadowHaze(ctx, time, staticFrame) {
        const centerX = this.width * 0.59;
        const centerY = this.height * 0.555;
        const pulse = staticFrame ? 0 : Math.sin(time * 0.34) * 0.012;
        const energy = 0.08 + (this.current.energy * 0.07) + pulse;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(1, 0.28);
        const basinGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.width * 0.42);
        basinGlow.addColorStop(0, `rgba(224, 181, 91, ${energy})`);
        basinGlow.addColorStop(0.48, `rgba(175, 157, 76, ${energy * 0.6})`);
        basinGlow.addColorStop(1, 'rgba(175, 157, 76, 0)');
        ctx.fillStyle = basinGlow;
        ctx.fillRect(-this.width * 0.5, -this.height, this.width, this.height * 2);
        ctx.restore();
    }

    drawWildfireMeadow(ctx, time, staticFrame) {
        const energy = this.current.energy;
        const waveTravel = staticFrame ? 0.38 : ((time * (0.055 + (energy * 0.035))) % 1);
        const visibleMotes = Math.floor(this.meadowMotes.length * (0.72 + (energy * 0.28)));

        ctx.save();
        ctx.lineCap = 'round';
        const glowBands = [[], [], []];
        for (let index = 0; index < this.grass.length; index += 5) {
            const blade = this.grass[index];
            if (blade.depth < 0.08) continue;
            const xNormalized = blade.x / this.width;
            const meadowWave = 0.5 + (
                Math.sin(
                    (xNormalized * 12.5)
                    + (blade.y / this.height * 4.2)
                    - (waveTravel * TAU)
                    + (Math.sin(blade.phase) * 0.55)
                ) * 0.5
            );
            const impulseDistance = Math.min(
                Math.abs(xNormalized - this.blockOrigin),
                1 - Math.abs(xNormalized - this.blockOrigin)
            );
            const impulseGlow = this.blockImpulse * Math.exp(
                -(impulseDistance * impulseDistance) / 0.012
            );
            const glow = clamp((meadowWave - 0.55) * 2.5 + impulseGlow, 0, 1);
            if (glow < 0.08) continue;

            const sway = staticFrame
                ? Math.sin(blade.phase) * blade.length * 0.025
                : Math.sin((time * 0.9) + blade.phase) * blade.length * this.current.wind * 0.08;
            const tipX = blade.x + sway;
            const tipY = blade.y - blade.length;
            glowBands[Math.min(2, Math.floor(glow * 3))].push({
                blade,
                sway,
                tipX,
                tipY
            });
        }

        for (let band = 0; band < glowBands.length; band += 1) {
            const litBlades = glowBands[band];
            if (!litBlades.length) continue;
            ctx.strokeStyle = `rgba(245, 200, 104, ${0.24 + (band * 0.22)})`;
            ctx.beginPath();
            for (const { blade, sway, tipX, tipY } of litBlades) {
                ctx.lineWidth = Math.max(0.55, blade.width * 0.7);
                ctx.moveTo(blade.x, blade.y - (blade.length * 0.28));
                ctx.quadraticCurveTo(
                    blade.x + (sway * 0.28),
                    blade.y - (blade.length * 0.68),
                    tipX,
                    tipY
                );
            }
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 222, 139, ${0.38 + (band * 0.25)})`;
            ctx.beginPath();
            for (const { blade, sway, tipX, tipY } of litBlades) {
                const radiusX = Math.max(0.65, blade.width * 0.9);
                const rotation = sway * 0.02;
                ctx.moveTo(
                    tipX + (Math.cos(rotation) * radiusX),
                    tipY + (Math.sin(rotation) * radiusX)
                );
                ctx.ellipse(
                    tipX,
                    tipY,
                    radiusX,
                    Math.max(1.2, blade.width * 1.9),
                    rotation,
                    0,
                    TAU
                );
            }
            ctx.fill();
        }

        const moteBands = [[], [], []];
        for (let index = 0; index < visibleMotes; index += 1) {
            const mote = this.meadowMotes[index];
            const travel = staticFrame ? 0 : time * mote.speed;
            const x = mote.x + (staticFrame ? 0 : Math.sin(travel + mote.phase) * mote.lift * 0.42);
            const y = mote.baseY
                - mote.lift
                + (staticFrame ? 0 : Math.sin((travel * 1.7) + mote.phase) * mote.lift * 0.28);
            const flutter = staticFrame ? 0.55 : 0.3 + (Math.abs(Math.sin((time * 4.5) + mote.phase)) * 0.7);
            moteBands[Math.min(2, Math.floor(mote.depth * 3))].push({
                flutter,
                mote,
                x,
                y
            });
        }

        for (let band = 0; band < moteBands.length; band += 1) {
            const visibleBand = moteBands[band];
            if (!visibleBand.length) continue;
            const alpha = (0.34 + (band * 0.2)) * (0.78 + (energy * 0.22));
            ctx.fillStyle = `rgba(255, 226, 151, ${alpha})`;
            ctx.beginPath();
            for (const { flutter, mote, x, y } of visibleBand) {
                const wingRadiusX = mote.size * flutter;
                const leftCenterX = x - (mote.size * 0.85);
                const rightCenterX = x + (mote.size * 0.85);
                ctx.moveTo(
                    leftCenterX + (Math.cos(-0.45) * wingRadiusX),
                    y + (Math.sin(-0.45) * wingRadiusX)
                );
                ctx.ellipse(
                    leftCenterX,
                    y,
                    wingRadiusX,
                    mote.size * 0.42,
                    -0.45,
                    0,
                    TAU
                );
                ctx.moveTo(
                    rightCenterX + (Math.cos(0.45) * wingRadiusX),
                    y + (Math.sin(0.45) * wingRadiusX)
                );
                ctx.ellipse(
                    rightCenterX,
                    y,
                    wingRadiusX,
                    mote.size * 0.42,
                    0.45,
                    0,
                    TAU
                );
            }
            ctx.fill();
            ctx.fillStyle = `rgba(255, 239, 185, ${Math.min(0.92, alpha + 0.12)})`;
            ctx.beginPath();
            for (const { mote, x, y } of visibleBand) {
                const coreRadius = Math.max(0.45, mote.size * 0.34);
                ctx.moveTo(x + coreRadius, y);
                ctx.arc(x, y, coreRadius, 0, TAU);
            }
            ctx.fill();
        }
        ctx.restore();
    }

    getTreeSway(tree, time, staticFrame) {
        if (staticFrame) return 0;
        const grassWaveSpeed = GRASS_WAVE_SPEED_BASE
            + (this.current.wind * GRASS_WAVE_SPEED_WIND);
        const grassSwayDistance = tree.size
            * (GRASS_SWAY_DISTANCE_BASE + (this.current.wind * GRASS_SWAY_DISTANCE_WIND));
        return Math.sin(
            (time * grassWaveSpeed * TREE_SWAY_RATIO) + tree.phase
        ) * grassSwayDistance * TREE_SWAY_RATIO;
    }

    drawTrees(ctx, time, staticFrame) {
        const palette = [
            ['#263A2B', '#39513A', '#53674A'],
            ['#31452E', '#465C37', '#61734A'],
            ['#2B402F', '#3F5740', '#596C4C'],
            ['#35482A', '#4B5D34', '#69754A']
        ];

        for (const tree of this.trees) {
            const sway = this.getTreeSway(tree, time, staticFrame);
            const trunkHeight = tree.size * 0.7;
            ctx.save();
            ctx.translate(tree.x, tree.y);
            ctx.rotate(tree.lean);

            ctx.strokeStyle = '#3A2D20';
            ctx.lineWidth = Math.max(1, tree.size * 0.095);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, tree.size * 0.18);
            ctx.lineTo(sway, -trunkHeight);
            ctx.stroke();

            ctx.translate(sway, 0);
            const colors = palette[tree.tone % palette.length];
            const crownY = -trunkHeight;
            const lobes = [
                [-0.34, 0.1, 0.48, colors[0]],
                [0.32, 0.06, 0.45, colors[1]],
                [-0.03, -0.28, 0.54, colors[2]],
                [0.03, 0.28, 0.5, colors[1]]
            ];
            for (const [x, y, scale, color] of lobes) {
                const radius = tree.size * scale;
                ctx.fillStyle = color;
                ctx.beginPath();
                roundedPolygon(ctx, [
                    [(x * tree.size) - radius, crownY + (y * tree.size)],
                    [(x * tree.size) - (radius * 0.25), crownY + (y * tree.size) - (radius * 0.85)],
                    [(x * tree.size) + (radius * 0.7), crownY + (y * tree.size) - (radius * 0.4)],
                    [(x * tree.size) + radius, crownY + (y * tree.size) + (radius * 0.35)],
                    [(x * tree.size), crownY + (y * tree.size) + (radius * 0.72)]
                ]);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    drawGrass(ctx, time, staticFrame) {
        const visibleFraction = 0.9 + (this.current.stake * 0.1);
        const visibleCount = Math.floor(this.grass.length * visibleFraction);
        const travelingPosition = staticFrame
            ? this.blockOrigin
            : ((this.blockOrigin + (time * (0.13 + (this.current.energy * 0.08)))) % 1);
        const palette = [
            'rgba(91, 111, 64, 0.66)',
            'rgba(104, 126, 67, 0.74)',
            'rgba(119, 137, 70, 0.8)',
            'rgba(138, 146, 74, 0.9)'
        ];

        for (let band = 0; band < 4; band += 1) {
            ctx.beginPath();
            ctx.strokeStyle = palette[band];
            ctx.lineCap = 'round';

            for (let index = 0; index < visibleCount; index += 1) {
                const blade = this.grass[index];
                const bladeBand = Math.min(3, Math.floor(blade.depth * 4));
                if (bladeBand !== band) continue;

                const xNormalized = blade.x / this.width;
                const coherentWave = staticFrame
                    ? Math.sin(blade.x * 0.012 + blade.phase) * 0.18
                    : (
                        Math.sin(
                            (time * (GRASS_WAVE_SPEED_BASE + (this.current.wind * GRASS_WAVE_SPEED_WIND)))
                            + (blade.x * 0.012)
                            + (blade.y * 0.004)
                            + blade.phase
                        ) * 0.66
                        + Math.sin((time * 0.43) + (blade.x * 0.0045)) * 0.34
                    );
                const gustDistance = Math.min(
                    Math.abs(xNormalized - travelingPosition),
                    1 - Math.abs(xNormalized - travelingPosition)
                );
                const gust = this.blockImpulse * Math.exp(-(gustDistance * gustDistance) / 0.0045);
                const bend = blade.length
                    * (GRASS_SWAY_DISTANCE_BASE + (this.current.wind * GRASS_SWAY_DISTANCE_WIND))
                    * (coherentWave + (gust * 1.6));
                const tipX = blade.x + bend;
                const tipY = blade.y - blade.length;

                ctx.lineWidth = blade.width;
                ctx.moveTo(blade.x, blade.y);
                ctx.quadraticCurveTo(
                    blade.x + (bend * 0.28),
                    blade.y - (blade.length * 0.56),
                    tipX,
                    tipY
                );
            }
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(205, 184, 111, 0.52)';
        for (let index = 0; index < visibleCount; index += 1) {
            const blade = this.grass[index];
            if (!blade.seedHead) continue;
            const coherentWave = staticFrame
                ? Math.sin(blade.phase) * 0.08
                : Math.sin((time * 1.1) + blade.phase + (blade.x * 0.008)) * this.current.wind * 0.24;
            const bend = blade.length * coherentWave;
            ctx.beginPath();
            ctx.ellipse(
                blade.x + bend,
                blade.y - blade.length,
                Math.max(0.7, blade.width * 1.3),
                Math.max(1.8, blade.width * 3.2),
                coherentWave,
                0,
                TAU
            );
            ctx.fill();
        }
    }

    drawSeeds(ctx, time, staticFrame) {
        const visibleSeeds = Math.floor(this.seeds.length * (0.35 + (this.current.energy * 0.65)));
        ctx.fillStyle = 'rgba(255, 226, 169, 0.3)';
        for (let index = 0; index < visibleSeeds; index += 1) {
            const seed = this.seeds[index];
            const travel = staticFrame ? 0 : time * seed.speed * (9 + (this.current.wind * 14));
            const x = ((seed.x + travel + 20) % (this.width + 40)) - 20;
            const y = seed.y
                + (staticFrame ? 0 : Math.sin((time * seed.speed) + seed.phase) * 12)
                - ((travel * 0.08) % (this.height * 0.18));
            ctx.beginPath();
            ctx.ellipse(x, y, seed.size * 0.55, seed.size * 1.6, 0.7, 0, TAU);
            ctx.fill();
        }
    }

    drawAtmosphere(ctx) {
        const horizon = this.height * 0.52;
        const mist = ctx.createLinearGradient(0, horizon - 45, 0, horizon + (this.height * 0.19));
        mist.addColorStop(0, 'rgba(244, 215, 168, 0)');
        mist.addColorStop(0.42, 'rgba(224, 199, 154, 0.12)');
        mist.addColorStop(1, 'rgba(224, 199, 154, 0)');
        ctx.fillStyle = mist;
        ctx.fillRect(-40, horizon - 45, this.width + 80, this.height * 0.25);

        const vignette = ctx.createRadialGradient(
            this.width * 0.5,
            this.height * 0.44,
            Math.min(this.width, this.height) * 0.24,
            this.width * 0.5,
            this.height * 0.5,
            Math.max(this.width, this.height) * 0.72
        );
        vignette.addColorStop(0, 'rgba(12, 15, 10, 0)');
        vignette.addColorStop(0.72, 'rgba(12, 15, 10, 0.04)');
        vignette.addColorStop(1, 'rgba(8, 10, 7, 0.3)');
        ctx.fillStyle = vignette;
        ctx.fillRect(-40, -40, this.width + 80, this.height + 80);
    }
}

export function createValleyEffect() {
    return new ValleyEffect();
}

export default createValleyEffect;
