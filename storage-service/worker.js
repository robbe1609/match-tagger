/* Match Tagger · online storage service (version 3: adds the player portal)
   A Cloudflare Worker that keeps your match videos and tags in your own R2 bucket.
   Needs two settings on the Worker:
     - an R2 bucket binding with the variable name  BUCKET
     - a secret called  ADMIN_PASSWORD  (the password you log in with)
   Open the Worker's address in a browser to check that both are set.
   Version 3 keeps player accounts and what you share with players in the bucket under Portal/.
   Passwords are stored only as salted PBKDF2 hashes: nobody, the coach included, can read them. */

const PREFIXES = ['Data/', 'Videos/', 'Exports/', 'Backups/'];
const PART_MAX = 95 * 1024 * 1024;        // the site sends 50 MB parts; Cloudflare accepts at most 100 MB per request
const TOKEN_DAYS = 30;                    // you stay logged in for 30 days per browser
const LINK_HOURS = 12;                    // video links handed to the player stay valid for 12 hours

const enc = new TextEncoder();
const b64u = buf => { let s = ''; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode('match-tagger:' + env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function same(a, b) { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status, error) => json({ error }, status);

async function makeToken(env) { const exp = Date.now() + TOKEN_DAYS * 864e5; return { token: exp + '.' + await hmac(env, 'token|' + exp), exp }; }
async function tokenOk(env, req) {
  const h = req.headers.get('Authorization') || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [exp, sig] = t.split('.'); if (!exp || !sig || +exp < Date.now()) return false;
  return same(sig, await hmac(env, 'token|' + exp));
}
async function linkOk(env, key, url) {
  const exp = url.searchParams.get('exp'), sig = url.searchParams.get('sig');
  if (!exp || !sig || +exp < Date.now()) return false;
  return same(sig, await hmac(env, 'get|' + key + '|' + exp));
}
function keyFrom(s) {
  let k = ''; try { k = decodeURIComponent(s || ''); } catch (e) { return null; }
  if (!k || k.length > 900 || k.includes('..') || k.includes('\\') || k.startsWith('/')) return null;
  return PREFIXES.some(p => k.startsWith(p)) ? k : null;
}
const typeOf = k => /\.json$/i.test(k) ? 'application/json' : /\.(mp4|m4v)$/i.test(k) ? 'video/mp4' : /\.mov$/i.test(k) ? 'video/quicktime' : /\.webm$/i.test(k) ? 'video/webm' : /\.mkv$/i.test(k) ? 'video/x-matroska' : /\.csv$/i.test(k) ? 'text/csv' : /\.zip$/i.test(k) ? 'application/zip' : /\.pptx$/i.test(k) ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/octet-stream';

async function serveObject(env, req, key, url) {
  const head = req.method === 'HEAD';
  let obj;
  try { obj = head ? await env.BUCKET.head(key) : await env.BUCKET.get(key, { range: req.headers }); }
  catch (e) { return new Response('Requested range not satisfiable', { status: 416 }); }
  if (!obj) return fail(404, 'Not found');
  const h = new Headers();
  obj.writeHttpMetadata(h);
  if (!h.get('Content-Type')) h.set('Content-Type', typeOf(key));
  h.set('ETag', obj.httpEtag); h.set('Accept-Ranges', 'bytes');
  h.set('Cache-Control', key.startsWith('Data/') ? 'no-store' : 'private, max-age=3600');
  if (url && url.searchParams.get('dl')) {           // download to the computer instead of playing in the browser
    const name = key.split('/').pop(), plain = name.replace(/[^\x20-\x7E]|"/g, '_');
    h.set('Content-Disposition', `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  const asked = !head && req.headers.get('Range');
  if (asked && obj.range) {
    const r = obj.range; let off, len;
    if (r.suffix != null) { len = Math.min(r.suffix, obj.size); off = obj.size - len; }
    else { off = r.offset || 0; len = r.length != null ? r.length : obj.size - off; }
    h.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`); h.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(obj.size));
  return new Response(head ? null : obj.body, { status: 200, headers: h });
}

/* =================== PLAYER PORTAL ===================
   Portal/accounts.json  {id: {id, username, name, num, all, salt, hash, it, must, ver, fails, lockUntil, lastLogin, changedAt}}
   Portal/share.json     {matches: [{id, title, date, ..., video, to}], batches: [{id, name, date, to, items: [...]}]}
   Portal/comments/<batch>.json  [{id, batch, item, pid, by, name, text, at}]   (each thread is between the coach and one player)
   Portal/ is not reachable through /api/obj, so players and even the coach's file calls cannot read it directly. */
const P_ACC = 'Portal/accounts.json', P_SHARE = 'Portal/share.json', P_PEPPER = 'Portal/pepper';
const P_TOKEN_DAYS = 60, P_IT = 20000;
async function rjson(env, key, dflt) { const o = await env.BUCKET.get(key); if (!o) return dflt; try { return await o.json(); } catch (e) { return dflt; } }
const wjson = (env, key, data) => env.BUCKET.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
async function pepper(env) { const o = await env.BUCKET.get(P_PEPPER); if (o) return await o.text(); const p = b64u(crypto.getRandomValues(new Uint8Array(32))); await env.BUCKET.put(P_PEPPER, p); return p; }
async function pwHash(env, pw, salt, it) {
  const k = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt + '|' + await pepper(env)), iterations: it, hash: 'SHA-256' }, k, 256));
}
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const defaultPw = a => String(a.num || '') + a.username;
async function setPw(env, a, pw, must) { a.salt = b64u(crypto.getRandomValues(new Uint8Array(16))); a.it = P_IT; a.hash = await pwHash(env, pw, a.salt, a.it); a.must = !!must; a.ver = (a.ver || 0) + 1; a.fails = 0; a.lockUntil = 0; a.changedAt = Date.now(); }
async function pToken(env, a, exp) { exp = exp || Date.now() + P_TOKEN_DAYS * 864e5; return { token: ['p', a.id, a.ver, exp, await hmac(env, 'ptok|' + a.id + '|' + a.ver + '|' + exp)].join('.'), exp }; }
async function pAuth(env, req) {
  const h = req.headers.get('Authorization') || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [kind, id, ver, exp, sig] = t.split('.'); if (kind !== 'p' || !id || !sig || +exp < Date.now()) return null;
  if (!same(sig, await hmac(env, 'ptok|' + id + '|' + ver + '|' + exp))) return null;
  const accs = await rjson(env, P_ACC, {}); const a = accs[id]; if (!a || String(a.ver) !== String(ver) || a.off) return null;
  return { a, accs };
}
const pub = a => ({ id: a.id, username: a.username, name: a.name, num: a.num || '', all: !!a.all, state: a.must ? 'start' : 'own', lastLogin: a.lastLogin || null, changedAt: a.changedAt || null, locked: (a.lockUntil || 0) > Date.now() });
const sees = (a, to) => a.all || to === 'all' || (Array.isArray(to) && to.includes(a.id));
function feedFor(a, share) {
  const matches = (share.matches || []).filter(m => sees(a, m.to)).map(m => ({ id: m.id, title: m.title, date: m.date, comp: m.comp || '', type: m.type || '', score: m.score || '' }));
  const batches = (share.batches || []).filter(b => sees(a, b.to) || (b.to === 'involved' && (a.all || (b.items || []).some(i => (i.players || []).includes(a.id)))))
    .map(b => ({ id: b.id, name: b.name, date: b.date, note: b.note || '',
      items: (b.items || []).filter(i => b.to !== 'involved' || a.all || (i.players || []).includes(a.id)).map(i => Object.assign({}, i, { mine: (i.players || []).includes(a.id) })) }))
    .filter(b => b.items.length);
  return { matches, batches };
}
function videoAllowed(a, share, mid) {
  const f = feedFor(a, share);
  if (f.matches.some(m => m.id === mid) || f.batches.some(b => b.items.some(i => i.mid === mid))) return ((share.matches || []).find(m => m.id === mid) || {}).video || ((share.videos || {})[mid]) || null;
  return null;
}
async function signLink(env, url, key) { const exp = Date.now() + LINK_HOURS * 36e5; return { url: `${url.origin}/api/obj/${key.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${await hmac(env, 'get|' + key + '|' + exp)}`, exp }; }
const cleanText = (t, n) => String(t || '').replace(/\s+$/, '').slice(0, n || 2000);

async function playerRoute(req, env, url) {
  const p = url.pathname, m = req.method;
  let body = {}; if (m === 'POST') { try { body = await req.json(); } catch (e) {} }
  if (p === '/api/p/login' && m === 'POST') {
    const accs = await rjson(env, P_ACC, {}), u = fold(body.username).replace(/\s+/g, '');
    const a = Object.values(accs).find(x => fold(x.username) === u && !x.off);
    const slow = () => new Promise(r => setTimeout(r, 700));
    if (!a) { await slow(); return fail(401, 'Wrong username or password.'); }
    if ((a.lockUntil || 0) > Date.now()) return fail(429, 'Too many tries. Wait 15 minutes, or ask your coach to reset your password.');
    if (!same(await pwHash(env, String(body.password || ''), a.salt, a.it || P_IT), a.hash)) {
      a.fails = (a.fails || 0) + 1; if (a.fails >= 8) { a.lockUntil = Date.now() + 15 * 6e4; a.fails = 0; }
      await wjson(env, P_ACC, accs); await slow(); return fail(401, 'Wrong username or password.');
    }
    a.fails = 0; a.lockUntil = 0; a.lastLogin = Date.now(); await wjson(env, P_ACC, accs);
    return json(Object.assign(await pToken(env, a), { must: !!a.must, me: pub(a) }));
  }
  const auth = await pAuth(env, req); if (!auth) return fail(401, 'Log in again');
  const { a, accs } = auth;
  if (p === '/api/p/password' && m === 'POST') {
    const nw = String(body.password || '');
    if (!same(await pwHash(env, String(body.old || ''), a.salt, a.it || P_IT), a.hash)) return fail(403, 'Your current password is not right.');
    if (nw.length < 6) return fail(400, 'Use at least 6 characters.');
    if (nw === defaultPw(a)) return fail(400, 'Choose a password that is different from the starting password.');
    await setPw(env, a, nw, false); await wjson(env, P_ACC, accs);
    return json(Object.assign(await pToken(env, a), { must: false, me: pub(a) }));
  }
  if (a.must) return fail(403, 'Choose your own password first.');
  if (p === '/api/p/me') return json({ me: pub(a) });
  const share = await rjson(env, P_SHARE, {});
  if (p === '/api/p/feed') return json(Object.assign({ me: pub(a) }, feedFor(a, share)));
  if (p === '/api/p/video' && m === 'POST') { const key = videoAllowed(a, share, String(body.mid || '')); if (!key || !keyFrom(key)) return fail(404, 'This video is not available.'); return json(await signLink(env, url, key)); }
  if (p === '/api/p/comments') {
    const batch = String(url.searchParams.get('batch') || body.batch || ''); if (!/^[A-Za-z0-9_-]{1,40}$/.test(batch)) return fail(400, 'Bad batch');
    const f = feedFor(a, share), b = f.batches.find(x => x.id === batch); if (!b) return fail(404, 'Not found');
    const key = 'Portal/comments/' + batch + '.json', list = await rjson(env, key, []);
    if (m === 'POST') {
      const text = cleanText(body.text); if (!text.trim()) return fail(400, 'Write something first.');
      if (!b.items.some(i => i.id === body.item)) return fail(404, 'Not found');
      list.push({ id: b64u(crypto.getRandomValues(new Uint8Array(9))), batch, item: String(body.item), pid: a.id, by: 'player', name: a.name, text, at: Date.now() });
      await wjson(env, key, list);
    }
    return json({ comments: list.filter(c => c.pid === a.id) });
  }
  return fail(404, 'Not found');
}
async function adminPortal(req, env, url) {
  const p = url.pathname, m = req.method;
  let body = {}; if (m === 'POST' || m === 'PUT') { try { body = await req.json(); } catch (e) {} }
  if (p === '/api/admin/players') {
    const accs = await rjson(env, P_ACC, {});
    if (m === 'POST') {
      let ch = false;
      for (const x of (body.players || [])) {
        const id = String(x.id || ''); if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) continue;
        const username = String(x.username || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40); if (!username) continue;
        const clash = Object.values(accs).find(o => o.id !== id && fold(o.username) === fold(username)); if (clash) continue;
        let a = accs[id];
        if (!a) { a = accs[id] = { id, username, name: String(x.name || ''), num: String(x.num || ''), all: !!x.all, created: Date.now() }; await setPw(env, a, defaultPw(a), true); ch = true; continue; }
        const was = defaultPw(a);
        if (a.username !== username || a.num !== String(x.num || '') || a.name !== String(x.name || '') || !!a.all !== !!x.all || a.off) {
          a.username = username; a.num = String(x.num || ''); a.name = String(x.name || ''); a.all = !!x.all; delete a.off; ch = true;
          if (a.must && was !== defaultPw(a)) await setPw(env, a, defaultPw(a), true);   // still on the starting password: it follows the new name/number
        }
      }
      for (const id of (body.disable || [])) if (accs[id] && !accs[id].off) { accs[id].off = true; accs[id].ver = (accs[id].ver || 0) + 1; ch = true; }
      if (ch) await wjson(env, P_ACC, accs);
    }
    return json({ players: Object.values(accs).filter(a => !a.off).map(pub) });
  }
  if (p === '/api/admin/reset' && m === 'POST') {
    const accs = await rjson(env, P_ACC, {}), a = accs[String(body.id || '')]; if (!a) return fail(404, 'No such player');
    await setPw(env, a, defaultPw(a), true); await wjson(env, P_ACC, accs); return json({ player: pub(a) });
  }
  if (p === '/api/admin/share') {
    if (m === 'PUT') { const d = body && typeof body === 'object' ? body : {}; await wjson(env, P_SHARE, { matches: d.matches || [], batches: d.batches || [], videos: d.videos || {}, updatedAt: Date.now() }); }
    return json(await rjson(env, P_SHARE, { matches: [], batches: [], videos: {} }));
  }
  if (p === '/api/admin/comments') {
    if (m === 'POST') {
      const batch = String(body.batch || ''); if (!/^[A-Za-z0-9_-]{1,40}$/.test(batch)) return fail(400, 'Bad batch');
      const text = cleanText(body.text); if (!text.trim()) return fail(400, 'Write something first.');
      const key = 'Portal/comments/' + batch + '.json', list = await rjson(env, key, []);
      list.push({ id: b64u(crypto.getRandomValues(new Uint8Array(9))), batch, item: String(body.item || ''), pid: String(body.pid || ''), by: 'coach', name: 'Coach', text, at: Date.now() });
      await wjson(env, key, list); return json({ comments: list });
    }
    const out = {}; let cursor;
    do { const r = await env.BUCKET.list({ prefix: 'Portal/comments/', cursor }); for (const o of r.objects) { const id = o.key.slice(16).replace(/\.json$/, ''); out[id] = await rjson(env, o.key, []); } cursor = r.truncated ? r.cursor : undefined; } while (cursor);
    return json({ comments: out });
  }
  return fail(404, 'Not found');
}

async function route(req, env, url) {
  const p = url.pathname, m = req.method;
  if (p === '/' || p === '') {
    const missing = [!env.BUCKET && 'the R2 bucket binding called BUCKET', !env.ADMIN_PASSWORD && 'the secret called ADMIN_PASSWORD'].filter(Boolean);
    const msg = missing.length ? 'Match Tagger storage is almost ready. Still missing: ' + missing.join(' and ') + '.' : 'Match Tagger storage is ready. Use this address to log in on your Match Tagger site.';
    return new Response(msg, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (!p.startsWith('/api/')) return fail(404, 'Not found');
  if (!env.BUCKET || !env.ADMIN_PASSWORD) return fail(503, 'Storage is not set up yet: add the BUCKET binding and the ADMIN_PASSWORD secret.');

  if (p === '/api/login' && m === 'POST') {
    let body = {}; try { body = await req.json(); } catch (e) {}
    if (!same(body.password, env.ADMIN_PASSWORD)) { await new Promise(r => setTimeout(r, 900)); return fail(401, 'Wrong password'); }
    return json(await makeToken(env));
  }

  if (p.startsWith('/api/p/')) return playerRoute(req, env, url);

  // videos and files: also readable with a signed link (for the video player)
  if (p.startsWith('/api/obj/') && (m === 'GET' || m === 'HEAD')) {
    const key = keyFrom(p.slice(9)); if (!key) return fail(400, 'Bad file name');
    if (!(await linkOk(env, key, url)) && !(await tokenOk(env, req))) return fail(401, 'Log in again');
    return serveObject(env, req, key, url);
  }

  if (!(await tokenOk(env, req))) return fail(401, 'Log in again');

  if (p === '/api/check') return json({ ok: true, version: 3 });
  if (p.startsWith('/api/admin/')) return adminPortal(req, env, url);

  if (p === '/api/list' && m === 'GET') {
    const prefix = url.searchParams.get('prefix') || '';
    if (prefix && !PREFIXES.some(x => prefix.startsWith(x) || x.startsWith(prefix))) return fail(400, 'Bad folder');
    const out = []; let cursor;
    do {
      const r = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
      r.objects.forEach(o => out.push({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() }));
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor && out.length < 20000);
    return json({ objects: out });
  }

  if (p === '/api/sign' && m === 'POST') {
    const key = keyFrom(url.searchParams.get('key')); if (!key) return fail(400, 'Bad file name');
    const exp = Date.now() + LINK_HOURS * 36e5;
    const link = `${url.origin}/api/obj/${key.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${await hmac(env, 'get|' + key + '|' + exp)}`;
    return json({ url: link, exp });
  }

  if (p.startsWith('/api/obj/')) {
    const key = keyFrom(p.slice(9)); if (!key) return fail(400, 'Bad file name');
    if (m === 'PUT') {
      const len = +req.headers.get('Content-Length'); if (len > PART_MAX) return fail(413, 'Too large for one request');
      const o = await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: req.headers.get('Content-Type') || typeOf(key) } });
      return json({ key, size: o ? o.size : null });
    }
    if (m === 'DELETE') { await env.BUCKET.delete(key); return json({ ok: true }); }
  }

  if (p.startsWith('/api/mpu/')) {
    const key = keyFrom(url.searchParams.get('key')); if (!key) return fail(400, 'Bad file name');
    const id = url.searchParams.get('id');
    if (p === '/api/mpu/create' && m === 'POST') {
      const up = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: typeOf(key) } });
      return json({ id: up.uploadId });
    }
    if (!id) return fail(400, 'Missing upload id');
    const up = env.BUCKET.resumeMultipartUpload(key, id);
    try {
      if (p === '/api/mpu/part' && m === 'PUT') {
        const n = +url.searchParams.get('n'); if (!(n >= 1 && n <= 10000)) return fail(400, 'Bad part number');
        const len = +req.headers.get('Content-Length'); if (len > PART_MAX) return fail(413, 'Part too large');
        const part = await up.uploadPart(n, req.body);
        return json({ partNumber: part.partNumber, etag: part.etag });
      }
      if (p === '/api/mpu/complete' && m === 'POST') {
        const body = await req.json();
        const o = await up.complete((body.parts || []).map(x => ({ partNumber: +x.partNumber, etag: String(x.etag) })));
        return json({ key, size: o.size });
      }
      if (p === '/api/mpu/abort' && m === 'POST') { await up.abort(); return json({ ok: true }); }
    } catch (e) {
      return fail(409, 'Upload could not continue: ' + (e && e.message || e));
    }
  }
  return fail(404, 'Not found');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': origin || '*', 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag, Accept-Ranges',
      'Access-Control-Max-Age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try { res = await route(req, env, url); }
    catch (e) { res = fail(500, 'Storage error: ' + (e && e.message || e)); }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  }
};
