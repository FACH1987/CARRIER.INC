const supportContent = document.querySelector('#support-content');
const supportStatus = document.querySelector('#support-status');
const supportForm = document.querySelector('#support-form');
const reportOption = supportForm.elements.report;
const reportHelp = document.querySelector('#support-report-help');
const reportLabel = document.querySelector('#support-report-option');
const supportTarget = new URLSearchParams(location.search).get('userId');
const supportUrl = '/api/support' + (supportTarget ? '?userId=' + encodeURIComponent(supportTarget) : '');
const priorityLabels = ['Estándar', 'Prioritario · Negocio', 'Cuenta Corporativo'];
reportOption.checked = new URLSearchParams(location.search).get('report') === '1';
function updateReportHelp() {
  reportHelp.hidden = reportLabel.hidden || !reportOption.checked;
  supportForm.querySelector('[type="submit"]').textContent = reportHelp.hidden ? 'Enviar mensaje' : 'Enviar reporte';
}
reportOption.addEventListener('change', updateReportHelp);

function addSupportElement(tag, value, parent = supportContent) {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
}

async function refreshSupport() {
  try {
    const response = await fetch(supportUrl);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    supportContent.replaceChildren();
    if (supportStatus.textContent === 'Consultando soporte…') supportStatus.textContent = '';
    if (data.conversations) {
      addSupportElement('h2', 'Bandeja de soporte');
      if (!data.conversations.length) addSupportElement('p', 'Todavía no hay conversaciones.');
      const list = addSupportElement('ul', '');
      for (const conversation of data.conversations) {
        const summary = conversation.name + ' · ' + priorityLabels[conversation.priority]
          + (conversation.pendingReport ? ' · Problema sin respuesta' : '');
        const link = addSupportElement('a', summary, addSupportElement('li', '', list));
        link.href = 'support.html?userId=' + encodeURIComponent(conversation.id);
      }
      return;
    }
    if (data.admin) addSupportElement('a', 'Volver a la bandeja').href = 'support.html';
    reportLabel.hidden = data.admin;
    updateReportHelp();
    if (data.plan === 'negocio') addSupportElement('p', 'Soporte prioritario de Negocio.');
    if (data.plan === 'corporativo') addSupportElement('p', data.executive ? 'Tu ejecutivo de cuenta: ' + data.executive : 'Atención Corporativo. Ejecutivo pendiente de asignar.');
    if (!data.messages.length) addSupportElement('p', 'Escribe tu consulta para iniciar la conversación.');
    const list = addSupportElement('ol', '');
    for (const message of data.messages) {
      const item = addSupportElement('li', '', list);
      const date = new Date(message.createdAt).toLocaleString('es-NI', { timeZone: 'America/Managua' });
      const author = message.fromSupport ? 'Soporte' : message.kind === 'app_issue' ? 'Problema con la app' : 'Cliente';
      addSupportElement('strong', author + ' · ' + date, item);
      addSupportElement('p', message.body, item);
    }
    supportForm.hidden = false;
  } catch (error) {
    supportStatus.textContent = error.message;
  }
}

supportForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = supportForm.querySelector('button');
  const isReport = !reportLabel.hidden && reportOption.checked;
  button.disabled = true;
  try {
    const response = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: supportForm.elements.body.value, kind: isReport ? 'app_issue' : 'message',
        ...(supportTarget ? { userId: supportTarget } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    supportForm.reset();
    updateReportHelp();
    await refreshSupport();
    supportStatus.textContent = isReport ? 'Reporte enviado. La respuesta aparecerá en este chat.' : 'Mensaje enviado.';
  } catch (error) {
    supportStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
refreshSupport();
window.setInterval(refreshSupport, 20_000);
