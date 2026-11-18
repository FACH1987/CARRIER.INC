const supportContent = document.querySelector('#support-content');
const supportStatus = document.querySelector('#support-status');
const supportForm = document.querySelector('#support-form');
const supportTarget = new URLSearchParams(location.search).get('userId');
const supportUrl = '/api/support' + (supportTarget ? '?userId=' + encodeURIComponent(supportTarget) : '');
const priorityLabels = ['Estándar', 'Prioritario · Negocio', 'Cuenta Corporativo'];

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
    supportStatus.textContent = '';
    if (data.conversations) {
      addSupportElement('h2', 'Bandeja de soporte');
      if (!data.conversations.length) addSupportElement('p', 'Todavía no hay conversaciones.');
      const list = addSupportElement('ul', '');
      for (const conversation of data.conversations) {
        const link = addSupportElement('a', conversation.name + ' · ' + priorityLabels[conversation.priority], addSupportElement('li', '', list));
        link.href = 'support.html?userId=' + encodeURIComponent(conversation.id);
      }
      return;
    }
    if (data.admin) addSupportElement('a', 'Volver a la bandeja').href = 'support.html';
    if (data.plan === 'negocio') addSupportElement('p', 'Soporte prioritario de Negocio.');
    if (data.plan === 'corporativo') addSupportElement('p', data.executive ? 'Tu ejecutivo de cuenta: ' + data.executive : 'Atención Corporativo. Ejecutivo pendiente de asignar.');
    if (!data.messages.length) addSupportElement('p', 'Escribe tu consulta para iniciar la conversación.');
    const list = addSupportElement('ol', '');
    for (const message of data.messages) {
      const item = addSupportElement('li', '', list);
      const date = new Date(message.createdAt).toLocaleString('es-NI', { timeZone: 'America/Managua' });
      addSupportElement('strong', (message.fromSupport ? 'Soporte' : 'Cliente') + ' · ' + date, item);
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
  button.disabled = true;
  try {
    const response = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: supportForm.elements.body.value, ...(supportTarget ? { userId: supportTarget } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    supportForm.reset();
    await refreshSupport();
  } catch (error) {
    supportStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
refreshSupport();
window.setInterval(refreshSupport, 20_000);
