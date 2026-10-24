const SHELL_CACHE = 'command-centre-shell-v10.42.2-timstreams';
const SHELL_VERSION=SHELL_CACHE.match(/v(\d+\.\d+\.\d+)/)[1].split('.').map(Number);
function newerVersion(value){if(!/^\d+\.\d+\.\d+$/.test(value||''))return false;const parts=value.split('.').map(Number);for(let i=0;i<3;i++){if(parts[i]!==SHELL_VERSION[i])return parts[i]>SHELL_VERSION[i]}return false}
const APP_SHELL = [
  '/',
  '/index.html',
  '/state-safety.js',
  '/notebooks.js',
  '/manga-reader.js',
  '/manga-reader.css',
  '/manga-library.js',
  '/glass-design.css',
  '/workspace-design.css',
  '/workspace-design.js',
  '/workspace-art.svg',
  '/comix-links.js',
  '/note-editor.js',
  '/notebooks.css',
  '/accounts-client.js',
  '/football-following.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/transfers.css',
  '/transfers.bundle.js',
  '/messages.css',
  '/messages.bundle.js',
  '/space-motion.css',
  '/space-motion.js',
  '/games-suite.css',
  '/games-content.js',
  '/crossword-clues.js',
  '/games-suite.js'
];
APP_SHELL.push('/sports-providers.js','/football-pitch.js','/football-pitch.css','/playback-safety.js','/note-images.js','/storage-tools.js');
APP_SHELL.push('/schoolbook-providers.js','/schoolbook-practice.bundle.js','/schoolbook-practice.bundle.css');
APP_SHELL.push('/ai-keys.js');
APP_SHELL.push('/streamcorner-view.js','/streamcorner-view.css');

// Version queries select a release at the network layer; one canonical cache
// entry per asset prevents every release/query from duplicating the same files.
function validShellResponse(path, response) {
  if (!response?.ok) return false;
  const type = response.headers.get('content-type') || '';
  if (path.endsWith('.js')) return /(?:javascript|ecmascript)/i.test(type);
  if (path.endsWith('.css')) return /text\/css/i.test(type);
  if (path.endsWith('.svg')) return /image\/svg\+xml/i.test(type);
  if (path.endsWith('.png')) return /image\/png/i.test(type);
  if (path.endsWith('.webmanifest')) return /(?:json|manifest)/i.test(type);
  return /text\/html/i.test(type);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Small batches leave the launch animation and app requests room to run.
    const paths = APP_SHELL.filter(path => path !== '/');
    for (let start = 0; start < paths.length; start += 6) {
      await Promise.all(paths.slice(start, start + 6).map(async path => {
        const response = await fetch(path, {cache:'reload'});
        if (!validShellResponse(path, response)) throw new Error('Missing or invalid app asset: ' + path);
        await cache.put(path, response);
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('command-centre-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (validShellResponse('/index.html', response)) await (await caches.open(SHELL_CACHE)).put('/index.html', response.clone());
        return response;
      } catch {
        return (await (await caches.open(SHELL_CACHE)).match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(url.pathname);
      // A fresh page can arrive before the replacement service worker activates.
      // Never give its versioned scripts/styles older bytes from this shell.
      if(newerVersion(url.searchParams.get('v'))){
        try{const response=await fetch(request);if(validShellResponse(url.pathname,response)){await cache.put(url.pathname,response.clone());return response}return cached||response}catch{return cached||Response.error()}
      }
      if (cached) {
        event.waitUntil(fetch(request).then(async response => {
          if (validShellResponse(url.pathname, response)) await cache.put(url.pathname, response.clone());
        }).catch(() => {}));
        return cached;
      }
      const response = await fetch(request);
      if (validShellResponse(url.pathname, response)) await cache.put(url.pathname, response.clone());
      return response;
    })());
  }
});

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Command Centre',
      body: event.data?.text() || 'You have a reminder.'
    };
  }

  // Older Command Centre pushes stored the destination under payload.data.url.
  // Newer pushes also provide payload.url. Support both formats.
  const destination =
    payload.url ||
    payload.data?.url ||
    '/';

  event.waitUntil(
    self.registration.showNotification(
      payload.title || 'Command Centre',
      {
        body: payload.body || 'You have a reminder.',
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/icon-192.png',
        tag: payload.tag || ('cc-' + Date.now()),
        renotify: true,
        data: {
          url: destination
        }
      }
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    let target;

    try {
      target = new URL(
        event.notification.data?.url || '/',
        self.location.origin
      );
    } catch {
      target = new URL('/', self.location.origin);
    }

    // Only allow normal web destinations.
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      target = new URL('/', self.location.origin);
    }

    const isExternal = target.origin !== self.location.origin;

    // News alerts point at the publisher's website. Do not focus the existing
    // Command Centre window for an external target: doing that was why the
    // notification appeared to "just open the app".
    if (isExternal) {
      if ('openWindow' in clients) {
        return clients.openWindow(target.href);
      }
      return;
    }

    // Same-origin destinations such as #briefing and #football should continue
    // to reuse the existing Command Centre window where possible.
    const windows = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (!('focus' in client)) continue;

      try {
        if ('navigate' in client) {
          await client.navigate(target.href);
        }
      } catch {
        // If navigation fails, fall through to opening a fresh window below.
        continue;
      }

      return client.focus();
    }

    if ('openWindow' in clients) {
      return clients.openWindow(target.href);
    }
  })());
});
