import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('native-ios/CommandCentreNative/NativePlayerProtection.swift','utf8');
const rules=JSON.parse(source.match(/static let encodedRules = #"""\s*([\s\S]*?)\s*"""#/)[1]);
const blocked=url=>rules.some(rule=>rule.action.type==='block'&&new RegExp(rule.trigger['url-filter'],'i').test(url));
test('native ad rules block explicit advertising domains and their subdomains',()=>{
 for(const url of ['https://popads.net/pop.js','https://cdn.popcash.net/script.js','https://ads.doubleclick.net/serve?video=1','https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'])assert.equal(blocked(url),true,url);
});
test('native ad rules do not match lookalike hosts, query text, normal players or video resources',()=>{
 for(const url of ['https://popads.net.evil.test/file','https://example.com/ads?host=popads.net','https://viduki.net/1/movie/969681','https://anicine.xyz/','https://www.1shows.org/','https://cdn.example.com/video/adventure.m3u8'])assert.equal(blocked(url),false,url);
 for(const rule of rules)assert.equal(rule.trigger['resource-type'].includes('media'),false);
});
test('native filtering initializes before loading and accepts changes only from the app main frame',()=>{
 const view=readFileSync('native-ios/CommandCentreNative/CommandCentreWebView.swift','utf8');
 assert.match(view,/playerProtection.prepare\(webView: webView\)[\s\S]*?webView\?\.load/);
 assert.match(view,/message.name == "nativePlayerFiltering"[\s\S]*?guard trustedMainFrame\(message.frameInfo\)[\s\S]*?playerProtection.setEnabled/);
 assert.match(view,/navigationAction.targetFrame == nil[\s\S]*?trustedMainFrame\(navigationAction.sourceFrame\) \? .allow : .cancel/);
});
