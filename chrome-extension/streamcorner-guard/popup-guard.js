(() => {
  'use strict';
  const sourceHosts = new Set([
    'streamcorner.st', 'www.streamcorner.st', 'cornerstream.tech', 'www.cornerstream.tech',
    'streamcorner.foo', 'www.streamcorner.foo', 'streamcorner.cloud', 'www.streamcorner.cloud',
    'streamcorner.fun', 'www.streamcorner.fun', 'streamcorner.info', 'www.streamcorner.info',
    'streamninja.cloud', 'www.streamninja.cloud', 'streamninja.fun', 'www.streamninja.fun',
    'amazon.com.pandecocogaming.sbs', 'embedindia.st', 'taifood-blog.asia'
  ]);
  function approvedUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
    try {
      const destination = new URL(rawUrl, location.href);
      return destination.protocol === 'https:' && sourceHosts.has(destination.hostname) && !destination.port && !destination.username && !destination.password ? destination : null;
    } catch { return null; }
  }
  const nativeOpen = window.open;
  window.open = function(url, target, features) {
    if (!navigator.userActivation?.isActive) return null;
    const destination = approvedUrl(url);
    if (!destination) return null;
    if (target === '_self' || target === '_top' || target === '_parent') return nativeOpen.call(window, destination.href, target, features);
    try {
      window.top.location.assign(destination.href);
      return window.top;
    } catch { return null; }
  };
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[target="_blank"]');
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const destination = event.isTrusted && approvedUrl(link.href);
    if (destination) {
      try { window.top.location.assign(destination.href); } catch {}
    }
  }, true);
})();
