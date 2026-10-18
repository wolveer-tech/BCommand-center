/* Shared page chrome and illustrations. Existing feature controls keep their IDs. */
(() => {
 const sections={
  today:['Today','A little clarity for the day ahead.'],portfolio:['Portfolio','Your markets, holdings and the bigger picture.'],manga:['Manga library','A home for every story you follow.'],reddit:['Community','Follow the conversations that matter to you.'],entertainment:['Entertainment','Good things to watch, read and play.'],watch:['Watch','Settle into your next favourite.'],messages:['Messages','A conversation between your devices.'],transfers:['Transfers','Carry your files from one screen to another.'],mirror:['Mirror','A second screen, within reach.'],football:['Sport','Your teams, fixtures and match days.'],weather:['Weather','A window into the day outside.'],calendar:['Calendar','Make a little space for what’s next.'],notes:['Notes','Thoughts, plans and everything in between.'],schoolbooks:['Schoolbooks','Your subjects, your pages, your progress.'],music:['Music','A soundtrack for whatever comes next.'],news:['News','Stay curious about the world.'],bible:['Reading','Your reading, one chapter at a time.'],briefing:['Briefing','The day, brought together.'],status:['Status','A quiet check on your connected world.'],account:['Account & sync','Your space, on every device.']
 };
 const art=key=>`<svg class="workspace-art" viewBox="0 0 240 180" aria-hidden="true" focusable="false"><use href="/workspace-art.svg?v=10.33.7#${key}"></use></svg>`;
 document.querySelectorAll('.iphone-app[data-launch-page]').forEach(button=>{
  const key=button.dataset.launchPage,icon=button.querySelector('.iphone-app-icon');
  if(icon&&sections[key]){icon.innerHTML=art(key);icon.setAttribute('aria-hidden','true');}
 });
 document.querySelectorAll('.sidebar-item[data-page]').forEach(button=>{const icon=button.querySelector('.sidebar-emoji'),key=button.dataset.page;if(icon&&sections[key]){icon.innerHTML=art(key);icon.setAttribute('aria-hidden','true');}});
 for(const [key,[title,description]] of Object.entries(sections)){
  const page=document.getElementById(key+'Page');if(!page)continue;
  page.classList.add('workspace-page');page.dataset.workspace=key;
  if(key==='manga')continue;
  const header=document.createElement('header');header.className='workspace-heading';
  header.innerHTML=`<div><span class="glass-eyebrow">YOUR PERSONAL SPACE</span><h1>${title}</h1><p>${description}</p></div>${art(key)}`;
  page.prepend(header);
 }
 function entertainmentHeading(name){
  const heading=document.querySelector('#entertainmentPage>.workspace-heading');if(!heading)return;
  const copy={watch:['Watch','Settle into your next favourite.'],games:['Games','A little challenge, whenever you need one.'],community:['Community','Follow the conversations that matter to you.'],foryou:sections.entertainment}[name]||sections.entertainment;
  heading.querySelector('h1').textContent=copy[0];heading.querySelector('p').textContent=copy[1];
 }
 addEventListener('cc-entpanelchange',event=>entertainmentHeading(event.detail));
 entertainmentHeading(document.querySelector('.ent-panel.active')?.dataset.entPanel);
})();
