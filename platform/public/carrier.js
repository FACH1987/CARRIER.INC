const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const target = new URLSearchParams(location.search).get('userId');
let dossier, busy = false, documentSlot, reviewDoc;
async function api(url, options = {}) {
  const response = await fetch(url, { cache:'no-store', ...options });
  const data = await response.json();
  if (!response.ok) { if ([401,403].includes(response.status) && options.method !== 'POST') { $('#dossier-content').hidden = true; $('#dossier-denied').hidden = false; } throw new Error(data.error || 'No pudimos completar la solicitud.'); }
  return data;
}
function list(checklist, entityType, entityId) {
  return '<ul class="document-list">' + checklist.map(item => {
    const doc = item.document;
    const state = item.valid ? (doc.exemption ? 'No aplicabilidad declarada' : 'Cargado · Fecha vigente') : !doc ? 'Falta documento' : doc.expiresAt && doc.expiresAt < dossier.day ? 'Vencido · requiere renovación' : doc.status === 'rejected' ? 'Rechazado · requiere corrección' : 'Incompleto · requiere corrección';
    return `<li class="document-item"><div><strong>${safe(item.label)}</strong><small class="document-state ${item.valid ? 'valid' : ''}">${safe(state)}</small>${doc ? `<small>${doc.exemption ? 'Justificación: '+safe(doc.exemption) : 'Emisión: '+safe(doc.issuedAt)+' · Vencimiento: '+safe(doc.noExpiry ? 'Sin fecha impresa' : doc.expiresAt)}</small>${doc.reviewNote ? '<small>Revisión: '+safe(doc.reviewNote)+'</small>' : ''}` : ''}</div><div class="document-actions">${doc && !doc.exemption ? `<a class="workflow-button" href="/api/carrier/documents/${encodeURIComponent(doc.id)}">Descargar privado</a>` : ''}${dossier.readOnly ? doc ? `<button class="workflow-button" data-review="${safe(doc.id)}">Revisar</button>` : '' : `<button class="workflow-button" data-upload="${safe(item.type)}" data-entity="${safe(entityType)}" data-id="${safe(entityId)}">${doc ? 'Reemplazar / renovar' : 'Subir documento'}</button>`}</div></li>`;
  }).join('')+'</ul>';
}
async function load() {
  if (busy) return;
  $('#dossier-status').textContent = 'Consultando expediente…';
  try {
    dossier = await api('/api/carrier'+(target ? '?userId='+encodeURIComponent(target) : ''));
    // The API authorizes the target. A supplied userId puts the UI in review mode.
    dossier.readOnly = Boolean(target);
    $('#dossier-title').textContent = dossier.readOnly ? 'Expediente de '+dossier.owner.name : 'Tu expediente de transportista';
    $('#carrier-admin-back').hidden = !dossier.isAdmin;
    $('#dossier-content').hidden = false; $('#dossier-denied').hidden = true;
    const readyCount = dossier.vehicles.filter(v=>v.ready).length;
    $('#dossier-summary').textContent = dossier.ready ? `Registro operativo habilitado · ${readyCount} unidad(es) con documentación completa y vigente al ${dossier.day}.` : 'Registro operativo pendiente · Sube todos los documentos requeridos y vigentes. El acceso se habilita automáticamente. No podrás consultar nuevas cargas ni recibir viajes hasta tener una unidad habilitada.';
    $('#dossier-summary').classList.toggle('ready',dossier.ready);
    $('#profile-create').hidden = Boolean(dossier.profile) || dossier.readOnly;
    for(const id of ['profile-record','drivers-section','vehicles-section']) $('#'+id).hidden = !dossier.profile;
    if(dossier.profile) {
      $('#profile-name').textContent = dossier.profile.legalName+' · '+(dossier.profile.kind === 'flota' ? 'Flota' : 'Independiente');
      $('#profile-documents').innerHTML = list(dossier.profileChecklist,'profile',dossier.userId);
      $('#driver-records').innerHTML = dossier.drivers.map(d=>`<article class="dossier-entity"><h3>${safe(d.name)}</h3><p>Categorías declaradas: ${safe(d.categories.join(', '))} · ${d.ready ? 'Documentación vigente' : 'Pendiente / incompleto'}</p>${list(d.checklist,'driver',d.id)}</article>`).join('');
      $('#vehicle-records').innerHTML = dossier.vehicles.map(v=>`<article class="dossier-entity"><h3>${safe(v.plate)} · ${safe(v.description)}</h3><p>${safe(v.equipment)} · ${safe(v.capacityKg)} kg · Categoría ${safe(v.requiredCategory)} · Conductor: ${safe(v.driverName)}</p><p><strong>${v.ready ? 'Unidad habilitada: documentos completos y vigentes' : 'Unidad no habilitada: revisa operador, conductor y documentos del vehículo'}</strong></p>${list(v.checklist,'vehicle',v.id)}</article>`).join('');
      $('#vehicle-driver').innerHTML = '<option value="">Selecciona un conductor</option>'+dossier.drivers.map(d=>`<option value="${safe(d.id)}">${safe(d.name)} · ${safe(d.categories.join(', '))}</option>`).join('');
      const limit = dossier.profile.kind === 'independiente' ? 1 : 50;
      $('#driver-add').hidden = dossier.readOnly || dossier.drivers.length >= limit;
      $('#vehicle-add').hidden = dossier.readOnly || dossier.vehicles.length >= limit || !dossier.drivers.length;
    }
    $('#dossier-status').textContent = 'Expediente actualizado. Los vencimientos se comprueban con la fecha de Nicaragua.';
  } catch(error) { $('#dossier-status').textContent = error.message; }
}
for(const action of ['profile','driver','vehicle']) $('#'+action+'-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(busy) return;
  const form=event.currentTarget; if(!form.reportValidity())return;
  const fields=new FormData(form); const body={action,...Object.fromEntries(fields)};
  if(action==='profile')body.consent=fields.has('consent');
  if(action==='driver')body.categories=fields.getAll('categories');
  if(action==='vehicle')body.capacityKg=Number(fields.get('capacityKg'));
  busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
  try { await api('/api/carrier',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); form.reset(); }
  catch(error){ $('#dossier-status').textContent=error.message; busy=false;button.disabled=false;return; }
  busy=false;button.disabled=false;await load();
});
function allDocuments() { return [...dossier.profileChecklist,...dossier.drivers.flatMap(d=>d.checklist),...dossier.vehicles.flatMap(v=>v.checklist)].map(i=>i.document).filter(Boolean); }
$('#dossier-content').addEventListener('click',event=>{
  const upload=event.target.closest('[data-upload]'), review=event.target.closest('[data-review]'); if(busy)return;
  if(upload && !dossier.readOnly){
    documentSlot={type:upload.dataset.upload,entityType:upload.dataset.entity,entityId:upload.dataset.id};
    $('#document-form').reset(); $('#document-error').hidden=true;
    $('#document-title').textContent=dossier.documentLabels[documentSlot.type];
    $('#no-expiry-label').hidden=!dossier.timeless.includes(documentSlot.type);
    $('#exemption-label').hidden=!dossier.exemptable.includes(documentSlot.type);
    const form=$('#document-form');form.elements.issuedAt.max=dossier.day;form.elements.expiresAt.min=dossier.day;
    documentFields();$('#document-dialog').showModal();
  }
  if(review && dossier.isAdmin){
    reviewDoc=allDocuments().find(d=>d.id===review.dataset.review);if(!reviewDoc)return;
    $('#review-form').reset();$('#review-error').hidden=true;
    $('#review-description').textContent=dossier.documentLabels[reviewDoc.type]+' · '+(reviewDoc.exemption ? 'Solicitud de no aplicabilidad: '+reviewDoc.exemption : 'Comprueba el archivo y los datos del conductor y la unidad antes de aprobar.');
    $('#review-dialog').showModal();
  }
});
function documentFields(){const f=$('#document-form');const exempt=f.elements.notApplicable.checked,none=f.elements.noExpiry.checked;for(const name of ['file','issuedAt','expiresAt']){f.elements[name].disabled=exempt || (name==='expiresAt'&&none);f.elements[name].required=!f.elements[name].disabled;}$('#exemption-reason').hidden=!exempt;f.elements.exemption.required=exempt;f.elements.exemption.disabled=!exempt;f.elements.noExpiry.disabled=exempt;}
$('#document-form').addEventListener('change',documentFields);
$('#document-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const f=event.currentTarget;if(!f.reportValidity())return;
  const file=f.elements.file.files[0],exempt=f.elements.notApplicable.checked;
  if(!exempt && (!file || file.size>5*1024*1024)){ $('#document-error').hidden=false;$('#document-error').textContent='Selecciona un archivo de hasta 5 MB.';return; }
  const query=new URLSearchParams({...documentSlot,issuedAt:f.elements.issuedAt.value,expiresAt:f.elements.expiresAt.value,noExpiry:String(f.elements.noExpiry.checked),...(exempt?{exemption:f.elements.exemption.value.trim()}:{})});
  busy=true;const button=f.querySelector('[type=submit]');button.disabled=true;$('#document-error').hidden=true;
  try{await api('/api/carrier/documents',{method:'POST',headers:{'Content-Type':exempt?'application/octet-stream':file.type,'X-Document-Metadata':encodeURIComponent(query.toString())},body:exempt?new Uint8Array():file});$('#document-dialog').close();}
  catch(error){$('#document-error').textContent=error.message;$('#document-error').hidden=false;busy=false;button.disabled=false;return;}
  busy=false;button.disabled=false;await load();
});
$('#review-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!reviewDoc)return;const f=event.currentTarget;if(!f.reportValidity())return;
  busy=true;const button=f.querySelector('[type=submit]');button.disabled=true;$('#review-error').hidden=true;
  try{await api('/api/admin/documents/'+encodeURIComponent(reviewDoc.id)+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:reviewDoc.revision,status:f.elements.status.value,note:f.elements.note.value,attest:f.elements.attest.checked})});$('#review-dialog').close();}
  catch(error){$('#review-error').textContent=error.message;$('#review-error').hidden=false;busy=false;button.disabled=false;return;}
  busy=false;button.disabled=false;await load();
});
for(const name of ['document','review']){ $('#'+name+'-close').addEventListener('click',()=>{if(!busy)$('#'+name+'-dialog').close();});$('#'+name+'-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();}); }
$('#dossier-refresh').addEventListener('click',load);
window.addEventListener('focus',load);load();
