const trackingStatus = document.querySelector('#tracking-status');
const trackingButton = document.querySelector('#tracking-share');
const mapButton = document.querySelector('#tracking-map-toggle');
const mapFrame = document.querySelector('#tracking-map');
const id = new URLSearchParams(location.search).get('load');
const endpoint = '/api/loads/' + encodeURIComponent(id || '') + '/position';
let watcher = null;
let heartbeat = null;
let pendingSend = null;
let position = null;
let lastSend = 0;
let mapVisible = false;
let updating = false;
let locationError = '';

function refreshMap() {
  mapButton.hidden = !position;
  mapFrame.hidden = !position || !mapVisible;
  if (mapFrame.hidden) {
    mapFrame.removeAttribute('src');
    return;
  }
  const url = freightMapUrl(position.latitude, position.longitude);
  if (mapFrame.getAttribute('src') !== url) mapFrame.src = url;
}

async function send(body, keepalive = false) {
  const response = await fetch(endpoint, { method: 'POST', keepalive,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json()).error || 'No se pudo actualizar la ubicación.');
}

function clearWatch() {
  if (watcher === null) return;
  navigator.geolocation.clearWatch(watcher);
  window.clearInterval(heartbeat);
  heartbeat = null;
  watcher = null;
  trackingButton.textContent = 'Compartir mi ubicación';
}

async function refreshTracking() {
  if (!id || updating) return;
  updating = true;
  try {
    const response = await fetch(endpoint);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (!result.canShare) clearWatch();
    trackingButton.hidden = !result.canShare;
    document.querySelector('#tracking-permission').hidden = !result.canShare;
    position = result.position;
    trackingStatus.textContent = locationError || (position
      ? 'Última ubicación recibida a las ' + new Date(position.updatedAt).toLocaleTimeString('es-NI')
      : result.inTransit ? 'Esperando una ubicación reciente del transportista.' : 'El viaje no está en tránsito.');
    refreshMap();
  } catch (error) {
    clearWatch();
    trackingButton.hidden = true;
    position = null;
    refreshMap();
    trackingStatus.textContent = error.message;
  } finally {
    updating = false;
  }
}

trackingButton.addEventListener('click', async () => {
  locationError = '';
  if (watcher !== null) {
    clearWatch();
    trackingButton.disabled = true;
    try {
      await pendingSend;
      await send({ action: 'stop' });
      await refreshTracking();
    } catch (error) { trackingStatus.textContent = error.message; }
    finally { trackingButton.disabled = false; }
    return;
  }
  if (!navigator.geolocation) { trackingStatus.textContent = 'Este navegador no ofrece ubicación.'; return; }
  lastSend = 0;
  const update = ({ coords }) => {
    if (watcher === null || pendingSend || Date.now() - lastSend < 10_000) return;
    lastSend = Date.now();
    pendingSend = send({ action: 'position', latitude: coords.latitude, longitude: coords.longitude })
      .then(() => { locationError = ''; return refreshTracking(); })
      .catch(error => { locationError = error.message; trackingStatus.textContent = locationError; })
      .finally(() => { pendingSend = null; });
  };
  const locationFailure = error => {
    clearWatch();
    locationError = error.code === 1 ? 'Permiso de ubicación denegado.' : 'No pudimos obtener tu ubicación.';
    trackingStatus.textContent = locationError;
    const stopSharing = () => send({ action: 'stop' }, true).catch(() => {});
    if (pendingSend) pendingSend.finally(stopSharing);
    else stopSharing();
  };
  const options = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };
  watcher = navigator.geolocation.watchPosition(update, locationFailure, options);
  heartbeat = window.setInterval(() => {
    if (Date.now() - lastSend >= 12_000) navigator.geolocation.getCurrentPosition(update, locationFailure, options);
  }, 15_000);
  trackingButton.textContent = 'Dejar de compartir';
});

mapButton.addEventListener('click', () => {
  mapVisible = !mapVisible;
  mapButton.textContent = mapVisible ? 'Ocultar mapa' : 'Mostrar en OpenStreetMap';
  refreshMap();
});

window.addEventListener('pagehide', () => {
  if (watcher === null) return;
  clearWatch();
  send({ action: 'stop' }, true).catch(() => {});
});
if (id) {
  refreshTracking();
  window.setInterval(refreshTracking, 10_000);
} else {
  trackingStatus.textContent = 'Abre el GPS desde un viaje en el tablero.';
}
