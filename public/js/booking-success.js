const params = new URLSearchParams(location.search);
const id = params.get('booking');
if (id) document.getElementById('booking-id').textContent = 'Номер брони: ' + id;

// Conversion goal — no-op if Metrika is disabled (window.__ym queues then replays)
if (window.__ym) window.__ym('booking');
