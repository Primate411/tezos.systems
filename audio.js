/**
 * ULTRA MODE AUDIO SYSTEM
 * Subtle, tasteful sound design for each Ultra mode
 * Uses Web Audio API - no external files needed
 */

let audioCtx = null;
let audioEnabled = true;
let masterGain = null;

// Sound profiles for each Ultra mode
const SOUND_PROFILES = {
    terminal: {
        click: { type: 'square', freq: 800, duration: 0.05, decay: 0.03 },
        hover: { type: 'square', freq: 400, duration: 0.02, decay: 0.01 },
        activate: { type: 'square', freq: [200, 400, 800], duration: 0.15, decay: 0.1 },
        trail: { type: 'square', freq: 120, duration: 0.01, decay: 0.005, volume: 0.02 }
    },
    signal: {
        click: { type: 'sine', freq: 880, duration: 0.08, decay: 0.05 },
        hover: { type: 'sine', freq: 660, duration: 0.03, decay: 0.02 },
        activate: { type: 'sine', freq: [440, 660, 880], duration: 0.2, decay: 0.15 },
        trail: { type: 'sine', freq: 220, duration: 0.015, decay: 0.01, volume: 0.015 }
    },
    circuit: {
        click: { type: 'sawtooth', freq: 600, duration: 0.04, decay: 0.02 },
        hover: { type: 'triangle', freq: 300, duration: 0.02, decay: 0.01 },
        activate: { type: 'sawtooth', freq: [150, 300, 600], duration: 0.12, decay: 0.08 },
        trail: { type: 'triangle', freq: 100, duration: 0.008, decay: 0.004, volume: 0.02 }
    },
    glitch: {
        click: { type: 'sawtooth', freq: 'random', duration: 0.06, decay: 0.03 },
        hover: { type: 'square', freq: 'random', duration: 0.02, decay: 0.01 },
        activate: { type: 'sawtooth', freq: [100, 800, 200, 1200], duration: 0.18, decay: 0.1 },
        trail: { type: 'sawtooth', freq: 'random', duration: 0.01, decay: 0.005, volume: 0.015 }
    },
    network: {
        click: { type: 'sine', freq: 520, duration: 0.1, decay: 0.08 },
        hover: { type: 'sine', freq: 380, duration: 0.04, decay: 0.03 },
        activate: { type: 'sine', freq: [260, 390, 520], duration: 0.25, decay: 0.2 },
        trail: { type: 'sine', freq: 180, duration: 0.02, decay: 0.015, volume: 0.01 }
    }
};

/**
 * Initialize audio system
 */
export function initAudio() {
    // Load preference
    audioEnabled = localStorage.getItem('ultraAudio') !== 'false';
    
    // Create audio context on first user interaction
    const initContext = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.15; // Master volume - keep it subtle
            masterGain.connect(audioCtx.destination);
        }
        document.removeEventListener('click', initContext);
        document.removeEventListener('keydown', initContext);
    };
    
    document.addEventListener('click', initContext, { once: true });
    document.addEventListener('keydown', initContext, { once: true });
}

/**
 * Toggle audio on/off
 */
export function toggleAudio() {
    audioEnabled = !audioEnabled;
    localStorage.setItem('ultraAudio', audioEnabled.toString());
    return audioEnabled;
}

/**
 * Check if audio is enabled
 */
export function isAudioEnabled() {
    return audioEnabled;
}

/**
 * Play a sound for the current Ultra mode
 */
export function playSound(soundType, mode = null) {
    if (!audioEnabled || !audioCtx) return;
    
    // Get current mode if not specified
    if (!mode) {
        mode = document.body.getAttribute('data-ultra') || 'terminal';
    }
    
    const profile = SOUND_PROFILES[mode];
    if (!profile || !profile[soundType]) return;
    
    const sound = profile[soundType];
    
    // Resume context if suspended
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    try {
        if (Array.isArray(sound.freq)) {
            // Arpeggio
            playArpeggio(sound);
        } else {
            // Single tone
            playTone(sound);
        }
    } catch (e) {
        // Silently fail - audio is non-critical
    }
}

/**
 * Play a single tone
 */
function playTone(sound) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = sound.type;
    
    // Handle random frequency for glitch mode
    let freq = sound.freq;
    if (freq === 'random') {
        freq = 100 + Math.random() * 1000;
    }
    osc.frequency.value = freq;
    
    const volume = sound.volume || 0.3;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + sound.duration);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + sound.duration);
}

/**
 * Play an arpeggio (sequence of tones)
 */
function playArpeggio(sound) {
    const notes = sound.freq;
    const noteLength = sound.duration / notes.length;
    
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = sound.type;
        
        // Handle random frequency
        let actualFreq = freq;
        if (freq === 'random') {
            actualFreq = 100 + Math.random() * 1000;
        }
        osc.frequency.value = actualFreq;
        
        const startTime = audioCtx.currentTime + (i * noteLength);
        const volume = 0.25 - (i * 0.05); // Fade out through arpeggio
        
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteLength);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + noteLength);
    });
}

/**
 * Play click sound
 */
export function playClick(mode) {
    playSound('click', mode);
}

/**
 * Play hover sound
 */
export function playHover(mode) {
    playSound('hover', mode);
}

/**
 * Play mode activation sound
 */
export function playActivate(mode) {
    playSound('activate', mode);
}

/**
 * Play subtle trail sound (throttled)
 */
let lastTrailSound = 0;
export function playTrail(mode) {
    const now = Date.now();
    if (now - lastTrailSound < 50) return; // Throttle to max 20/sec
    lastTrailSound = now;
    playSound('trail', mode);
}

/**
 * Get sound profile for a mode
 */
export function getSoundProfile(mode) {
    return SOUND_PROFILES[mode] || SOUND_PROFILES.terminal;
}
