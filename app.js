const STORAGE_KEY = "rutacarga.loads.v1";

const exampleLoads = [
  { id: "sample-1", origin: "Dallas, TX", destination: "Houston, TX", pickupDate: "2026-11-14", equipment: "Dry Van", weight: 42000, pay: 1850, company: "Lone Star Freight", email: "dispatch@lonestarfreight.example", createdAt: "2026-11-13T10:20:00-06:00", demo: true },
  { id: "sample-2", origin: "Phoenix, AZ", destination: "Los Angeles, CA", pickupDate: "2026-11-14", equipment: "Reefer", weight: 38000, pay: 1450, company: "Desert Valley Produce", email: "loads@desertvalley.example", createdAt: "2026-11-13T09:10:00-07:00", demo: true },
  { id: "sample-3", origin: "Atlanta, GA", destination: "Nashville, TN", pickupDate: "2026-11-15", equipment: "Flatbed", weight: 36000, pay: 1125, company: "Piedmont Building Supply", email: "shipping@piedmontsupply.example", createdAt: "2026-11-13T08:30:00-05:00", demo: true },
  { id: "sample-4", origin: "Chicago, IL", destination: "Indianapolis, IN", pickupDate: "2026-11-14", equipment: "Power Only", weight: 40000, pay: 980, company: "Midwest Logistics Co.", email: "dispatch@midwestlogistics.example", createdAt: "2026-11-12T16:45:00-06:00", demo: true },
  { id: "sample-5", origin: "Miami, FL", destination: "Orlando, FL", pickupDate: "2026-11-16", equipment: "Dry Van", weight: 28000, pay: 760, company: "Suncoast Wholesale", email: "freight@suncoastwholesale.example", createdAt: "2026-11-12T14:00:00-05:00", demo: true }
];

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

function getLoads() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return [...exampleLoads];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("El formato de las cargas guardadas no es válido.");
    return parsed;
  } catch (error) {
    console.error("No se pudieron cargar las publicaciones guardadas.", error);
    showToast("No pudimos leer las cargas guardadas en este navegador.");
    return [...exampleLoads];
  }
}

let loads = getLoads();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatWeight(value) {
  return `${new Intl.NumberFormat("en-US").format(value)} lb`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-US", { month: "short", day: "numeric" }).format(date);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
}

function getVisibleLoads() {
  const origin = filters.origin.value.trim().toLocaleLowerCase();
  const destination = filters.destination.value.trim().toLocaleLowerCase();
  const equipment = filters.equipment.value;

  return loads.filter((load) =>
    load.origin.toLocaleLowerCase().includes(origin) &&
    load.destination.toLocaleLowerCase().includes(destination) &&
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

function saveLoads() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loads));
    return true;
  } catch (error) {
    console.error("No se pudieron guardar las publicaciones.", error);
    showToast("No pudimos guardar la carga. Revisa el almacenamiento del navegador.");
    return false;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3300);
}

function openPostDialog() {
  const dateInput = postForm.elements.namedItem("pickupDate");
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

postForm.addEventListener("submit", (event) => {
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

  loads = [newLoad, ...loads];
  if (!saveLoads()) {
    loads = loads.filter((load) => load.id !== newLoad.id);
    return;
  }

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

renderLoads();
