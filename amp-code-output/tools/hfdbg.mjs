import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [,, htmlDir, ...times] = process.argv;
const b = await puppeteer.launch({executablePath: process.env.CHROME, args:['--no-sandbox']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
p.on('console', m=>console.log('console:', m.text().slice(0,200)));
const rt = fs.readFileSync('node_modules/hyperframes/dist/hyperframe.runtime.iife.js','utf8');
await p.evaluateOnNewDocument(rt);
await p.goto('file://'+htmlDir+'/index.html');
await new Promise(r=>setTimeout(r,1500));
const keys = await p.evaluate(()=>Object.keys(window).filter(k=>k.startsWith('__hf')||k.startsWith('__hyper')));
console.log(keys.join(' '));
for (const t of times.map(Number)) {
  const r = await p.evaluate(async (t)=>{
    if (window.__hf?.seek) window.__hf.seek(t); else if (window.__player?.renderSeek) window.__player.renderSeek(t);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const f=document.getElementById('feed');
    return {t, st:f.scrollTop, style:document.querySelector('.msg').getAttribute('style'), op:getComputedStyle(document.querySelector('.msg')).opacity,
      a:document.getAnimations().slice(0,2).map(a=>[a.animationName||'', a.timeline?.constructor.name, a.playState, String(a.currentTime)])};
  }, t);
  console.log(JSON.stringify(r));
}
await b.close();
