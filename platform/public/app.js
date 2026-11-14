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
const removedLoadIds = new Set();
let sessionKnown = false;
let refreshing = null;
let currentUser = null;
let authMode = 'login';
let continueToPublish = false;
let authBusy = false;
const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
function setAccount(user) {
  currentUser = user;
  signedIn = Boolean(user);
  document.querySelector('#my-loads').hidden = !signedIn;
  if (!signedIn) {
    if (mineOnly) loads = [];
    mineOnly = false;
    document.querySelector('#my-loads').setAttribute('aria-pressed', 'false');
    loads = loads.map(load => ({ ...load, canDelete: false }));
  }
  document.querySelector('#sign-in').hidden = signedIn;
  document.querySelector('#account-login').hidden = signedIn;
  document.querySelector('#account-logout').hidden = !signedIn;
  const label = document.querySelector('#account-label');
  label.hidden = !signedIn;
  label.textContent = user ? user.name : '';
}
function setAuthMode(mode) {
  if (authBusy) return;
  authMode = mode;
  const registering = mode === 'register';
  const label = registering ? 'Crear cuenta' : 'Iniciar sesión';
  document.querySelector('#auth-title').textContent = label;
  document.querySelector('#auth-submit').textContent = label;
  document.querySelector('#auth-description').textContent = registering ? 'Crea tu cuenta para publicar cargas en Nicaragua.' : 'Ingresa tu correo y contraseña para continuar.';
  for (const [id, name] of [['#auth-name-field', 'name'], ['#auth-confirm-field', 'confirmPassword']]) {
    document.querySelector(id).hidden = !registering;
    authForm.elements.namedItem(name).disabled = !registering;
    authForm.elements.namedItem(name).required = registering;
  }
  const password = authForm.elements.namedItem('password');
  password.minLength = registering ? 12 : 1;
  password.autocomplete = registering ? 'new-password' : 'current-password';
  authForm.elements.namedItem('confirmPassword').setCustomValidity('');
  document.querySelector('#auth-password-help').textContent = registering ? 'Elige una contraseña de 12 a 128 caracteres.' : 'Usa la contraseña de tu cuenta de RutaCarga.';
  document.querySelector('#auth-login-mode').setAttribute('aria-pressed', String(!registering));
  document.querySelector('#auth-register-mode').setAttribute('aria-pressed', String(registering));
  document.querySelector('#auth-error').hidden = true;
}
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
    let response = await fetch(mineOnly ? '/api/loads?mine=1' : '/api/loads', { cache: 'no-store' });
    if (response.status === 401 && mineOnly) {
      setAccount(null);
      response = await fetch('/api/loads', { cache: 'no-store' });
    }
    if (!response.ok) throw new Error('No se pudieron consultar las cargas.');
    const data = await response.json();
    loads = data.loads.filter(load => !removedLoadIds.has(load.id));
    setAccount(data.user || null);
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

function formatCurrency(value) {
  return new Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO", maximumFractionDigits: 0 }).format(value);
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
    if (filters.sort.value === "pay-desc") return Number(b.pay) - Number(a.pay);
    if (filters.sort.value === "pay-asc") return Number(a.pay) - Number(b.pay);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function renderLoads() {
  const visibleLoads = getVisibleLoads();
  const hasFilters = Boolean(filters.origin.value.trim() || filters.destination.value.trim() || filters.equipment.value);
  document.querySelector('#empty-title').textContent = hasFilters ? 'No encontramos cargas con esos filtros' : (mineOnly ? 'No tienes cargas publicadas' : 'Aún no hay cargas publicadas');
  document.querySelector('#empty-description').textContent = hasFilters ? 'Prueba con otro municipio o equipo, o publica tu propio envío.' : 'Publica la primera carga con los datos de tu envío para que los transportistas puedan contactarte.';
  document.querySelector('#empty-clear').hidden = !hasFilters;
  countElement.textContent = String(visibleLoads.length);
  document.querySelector('#load-count-label').textContent = mineOnly ? 'cargas de tu cuenta' : 'cargas disponibles';
  emptyState.hidden = visibleLoads.length > 0;
  loadList.hidden = visibleLoads.length === 0;
  loadList.innerHTML = visibleLoads.map((load) => {
    const contactControl = `<a class="button contact-button" href="mailto:${escapeHtml(load.email)}?subject=${encodeURIComponent(`Consulta sobre carga: ${load.origin} a ${load.destination}`)}" aria-label="Contactar a ${escapeHtml(load.company)} por correo">Contactar <span aria-hidden="true">↗</span></a>`;
    const removeControl = load.canDelete === true && signedIn
      ? `<button type="button" class="delete-load-button" data-delete-load="${escapeHtml(load.id)}" ${deletingLoads.has(load.id) ? 'disabled' : ''}>${deletingLoads.has(load.id) ? 'Eliminando…' : 'Eliminar'}<span class="sr-only"> carga de ${escapeHtml(load.origin)} a ${escapeHtml(load.destination)}</span></button>` : '';
    return `
      <article class="load-card">
        <div class="route-info">
          <div class="company-line"><span class="company-avatar">${escapeHtml(initials(load.company))}</span>${escapeHtml(load.company)}</div>
          <div class="route-cities"><span>${escapeHtml(load.origin)}</span><span class="route-arrow" aria-hidden="true">→</span><span>${escapeHtml(load.destination)}</span></div>
        </div>
        <div class="load-detail"><span class="detail-label">RECOGIDA</span><span class="detail-value">${escapeHtml(formatDate(load.pickupDate))}</span></div>
        <div class="load-detail"><span class="detail-label">EQUIPO</span><span class="equipment-pill">${escapeHtml(load.equipment)}</span></div>
        <div class="load-detail"><span class="detail-label">PESO</span><span class="detail-value">${escapeHtml(formatWeight(load.weight))}</span></div>
        <div class="load-detail pay-detail"><span class="detail-label">PAGO OFRECIDO</span><span class="detail-value pay-value">${escapeHtml(formatCurrency(load.pay))}</span></div>
        <div class="load-actions">${contactControl}${removeControl}</div>
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
    company: String(formData.get("company")).trim(),
    email: String(formData.get("email")).trim()
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
  if (authMode === 'register') payload.name = String(data.get('name')).trim();
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
window.setInterval(refreshLoads, 30000);
