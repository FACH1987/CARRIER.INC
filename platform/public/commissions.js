const statusElement = document.querySelector('#billing-status');
const content = document.querySelector('#billing-content');
const denied = document.querySelector('#billing-denied');
const rowsElement = document.querySelector('#billing-rows');
const paymentDialog = document.querySelector('#payment-dialog');
const paymentForm = document.querySelector('#payment-form');
let page = 1, total = 0, busy = false, recording = false, records = [], selectedId = null;
const money = (value, currency) => new Intl.NumberFormat('es-NI', { style: 'currency', currency, currencyDisplay: 'code' }).format(value / 100);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => value ? new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'America/Managua' }).format(new Date(value)) : '';
function controls() {
  document.querySelector('#billing-prev').disabled = busy || recording || page <= 1;
  document.querySelector('#billing-next').disabled = busy || recording || page * 25 >= total;
  document.querySelector('#billing-refresh').disabled = busy || recording;
  document.querySelector('#billing-search [type="submit"]').disabled = busy || recording;
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
  if (busy || recording) return;
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
    rowsElement.innerHTML = records.map(row => `<tr><td>${safe(row.company)}<small class="billing-detail">Titular: ${safe(row.payerName)}<br>${safe(row.payerEmail)}</small></td><td>${safe(row.origin)} → ${safe(row.destination)}<small class="billing-detail">${safe(row.carrierName)}<br>Finalizada: ${safe(date(row.createdAt))}</small></td><td>${safe(money(row.fareCents, row.currency))}</td><td><strong>${safe(money(row.amountCents, row.currency))}</strong></td><td>${row.status === 'paid' ? 'Pago registrado' : 'Pendiente de cobro'}</td><td>${row.status === 'pending' ? `<button class="workflow-button" type="button" data-record-payment="${safe(row.id)}">Registrar pago recibido</button>` : `<span>${safe(row.paymentReference)}</span><small class="billing-detail">${safe(date(row.paidAt))}</small>`}</td></tr>`).join('');
    document.querySelector('#billing-empty').hidden = records.length > 0;
    document.querySelector('#billing-page').textContent = `Página ${page} de ${Math.max(1, Math.ceil(total / 25))} · ${total} comisiones`;
    statusElement.textContent = 'Comisiones actualizadas. Los importes cobrados corresponden a los pagos registrados manualmente.';
  } catch (error) { statusElement.textContent = error.message || 'Revisa tu conexión.'; }
  finally { busy = false; controls(); }
}
document.querySelector('#billing-search').addEventListener('submit', event => { event.preventDefault(); if (!busy && !recording) { page = 1; loadCommissions(); } });
document.querySelector('#billing-filter').addEventListener('change', () => { if (!busy && !recording) { page = 1; loadCommissions(); } });
document.querySelector('#billing-refresh').addEventListener('click', loadCommissions);
document.querySelector('#billing-prev').addEventListener('click', () => { if (!busy && !recording && page > 1) { page--; loadCommissions(); } });
document.querySelector('#billing-next').addEventListener('click', () => { if (!busy && !recording && page * 25 < total) { page++; loadCommissions(); } });
rowsElement.addEventListener('click', event => {
  const button = event.target.closest('[data-record-payment]');
  if (!button || !rowsElement.contains(button) || busy || recording) return;
  const row = records.find(item => item.id === button.dataset.recordPayment && item.status === 'pending');
  if (!row) return;
  selectedId = row.id;
  paymentForm.reset();
  document.querySelector('#payment-description').textContent = row.company + ' · Comisión: ' + money(row.amountCents, row.currency);
  document.querySelector('#payment-error').hidden = true;
  paymentDialog.showModal();
});
document.querySelector('#payment-close').addEventListener('click', () => { if (!recording) paymentDialog.close(); });
paymentDialog.addEventListener('cancel', event => { if (recording) event.preventDefault(); });
paymentForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (recording || !selectedId || !paymentForm.reportValidity()) return;
  recording = true;
  controls();
  const button = paymentForm.querySelector('[type="submit"]');
  button.disabled = true;
  document.querySelector('#payment-error').hidden = true;
  let saved = false;
  try {
    const response = await fetch('/api/admin/commissions/' + encodeURIComponent(selectedId) + '/settle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: paymentForm.elements.namedItem('reference').value.trim(), confirmReceived: paymentForm.elements.namedItem('confirmReceived').checked }) });
    const result = await response.json();
    if (response.status === 401 || response.status === 403) { paymentDialog.close(); clearAccess(result.error || 'Inicia sesión de nuevo.'); return; }
    if (!response.ok) throw new Error(result.error || 'No pudimos registrar el pago.');
    paymentDialog.close();
    saved = true;
  } catch (error) { const target = document.querySelector('#payment-error'); target.textContent = error.message || 'Revisa tu conexión.'; target.hidden = false; }
  finally { recording = false; button.disabled = false; controls(); }
  if (saved) await loadCommissions();
});
window.addEventListener('focus', loadCommissions);
loadCommissions();
