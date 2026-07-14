const params = new URLSearchParams(location.search);
const id = params.get('booking');
if (id) document.getElementById('booking-id').textContent = 'Номер брони: ' + id;
