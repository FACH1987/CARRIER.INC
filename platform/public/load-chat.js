const params = new URLSearchParams(location.search);
const chatLoadId = params.get('load');
const selectedCarrier = params.get('carrier');
const endpoint = chatLoadId ? '/api/loads/' + encodeURIComponent(chatLoadId) + '/chat' : '/api/load-chats';
const readEndpoint = endpoint + (chatLoadId && selectedCarrier ? '?carrier=' + encodeURIComponent(selectedCarrier) : '');
const content = document.querySelector('#load-chat-content');
const statusMessage = document.querySelector('#load-chat-status');
const chatForm = document.querySelector('#load-chat-form');
let refreshingChat = false;
let lastView = '';

function child(tag, text, parent) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function threadLink(load, carrier) {
  return 'load-chat.html?' + new URLSearchParams({ load, ...(carrier ? { carrier } : {}) });
}

async function refreshChat() {
  if (refreshingChat) return;
  refreshingChat = true;
  try {
    const response = await fetch(readEndpoint);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const view = JSON.stringify(data);
    if (view === lastView) return;
    lastView = view;
    statusMessage.textContent = '';
    content.replaceChildren();
    if (!chatLoadId) {
      if (!data.threads.length) child('p', 'Abre el chat de una carga para iniciar una conversación.', content);
      const list = child('ul', '', content);
      for (const thread of data.threads) {
        const text = thread.name + ' · ' + thread.origin + ' → ' + thread.destination;
        child('a', text, child('li', '', list)).href = threadLink(thread.loadId, thread.carrierId);
      }
      return;
    }
    document.querySelector('#load-chat-title').textContent = 'Chat · ' + data.route;
    if (data.owner) {
      if (!data.participants.length) child('p', 'Las conversaciones aparecerán cuando un transportista escriba o cotice esta carga.', content);
      const list = child('ul', '', content);
      for (const participant of data.participants) {
        const link = child('a', participant.name, child('li', '', list));
        link.href = threadLink(chatLoadId, participant.id);
        if (participant.id === selectedCarrier) link.setAttribute('aria-current', 'page');
      }
      if (!selectedCarrier) return;
    }
    if (!data.messages.length) child('p', 'Todavía no hay mensajes en esta conversación.', content);
    const messages = child('ol', '', content);
    for (const message of data.messages) {
      const item = child('li', '', messages);
      const date = new Date(message.createdAt).toLocaleString('es-NI', { timeZone: 'America/Managua' });
      child('strong', (message.fromCarrier ? 'Transportista' : 'Publicador') + ' · ' + date, item);
      child('p', message.body, item);
    }
    chatForm.hidden = !data.canSend;
    if (!data.canSend) statusMessage.textContent = 'Esta conversación es de solo lectura.';
  } catch (error) {
    chatForm.hidden = true;
    content.replaceChildren();
    lastView = '';
    statusMessage.textContent = error.message || 'No pudimos abrir el chat.';
  } finally {
    refreshingChat = false;
  }
}

chatForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = chatForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: chatForm.elements.body.value, ...(selectedCarrier ? { carrierId: selectedCarrier } : {}) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    chatForm.reset();
    await refreshChat();
  } catch (error) {
    statusMessage.textContent = error.message || 'No pudimos enviar el mensaje.';
  } finally {
    button.disabled = false;
  }
});
refreshChat();
window.setInterval(refreshChat, 10_000);
