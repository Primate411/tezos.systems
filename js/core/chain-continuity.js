// A null snapshot means the standalone Chamber owns its continuity reads.
// Dashboard observations must not depend on hidden markup or animated text.
let dashboardContinuity = null;
const listeners = new Set();

export function readDashboardContinuity() {
    return dashboardContinuity;
}

export function publishDashboardContinuity(next) {
    if (dashboardContinuity && Object.keys(next).every(key => next[key] === dashboardContinuity[key])) return;
    dashboardContinuity = Object.freeze({ ...next });
    listeners.forEach(listener => listener());
}

export function subscribeDashboardContinuity(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
