import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const nativeApp=readFileSync(new URL('../native-ios/CommandCentreNative/CommandCentreNativeApp.swift',import.meta.url),'utf8');
const nativeWebView=readFileSync(new URL('../native-ios/CommandCentreNative/CommandCentreWebView.swift',import.meta.url),'utf8');
const nativeProject=readFileSync(new URL('../native-ios/project.yml',import.meta.url),'utf8');
const inlineScript=html.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1]||'';

function functionSource(name,nextName){
  const start=inlineScript.indexOf(`function ${name}`);
  const end=inlineScript.indexOf(`function ${nextName}`,start+1);
  assert.notEqual(start,-1,`${name} should exist`);
  assert.notEqual(end,-1,`${nextName} should follow ${name}`);
  return inlineScript.slice(start,end);
}

test('mobile note actions sit above and hide the dock',()=>{
  assert.match(html,/#noteModal\.modal\{[^}]*z-index:2147483200/);
  assert.match(html,/body:has\(#noteModal\.open\) \.mobile-dock/);
  assert.match(html,/#noteModal \.modal-actions\{[^}]*padding:[^}]*safe-area-inset-bottom/);
});

test('Movies & TV has an app-controlled fullscreen stage',()=>{
  assert.match(html,/id="mediaFullscreenBtn"/);
  assert.match(html,/id="mediaPlayerStage"/);
  assert.match(html,/id="mediaFullscreenExit"/);
  assert.match(html,/function enterMediaFullscreen\(\)/);
  assert.match(html,/stage\.requestFullscreen\|\|stage\.webkitRequestFullscreen/);
  assert.match(html,/media-player-stage\.is-expanded[^}]*position:fixed!important/);
});

test('mobile dock is fixed above embedded stream layers',()=>{
  const dockRule=html.match(/\.mobile-dock\{\s*position:fixed!important;[\s\S]*?\n\s*\}/)?.[0]||'';
  assert.match(dockRule,/z-index:2147482000/);
  assert.match(dockRule,/isolation:isolate/);
  assert.doesNotMatch(dockRule,/translateZ|will-change|contain:/);
});

test('For You mixes result groups and caps channel dominance',()=>{
  const context=vm.createContext({
    state:{entertainment:{
      youtubeHistoryDetailed:[{id:'watched'}],
      youtubeRecommendationHidden:['hidden']
    }},
    decodeHtmlText:value=>String(value||'')
  });
  vm.runInContext(
    functionSource('youtubeDiversifyRecommendationGroups','youtubeRecommendationSummary'),
    context
  );

  const groups=[
    {reason:'Search',items:[
      {videoId:'a1',channelTitle:'Channel A'},
      {videoId:'a2',channelTitle:'Channel A'},
      {videoId:'a3',channelTitle:'Channel A'},
      {videoId:'b1',channelTitle:'Channel B'},
      {videoId:'watched',channelTitle:'Channel W'}
    ]},
    {reason:'History',items:[
      {videoId:'c1',channelTitle:'Channel C'},
      {videoId:'c2',channelTitle:'Channel C'},
      {videoId:'d1',channelTitle:'Channel D'},
      {videoId:'hidden',channelTitle:'Channel H'}
    ]},
    {reason:'Discovery',items:[
      {videoId:'e1',channelTitle:'Channel E'},
      {videoId:'f1',channelTitle:'Channel F'},
      {videoId:'g1',channelTitle:'Channel G'}
    ]}
  ];

  const result=context.youtubeDiversifyRecommendationGroups(groups,8);
  assert.equal(result.length,8);
  assert.equal(new Set(result.map(item=>item.videoId)).size,8);
  assert.ok(!result.some(item=>item.videoId==='watched'||item.videoId==='hidden'));
  const counts=new Map();
  result.forEach(item=>counts.set(item.channelTitle,(counts.get(item.channelTitle)||0)+1));
  assert.ok(Math.max(...counts.values())<=2);
  assert.ok(counts.size>=6);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.slice(0,3).map(item=>item.recommendationReason))),
    ['Search','History','Discovery']
  );
});

test('playing video stays mounted in an in-app mini-player across navigation',()=>{
  assert.match(html,/id="youtubePlayerStage"/);
  assert.match(html,/class="media-player-stage app-video-stage" id="mediaPlayerStage"/);
  assert.match(html,/\.app-video-stage\.is-mini\{[^}]*position:fixed!important/);
  assert.match(html,/function updateFloatingVideoPlayer\(\)/);
  assert.match(html,/requestAnimationFrame\(updateFloatingVideoPlayer\)/);
  assert.match(html,/width:min\(360px,calc\(100vw - 16px\)\)!important;\s*min-height:200px!important/);
  assert.match(html,/body:has\(\.app-video-stage\.is-mini\) \.global-quick-add/);
  assert.match(html,/data-video-return="youtube"/);
  assert.match(html,/data-video-close="media"/);
});

test('YouTube Music uses one official iframe and a controls-only mini module',()=>{
  const miniSource=functionSource('renderMusicMiniPlayer','updateMusicProgress');
  const youtubeSource=functionSource('musicRenderYouTubeStage','musicPlaybackSnapshot');
  assert.doesNotMatch(miniSource,/<iframe/i);
  assert.match(youtubeSource,/id="musicYouTubeFrame"/);
  assert.match(youtubeSource,/enablejsapi=1/);
  assert.match(html,/\.music-mini-youtube\{display:none!important\}/);
  assert.match(html,/function bindMusicMediaSession\(\)/);
  assert.match(html,/navigator\.mediaSession\.setActionHandler/);
  assert.match(html,/page!==['"]music['"][^\n]*musicTogglePlay\(false\)/);
  assert.match(html,/visibilityState===['"]hidden['"][\s\S]*musicTogglePlay\(false\)/);
});

test('watch progress is persisted, resumed and shown in Continue Watching',()=>{
  assert.match(html,/function youtubeResumeSeconds\(id\)/);
  assert.match(html,/getCurrentTime/);
  assert.match(html,/getDuration/);
  assert.match(html,/progressSeconds/);
  assert.match(html,/durationSeconds/);
  assert.match(html,/class="continue-progress"/);
  assert.match(html,/id="mediaMarkWatchedBtn"/);
  assert.match(html,/command-centre:media-progress/);
});

test('native iOS wrapper enables background audio and system PiP',()=>{
  assert.match(nativeApp,/AVAudioSession\.sharedInstance\(\)/);
  assert.match(nativeApp,/setCategory\(\.playback/);
  assert.match(nativeWebView,/allowsPictureInPictureMediaPlayback = true/);
  assert.match(nativeProject,/INFOPLIST_KEY_UIBackgroundModes: audio/);
  assert.match(nativeProject,/MARKETING_VERSION: 1\.3\.0/);
});
