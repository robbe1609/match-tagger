/* Match Tagger · online storage.
   Talks to your own storage service (a Cloudflare Worker with an R2 bucket, see worker.js and the README).
   Same layout as the folder version:
     Data/matches/<id>.json   one file per match
     Data/settings.json       squad, tags, team, boards
     Videos/                  match videos (subfolders allowed)
     Exports/, Backups/       files you choose to keep online */
const CLOUD=(function(){
  "use strict";
  const LS='matchTagger.cloud.v1', PART=50*1024*1024, SMALL=40*1024*1024, PARALLEL=3;
  let cfg={}, state='init';
  try{ cfg=JSON.parse(localStorage.getItem(LS)||'{}')||{}; }catch(e){ cfg={}; }
  const keep=()=>{ try{ localStorage.setItem(LS,JSON.stringify(cfg)); }catch(e){} };
  const base=()=>String(cfg.api||'').replace(/\/+$/,'');
  const enc=k=>k.split('/').map(encodeURIComponent).join('/');
  const authErr=()=>Object.assign(new Error('Your login has expired. Log in again.'),{name:'AuthError'});

  function normApi(a){ a=String(a||'').trim(); if(!a) return ''; if(!/^https?:\/\//i.test(a)) a='https://'+a; try{ const u=new URL(a); return u.origin; }catch(e){ return ''; } }
  async function api(path,opts){
    opts=opts||{}; const h=new Headers(opts.headers||{}); if(cfg.token) h.set('Authorization','Bearer '+cfg.token);
    let r; try{ r=await fetch(base()+path,Object.assign({},opts,{headers:h})); }catch(e){ throw Object.assign(new Error('Cannot reach your storage. Check your internet connection.'),{name:'NetworkError'}); }
    if(r.status===401){ state='prompt'; throw authErr(); }
    return r;
  }
  async function ok(r){ if(r.ok) return r; let m=''; try{ m=(await r.json()).error; }catch(e){} throw new Error(m||('Storage error '+r.status)); }

  async function init(){
    if(!cfg.api){ state='none'; return state; }
    if(!cfg.token||!(cfg.exp>Date.now()+60000)){ state='prompt'; return state; }
    try{ await ok(await api('/api/check')); state='granted'; }
    catch(e){ state=e.name==='AuthError'?'prompt':'granted'; }   // offline: carry on, saving retries later
    return state;
  }
  async function login(address,password){
    const a=normApi(address||cfg.api); if(!a) throw new Error('Enter the address of your storage, for example match-tagger-storage.yourname.workers.dev');
    let r; try{ r=await fetch(a+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password||''})}); }
    catch(e){ throw new Error('Cannot reach '+a.replace(/^https?:\/\//,'')+'. Check the address and your internet connection.'); }
    if(r.status===401) throw new Error('Wrong password.');
    if(r.status===503) throw new Error('The storage is not finished: add the BUCKET binding and the ADMIN_PASSWORD secret to your Worker (see the guide).');
    if(!r.ok) throw new Error('This address does not answer like Match Tagger storage. Check the address.');
    const d=await r.json(); cfg={api:a,token:d.token,exp:d.exp}; keep(); state='granted'; return cfg;
  }
  function logout(){ cfg.token=null; cfg.exp=0; keep(); state='prompt'; }
  function forget(){ cfg={}; keep(); state='none'; }

  async function readText(path){ const r=await api('/api/obj/'+enc(path),{cache:'no-store'}); if(r.status===404) return null; await ok(r); return r.text(); }
  async function readBlob(path){ const r=await api('/api/obj/'+enc(path),{cache:'no-store'}); if(r.status===404) return null; await ok(r); return r.blob(); }
  async function write(path,data){
    const blob=data instanceof Blob?data:new Blob([data],{type:/\.json$/i.test(path)?'application/json':'application/octet-stream'});
    if(blob.size>SMALL) return upload(blob,path);
    await ok(await api('/api/obj/'+enc(path),{method:'PUT',body:blob,headers:{'Content-Type':blob.type||'application/octet-stream'}}));
  }
  async function remove(path){ await ok(await api('/api/obj/'+enc(path),{method:'DELETE'})); }
  async function ensure(){}
  async function listRaw(prefix){ const r=await ok(await api('/api/list?prefix='+encodeURIComponent(prefix),{cache:'no-store'})); return (await r.json()).objects||[]; }
  async function list(path){
    const pre=path.replace(/\/?$/,'/'), objs=await listRaw(pre);
    return objs.filter(o=>!o.key.slice(pre.length).includes('/')).map(o=>{ const name=o.key.slice(pre.length);
      return {name,kind:'file',size:o.size,handle:{getFile:async()=>({text:()=>readText(o.key)})}}; });
  }
  function remoteFile(o){
    const rel=o.key.replace(/^Videos\//,''), parts=rel.split('/'), name=parts.pop();
    let link=null, linkExp=0;
    const f={remote:true,key:o.key,id:rel,name,folder:parts.join('/'),size:o.size,modified:o.uploaded,
      type:/\.(mp4|m4v)$/i.test(name)?'video/mp4':/\.mov$/i.test(name)?'video/quicktime':/\.webm$/i.test(name)?'video/webm':'',
      async url(force){
        if(!force&&link&&linkExp>Date.now()+15*60000) return link;
        const d=await (await ok(await api('/api/sign?key='+encodeURIComponent(o.key),{method:'POST'}))).json(); link=d.url; linkExp=d.exp; return link;
      },
      async read(off,len){
        for(let attempt=0;attempt<3;attempt++){
          try{ const u=await f.url(attempt>0); const r=await fetch(u,{headers:{Range:'bytes='+off+'-'+(off+len-1)}});
            if(r.status===206) return new Uint8Array(await r.arrayBuffer());
            if(r.status===200) return new Uint8Array(await r.arrayBuffer()).subarray(off,off+len);
            if(r.status!==401) throw new Error('Read failed '+r.status); }
          catch(e){ if(attempt===2) throw e; await new Promise(r=>setTimeout(r,800*(attempt+1))); }
        }
      }};
    return f;
  }
  async function listVideos(path){
    const objs=await listRaw(path.replace(/\/?$/,'/'));
    return objs.filter(o=>/\.(mp4|m4v|mov|webm|mkv)$/i.test(o.key)).map(remoteFile);
  }
  async function usage(){ const objs=await listRaw(''); return {bytes:objs.reduce((a,o)=>a+o.size,0),files:objs.length}; }

  /* uploads: 50 MB parts, 3 at a time, resumable after a reload */
  function xhrPut(url,body,onProg,cancelled){
    return new Promise((res,rej)=>{
      const x=new XMLHttpRequest(); x.open('PUT',url); x.setRequestHeader('Authorization','Bearer '+cfg.token);
      x.upload.onprogress=e=>onProg&&onProg(e.loaded);
      x.onload=()=>{ if(x.status===401){ state='prompt'; rej(authErr()); return; } if(x.status>=200&&x.status<300){ try{ res(JSON.parse(x.responseText)); }catch(e){ res({}); } } else { let m=''; try{ m=JSON.parse(x.responseText).error; }catch(e){} rej(Object.assign(new Error(m||('Upload error '+x.status)),{status:x.status})); } };
      x.onerror=()=>rej(Object.assign(new Error('Network error during upload'),{name:'NetworkError'}));
      x.send(body);
      const iv=setInterval(()=>{ if(x.readyState===4) clearInterval(iv); else if(cancelled&&cancelled()){ clearInterval(iv); x.abort(); rej(Object.assign(new Error('Cancelled'),{name:'AbortError'})); } },300);
    });
  }
  async function upload(file,key,onProgress,cancelled){
    const total=file.size, report=l=>onProgress&&onProgress(Math.min(total,l),total);
    if(total<=SMALL){ await xhrPut(base()+'/api/obj/'+enc(key),file,report,cancelled); report(total); return {key,size:total}; }
    const rk='matchTagger.upload:'+key+'|'+total+'|'+(file.lastModified||0);
    let rec=null; try{ rec=JSON.parse(localStorage.getItem(rk)||'null'); }catch(e){}
    const saveRec=()=>{ try{ localStorage.setItem(rk,JSON.stringify(rec)); }catch(e){} };
    for(let round=0;round<2;round++){
      if(!rec){ const d=await (await ok(await api('/api/mpu/create?key='+encodeURIComponent(key),{method:'POST'}))).json(); rec={id:d.id,parts:{}}; saveRec(); }
      const n=Math.ceil(total/PART), live={};
      const done=()=>Object.keys(rec.parts).reduce((a,k)=>a+Math.min(PART,total-(k-1)*PART),0);
      const tick=()=>report(done()+Object.values(live).reduce((a,b)=>a+b,0));
      const todo=[]; for(let i=1;i<=n;i++) if(!rec.parts[i]) todo.push(i);
      let stale=false;
      async function worker(){
        while(todo.length&&!stale){
          if(cancelled&&cancelled()) throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
          const i=todo.shift(), blob=file.slice((i-1)*PART,Math.min(total,i*PART));
          for(let attempt=0;;attempt++){
            try{ const r=await xhrPut(base()+'/api/mpu/part?key='+encodeURIComponent(key)+'&id='+encodeURIComponent(rec.id)+'&n='+i,blob,l=>{ live[i]=l; tick(); },cancelled);
              delete live[i]; rec.parts[i]=r.etag; saveRec(); tick(); break; }
            catch(e){ delete live[i]; if(e.name==='AbortError'||e.name==='AuthError') throw e; if(e.status===409){ stale=true; return; } if(attempt>=5) throw e; await new Promise(r=>setTimeout(r,Math.min(30000,1500*Math.pow(2,attempt)))); }
          }
        }
      }
      tick();
      await Promise.all(Array.from({length:Math.min(PARALLEL,todo.length||1)},worker));
      if(stale){ rec=null; try{ localStorage.removeItem(rk); }catch(e){} continue; }   // the old upload expired: start again
      const parts=Object.entries(rec.parts).map(([k,v])=>({partNumber:+k,etag:v})).sort((a,b)=>a.partNumber-b.partNumber);
      const r=await api('/api/mpu/complete?key='+encodeURIComponent(key)+'&id='+encodeURIComponent(rec.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts})});
      if(r.status===409&&round===0){ rec=null; try{ localStorage.removeItem(rk); }catch(e){} continue; }
      await ok(r); try{ localStorage.removeItem(rk); }catch(e){} report(total); return {key,size:total};
    }
    throw new Error('The upload could not be completed. Try again.');
  }

  return {init,login,logout,forget,readText,readBlob,write,remove,ensure,list,listVideos,upload,usage,
    kind:'cloud', supported:true,
    pick:async()=>{ throw Object.assign(new Error('Not available'),{name:'AbortError'}); },
    reconnect:async()=>state,
    get state(){ return state; }, get name(){ return 'Online storage'; }, get api(){ return cfg.api||''; },
    get host(){ return base().replace(/^https?:\/\//,''); }};
})();
