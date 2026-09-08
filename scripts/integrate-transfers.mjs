import { readFileSync, writeFileSync } from 'node:fs';
const path='public/index.html';
let html=readFileSync(path,'utf8');
if(!html.includes('id="transfersPage"')){
  html=html.replace('</head>','<link rel="stylesheet" href="/transfers.css">\n<script defer src="/transfers.bundle.js"></script>\n</head>');
  html=html.replace('    <section class="page" id="todayPage">',readFileSync('transfers-ui.html','utf8')+'\n    <section class="page" id="todayPage">');
  html=html.replace('      <button class="sidebar-item" data-page="mirror">','      <button class="sidebar-item" data-page="transfers"><span class="sidebar-emoji">⇄</span> Transfers</button>\n      <button class="sidebar-item" data-page="mirror">');
  html=html.replace(/<button class="iphone-app" type="button" data-launch-action="settings">[\s\S]*?<\/button>/,'<button class="iphone-app" type="button" data-launch-page="transfers"><span class="iphone-app-icon app-theme-transfers">⇄</span><span class="iphone-app-label">Transfers</span></button>');
  html=html.replace('<button class="launcher-chip" type="button" data-launch-page="notes">','<button class="launcher-chip" type="button" data-launch-action="settings">⚙ Settings</button>\n                <button class="launcher-chip" type="button" data-launch-page="notes">');
  html=html.replace("const SEARCH_PAGES=[","const SEARCH_PAGES=[\n  ['transfers','Transfers','⇄'],");
  html=html.replace("function applyLaunchRoute(){","function applyLaunchRoute(){\n  if(location.hash==='#transfers'){switchPage('transfers',false);return;}");
  html=html.replace("  target.classList.add('active');","  target.classList.add('active');\n  window.dispatchEvent(new CustomEvent('cc-pagechange',{detail:page}));");
  writeFileSync(path,html);
}
