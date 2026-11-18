const loadList = document.querySelector("#load-list");
const emptyState = document.querySelector("#empty-state");
const countElement = document.querySelector("#load-count");
const quoteNotice = document.querySelector('#quote-notice');
const quoteDialog = document.querySelector('#quote-dialog');
const quoteForm = document.querySelector('#quote-form');
const ratingDialog = document.querySelector('#rating-dialog');
const ratingForm = document.querySelector('#rating-form');
const nearbyButton = document.querySelector('#nearby-alerts');
const pickupMap = document.querySelector('#pickup-map');
const alertedLoads = new Set();
let nearbyWatch = null;
let nearbyPosition = null;
let alertAudio = null;
const starterQuoteDelay = 15 * 60 * 1000;
let viewerPlan = null;
const visibilityRank = { estandar: 0, destacada: 1, vip: 2 };
const visibilityLabel = { destacada: 'Destacada', vip: 'Urgente / VIP' };
const customerTypeLabel = { particular: 'Particular', comercio: 'Pequeño comercio', empresa: 'Empresa' };
let quotingId = null;
const postDialog = document.querySelector("#post-dialog");
const postForm = document.querySelector("#post-form");
const searchForm = document.querySelector("#search-form");
const toast = document.querySelector("#toast");
const filters = {
  origin: document.querySelector("#origin-filter"),
  destination: document.querySelector("#destination-filter"),
  equipment: document.querySelector("#equipment-filter"),
  sort: document.querySelector("#sort-select")
};
let toastTimer;

let loads = [];
let signedIn = false;
let mineOnly = false;
const deletingLoads = new Set();
const workflowBusy = new Set();
const removedLoadIds = new Set();
let sessionKnown = false;
let refreshing = null;
let currentUser = null;
let authMode = 'login';
let continueToPublish = false;
let authBusy = false;
const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
const passwordToggle = document.querySelector('#auth-password-toggle');
function setPasswordVisible(visible) {
  authForm.elements.namedItem('password').type = visible ? 'text' : 'password';
  passwordToggle.textContent = visible ? 'Ocultar' : 'Mostrar';
  passwordToggle.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
  passwordToggle.setAttribute('aria-pressed', String(visible));
}
passwordToggle.addEventListener('click', () => {
  setPasswordVisible(authForm.elements.namedItem('password').type === 'password');
});
authDialog.addEventListener('close', () => setPasswordVisible(false));
function setAccount(user) {
  const changed = currentUser?.id !== user?.id || currentUser?.role !== user?.role;
  currentUser = user;
  signedIn = Boolean(user);
  document.querySelector('#load-chat-inbox').hidden = !user || user.isAdmin;
  nearbyButton.hidden = user?.role !== 'transportista';
  if (user?.role !== 'transportista') stopNearbyAlerts();
  document.querySelectorAll('[data-plan-register]').forEach(button => { button.hidden = signedIn; });
  document.querySelector('#admin-open').hidden = !user?.isAdmin;
  document.querySelector('#commissions-open').hidden = !user?.isAdmin;
  document.querySelector('#carrier-open').hidden = user?.role !== 'transportista';
  document.querySelector('#bank-open').hidden = !user || !['empresa', 'transportista'].includes(user.role);
  if (!user) document.querySelector('#carrier-notice').hidden = true;
  document.querySelector('#access-gate').hidden = signedIn;
  document.querySelector('#load-board').hidden = !signedIn;
  document.querySelector('#board-meta').hidden = !signedIn;
  document.querySelector('#my-loads').hidden = !signedIn;
  const adminOnly = user?.role === 'administrador';
  for (const id of ['open-post-top', 'open-post-hero', 'empty-post']) document.getElementById(id).hidden = adminOnly;
  if (!signedIn) {
    loads = [];
    mineOnly = false;
    document.querySelector('#my-loads').setAttribute('aria-pressed', 'false');
    loads = loads.map(load => ({ ...load, canDelete: false }));
  }
  document.querySelector('#sign-in').hidden = signedIn;
  document.querySelector('#account-login').hidden = signedIn;
  document.querySelector('#account-logout').hidden = !signedIn;
  const label = document.querySelector('#account-label');
  label.hidden = !signedIn;
  label.title = user?.isAdmin ? 'Administrador: ' + user.email : '';
  label.textContent = user ? user.name + (user.isAdmin ? ' · Administrador' : user.role === 'transportista' ? ' · Transportista' : ' · Empresa') : '';
  if (changed) document.dispatchEvent(new CustomEvent('rutacarga:account', { detail: user }));
}
function setAuthMode(mode) {
  if (authBusy) return;
  setPasswordVisible(false);
  authMode = mode;
  const registering = mode === 'register';
  const label = registering ? 'Crear cuenta' : 'Iniciar sesión';
  document.querySelector('#auth-title').textContent = label;
  document.querySelector('#auth-submit').textContent = label;
  document.querySelector('#auth-description').textContent = registering ? 'Elige tu tipo de cuenta para acceder a las cargas en Nicaragua.' : 'Ingresa tu correo y contraseña para continuar.';
  for (const [id, name] of [['#auth-name-field', 'name'], ['#auth-confirm-field', 'confirmPassword'], ['#auth-role-field', 'role']]) {
    document.querySelector(id).hidden = !registering;
    authForm.elements.namedItem(name).disabled = !registering;
    authForm.elements.namedItem(name).required = registering;
  }
  const password = authForm.elements.namedItem('password');
  password.minLength = registering ? 12 : 1;
  password.autocomplete = registering ? 'new-password' : 'current-password';
  authForm.elements.namedItem('confirmPassword').setCustomValidity('');
  document.querySelector('#auth-password-help').textContent = registering ? 'Elige una contraseña de 12 a 128 caracteres.' : 'Usa la contraseña de tu cuenta de Carrier.INC.';
  document.querySelector('#auth-login-mode').setAttribute('aria-pressed', String(!registering));
  document.querySelector('#auth-register-mode').setAttribute('aria-pressed', String(registering));
  document.querySelector('#auth-error').hidden = true;
  updatePhoneField();
}
function updatePhoneField() {
  const needed = authMode === 'register' && authForm.elements.namedItem('role').value === 'transportista';
  document.querySelector('#auth-phone-field').hidden = !needed;
  document.querySelector('#auth-sms-field').hidden = !needed;
  authForm.elements.namedItem('phone').disabled = !needed;
  authForm.elements.namedItem('phone').required = needed;
  authForm.elements.namedItem('smsConsent').disabled = !needed;
}
authForm.elements.namedItem('role').addEventListener('change', updatePhoneField);
function openAuth(mode = 'login', publishing = false) {
  continueToPublish = publishing;
  setAuthMode(mode);
  if (!authDialog.open) authDialog.showModal();
}

async function refreshLoads() {
  if (refreshing) return refreshing;
  refreshing = updateLoads();
  try { return await refreshing; } finally { refreshing = null; }
}
async function updateLoads() {
  try {
    const response = await fetch(mineOnly ? '/api/loads?mine=1' : '/api/loads', { cache: 'no-store' });
    if (response.status === 401) {
      setAccount(null);
      sessionKnown = true;
      renderLoads();
      document.querySelector('#connection-status').textContent = '';
      return;
    }
    if (response.status === 403) {
      const result = await response.json();
      if (result.onboardingRequired) {
        setAccount(result.user); loads = []; renderLoads();
        sessionKnown = true;
        document.querySelector('#connection-status').textContent = result.error;
        document.querySelector('#carrier-notice').hidden = false;
        document.querySelector('#load-board').hidden = true;
        return;
      }
    }
    if (!response.ok) throw new Error('No se pudieron consultar las cargas.');
    const data = await response.json();
    viewerPlan = data.plan;
    loads = data.loads.filter(load => !removedLoadIds.has(load.id));
    setAccount(data.user || null);
    document.querySelector('#carrier-notice').hidden = true;
    sessionKnown = true;
    document.querySelector('#sign-in').hidden = signedIn;
    document.querySelector('#connection-status').textContent = 'Conectado · Las cargas se comparten entre dispositivos. Actualización cada 30 segundos.';
    renderLoads();
    checkNearbyLoads();
    if (signedIn && new URLSearchParams(window.location.search).get('publicar') === '1') {
      const url = new URL(window.location.href);
      url.searchParams.delete('publicar');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      openPostDialog();
    }
  } catch (error) {
    document.querySelector('#connection-status').textContent = 'No pudimos actualizar las cargas. Reintentaremos automáticamente; revisa tu conexión.';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("es-NI", { style: "currency", currency, currencyDisplay: "code" }).format(value);
}

function formatWeight(value) {
  return `${new Intl.NumberFormat("es-NI").format(value)} kg`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-NI", { month: "short", day: "numeric" }).format(date);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
}

function normalizeSearch(value) {
  return value.trim().toLocaleLowerCase("es-NI").normalize("NFD").replace(/\p{M}/gu, "");
}

function getVisibleLoads() {
  const origin = normalizeSearch(filters.origin.value);
  const destination = normalizeSearch(filters.destination.value);
  const equipment = filters.equipment.value;

  return loads.filter((load) =>
    normalizeSearch(load.origin).includes(origin) &&
    normalizeSearch(load.destination).includes(destination) &&
    (!equipment || load.equipment === equipment)
  ).sort((a, b) => {
    if (filters.sort.value === "pay-desc") return b.currency.localeCompare(a.currency) || Number(b.pay) - Number(a.pay);
    if (filters.sort.value === "pay-asc") return b.currency.localeCompare(a.currency) || Number(a.pay) - Number(b.pay);
    return (visibilityRank[b.visibility] ?? 0) - (visibilityRank[a.visibility] ?? 0)
      || new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function renderLoads() {
  const visibleLoads = getVisibleLoads();
  const hasFilters = Boolean(filters.origin.value.trim() || filters.destination.value.trim() || filters.equipment.value);
  document.querySelector('#empty-title').textContent = hasFilters ? 'No encontramos cargas con esos filtros' : (mineOnly ? 'No tienes cargas ni viajes asignados' : 'Aún no hay cargas publicadas');
  document.querySelector('#empty-description').textContent = hasFilters ? 'Prueba con otro municipio o equipo, o publica tu propio envío.' : 'Publica la primera carga con los datos de tu envío para que los transportistas puedan contactarte.';
  document.querySelector('#empty-clear').hidden = !hasFilters;
  countElement.textContent = String(visibleLoads.length);
  document.querySelector('#load-count-label').textContent = mineOnly ? 'cargas y viajes de tu cuenta' : 'cargas disponibles';
  emptyState.hidden = visibleLoads.length > 0;
  loadList.hidden = visibleLoads.length === 0;
  loadList.innerHTML = visibleLoads.map((load) => {
    const canChat = load.isOwner || load.isCarrier || (currentUser?.role === 'transportista' && load.status === 'disponible');
    const contactControl = canChat
      ? `<a class="button contact-button" href="load-chat.html?load=${encodeURIComponent(load.id)}">Abrir chat</a>`
      : '';
    const quoteControl = currentUser?.role === 'transportista' && !load.isOwner && load.status === 'disponible'
      ? `<button type="button" class="button button-light button-small" data-quote-load="${escapeHtml(load.id)}">Cotizar</button>`
      : '';
    const quoteListControl = load.isOwner
      ? `<button type="button" class="button button-light button-small" data-quote-list="${escapeHtml(load.id)}">Ver cotizaciones</button>`
      : '';
    const mapControl = load.pickupLatitude != null && load.pickupLongitude != null
      ? `<button type="button" class="button button-light button-small" data-pickup-map="${escapeHtml(load.id)}">Mapa de recogida</button>` : '';
    const trackingControl = load.corporateExtras && load.status === 'en_transito' && (load.isOwner || load.isCarrier)
      ? `<a class="button button-light button-small" href="tracking.html?load=${encodeURIComponent(load.id)}">GPS en vivo</a>` : '';
    const removeControl = load.canDelete === true && signedIn
      ? `<button type="button" class="delete-load-button" data-delete-load="${escapeHtml(load.id)}" ${deletingLoads.has(load.id) || workflowBusy.has(load.id) ? 'disabled' : ''}>${deletingLoads.has(load.id) ? 'Eliminando…' : 'Eliminar'}<span class="sr-only"> carga de ${escapeHtml(load.origin)} a ${escapeHtml(load.destination)}</span></button>` : '';
    return `
      <article class="load-card">
        <div class="route-info">
          <div class="company-line"><span class="company-avatar">${escapeHtml(initials(load.company))}</span>${escapeHtml(load.company)} · ${escapeHtml(customerTypeLabel[load.customerType] || '')}</div>
          ${visibilityLabel[load.visibility] ? `<strong class="equipment-pill">${visibilityLabel[load.visibility]}</strong>` : ''}
          <div class="route-cities"><span>${escapeHtml(load.origin)}</span><span class="route-arrow" aria-hidden="true">→</span><span>${escapeHtml(load.destination)}</span></div>
        </div>
        <div class="load-detail"><span class="detail-label">RECOGIDA</span><span class="detail-value">${escapeHtml(formatDate(load.pickupDate))}</span></div>
        <div class="load-detail"><span class="detail-label">EQUIPO</span><span class="equipment-pill">${escapeHtml(load.equipment)}</span></div>
        <div class="load-detail"><span class="detail-label">PESO</span><span class="detail-value">${escapeHtml(formatWeight(load.weight))}</span></div>
        <div class="load-detail pay-detail"><span class="detail-label">PAGO OFRECIDO</span><span class="detail-value pay-value">${escapeHtml(formatCurrency(load.pay, load.currency))}</span></div>
        <div class="load-actions">${contactControl}${mapControl}${trackingControl}${quoteControl}${quoteListControl}${workflowControls(load)}${removeControl}</div><div class="load-extra">${workflowSummary(load)}</div>
      </article>`;
  }).join("");
}

function stopNearbyAlerts() {
  if (nearbyWatch !== null) navigator.geolocation.clearWatch(nearbyWatch);
  nearbyWatch = null;
  nearbyPosition = null;
  alertedLoads.clear();
  nearbyButton.setAttribute('aria-pressed', 'false');
  nearbyButton.textContent = 'Activar avisos cercanos';
  if (alertAudio) alertAudio.close().catch(() => {});
  alertAudio = null;
}

function checkNearbyLoads() {
  if (!nearbyPosition || mineOnly || document.hidden) return;
  const matches = loads.filter(load => ['vip', 'destacada'].includes(load.visibility)
    && load.status === 'disponible' && load.pickupLatitude != null && load.pickupLongitude != null
    && !alertedLoads.has(load.id) && freightDistanceKm(nearbyPosition, { latitude: load.pickupLatitude, longitude: load.pickupLongitude }) <= 5);
  if (!matches.length) return;
  matches.forEach(load => alertedLoads.add(load.id));
  if (matches.some(load => load.visibility === 'vip') && alertAudio?.state === 'running') {
    const source = alertAudio.createOscillator();
    const gain = alertAudio.createGain();
    source.frequency.value = 700;
    gain.gain.value = 0.12;
    source.connect(gain).connect(alertAudio.destination);
    source.start();
    source.stop(alertAudio.currentTime + 0.4);
  }
  showToast(matches.length === 1 ? 'Flete cercano: ' + matches[0].origin + ' → ' + matches[0].destination : matches.length + ' fletes destacados o VIP a menos de 5 km.');
}

nearbyButton.addEventListener('click', () => {
  if (nearbyWatch !== null) { stopNearbyAlerts(); return; }
  if (!navigator.geolocation) { showToast('Tu navegador no ofrece ubicación.'); return; }
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio) {
    alertAudio = new Audio();
    alertAudio.resume().catch(() => {});
  }
  nearbyWatch = navigator.geolocation.watchPosition(({ coords }) => {
    if (nearbyWatch === null) return;
    nearbyPosition = coords;
    checkNearbyLoads();
  }, () => {
    stopNearbyAlerts();
    showToast('Permite la ubicación para recibir avisos de fletes cercanos.');
  }, { maximumAge: 30_000, timeout: 20_000 });
  nearbyButton.setAttribute('aria-pressed', 'true');
  nearbyButton.textContent = 'Desactivar avisos cercanos';
});
window.addEventListener('pagehide', stopNearbyAlerts);
pickupMap.addEventListener('close', () => pickupMap.querySelector('iframe').removeAttribute('src'));
loadList.addEventListener('click', event => {
  const button = event.target.closest('[data-pickup-map]');
  if (!button) return;
  const load = loads.find(item => item.id === button.dataset.pickupMap);
  if (!load || load.pickupLatitude == null || load.pickupLongitude == null) return;
  pickupMap.querySelector('iframe').src = freightMapUrl(load.pickupLatitude, load.pickupLongitude);
  pickupMap.showModal();
});

function showQuoteNotice(message, corporate) {
  document.querySelector('#quote-notice-message').textContent = message;
  document.querySelector('#quote-plan-status').hidden = !corporate;
  document.querySelector('#quote-plans-link').hidden = !corporate;
  quoteNotice.showModal();
}
loadList.addEventListener('click', async event => {
  const listButton = event.target.closest('[data-quote-list]');
  if (listButton) {
    listButton.disabled = true;
    try {
      const response = await fetch('/api/loads/' + encodeURIComponent(listButton.dataset.quoteList) + '/quotes');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const list = document.querySelector('#quotes-results');
      list.replaceChildren();
      for (const quote of result.quotes) {
        const row = document.createElement('li');
        const gold = quote.priority === 2 ? ' · Verificado Oro' : '';
        const score = quote.rating != null ? ' · ' + quote.rating.toFixed(1) + '/5' : '';
        row.textContent = quote.name + ' · ' + formatCurrency(quote.amountCents / 100, result.currency) + gold + score + ' · ';
        const chat = document.createElement('a');
        chat.textContent = 'Abrir chat';
        chat.href = 'load-chat.html?' + new URLSearchParams({ load: listButton.dataset.quoteList, carrier: quote.carrierId });
        row.append(chat);
        list.append(row);
      }
      if (!result.quotes.length) {
        const row = document.createElement('li');
        row.textContent = 'Todavía no hay cotizaciones.';
        list.append(row);
      }
      document.querySelector('#quotes-list').showModal();
    } catch (error) {
      showToast(error.message || 'No pudimos consultar las cotizaciones.');
    } finally {
      listButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest('[data-quote-load]');
  if (!button || currentUser?.role !== 'transportista') return;
  const load = loads.find(item => item.id === button.dataset.quoteLoad);
  if (!load) return;
  const recentlyPublished = Date.now() < Date.parse(load.createdAt) + starterQuoteDelay;
  if (load.corporate && viewerPlan !== 'elite') {
    showQuoteNotice('Este es un flete corporativo exclusivo para miembros Elite (con Récord de Policía verificado). Sube tu Récord de Policía y activa tu plan para cotizar ahora.', true);
    return;
  }
  if (load.customerType === 'comercio' && !viewerPlan) {
    showQuoteNotice('Para cotizar fletes de pequeños comercios, activa Chofer Pro o Flota / Elite.', false);
    return;
  }
  if (!viewerPlan && recentlyPublished) {
    showQuoteNotice('Este flete está en acceso anticipado. Podrás cotizar 15 minutos después de su publicación con el plan Arrancador.', false);
    return;
  }
  quotingId = load.id;
  quoteForm.elements.amount.value = load.pay;
  document.querySelector('#quote-amount-label').textContent = 'Importe ofrecido (' + load.currency + ')';
  document.querySelector('#quote-error').textContent = '';
  quoteDialog.showModal();
});
document.querySelector('#quote-plans-link').addEventListener('click', () => quoteNotice.close());
document.querySelector('#quote-cancel').addEventListener('click', () => quoteDialog.close());
quoteForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = quoteForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch('/api/loads/' + encodeURIComponent(quotingId) + '/quotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents: Math.round(Number(quoteForm.elements.amount.value) * 100) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    quoteDialog.close();
    showToast('Cotización enviada.');
  } catch (error) {
    document.querySelector('#quote-error').textContent = error.message || 'No pudimos enviar la cotización.';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#my-loads').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    if (refreshing) await refreshLoads();
    if (!signedIn) { openAuth(); return; }
    mineOnly = !mineOnly;
    button.setAttribute('aria-pressed', String(mineOnly));
    await refreshLoads();
  } finally { button.disabled = false; }
});
loadList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-load]');
  if (!button || !loadList.contains(button)) return;
  const id = button.dataset.deleteLoad;
  const load = loads.find(item => item.id === id);
  if (!load || load.canDelete !== true || !signedIn || deletingLoads.has(id)) return;
  if (!window.confirm(`¿Eliminar la carga de ${load.origin} a ${load.destination}? Esta acción es definitiva.`)) return;
  deletingLoads.add(id);
  renderLoads();
  try {
    const response = await fetch('/api/loads/' + encodeURIComponent(id), { method: 'DELETE' });
    const result = await response.json();
    if (response.status === 401) {
      setAccount(null);
      renderLoads();
      openAuth();
      showToast('Inicia sesión de nuevo para eliminar tu carga.');
      return;
    }
    if (!response.ok) throw new Error(result.error || 'No pudimos eliminar la carga.');
    removedLoadIds.add(id);
    loads = loads.filter(item => item.id !== id);
    renderLoads();
    showToast('Carga eliminada.');
    await refreshLoads();
  } catch (error) { showToast(error.message || 'Revisa tu conexión e intenta de nuevo.'); }
  finally { deletingLoads.delete(id); renderLoads(); }
});

const assignDialog = document.querySelector('#assign-dialog');
const transferDialog = document.querySelector('#transfer-dialog');
transferDialog.addEventListener('close', () => {
  transferDialog.querySelectorAll('dd').forEach(value => { value.textContent = ''; });
});
const assignForm = document.querySelector('#assign-form');
let assigningId = null;
const statusNames = { disponible: 'Disponible', asignada: 'Esperando aceptación', en_transito: 'En tránsito', entregada: 'Entrega reportada', finalizada: 'Finalizada' };
function workflowControls(load) {
  const button = (action, title) => `<button class="workflow-button" type="button" data-workflow="${action}" data-load="${escapeHtml(load.id)}" ${workflowBusy.has(load.id) ? 'disabled' : ''}>${title}</button>`;
  let html = '';
  if (load.canAssign) html += button('assign', 'Asignar transportista');
  if (load.isOwner && load.status === 'asignada') html += button('cancel_assignment', 'Retirar asignación');
  if (load.isCarrier && load.status === 'asignada') html += button('accept', 'Aceptar viaje') + button('reject', 'Rechazar');
  if (load.isCarrier && ['en_transito', 'entregada'].includes(load.status) && !load.hasDeliveryEvidence) {
    html += `<form class="post-form" data-delivery-form="${escapeHtml(load.id)}">
      <label class="form-field"><span>Foto del documento de recibido del cliente en destino</span><input type="file" name="receipt" accept="image/jpeg,image/png" required></label>
      <label class="form-field"><span>Foto de la carga en el lugar de entrega</span><input type="file" name="cargo" accept="image/jpeg,image/png" required></label>
      ${load.corporateExtras ? `<fieldset class="delivery-signature"><legend>Firma del receptor</legend>
        <label class="form-field"><span>Nombre completo del receptor</span><input name="signer" maxlength="120"></label>
        <p>El receptor puede firmar en el recuadro o adjuntar una imagen de su firma.</p>
        <canvas width="600" height="210" aria-label="Área para dibujar la firma" data-signature-canvas></canvas>
        <button class="button button-light button-small" type="button" data-signature-clear>Borrar firma dibujada</button>
        <label class="form-field"><span>Adjuntar imagen de firma</span><input type="file" name="signatureFile" accept="image/jpeg,image/png"></label>
        <label class="form-note"><input type="checkbox" name="signatureConsent" value="true"> El receptor autorizó guardar su firma con el comprobante de esta entrega.</label>
      </fieldset>` : ''}
      <button type="submit" class="workflow-button" ${workflowBusy.has(load.id) ? 'disabled' : ''}>Reportar entrega</button>
    </form>`;
  }
  if (load.isOwner && load.status === 'entregada' && load.hasDeliveryEvidence) html += button('complete', 'Confirmar entrega');
  if (load.isOwner && load.status === 'finalizada') html += button('transfer', 'Datos para transferir el flete');
  if (load.isOwner && load.status === 'finalizada' && load.rating == null) html += button('rate', 'Calificar transportista');
  return html;
}
function workflowSummary(load) {
  const status = escapeHtml(statusNames[load.status] || 'Disponible');
  const carrier = load.carrierName ? '<span>Transportista: ' + escapeHtml(load.carrierName) + '</span>' : '';
  const unit = load.vehiclePlate ? '<span>Unidad: ' + escapeHtml(load.vehiclePlate) + ' · Conductor: ' + escapeHtml(load.driverName || '') + ' · Categoría: ' + escapeHtml(load.licenseCategory || '') + '</span>' : '';
  const evidenceUrl = '/api/loads/' + encodeURIComponent(load.id) + '/delivery-evidence?photo=';
  const evidence = load.hasDeliveryEvidence
    ? `<span><a href="${evidenceUrl}receipt" target="_blank" rel="noopener">Ver documento de recibido</a> · <a href="${evidenceUrl}cargo" target="_blank" rel="noopener">Ver foto de la carga</a></span>`
    : '';
  const signature = load.deliverySigner
    ? `<span>Recibió ${escapeHtml(load.deliverySigner)} · <a href="${evidenceUrl}signature" target="_blank" rel="noopener">Ver firma de entrega</a></span>`
    : '';
  const rating = load.rating != null ? '<span>Calificación del transportista: ' + escapeHtml(load.rating) + '/5</span>' : '';
  return '<span class="shipment-status">' + status + '</span>' + carrier + unit + evidence + signature + rating;
}
async function workflowRequest(id, payload) {
  const response = await fetch('/api/loads/' + encodeURIComponent(id) + '/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (response.status === 401) {
    setAccount(null);
    if (assignDialog.open) assignDialog.close();
    openAuth();
  }
  if (!response.ok) throw new Error(result.error || 'No pudimos actualizar la carga.');
  return result;
}
function showMyLoads() {
  mineOnly = true;
  document.querySelector('#my-loads').setAttribute('aria-pressed', 'true');
}
loadList.addEventListener('click', async event => {
  const button = event.target.closest('[data-workflow]');
  if (!button || !loadList.contains(button)) return;
  const load = loads.find(item => item.id === button.dataset.load);
  if (!load || workflowBusy.has(load.id)) return;
  const action = button.dataset.workflow;
  if (action === 'rate') {
    ratingForm.reset();
    ratingForm.dataset.load = load.id;
    document.querySelector('#rating-error').textContent = '';
    ratingDialog.showModal();
    return;
  }
  if (action === 'transfer') {
    workflowBusy.add(load.id);
    button.disabled = true;
    try {
      const response = await fetch('/api/bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'direct-transfer', loadId: load.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No pudimos consultar los datos de transferencia.');
      if (!signedIn) return;
      document.querySelector('#transfer-fare').textContent = formatCurrency(data.fareCents / 100, data.currency);
      document.querySelector('#transfer-bank').textContent = data.bankName;
      document.querySelector('#transfer-holder').textContent = data.holderName;
      document.querySelector('#transfer-type').textContent = data.accountType === 'ahorro' ? 'Ahorro' : 'Corriente';
      document.querySelector('#transfer-number').textContent = data.accountNumber;
      transferDialog.showModal();
    } catch (error) {
      showToast(error.message || 'Revisa tu conexión.');
    } finally {
      workflowBusy.delete(load.id);
      button.disabled = false;
    }
    return;
  }
  if (action === 'assign') {
    if (!load.canAssign) return;
    assigningId = load.id;
    assignForm.reset();
    const picker = assignForm.elements.namedItem('carrierId');
    picker.replaceChildren(new Option('Cargando transportistas…', ''));
    assignForm.elements.namedItem('vehicleId').innerHTML = '<option value="">Consulta primero el transportista</option>';
    document.querySelector('#assign-verified').textContent = '';
    document.querySelector('#assign-route').textContent = load.origin + ' → ' + load.destination;
    document.querySelector('#assign-quote').textContent = 'Flete directo al transportista: ' + formatCurrency(load.pay, load.currency);
    document.querySelector('#assign-error').hidden = true;
    assignDialog.showModal();
    try {
      const response = await fetch('/api/loads/' + encodeURIComponent(load.id) + '/chat');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (assigningId !== load.id) return;
      picker.replaceChildren(new Option(data.participants.length ? 'Selecciona un transportista' : 'Todavía no hay chats ni cotizaciones', ''),
        ...data.participants.map(carrier => new Option(carrier.name, carrier.id)));
    } catch (error) {
      if (assigningId !== load.id) return;
      picker.replaceChildren(new Option('No pudimos cargar los transportistas', ''));
      const target = document.querySelector('#assign-error');
      target.textContent = error.message;
      target.hidden = false;
    }
    return;
  }
  const messages = {
    accept: '¿Aceptar este viaje por el flete indicado? La empresa te pagará directamente.',
    reject: '¿Rechazar esta asignación? La carga volverá a estar disponible.',
    cancel_assignment: '¿Retirar la asignación antes de que el transportista la acepte?',
    complete: '¿Confirmas que la carga fue entregada? Podrás consultar los datos para transferir el flete directamente al transportista.'
  };
  if (!messages[action] || !window.confirm(messages[action])) return;
  workflowBusy.add(load.id);
  renderLoads();
  try {
    await workflowRequest(load.id, { action });
    showMyLoads();
    await refreshLoads();
    showToast(action === 'complete' ? 'Entrega confirmada. Ya puedes consultar los datos para transferir el flete.' : 'Estado de la carga actualizado.');
  } catch (error) { showToast(error.message || 'Revisa tu conexión.'); }
  finally { workflowBusy.delete(load.id); renderLoads(); }
});
let signatureStroke = null;
function signaturePoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height };
}
loadList.addEventListener('pointerdown', event => {
  const canvas = event.target.closest('[data-signature-canvas]');
  if (!canvas || signatureStroke || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  signatureStroke = { canvas, id: event.pointerId, last: signaturePoint(event, canvas) };
});
loadList.addEventListener('pointermove', event => {
  if (signatureStroke?.id !== event.pointerId) return;
  const { canvas, last } = signatureStroke;
  const point = signaturePoint(event, canvas);
  const context = canvas.getContext('2d');
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.strokeStyle = '#152d52';
  context.beginPath();
  context.moveTo(last.x, last.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  signatureStroke.last = point;
  canvas.dataset.signed = 'true';
});
loadList.addEventListener('lostpointercapture', event => {
  if (signatureStroke?.id === event.pointerId) signatureStroke = null;
});
loadList.addEventListener('click', event => {
  const button = event.target.closest('[data-signature-clear]');
  if (!button) return;
  const canvas = button.closest('fieldset').querySelector('canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  delete canvas.dataset.signed;
});
loadList.addEventListener('submit', async event => {
  const form = event.target.closest('[data-delivery-form]');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.deliveryForm;
  if (workflowBusy.has(id)) return;
  const photos = new FormData(form);
  const button = form.querySelector('button[type="submit"]');
  workflowBusy.add(id);
  button.disabled = true;
  try {
    const attachment = photos.get('signatureFile');
    photos.delete('signatureFile');
    const canvas = form.querySelector('canvas[data-signed]');
    if (attachment?.size) photos.set('signature', attachment);
    else if (canvas) {
      const signature = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!signature) throw new Error('No se pudo guardar la firma. Vuelve a dibujarla.');
      photos.set('signature', signature, 'firma.png');
    }
    const response = await fetch('/api/loads/' + encodeURIComponent(id) + '/delivery-evidence', { method: 'POST', body: photos });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos guardar las fotos.');
    workflowBusy.delete(id);
    showMyLoads();
    await refreshLoads();
    showToast('Entrega reportada. La empresa puede revisar las fotos y confirmar.');
  } catch (error) {
    showToast(error.message || 'Revisa tu conexión.');
  } finally {
    workflowBusy.delete(id);
    button.disabled = false;
  }
});
document.querySelector('#assign-close').addEventListener('click', () => { if (!workflowBusy.has(assigningId)) assignDialog.close(); });
document.querySelector('#rating-close').addEventListener('click', () => ratingDialog.close());
ratingForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = ratingForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch('/api/loads/' + encodeURIComponent(ratingForm.dataset.load) + '/rating', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: Number(ratingForm.elements.score.value) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    ratingDialog.close();
    await refreshLoads();
    showToast('Calificación guardada.');
  } catch (error) {
    document.querySelector('#rating-error').textContent = error.message || 'No pudimos guardar la calificación.';
  } finally {
    button.disabled = false;
  }
});
assignDialog.addEventListener('cancel', event => { if (workflowBusy.has(assigningId)) event.preventDefault(); });
assignForm.elements.namedItem('carrierId').addEventListener('change', () => {
  assignForm.elements.namedItem('vehicleId').innerHTML = '<option value="">Consulta las unidades de este transportista</option>';
  document.querySelector('#assign-verified').textContent = '';
});
document.querySelector('#assign-lookup').addEventListener('click', async event => {
  if (!assigningId || workflowBusy.has(assigningId)) return;
  const picker = assignForm.elements.namedItem('carrierId');
  if (!picker.reportValidity()) return;
  const button = event.currentTarget; button.disabled = true;
  workflowBusy.add(assigningId);
  const carrierId = picker.value;
  try {
    const result = await workflowRequest(assigningId, { action: 'options', carrierId });
    if (carrierId !== picker.value) return;
    assignForm.elements.namedItem('vehicleId').innerHTML = '<option value="">Selecciona una unidad</option>' + result.vehicles.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.plate)} · ${escapeHtml(v.driverName)} · Categoría ${escapeHtml(v.category)}</option>`).join('');
    document.querySelector('#assign-verified').textContent = result.vehicles.length ? 'Documentación completa y con fechas vigentes hasta la recogida: ' + result.checkedThrough + '. Fechas y categorías declaradas por el transportista.' : 'No tiene unidades habilitadas para esta fecha, equipo y capacidad. El transportista debe completar o renovar su expediente.';
  } catch (error) { document.querySelector('#assign-error').textContent = error.message; document.querySelector('#assign-error').hidden = false; }
  finally { workflowBusy.delete(assigningId); button.disabled = false; }
});
assignForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!assignForm.reportValidity() || !assigningId || workflowBusy.has(assigningId)) return;
  const id = assigningId;
  const button = assignForm.querySelector('[type="submit"]');
  button.disabled = true;
  workflowBusy.add(id);
  document.querySelector('#assign-error').hidden = true;
  try {
    await workflowRequest(id, { action: 'assign', carrierId: assignForm.elements.namedItem('carrierId').value, vehicleId: assignForm.elements.namedItem('vehicleId').value });
    assignDialog.close();
    showMyLoads();
    await refreshLoads();
    showToast('Carga asignada. El transportista debe aceptar el viaje en Mis cargas.');
  } catch (error) {
    const target = document.querySelector('#assign-error');
    target.textContent = error.message || 'Revisa los datos.';
    target.hidden = false;
  } finally { workflowBusy.delete(id); button.disabled = false; renderLoads(); }
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3300);
}

async function openPostDialog() {
  if (!sessionKnown) await refreshLoads();
  if (!sessionKnown) { showToast('No pudimos verificar tu sesión. Revisa la conexión e intenta de nuevo.'); return; }
  if (!signedIn) { openAuth('login', true); return; }
  if (currentUser?.role === 'administrador') { showToast('Tu cuenta administra la plataforma y no publica cargas.'); return; }
  document.querySelector('#publish-error').hidden = true;
  if (currentUser) {
    if (!postForm.elements.namedItem('company').value) postForm.elements.namedItem('company').value = currentUser.name;
  }
  const visibility = postForm.elements.namedItem('visibility');
  visibility.querySelector('[value="destacada"]').disabled = !['negocio', 'corporativo'].includes(viewerPlan);
  visibility.querySelector('[value="vip"]').disabled = viewerPlan !== 'corporativo';
  if (visibility.selectedOptions[0]?.disabled) visibility.value = 'estandar';
  const dateInput = postForm.elements.namedItem("pickupDate");
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const localToday = ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
  dateInput.min = localToday;
  if (!dateInput.value || dateInput.value < localToday) dateInput.value = localToday;
  if (!postDialog.open) postDialog.showModal();
}

document.querySelector('#pickup-location').addEventListener('click', () => {
  const locationStatus = document.querySelector('#pickup-location-status');
  if (!navigator.geolocation) { locationStatus.textContent = 'Ingresa las coordenadas de recogida manualmente.'; return; }
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    postForm.elements.pickupLatitude.value = coords.latitude;
    postForm.elements.pickupLongitude.value = coords.longitude;
    locationStatus.textContent = 'Punto listo. Se mostrará a usuarios registrados al publicar.';
  }, () => { locationStatus.textContent = 'No se pudo obtener tu ubicación. Puedes ingresar el punto manualmente.'; }, { timeout: 15_000 });
});

document.querySelector("#open-post-top").addEventListener("click", openPostDialog);
document.querySelector("#open-post-hero").addEventListener("click", openPostDialog);
document.querySelector("#empty-post").addEventListener("click", openPostDialog);
document.querySelector("#close-dialog").addEventListener("click", () => postDialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => postDialog.close());
postDialog.addEventListener("click", (event) => {
  if (event.target === postDialog) postDialog.close();
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!postForm.reportValidity()) return;

  const formData = new FormData(postForm);
  const latitude = formData.get('pickupLatitude');
  const longitude = formData.get('pickupLongitude');
  if (Boolean(latitude) !== Boolean(longitude)) {
    const error = document.querySelector('#publish-error');
    error.textContent = 'Indica ambas coordenadas de recogida.';
    error.hidden = false;
    return;
  }
  const newLoad = {
    origin: String(formData.get("origin")).trim(),
    destination: String(formData.get("destination")).trim(),
    pickupDate: String(formData.get("pickupDate")),
    equipment: String(formData.get("equipment")),
    weight: Number(formData.get("weight")),
    pay: Number(formData.get("pay")),
    currency: 'USD',
    company: String(formData.get("company")).trim(),
    customerType: String(formData.get("customerType")),
    visibility: String(formData.get("visibility")),
    ...(latitude && longitude ? { pickupLocation: { latitude: Number(latitude), longitude: Number(longitude) } } : {}),
  };

  const button = postForm.querySelector('[type="submit"]');
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Guardando…";
  document.querySelector("#publish-error").hidden = true;
  try {
    const response = await fetch('/api/loads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newLoad) });
    const result = await response.json();
    if (response.status === 401) {
      setAccount(null);
      postDialog.close();
      openAuth('login', true);
      return;
    }
    if (!response.ok) throw new Error(result.error || 'No pudimos publicar la carga.');
    loads = [result.load, ...loads];
  } catch (error) {
    const errorElement = document.querySelector('#publish-error');
    errorElement.textContent = error.message || 'Revisa tu conexión e intenta de nuevo.';
    errorElement.hidden = false;
    return;
  } finally { button.disabled = false; button.textContent = originalLabel; }

  postForm.reset();
  postDialog.close();
  filters.origin.value = "";
  filters.destination.value = "";
  filters.equipment.value = "";
  filters.sort.value = "newest";
  renderLoads();
  showToast("¡Carga publicada! Ya aparece en el tablero.");
  document.querySelector("#tablero").scrollIntoView({ behavior: "smooth" });
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderLoads();
});

filters.origin.addEventListener("input", renderLoads);
filters.destination.addEventListener("input", renderLoads);
filters.equipment.addEventListener("change", renderLoads);
filters.sort.addEventListener("change", renderLoads);

function clearFilters() {
  filters.origin.value = "";
  filters.destination.value = "";
  filters.equipment.value = "";
  filters.sort.value = "newest";
  renderLoads();
}

document.querySelector("#clear-filters").addEventListener("click", clearFilters);
document.querySelector("#empty-clear").addEventListener("click", clearFilters);
document.querySelector("#current-year").textContent = String(new Date().getFullYear());


function openRoleRegistration(role) {
  openAuth('register');
  authForm.elements.namedItem('role').value = role;
  updatePhoneField();
}
document.querySelector('#register-carrier').addEventListener('click', () => openRoleRegistration('transportista'));
document.querySelectorAll('[data-plan-register]').forEach(button => {
  button.addEventListener('click', () => openRoleRegistration(button.dataset.planRegister));
});
document.querySelector('#gate-login').addEventListener('click', () => openAuth());
document.querySelector('#account-login').addEventListener('click', () => openAuth());
document.querySelector('#sign-in').addEventListener('click', () => openAuth('login', true));
document.querySelector('#auth-login-mode').addEventListener('click', () => setAuthMode('login'));
document.querySelector('#auth-register-mode').addEventListener('click', () => setAuthMode('register'));
document.querySelector('#auth-close').addEventListener('click', () => { if (!authBusy) authDialog.close(); });
authDialog.addEventListener('cancel', (event) => { if (authBusy) event.preventDefault(); });
authDialog.addEventListener('click', (event) => { if (event.target === authDialog && !authBusy) authDialog.close(); });
authForm.elements.namedItem('confirmPassword').addEventListener('input', (event) => event.target.setCustomValidity(''));
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authBusy) return;
  const confirmation = authForm.elements.namedItem('confirmPassword');
  confirmation.setCustomValidity(authMode === 'register' && confirmation.value !== authForm.elements.namedItem('password').value ? 'Las contraseñas no coinciden.' : '');
  if (!authForm.reportValidity()) return;
  const data = new FormData(authForm);
  const payload = { email: String(data.get('email')).trim(), password: String(data.get('password')) };
  if (authMode === 'register') { payload.name = String(data.get('name')).trim(); payload.role = String(data.get('role')); }
  if (authMode === 'register' && payload.role === 'transportista') { payload.phone = String(data.get('phone')).trim(); payload.smsConsent = data.has('smsConsent'); }
  authBusy = true;
  const button = document.querySelector('#auth-submit');
  button.disabled = true;
  button.textContent = 'Procesando…';
  document.querySelector('#auth-error').hidden = true;
  try {
    const response = await fetch('/api/auth/' + authMode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos completar el acceso.');
    setAccount(result.user);
    sessionKnown = true;
    authForm.reset();
    authDialog.close();
    if (result.onboardingRequired) { window.location.assign('/carrier.html'); return; }
    showToast(authMode === 'register' ? 'Tu cuenta está lista.' : 'Sesión iniciada.');
    if (continueToPublish) await openPostDialog();
    refreshLoads();
  } catch (error) {
    const target = document.querySelector('#auth-error');
    target.textContent = error.message || 'Revisa tu conexión e intenta de nuevo.';
    target.hidden = false;
  } finally {
    authBusy = false;
    button.disabled = false;
    button.textContent = authMode === 'register' ? 'Crear cuenta' : 'Iniciar sesión';
    authForm.elements.namedItem('password').value = '';
    confirmation.value = '';
  }
});
document.querySelector('#account-logout').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('No pudimos cerrar la sesión. Intenta de nuevo.');
    setAccount(null);
    sessionKnown = true;
    renderLoads();
    showToast('Sesión cerrada.');
    refreshLoads();
  } catch (error) { showToast(error.message || 'Revisa tu conexión.'); }
  finally { button.disabled = false; }
});

refreshLoads();
window.setInterval(() => {
  const selectingPhotos = [...loadList.querySelectorAll('[data-delivery-form] input[type="file"]')]
    .some(input => input.files.length || input === document.activeElement);
  const draftingSignature = signatureStroke || loadList.querySelector('canvas[data-signed]')
    || [...loadList.querySelectorAll('[name="signer"]')].some(input => input.value || input === document.activeElement);
  if (!selectingPhotos && !draftingSignature) refreshLoads();
}, 30000);
