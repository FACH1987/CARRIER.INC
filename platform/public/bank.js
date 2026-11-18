(() => {
  const $ = selector => document.querySelector(selector);
  const target = new URLSearchParams(location.search).get('userId');
  const endpoint = '/api/bank-account' + (target ? '?userId=' + encodeURIComponent(target) : '');
  const form = $('#bank-form');
  let busy = false, revealed = false, currentOwnerId = null;
  function hideNumber() { revealed = false; $('#bank-number').textContent = ''; $('#bank-number').hidden = true; $('#bank-reveal').textContent = 'Mostrar número de cuenta'; $('#bank-reveal').setAttribute('aria-expanded', 'false'); }
  function deny() { hideNumber(); form.reset(); $('#bank-content').hidden = true; $('#bank-denied').hidden = false; }
  async function request(options = {}) {
    const response = await fetch(endpoint, { cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) { if ([401, 403, 404].includes(response.status)) deny(); throw Error(data.error || 'No se pudo completar la solicitud.'); }
    return data;
  }
  async function load() {
    hideNumber();
    const data = await request();
    currentOwnerId = data.owner.id;
    const saved = data.bankAccount;
    $('#bank-heading').textContent = data.readOnly ? 'Cuenta de ' + data.owner.name : data.owner.role === 'empresa' ? 'Cuenta de origen de la empresa' : 'Cuenta para recibir el flete';
    $('#bank-purpose').textContent = data.owner.role === 'empresa' ? 'Registra desde qué cuenta realizarás tus transferencias. Esto no autoriza débitos automáticos.' : 'Registra en qué cuenta deseas recibir transferencias por los fletes realizados. La empresa confirma la entrega antes de gestionar el pago.';
    $('#bank-summary').textContent = saved ? `${saved.bankName} · ${saved.holderName} · ${saved.accountType === 'ahorro' ? 'Ahorro' : 'Corriente'} · ${saved.currency} · ${saved.maskedNumber}` : 'Todavía no hay una cuenta bancaria registrada.';
    form.hidden = data.readOnly;
    $('#bank-delete').hidden = !saved || data.readOnly;
    $('#bank-reveal').hidden = !saved;
    for (const key of ['bankName', 'holderName', 'accountType', 'currency']) if (saved) form.elements.namedItem(key).value = saved[key];
    form.elements.accountNumber.value = '';
    form.elements.consent.checked = false;
    $('#bank-share').hidden = data.owner.role !== 'transportista';
    form.elements.shareForDirectTransfer.checked = Boolean(saved?.shareForDirectTransfer);
    $('#bank-content').hidden = false; $('#bank-denied').hidden = true;
  }
  async function perform(operation) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('button')]; controls.forEach(button => { button.disabled = true; });
    try { await operation(); } catch (error) { $('#bank-status').textContent = error.message; }
    finally { busy = false; controls.forEach(button => { button.disabled = false; }); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    perform(async () => {
      const data = Object.fromEntries(new FormData(form));
      await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, action: 'save', consent: form.elements.consent.checked, shareForDirectTransfer: form.elements.shareForDirectTransfer.checked }) });
      await load(); $('#bank-status').textContent = 'Cuenta guardada. No se ha realizado ninguna transferencia.';
    });
  });
  $('#bank-reveal').addEventListener('click', () => perform(async () => {
    if (revealed) { hideNumber(); return; }
    const data = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reveal' }) });
    $('#bank-number').textContent = data.accountNumber; $('#bank-number').hidden = false; revealed = true;
    $('#bank-reveal').textContent = 'Ocultar número de cuenta'; $('#bank-reveal').setAttribute('aria-expanded', 'true');
  }));
  $('#bank-delete').addEventListener('click', () => {
    if (!confirm('¿Eliminar la cuenta bancaria guardada? Esto no cancela transferencias que ya hayas realizado fuera de la web.')) return;
    perform(async () => { await request({ method: 'DELETE' }); form.reset(); await load(); $('#bank-status').textContent = 'Cuenta bancaria eliminada.'; });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideNumber(); });
  window.addEventListener('pagehide', hideNumber);
  window.addEventListener('focus', () => { if (!busy) perform(async () => { const data = await request(); if (data.owner.id !== currentOwnerId) { form.reset(); await load(); } }); });
  perform(async () => { await load(); $('#bank-status').textContent = 'Datos privados de cuenta bancaria.'; });
})();
