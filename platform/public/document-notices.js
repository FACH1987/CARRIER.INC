(() => {
  const mount = document.querySelector('#document-notices');
  const banner = document.querySelector('#document-notices-banner');
  if (!mount || !banner) return;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  let state = null, version = 0, loading = false, saving = false, page = 0;
  mount.hidden = true; banner.hidden = true;
  mount.innerHTML = '<button type="button" class="button button-light button-small" id="notices-open">Avisos <span id="notices-count" class="notice-count">0</span></button>';
  const dialog = document.createElement('dialog');
  dialog.className = 'post-dialog notice-dialog';
  dialog.setAttribute('aria-labelledby','notices-title');
  dialog.innerHTML = '<div class="post-form"><div class="dialog-heading"><div><h2 id="notices-title">Avisos de tus documentos</h2><p>Recordatorios a 30, 15, 7 y 1 día, al vencer hoy y después del vencimiento.</p></div><button type="button" class="close-button" id="notices-close" aria-label="Cerrar avisos">×</button></div><p id="notices-status" role="status" aria-live="polite"></p><div id="notices-access" class="notice-access"></div><ul id="notices-list" class="notice-list"></ul><div class="notice-toolbar"><button type="button" class="button button-light button-small" id="notices-read-page">Marcar esta página como leída</button><button type="button" class="text-button" id="notices-refresh">Actualizar</button></div><div class="notice-toolbar"><button type="button" class="text-button" id="notices-prev">Anterior</button><span id="notices-page"></span><button type="button" class="text-button" id="notices-next">Siguiente</button></div><p class="account-help">Avisos dentro de la app al abrirla o mientras permanece activa. Marcar un aviso como leído no renueva el documento ni desbloquea una unidad.</p></div>';
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  function clear() { state = null; mount.hidden = true; banner.hidden = true; banner.replaceChildren(); if(dialog.open)dialog.close(); $('#notices-list').replaceChildren(); }
  function show() { if(!dialog.open)dialog.showModal(); render(); }
  function render() {
    if(!state)return;
    page=Math.min(page,Math.max(0,Math.ceil(state.alerts.length/50)-1));
    const rows=state.alerts.slice(page*50,page*50+50);
    document.querySelector('#notices-count').textContent=String(state.unread);
    document.querySelector('#notices-open').setAttribute('aria-label',`Avisos de documentos: ${state.unread} sin leer`);
    mount.hidden=false; banner.hidden=state.alerts.length===0;
    if(state.alerts.length){
      const expired=state.alerts.filter(a=>a.daysLeft<0).length;
      banner.classList.toggle('expired',expired>0);
      banner.innerHTML='<strong>'+ (expired ? `${expired} documento(s) vencido(s).` : 'Tus documentos están próximos a vencer.') + '</strong><span>'+safe(expired ? state.accessAllowed ? 'Las unidades afectadas están bloqueadas para nuevas cargas. Renueva sus documentos.' : 'No puedes obtener nuevas cargas hasta renovar los documentos requeridos.' : 'Renueva antes del vencimiento para mantener el acceso a nuevas cargas.')+'</span><button type="button" class="workflow-button" data-show-notices>Ver avisos</button>';
    }
    $('#notices-access').textContent=state.accessAllowed ? `${state.enabledVehicles} unidad(es) habilitada(s) para nuevas cargas.` : 'Acceso a nuevas cargas bloqueado. Puedes entrar a Mi expediente para corregir o renovar documentos.';
    $('#notices-list').innerHTML=rows.length?rows.map(a=>`<li class="notice-item ${safe(a.severity)}"><strong>${safe(a.title)}</strong><small>${safe(a.subject)} · Vencimiento: ${safe(a.expiresAt)}</small><p>${safe(a.message)}</p><div class="notice-toolbar"><a href="carrier.html" class="workflow-button">Renovar documento</a>${a.read?'<span class="notice-read">Leído</span>':`<button type="button" class="text-button" data-read-notice="${safe(a.id)}" ${saving?'disabled':''}>Marcar leído</button>`}</div></li>`).join(''):'<li class="notice-item">No tienes documentos próximos a vencer ni vencidos.</li>';
    $('#notices-page').textContent=`${page+1} / ${Math.max(1,Math.ceil(state.alerts.length/50))}`;
    $('#notices-prev').disabled=page===0||saving;
    $('#notices-next').disabled=(page+1)*50>=state.alerts.length||saving;
    $('#notices-read-page').disabled=saving||!rows.some(a=>!a.read);
    $('#notices-refresh').disabled=loading||saving;
  }
  async function refresh(force=false){
    if((loading&&!force)||saving||document.hidden)return;
    const current=++version;loading=true;
    try{
      const response=await fetch('/api/carrier/notifications',{cache:'no-store'});
      if(current!==version)return;
      if([401,403].includes(response.status)){clear();return;}
      if(!response.ok)throw Error('No pudimos actualizar los avisos. Intenta de nuevo.');
      const result=await response.json();if(current!==version)return;
      state=result;$('#notices-status').textContent=`${result.unread} aviso(s) sin leer. Actualizado con fecha de Nicaragua: ${result.day}.`;render();
    }catch(error){if(current===version)$('#notices-status').textContent=error.message;}
    finally{if(current===version){loading=false;render();}}
  }
  async function mark(ids){
    if(saving||!ids.length)return;saving=true;render();
    try{
      const response=await fetch('/api/carrier/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
      if([401,403].includes(response.status)){clear();return;}
      const result=await response.json();if(!response.ok)throw Error(result.error||'No pudimos guardar el estado del aviso.');
      for(const item of state?.alerts||[])if(ids.includes(item.id))item.read=true;
      if(state)state.unread=state.alerts.filter(a=>!a.read).length;
      $('#notices-status').textContent='Avisos marcados como leídos. Recuerda renovar los documentos.';
    }catch(error){$('#notices-status').textContent=error.message;}
    finally{saving=false;render();}await refresh();
  }
  document.querySelector('#notices-open').addEventListener('click',show);
  banner.addEventListener('click',event=>{if(event.target.closest('[data-show-notices]'))show();});
  $('#notices-close').addEventListener('click',()=>dialog.close());
  $('#notices-refresh').addEventListener('click',()=>refresh());
  $('#notices-prev').addEventListener('click',()=>{if(page>0){page--;render();}});
  $('#notices-next').addEventListener('click',()=>{if(state&&(page+1)*50<state.alerts.length){page++;render();}});
  $('#notices-read-page').addEventListener('click',()=>mark(state?.alerts.slice(page*50,page*50+50).filter(a=>!a.read).map(a=>a.id)||[]));
  $('#notices-list').addEventListener('click',event=>{const b=event.target.closest('[data-read-notice]');if(b)mark([b.dataset.readNotice]);});
  document.addEventListener('rutacarga:account',event=>{++version;loading=false;clear();if(event.detail?.role==='transportista')refresh(true);});
  document.addEventListener('rutacarga:documents-updated',()=>refresh(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('focus',()=>refresh());setInterval(()=>refresh(),60000);refresh();
})();
