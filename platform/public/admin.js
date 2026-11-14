const statusElement = document.querySelector('#admin-status');
const content = document.querySelector('#admin-content');
const denied = document.querySelector('#admin-denied');
const tbody = document.querySelector('#users-list');
let page = 1;
let total = 0;
let pageSize = 25;
let busy = false;
let currentRows = [];
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function registrationDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'America/Managua' }).format(date);
}
function controls() {
  document.querySelector('#users-prev').disabled = busy || page <= 1;
  document.querySelector('#users-next').disabled = busy || page * pageSize >= total;
  document.querySelector('#users-refresh').disabled = busy;
  document.querySelector('#admin-search [type="submit"]').disabled = busy;
}
async function loadUsers() {
  if (busy) return;
  busy = true;
  controls();
  statusElement.textContent = 'Consultando usuarios…';
  try {
    const params = new URLSearchParams({ page: String(page), role: document.querySelector('#user-role').value, q: document.querySelector('#user-search').value.trim() });
    const response = await fetch('/api/admin/users?' + params, { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      tbody.innerHTML = '';
      currentRows = [];
      document.querySelector('#admin-identity').textContent = '';
      content.hidden = true;
      denied.hidden = false;
      statusElement.textContent = response.status === 401 ? 'Necesitas iniciar sesión.' : 'Tu cuenta no tiene acceso de administrador.';
      return;
    }
    if (!response.ok) throw new Error('No pudimos consultar los usuarios. Intenta actualizar.');
    const data = await response.json();
    currentRows = data.users;
    document.querySelector('#admin-identity').textContent = 'Administrador: ' + data.administrator.email;
    total = data.total;
    pageSize = data.pageSize;
    denied.hidden = true;
    content.hidden = false;
    document.querySelector('#users-total').textContent = String(data.counts.total);
    document.querySelector('#users-companies').textContent = String(data.counts.empresas);
    document.querySelector('#users-carriers').textContent = String(data.counts.transportistas);
    tbody.innerHTML = data.users.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${user.role === 'transportista' ? 'Transportista' : 'Empresa'}</td><td>${escapeHtml(registrationDate(user.createdAt))}</td><td>${user.isAdmin ? '<span class="admin-protected">Administrador · Cuenta protegida</span>' : user.canDelete === true ? `<button type="button" class="admin-delete-user" data-delete-user="${escapeHtml(user.id)}">Eliminar<span class="sr-only"> usuario ${escapeHtml(user.name)}</span></button>` : ''}</td></tr>`).join('');
    document.querySelector('#users-empty').hidden = data.users.length > 0;
    document.querySelector('#users-page').textContent = `Página ${page} de ${Math.max(1, Math.ceil(total / pageSize))} · ${total} cuentas encontradas`;
    statusElement.textContent = 'Usuarios actualizados.';
  } catch (error) { statusElement.textContent = error.message || 'Revisa tu conexión e intenta de nuevo.'; }
  finally { busy = false; controls(); }
}
document.querySelector('#admin-search').addEventListener('submit', event => { event.preventDefault(); if (!busy) { page = 1; loadUsers(); } });
document.querySelector('#user-role').addEventListener('change', () => { if (!busy) { page = 1; loadUsers(); } });
document.querySelector('#users-refresh').addEventListener('click', loadUsers);
document.querySelector('#users-prev').addEventListener('click', () => { if (!busy && page > 1) { page--; loadUsers(); } });
document.querySelector('#users-next').addEventListener('click', () => { if (!busy && page * pageSize < total) { page++; loadUsers(); } });
tbody.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-user]');
  if (!button || !tbody.contains(button) || busy) return;
  const user = currentRows.find(row => row.id === button.dataset.deleteUser);
  if (!user || user.isAdmin || user.canDelete !== true) return;
  if (!window.confirm(`¿Eliminar a ${user.name} (${user.email})? Se borrarán definitivamente su cuenta y todas sus cargas, y se cerrarán sus sesiones. Esta acción no se puede deshacer.`)) return;
  busy = true;
  controls();
  tbody.querySelectorAll('button').forEach(item => { item.disabled = true; });
  statusElement.textContent = 'Eliminando usuario…';
  let deleted = false;
  try {
    const response = await fetch('/api/admin/users/' + encodeURIComponent(user.id), { method: 'DELETE' });
    const result = await response.json();
    if (response.status === 401 || response.status === 403) {
      tbody.innerHTML = '';
      currentRows = [];
      content.hidden = true;
      denied.hidden = false;
      document.querySelector('#admin-identity').textContent = '';
      throw new Error(result.error || 'Tu sesión no permite realizar esta acción.');
    }
    if (!response.ok) throw new Error(result.error || 'No pudimos eliminar el usuario.');
    deleted = true;
    if (currentRows.length === 1 && page > 1) page--;
  } catch (error) { statusElement.textContent = error.message || 'Revisa tu conexión e intenta de nuevo.'; }
  finally {
    busy = false;
    tbody.querySelectorAll('button').forEach(item => { item.disabled = false; });
    controls();
  }
  if (deleted) { await loadUsers(); statusElement.textContent = 'Usuario eliminado. El directorio está actualizado.'; }
});
window.addEventListener('focus', loadUsers);
loadUsers();
