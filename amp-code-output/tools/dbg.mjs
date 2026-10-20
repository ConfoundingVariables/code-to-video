import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath: process.env.CHROME, args:['--no-sandbox']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
p.on('console', m=>console.log('console:', m.text()));
await p.evaluateOnNewDocument(()=>{window.__timelines={}}); await p.goto(new URL('../prototypes/proto/index.html', import.meta.url).href);
const r = await p.evaluate(async ()=>{
  const tl = window.__timelines.main; const out=[];
  for (const t of [0.5,1.5,2.4]) { tl.seek(t); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const f=document.getElementById('feed'); const a=document.getAnimations().map(a=>[a.animationName, a.timeline?.constructor.name, a.playState, String(a.currentTime?.toString?.()??a.currentTime)]);
    out.push({t, scrollTop:f.scrollTop, sh:f.scrollHeight, op:getComputedStyle(document.querySelector('.msg')).opacity, a:a.slice(0,3)}); }
  return out; });
console.log(JSON.stringify(r,null,1)); await b.close();
