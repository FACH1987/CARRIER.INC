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
async function refreshLoads() {
  try {
    const response = await fetch('/api/loads', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudieron consultar las cargas.');
    const data = await response.json();
    loads = data.loads;
    signedIn = data.signedIn;
    document.querySelector('#sign-in').hidden = signedIn;
    document.querySelector('#connection-status').textContent = 'Conectado · Las cargas se comparten entre dispositivos. Actualización cada 30 segundos.';
    renderLoads();
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
  countElement.textContent = String(visibleLoads.length);
  emptyState.hidden = visibleLoads.length > 0;
  loadList.hidden = visibleLoads.length === 0;
  loadList.innerHTML = visibleLoads.map((load) => {
    const companyInfo = load.demo
      ? `<span class="sample-badge">EJEMPLO</span>`
      : "";
    const contactControl = load.demo
      ? `<span class="button contact-button demo-contact" title="Esta carga es demostrativa; publica una carga para probar el contacto." aria-label="Contacto no disponible para cargas de ejemplo">Contacto demo</span>`
      : `<a class="button contact-button" href="mailto:${escapeHtml(load.email)}?subject=${encodeURIComponent(`Consulta sobre carga: ${load.origin} a ${load.destination}`)}" aria-label="Contactar a ${escapeHtml(load.company)} por correo">Contactar <span aria-hidden="true">↗</span></a>`;
    return `
      <article class="load-card">
        <div class="route-info">
          <div class="company-line"><span class="company-avatar">${escapeHtml(initials(load.company))}</span>${escapeHtml(load.company)} ${companyInfo}</div>
          <div class="route-cities"><span>${escapeHtml(load.origin)}</span><span class="route-arrow" aria-hidden="true">→</span><span>${escapeHtml(load.destination)}</span></div>
        </div>
        <div class="load-detail"><span class="detail-label">RECOGIDA</span><span class="detail-value">${escapeHtml(formatDate(load.pickupDate))}</span></div>
        <div class="load-detail"><span class="detail-label">EQUIPO</span><span class="equipment-pill">${escapeHtml(load.equipment)}</span></div>
        <div class="load-detail"><span class="detail-label">PESO</span><span class="detail-value">${escapeHtml(formatWeight(load.weight))}</span></div>
        <div class="load-detail pay-detail"><span class="detail-label">PAGO OFRECIDO</span><span class="detail-value pay-value">${escapeHtml(formatCurrency(load.pay))}</span></div>
        ${contactControl}
      </article>`;
  }).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3300);
}

function openPostDialog() {
  if (!signedIn) { window.location.assign('/signin-with-chatgpt?return_to=%2Fmarket.html'); return; }
  const dateInput = postForm.elements.namedItem("pickupDate");
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const localToday = ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
  dateInput.min = localToday;
  if (!dateInput.value || dateInput.value < localToday) dateInput.value = localToday;
  postDialog.showModal();
}

document.querySelector("#open-post-top").addEventListener("click", openPostDialog);
document.querySelector("#open-post-hero").addEventListener("click", openPostDialog);
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
    id: `load-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    origin: String(formData.get("origin")).trim(),
    destination: String(formData.get("destination")).trim(),
    pickupDate: String(formData.get("pickupDate")),
    equipment: String(formData.get("equipment")),
    weight: Number(formData.get("weight")),
    pay: Number(formData.get("pay")),
    company: String(formData.get("company")).trim(),
    email: String(formData.get("email")).trim(),
    createdAt: new Date().toISOString()
  };

  const button = postForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch('/api/loads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newLoad) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos publicar la carga.');
    loads = [result.load, ...loads];
  } catch (error) {
    showToast(error.message || 'Revisa tu conexión e intenta de nuevo.');
    return;
  } finally { button.disabled = false; }

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

refreshLoads();
window.setInterval(refreshLoads, 30000);
