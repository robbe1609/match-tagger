/* Match Tagger · folder storage.
   Uses a folder on this computer (for example the "Match Tagger" folder inside OneDrive, kept in sync by the OneDrive app).
   Chrome and Edge remember the folder between visits. Layout inside the folder:
     Data/matches/<id>.json   one file per match
     Data/settings.json       squad, tags, team
     Videos/                  match videos (subfolders allowed)
     Exports/                 clips and presentations saved from the app */
const FOLDER=(function(){
  "use strict";
  const supported=typeof window.showDirectoryPicker==='function';
  let root=null, state='init';
  function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('matchTagger',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function kv(mode,fn){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('kv',mode), st=tx.objectStore('kv'); const rq=fn(st); tx.oncomplete=()=>res(rq&&rq.result); tx.onerror=()=>rej(tx.error); }); }
  const kvGet=k=>kv('readonly',s=>s.get(k)), kvSet=(k,v)=>kv('readwrite',s=>s.put(v,k)), kvDel=k=>kv('readwrite',s=>s.delete(k));

  async function init(){
    if(!supported){ state='unsupported'; return state; }
    try{ root=await kvGet('root'); }catch(e){ root=null; }
    if(!root){ state='none'; return state; }
    let p='prompt'; try{ p=await root.queryPermission({mode:'readwrite'}); }catch(e){}
    state=p==='granted'?'granted':'prompt'; return state;
  }
  async function reconnect(){
    let p='denied'; try{ p=await root.requestPermission({mode:'readwrite'}); }catch(e){ console.warn(e); }
    state=p==='granted'?'granted':'prompt'; return state;
  }
  async function pick(){
    const dir=await window.showDirectoryPicker({id:'match-tagger',mode:'readwrite'});
    let r=dir, created=false;
    if(dir.name!=='Match Tagger'){
      let inner=null, looksLikeRoot=false;
      for await (const [n,h] of dir.entries()){ if(h.kind!=='directory') continue; if(n==='Match Tagger') inner=h; if(n==='Data'||n==='Videos') looksLikeRoot=true; }
      if(inner) r=inner; else if(!looksLikeRoot){ r=await dir.getDirectoryHandle('Match Tagger',{create:true}); created=true; }
    }
    let p='granted'; try{ p=await r.requestPermission({mode:'readwrite'}); }catch(e){}
    if(p!=='granted') throw Object.assign(new Error('Permission denied'),{name:'NotAllowedError'});
    root=r; await kvSet('root',r); state='granted';
    return {name:r.name,parent:dir.name,created};
  }
  async function forget(){ root=null; state='none'; try{ await kvDel('root'); }catch(e){} }
  async function dirAt(path,create){
    let d=root; if(!d) throw new Error('No folder connected');
    for(const p of path.split('/').filter(Boolean)){
      try{ d=await d.getDirectoryHandle(p,{create:!!create}); }
      catch(e){ if((e.name==='NotFoundError'||e.name==='TypeMismatchError')&&!create) return null; throw e; }
    }
    return d;
  }
  async function fileAt(path,create){
    const parts=path.split('/').filter(Boolean), name=parts.pop(), d=await dirAt(parts.join('/'),create); if(!d) return null;
    try{ return await d.getFileHandle(name,{create:!!create}); }catch(e){ if(e.name==='NotFoundError'&&!create) return null; throw e; }
  }
  async function readText(path){ const h=await fileAt(path); return h?(await h.getFile()).text():null; }
  async function readBlob(path){ const h=await fileAt(path); return h?await h.getFile():null; }
  async function write(path,data){ const h=await fileAt(path,true); const w=await h.createWritable(); try{ await w.write(data); await w.close(); }catch(e){ try{ await w.abort(); }catch(x){} throw e; } }
  async function remove(path){ const parts=path.split('/').filter(Boolean), name=parts.pop(), d=await dirAt(parts.join('/')); if(!d) return; try{ await d.removeEntry(name); }catch(e){ if(e.name!=='NotFoundError') throw e; } }
  async function ensure(path){ await dirAt(path,true); }
  async function list(path){ const d=await dirAt(path); if(!d) return null; const out=[]; for await (const [n,h] of d.entries()) out.push({name:n,kind:h.kind,handle:h}); return out; }
  async function listVideos(path,depth){
    const out=[], d0=await dirAt(path,true); depth=depth==null?2:depth;
    async function walk(d,rel,lv){
      for await (const [n,h] of d.entries()){
        if(n.startsWith('.')||n.startsWith('~')) continue;
        if(h.kind==='directory'){ if(lv<depth) await walk(h,rel?rel+'/'+n:n,lv+1); }
        else if(/\.(mp4|m4v|mov|webm|mkv)$/i.test(n)){ try{ const f=await h.getFile(); f.id=(rel?rel+'/':'')+n; f.folder=rel; f.modified=new Date(f.lastModified).toISOString(); f.handle=h; out.push(f); }catch(e){ console.warn('Skipped video',n,e); } }
      }
    }
    await walk(d0,'',0); return out;
  }
  return {init,reconnect,pick,forget,readText,readBlob,write,remove,ensure,list,listVideos,kind:'folder',
    get supported(){ return supported; }, get state(){ return state; }, get name(){ return root?root.name:''; }};
})();
