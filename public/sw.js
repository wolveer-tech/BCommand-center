self.addEventListener('push', event => {
  let data={};
  try { data=event.data ? event.data.json() : {}; } catch { data={title:'Command Centre',body:event.data?.text()||'You have a reminder.'}; }
  event.waitUntil(self.registration.showNotification(data.title||'Command Centre',{
    body:data.body||'You have a reminder.', icon:data.icon||'/icon-192.png', badge:data.badge||'/icon-192.png',
    tag:data.tag||('cc-'+Date.now()), renotify:true, data:{url:data.url||'/'}
  }));
});
self.addEventListener('notificationclick', event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c){try{c.navigate(target)}catch{};return c.focus()}}
    return clients.openWindow(target);
  }));
});
