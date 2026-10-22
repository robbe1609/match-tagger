/* Match Tagger · online storage service (version 2: adds downloads)
   A Cloudflare Worker that keeps your match videos and tags in your own R2 bucket.
   Needs two settings on the Worker:
     - an R2 bucket binding with the variable name  BUCKET
     - a secret called  ADMIN_PASSWORD  (the password you log in with)
   Open the Worker's address in a browser to check that both are set. */

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

  // videos and files: also readable with a signed link (for the video player)
  if (p.startsWith('/api/obj/') && (m === 'GET' || m === 'HEAD')) {
    const key = keyFrom(p.slice(9)); if (!key) return fail(400, 'Bad file name');
    if (!(await linkOk(env, key, url)) && !(await tokenOk(env, req))) return fail(401, 'Log in again');
    return serveObject(env, req, key, url);
  }

  if (!(await tokenOk(env, req))) return fail(401, 'Log in again');

  if (p === '/api/check') return json({ ok: true });

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
