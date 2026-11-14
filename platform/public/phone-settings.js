(() => {
  const panel=document.querySelector('#phone-settings');
  if(!panel||new URLSearchParams(location.search).has('userId'))return;
  const form=document.querySelector('#phone-form'), status=document.querySelector('#phone-status');
  let busy=false, verifyConnected=false;
  async function request(body){const response=await fetch('/api/carrier/phone',{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'No pudimos actualizar el teléfono.');return data;}
  async function load(){
    if(busy)return;
    try{const data=await request();panel.hidden=false;form.elements.phone.value=data.settings.phone||'';form.elements.channel.value=data.settings.channel==='sms'?'sms':'none';form.elements.notifyLoads.checked=data.settings.notifyLoads;form.elements.notifyDocuments.checked=data.settings.notifyDocuments;form.elements.consent.checked=Boolean(data.settings.consentAt);
      verifyConnected=data.integrations.phoneVerification;
      document.querySelector('#phone-send-code').disabled=!data.integrations.phoneVerification;
      document.querySelector('#phone-verify-button').disabled=!data.integrations.phoneVerification;
      const verified=data.settings.verifiedAt?'Número confirmado.':'Número sin confirmar.';
      status.textContent=verified+' '+(!data.integrations.sms||!data.integrations.phoneVerification?'El administrador debe conectar el servicio SMS y su programación. Tu teléfono queda guardado; no hay envíos activos.':'El servicio está conectado. Los envíos requieren autorización, número confirmado y ejecución de la programación.');
    }catch(error){status.textContent=error.message;}
  }
  async function perform(body){if(busy)return;busy=true;const controls=[...panel.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);status.textContent='Procesando…';try{const result=await request(body);status.textContent=result.codeRequested?'Código solicitado. Escríbelo abajo cuando lo recibas.':result.verified?'Número confirmado.':'Teléfono y preferencias guardados. Confirma tu número para recibir SMS.';}catch(error){status.textContent=error.message;}finally{busy=false;controls.forEach(b=>b.disabled=false);document.querySelector('#phone-send-code').disabled=!verifyConnected;document.querySelector('#phone-verify-button').disabled=!verifyConnected;}}
  form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;await perform({action:'save',phone:form.elements.phone.value,channel:form.elements.channel.value,notifyLoads:form.elements.notifyLoads.checked,notifyDocuments:form.elements.notifyDocuments.checked,consent:form.elements.consent.checked});});
  document.querySelector('#phone-send-code').addEventListener('click',()=>perform({action:'send_code'}));
  document.querySelector('#phone-code-form').addEventListener('submit',event=>{event.preventDefault();const f=event.currentTarget;if(f.reportValidity())perform({action:'verify_code',code:f.elements.code.value.trim()});});
  load();
})();
