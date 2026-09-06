import { spawn } from "node:child_process";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9338;
const DBGDIR = "D:\\Incuxai\\Forest new\\scripts\\.audit\\harness-shots\\.probe";
const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--no-first-run","--mute-audio","--remote-debugging-port="+PORT,"--user-data-dir="+DBGDIR,"--window-size=1440,900","about:blank"],{stdio:"ignore",windowsHide:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function getJson(u){for(let i=0;i<40;i++){try{return await (await fetch(u)).json();}catch{await sleep(250);}}throw new Error("unreachable");}
const ver=await getJson(`http://127.0.0.1:${PORT}/json/version`);
const ws=new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.addEventListener("open",r);ws.addEventListener("error",j);});
let id=0;const pending=new Map();const events=[];
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(!m.id){events.push(m);}});
const send=(method,params={},sessionId)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{resolve:res,reject:rej});ws.send(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})}));});
try{
  const {targetId}=await send("Target.createTarget",{url:"http://127.0.0.1:9399/harness"});
  const {sessionId}=await send("Target.attachToTarget",{targetId,flatten:true});
  const s=(method,params={})=>send(method,params,sessionId);
  await s("Page.enable");await s("Runtime.enable");
  await sleep(15000);
  const r=await s("Runtime.evaluate",{expression:`(async()=>{
    const t=document.title;
    const script=document.querySelector('script[type=module]');
    const scripts=[...document.scripts].map(x=>x.src||x.type);
    let mods;
    try{
      mods=performance.getEntriesByType('resource').filter(e=>/ml\/|audit\/|maplibre|bundle/.test(e.name)).map(e=>e.name.split('/').pop()+' '+(e.transferSize||0)+'B '+(e.duration|0)+'ms');
    }catch(e){mods='perf err '+e;}
    let mf=null;
    try{const resp=await fetch('/ml/maplibre-gl-dev.mjs');mf=resp.status+' '+resp.headers.get('content-type');}catch(e){mf='fetch err '+e;}
    return {title, scripts, mods, mf, hasGL:typeof globalThis.maplibregl};
  })()`,returnByValue:true,awaitPromise:true});
  console.log(JSON.stringify(r.result.value,null,1));
  const relevant=events.filter(e=>e.sessionId===sessionId&&["Runtime.exceptionThrown","Runtime.consoleAPICalled","Network.loadingFailed","Network.responseReceived"].includes(e.method));
  const rr=relevant.slice(0,40).map(e=>{const p=e.params;if(e.method==="Network.responseReceived"){const r=p.response;return {n:"resp",u:r.url,st:r.status,mt:r.mimeType,from:r.fromDiskCache?'disk':r.fromServiceWorker?'sw':'net'};}if(e.method==="Network.loadingFailed")return {n:"fail",u:p.requestId,err:p.canceled?'cancelled':p.errorText};if(e.method==="Runtime.exceptionThrown")return {n:"exc",d:p.exceptionDetails?.exception?.description};if(e.method==="Runtime.consoleAPICalled")return {n:"console",v:(p.args||[]).map(a=>a.value??a.description).join(' ')};return {n:e.method};});
  console.log(JSON.stringify(rr,null,1).slice(0,5000));
}finally{try{await send("Browser.close");}catch{}try{chrome.kill();}catch{}}

