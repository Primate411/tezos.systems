/** Chart libraries are requested only by chart surfaces, not every Chamber. */
const SOURCES = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js'
];
let chartWork = null;
function ready(index) {
    if (!window.Chart) return false;
    if (index === 0) return true;
    try { return Boolean(new window.Chart._adapters._date().formats()); } catch { return false; }
}
function load(source, index) {
    if (ready(index)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        let script = [...document.scripts].find(node => node.src === source);
        const created = !script;
        if (!script) script = document.createElement('script');
        const done = error => {
            clearTimeout(timer);
            script.removeEventListener('load', loaded);
            script.removeEventListener('error', failed);
            if (error) { script.remove(); reject(error); } else resolve();
        };
        const loaded = () => done(ready(index) ? null : new Error('Chart library did not initialize'));
        const failed = () => done(new Error('Chart library unavailable; retry opening the chart'));
        const timer = setTimeout(failed, 15000);
        script.addEventListener('load', loaded, { once: true });
        script.addEventListener('error', failed, { once: true });
        if (created) { script.src = source; document.head.appendChild(script); }
    });
}
export function ensureChartLibraries() {
    if (!chartWork) chartWork = (async () => {
        for (const [index, source] of SOURCES.entries()) await load(source, index);
    })().catch(error => { chartWork = null; throw error; });
    return chartWork;
}
