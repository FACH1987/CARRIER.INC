const loadList = document.querySelector("#load-list");
const emptyState = document.querySelector("#empty-state");
const countElement = document.querySelector("#load-count");
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
    loads = data.loads.filter(load => !removedLoadIds.has(load.id));
    setAccount(data.user || null);
    document.querySelector('#carrier-notice').hidden = true;
    sessionKnown = true;
    document.querySelector('#sign-in').hidden = signedIn;
    document.querySelector('#connection-status').textContent = 'Conectado · Las cargas se comparten entre dispositivos. Actualización cada 30 segundos.';
    renderLoads();
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
    return new Date(b.createdAt) - new Date(a.createdAt);
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
    const contactEmail = load.isOwner && load.carrierEmail ? load.carrierEmail : load.email;
    const contactControl = `<a class="button contact-button" href="mailto:${escapeHtml(contactEmail)}?subject=${encodeURIComponent(`Consulta sobre carga: ${load.origin} a ${load.destination}`)}" aria-label="Contactar a ${escapeHtml(load.company)} por correo">Contactar <span aria-hidden="true">↗</span></a>`;
    const removeControl = load.canDelete === true && signedIn
      ? `<button type="button" class="delete-load-button" data-delete-load="${escapeHtml(load.id)}" ${deletingLoads.has(load.id) || workflowBusy.has(load.id) ? 'disabled' : ''}>${deletingLoads.has(load.id) ? 'Eliminando…' : 'Eliminar'}<span class="sr-only"> carga de ${escapeHtml(load.origin)} a ${escapeHtml(load.destination)}</span></button>` : '';
    return `
      <article class="load-card">
        <div class="route-info">
          <div class="company-line"><span class="company-avatar">${escapeHtml(initials(load.company))}</span>${escapeHtml(load.company)}</div>
          <div class="route-cities"><span>${escapeHtml(load.origin)}</span><span class="route-arrow" aria-hidden="true">→</span><span>${escapeHtml(load.destination)}</span></div>
        </div>
        <div class="load-detail"><span class="detail-label">RECOGIDA</span><span class="detail-value">${escapeHtml(formatDate(load.pickupDate))}</span></div>
        <div class="load-detail"><span class="detail-label">EQUIPO</span><span class="equipment-pill">${escapeHtml(load.equipment)}</span></div>
        <div class="load-detail"><span class="detail-label">PESO</span><span class="detail-value">${escapeHtml(formatWeight(load.weight))}</span></div>
        <div class="load-detail pay-detail"><span class="detail-label">PAGO OFRECIDO</span><span class="detail-value pay-value">${escapeHtml(formatCurrency(load.pay, load.currency))}</span></div>
        <div class="load-actions">${contactControl}${workflowControls(load)}${removeControl}</div><div class="load-extra">${workflowSummary(load)}</div>
      </article>`;
  }).join("");
}

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
function quoteText(quote, currency) {
  return 'Flete al transportista: ' + formatCurrency(quote.fareCents / 100, currency) + ' · Comisión Carrier.INC 10%: ' + formatCurrency(quote.commissionCents / 100, currency) + ' · Total empresa: ' + formatCurrency(quote.totalCents / 100, currency);
}
function updatePostQuote() {
  const pay = Number(postForm.elements.namedItem('pay').value);
  if (!Number.isFinite(pay) || pay < 1 || pay > 1000000) { document.querySelector('#post-quote').textContent = 'Ingresa el valor del flete para ver la comisión.'; return; }
  const fareCents = Math.round(pay * 100);
  const commissionCents = Math.round(fareCents * 0.1);
  document.querySelector('#post-quote').textContent = quoteText({ fareCents, commissionCents, totalCents: fareCents + commissionCents }, 'USD');
}
postForm.elements.namedItem('pay').addEventListener('input', updatePostQuote);
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
      <button type="submit" class="workflow-button" ${workflowBusy.has(load.id) ? 'disabled' : ''}>Reportar entrega</button>
    </form>`;
  }
  if (load.isOwner && load.status === 'entregada' && load.hasDeliveryEvidence) html += button('complete', 'Confirmar entrega');
  if (load.isOwner && load.status === 'finalizada') html += button('transfer', 'Datos para transferir el flete');
  return html;
}
function workflowSummary(load) {
  const status = escapeHtml(statusNames[load.status] || 'Disponible');
  const carrier = load.carrierName ? '<span>Transportista: ' + escapeHtml(load.carrierName) + '</span>' : '';
  const unit = load.vehiclePlate ? '<span>Unidad: ' + escapeHtml(load.vehiclePlate) + ' · Conductor: ' + escapeHtml(load.driverName || '') + ' · Categoría: ' + escapeHtml(load.licenseCategory || '') + '</span>' : '';
  const pricing = load.quote ? '<span>' + escapeHtml(quoteText(load.quote, load.currency)) + (load.commissionAccepted ? '' : ' · Requiere aceptación al asignar') + '</span>' : '';
  const invoice = load.commission ? '<strong>' + (load.commission.status === 'paid' ? 'Comisión registrada como pagada' : 'Comisión pendiente de pago por la empresa') + ': ' + escapeHtml(formatCurrency(load.commission.amountCents / 100, load.currency)) + '</strong>' : '';
  const evidenceUrl = '/api/loads/' + encodeURIComponent(load.id) + '/delivery-evidence?photo=';
  const evidence = load.hasDeliveryEvidence
    ? `<span><a href="${evidenceUrl}receipt" target="_blank" rel="noopener">Ver documento de recibido</a> · <a href="${evidenceUrl}cargo" target="_blank" rel="noopener">Ver foto de la carga</a></span>`
    : '';
  return '<span class="shipment-status">' + status + '</span>' + carrier + unit + pricing + evidence + invoice;
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
    assignForm.elements.namedItem('vehicleId').innerHTML = '<option value="">Consulta primero el transportista</option>';
    document.querySelector('#assign-verified').textContent = '';
    document.querySelector('#assign-route').textContent = load.origin + ' → ' + load.destination;
    document.querySelector('#assign-quote').textContent = quoteText(load.quote, load.currency);
    document.querySelector('#assign-error').hidden = true;
    assignDialog.showModal();
    return;
  }
  const messages = {
    accept: '¿Aceptar este viaje por el flete indicado? La comisión de Carrier.INC la paga la empresa, adicional al flete.',
    reject: '¿Rechazar esta asignación? La carga volverá a estar disponible y no se generará comisión.',
    cancel_assignment: '¿Retirar la asignación antes de que el transportista la acepte? No se generará comisión.',
    complete: '¿Confirmas que el transporte finalizó? Se generará una comisión pendiente de pago de ' + formatCurrency((load.quote?.commissionCents || 0) / 100, load.currency) + ' a cargo de tu empresa. No se realiza un cargo automático.'
  };
  if (!messages[action] || !window.confirm(messages[action])) return;
  workflowBusy.add(load.id);
  renderLoads();
  try {
    await workflowRequest(load.id, { action });
    showMyLoads();
    await refreshLoads();
    showToast(action === 'complete' ? 'Carga finalizada. Comisión pendiente de pago registrada.' : 'Estado de la carga actualizado.');
  } catch (error) { showToast(error.message || 'Revisa tu conexión.'); }
  finally { workflowBusy.delete(load.id); renderLoads(); }
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
assignDialog.addEventListener('cancel', event => { if (workflowBusy.has(assigningId)) event.preventDefault(); });
assignForm.elements.namedItem('carrierEmail').addEventListener('input', () => {
  assignForm.elements.namedItem('vehicleId').innerHTML = '<option value="">Vuelve a consultar este correo</option>';
  document.querySelector('#assign-verified').textContent = '';
});
document.querySelector('#assign-lookup').addEventListener('click', async event => {
  if (!assigningId || workflowBusy.has(assigningId)) return;
  const email = assignForm.elements.namedItem('carrierEmail');
  if (!email.reportValidity()) return;
  const button = event.currentTarget; button.disabled = true;
  workflowBusy.add(assigningId);
  const requestedEmail = email.value.trim();
  try {
    const result = await workflowRequest(assigningId, { action: 'options', carrierEmail: requestedEmail });
    if (requestedEmail !== email.value.trim()) return;
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
    await workflowRequest(id, { action: 'assign', carrierEmail: assignForm.elements.namedItem('carrierEmail').value.trim(), vehicleId: assignForm.elements.namedItem('vehicleId').value, acceptCommission: assignForm.elements.namedItem('acceptCommission').checked });
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
    if (!postForm.elements.namedItem('email').value) postForm.elements.namedItem('email').value = currentUser.email;
  }
  const dateInput = postForm.elements.namedItem("pickupDate");
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const localToday = ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
  dateInput.min = localToday;
  if (!dateInput.value || dateInput.value < localToday) dateInput.value = localToday;
  updatePostQuote();
  if (!postDialog.open) postDialog.showModal();
}

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
  const newLoad = {
    origin: String(formData.get("origin")).trim(),
    destination: String(formData.get("destination")).trim(),
    pickupDate: String(formData.get("pickupDate")),
    equipment: String(formData.get("equipment")),
    weight: Number(formData.get("weight")),
    pay: Number(formData.get("pay")),
    currency: 'USD',
    company: String(formData.get("company")).trim(),
    email: String(formData.get("email")).trim(),
    acceptCommission: postForm.elements.namedItem("acceptCommission").checked
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


document.querySelector('#register-carrier').addEventListener('click', () => { openAuth('register'); authForm.elements.namedItem('role').value = 'transportista'; updatePhoneField(); });
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
  if (!selectingPhotos) refreshLoads();
}, 30000);
