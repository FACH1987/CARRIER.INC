const installButton = document.querySelector('#install-app');
const installHelp = document.querySelector('#install-app-help');
const standalone = window.matchMedia('(display-mode: standalone)');
let installPrompt = null;

function updateInstallVisibility() {
  if (installButton) installButton.hidden = standalone.matches || navigator.standalone === true;
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
if (installButton) {
  updateInstallVisibility();
  standalone.addEventListener('change', updateInstallVisibility);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
    if (installHelp.open) installHelp.close();
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) {
      installHelp.showModal();
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
    } catch {
      installHelp.showModal();
    }
  });
}
