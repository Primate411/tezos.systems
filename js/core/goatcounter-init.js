// GoatCounter path override plus lightweight product-loop events.
(function () {
    const queue = [];
    let pageCounted = false;

    function slug(value) {
        return String(value || 'event')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'event';
    }

    function eventPath(name, details) {
        const params = new URLSearchParams();
        Object.entries(details || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            params.set(slug(key), slug(value));
        });
        const suffix = params.toString();
        return `/event/${slug(name)}${suffix ? `?${suffix}` : ''}`;
    }

    function send(payload) {
        if (window.goatcounter?.count) {
            window.goatcounter.count(payload);
            return true;
        }
        return false;
    }

    function flush() {
        if (!window.goatcounter?.count) return;
        if (!pageCounted) {
            pageCounted = true;
            window.goatcounter.count({ path: function (p) { return `${p}-v2`; } });
        }
        while (queue.length) send(queue.shift());
    }

    window.trackTezosSystemsEvent = function trackTezosSystemsEvent(name, details) {
        const payload = {
            path: eventPath(name, details),
            title: `event:${slug(name)}`,
            event: true
        };
        if (!send(payload)) queue.push(payload);
    };

    flush();
    window.addEventListener('load', flush, { once: true });
    setTimeout(flush, 1500);
})();
