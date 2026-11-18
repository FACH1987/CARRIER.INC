const statusMessage = document.querySelector('#subscription-status');
const content = document.querySelector('#subscription-content');
const planNames = { negocio: 'Negocio', corporativo: 'Corporativo', 'chofer-pro': 'Chofer Pro', elite: 'Flota / Elite' };
const money = cents => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'USD', currencyDisplay: 'code' }).format(cents / 100);
const date = value => new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'America/Managua' }).format(new Date(value));

function element(tag, label, parent = content) {
  const item = document.createElement(tag);
  item.textContent = label;
  parent.append(item);
  return item;
}

async function request(body) {
  const options = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const response = await fetch('/api/subscriptions', options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function action(form, label, payload) {
  const button = element('button', label, form);
  button.className = 'button button-dark';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    try {
      await request(payload());
      await refresh();
    } catch (error) {
      statusMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function renderAdmin(data) {
  element('h2', 'Abonos pendientes de verificar');
  element('p', data.pending.length
    ? 'Comprueba el importe, la moneda y la referencia en la cuenta receptora antes de verificar.'
    : 'No hay mensualidades pendientes.');
  for (const row of data.pending) {
    const form = element('form', '');
    form.className = 'post-form';
    element('h3', row.name + ' · ' + row.email, form);
    element('p', planNames[row.plan] + ' · ' + money(row.amountCents) + ' · Referencia del plan: ' + row.reference, form);
    const reference = element('input', '', element('label', 'Referencia de la operación bancaria ', form));
    reference.required = true;
    reference.minLength = 3;
    reference.maxLength = 120;
    const amount = element('input', '', element('label', 'Abono recibido en USD ', form));
    amount.type = 'number';
    amount.required = true;
    amount.min = '0.01';
    amount.step = '0.01';
    action(form, 'Verificar abono en USD', () => ({ action: 'verify', reference: row.reference,
      bankReference: reference.value, amountCents: Math.round(Number(amount.value) * 100), currency: 'USD' }));
  }
}

function renderCustomer(data) {
  const freePlan = data.role === 'empresa' ? 'Inicial' : 'Arrancador';
  element('h2', 'Plan actual: ' + (data.active ? planNames[data.active.plan] : freePlan));
  if (data.active) element('p', 'Vigente hasta el ' + date(data.active.endsAt) + '.');
  if (data.upcoming) element('p', 'Próxima mensualidad: ' + planNames[data.upcoming.plan] + ', del ' + date(data.upcoming.startsAt) + ' al ' + date(data.upcoming.endsAt) + '.');
  if (data.pending) {
    element('h3', 'Mensualidad pendiente de verificar');
    element('p', planNames[data.pending.plan] + ' · ' + money(data.pending.amountCents));
    element('p', 'Referencia única: ' + data.pending.reference);
    const bank = data.pending.bank;
    if (bank) {
      element('p', 'Transfiere en USD desde tu banco. Incluye la referencia única en el concepto del pago y conserva la referencia de la operación bancaria.');
      element('p', bank.bank + ' · ' + bank.holder + ' · Cuenta ' + bank.type + ' en USD: ' + bank.number);
      element('p', 'El plan se activa o renueva al verificar que el abono llegó a la cuenta.');
    } else {
      element('p', 'Los datos de transferencia están temporalmente fuera de servicio.');
    }
    return;
  }
  if (!data.configured) {
    element('p', 'La cuenta receptora de Carrier.INC está pendiente de configurar.');
    return;
  }
  if (data.upcoming) return;
  const form = element('form', '');
  form.className = 'post-form';
  const select = element('select', '', element('label', 'Plan mensual ', form));
  for (const [id, plan] of data.plans) {
    const option = element('option', plan.name + ' · ' + money(plan.amountCents), select);
    option.value = id;
    option.selected = id === data.active?.plan;
  }
  action(form, 'Generar referencia de pago', () => ({ action: 'request', plan: select.value }));
}

async function refresh() {
  try {
    const data = await request();
    content.replaceChildren();
    if (data.admin) renderAdmin(data);
    else renderCustomer(data);
    statusMessage.textContent = '';
  } catch (error) {
    statusMessage.textContent = error.message;
    if (!content.childElementCount) {
      const link = element('a', 'Volver a Carrier.INC');
      link.href = 'market.html';
    }
  }
}
refresh();
