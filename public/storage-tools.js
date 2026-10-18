/* Clear disposable iOS HTTP/media caches without touching saved website data. */
(() => {
  const initialize = () => {
    const card = document.getElementById('nativeStorageTools');
    const button = document.getElementById('clearNativeCachedFiles');
    const status = document.getElementById('nativeCacheStatus');
    const bridge = window.webkit?.messageHandlers?.nativeData;
    if (!card || !button || !window.CommandCentreNative?.storageMaintenance || !bridge) return;
    card.hidden = false;
    let timeout;
    button.addEventListener('click', () => {
      button.disabled = true;
      status.textContent = 'Clearing cached web and media files…';
      try { bridge.postMessage({action:'clearCachedFiles'}); }
      catch { button.disabled = false; status.textContent = 'Could not clear cached files. Please try again.'; return; }
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        button.disabled = false;
        status.textContent = 'Cleanup is taking longer than expected. Your saved data is preserved.';
      }, 20000);
    });
    window.addEventListener('cc-native-cache-cleared', () => {
      clearTimeout(timeout);
      button.disabled = false;
      status.textContent = 'Cached files cleared. iPhone Storage may take a little time to update the size.';
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
