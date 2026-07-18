/*
 * Yandex.Metrika loader — CSP-safe (no inline JS).
 * Counter id comes from /api/config (env YANDEX_METRIKA_ID); if unset, no-op.
 * Exposes window.__ym(goal, params) for conversion goals; calls made before the
 * counter finishes loading are queued and replayed after init.
 */
(function () {
  var queue = [];
  window.__ym = function (goal, params) { queue.push([goal, params]); };

  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      var id = Number(cfg && cfg.metrikaId);
      if (!id) return;

      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) { return; } }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

      window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });

      window.__ym = function (goal, params) {
        try { window.ym(id, 'reachGoal', goal, params); } catch (e) { /* ignore */ }
      };
      queue.forEach(function (g) { window.__ym(g[0], g[1]); });
    })
    .catch(function () { /* analytics must never break the page */ });
})();
