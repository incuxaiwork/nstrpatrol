import { spawn } from "node:child_process";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9338;
const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--no-first-run","--mute-audio","--remote-debugging-port="+PORT,"--user-data-dir=D:\\Incuxai\\Forest new\\scripts\\.audit\\harness-shots\\.probe2","--window-size=1440,900","about:blank"],{stdio:"ignore",windowsHide:true});
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
  await s("Page.enable");await s("Runtime.enable");await s("Network.enable");
  await sleep(15000);
  const relevant=events.filter(e=>e.sessionId===sessionId&&["Network.loadingFailed","Network.responseReceived"].includes(e.method)&&(e.params.url||e.params.response?.url||"").includes("maplibre"));
  const rep=relevant.map(e=>{const p=e.params;if(e.method==="Network.responseReceived"){const r=p.response;return {resp:r.status,url:r.url.slice(-80),mt:r.mimeType};}return {fail:p.errorText,url:(p.requestId||"")};});
  console.log(JSON.stringify(rep,null,1).slice(0,4000));
  const r=await s("Runtime.evaluate",{expression:`({t:document.title})`,returnByValue:true});
  console.log("title",JSON.stringify(r.result?.value));
}finally{try{await send("Browser.close");}catch{}try{chrome.kill();}catch{}}
