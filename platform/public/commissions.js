const statusElement = document.querySelector('#billing-status');
const content = document.querySelector('#billing-content');
const denied = document.querySelector('#billing-denied');
const rowsElement = document.querySelector('#billing-rows');
let page = 1, total = 0, busy = false, records = [];
const money = (value, currency) => new Intl.NumberFormat('es-NI', { style: 'currency', currency, currencyDisplay: 'code' }).format(value / 100);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => value ? new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'America/Managua' }).format(new Date(value)) : '';
function controls() {
  document.querySelector('#billing-prev').disabled = busy || page <= 1;
  document.querySelector('#billing-next').disabled = busy || page * 25 >= total;
  document.querySelector('#billing-refresh').disabled = busy;
  document.querySelector('#billing-search [type="submit"]').disabled = busy;
}
function clearAccess(message) {
  records = [];
  rowsElement.innerHTML = '';
  content.hidden = true;
  document.querySelectorAll('[data-admin-only]').forEach(element => { element.hidden = true; });
  denied.hidden = false;
  statusElement.textContent = message;
}
async function loadCommissions() {
  if (busy) return;
  busy = true;
  controls();
  statusElement.textContent = 'Consultando comisiones…';
  try {
    const params = new URLSearchParams({ page: String(page), q: document.querySelector('#billing-query').value.trim(), status: document.querySelector('#billing-filter').value });
    const response = await fetch('/api/admin/commissions?' + params, { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) { clearAccess('Inicia sesión con la cuenta administradora.'); return; }
    if (!response.ok) throw new Error('No pudimos consultar las comisiones.');
    const data = await response.json();
    total = data.total;
    records = data.commissions;
    content.hidden = false;
    document.querySelectorAll('[data-admin-only]').forEach(element => { element.hidden = false; });
    denied.hidden = true;
    const totalText = field => data.totals.byCurrency.map(row => money(row[field], row.currency)).join(' · ') || money(0, 'USD');
    document.querySelector('#billing-pending').textContent = totalText('pendingCents');
    document.querySelector('#billing-paid').textContent = totalText('paidCents');
    document.querySelector('#billing-count').textContent = String(data.totals.count);
    rowsElement.innerHTML = records.map(row => `<tr><td>${safe(row.company)}<small class="billing-detail">Titular: ${safe(row.payerName)}<br>${safe(row.payerEmail)}</small></td><td>${safe(row.origin)} → ${safe(row.destination)}<small class="billing-detail">${safe(row.carrierName)}<br>Finalizada: ${safe(date(row.createdAt))}</small></td><td>${safe(money(row.fareCents, row.currency))}</td><td><strong>${safe(money(row.amountCents, row.currency))}</strong></td><td>${row.status === 'paid' ? 'Pago registrado' : 'Fuera de cobro'}</td><td>${row.status === 'pending' ? '—' : `<span>${safe(row.paymentReference)}</span><small class="billing-detail">${safe(date(row.paidAt))}</small>`}</td></tr>`).join('');
    document.querySelector('#billing-empty').hidden = records.length > 0;
    document.querySelector('#billing-page').textContent = `Página ${page} de ${Math.max(1, Math.ceil(total / 25))} · ${total} comisiones`;
    statusElement.textContent = 'Historial actualizado.';
  } catch (error) { statusElement.textContent = error.message || 'Revisa tu conexión.'; }
  finally { busy = false; controls(); }
}
document.querySelector('#billing-search').addEventListener('submit', event => { event.preventDefault(); if (!busy) { page = 1; loadCommissions(); } });
document.querySelector('#billing-filter').addEventListener('change', () => { if (!busy) { page = 1; loadCommissions(); } });
document.querySelector('#billing-refresh').addEventListener('click', loadCommissions);
document.querySelector('#billing-prev').addEventListener('click', () => { if (!busy && page > 1) { page--; loadCommissions(); } });
document.querySelector('#billing-next').addEventListener('click', () => { if (!busy && page * 25 < total) { page++; loadCommissions(); } });
window.addEventListener('focus', loadCommissions);
loadCommissions();
