self.addEventListener('install', event => {
  // Activate notification-click fixes as soon as the updated worker is found.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
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
