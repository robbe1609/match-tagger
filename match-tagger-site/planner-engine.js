/* Week planner slide engine (from the WU18 Week Planner): shared by the live preview, the PowerPoint and the PDF export. */
/* ---------- Layout engine: shared by the live preview and the .pptx export ---------- */
const SLIDE_W = 13.333, SLIDE_H = 7.5;
// Two looks: the original dark slide, and a light one that saves ink when printed.
const PAL = {
  dark:{ bg:'0A0A0C', cell:'17181C', blockFill:'0A0A0C', notesFill:'0A0A0C', dayFill:'1E6FD9', dayText:'F2F4F8',
         kern:'1E6FD9', kern2:'3B8CF0', gym:'FFC000', gymLine:'FFC000', warm:'E8ECF3', warmLine:'E8ECF3',
         fg:'F2F4F8', title:'FFFFFF', dimTitle:'5C6475', onKern:'FFFFFF', muted:'A9B4C6', staff:'FFFF00', dark:'0A0A0C', noBorder:'2C2F38' },
  light:{ bg:'FFFFFF', cell:'F3F4F7', blockFill:'FFFFFF', notesFill:'FFFFFF', dayFill:'E3ECFA', dayText:'0E2F5E',
         kern:'1E6FD9', kern2:'3B8CF0', gym:'FFC000', gymLine:'E0A800', warm:'E3E7EE', warmLine:'8E97A6',
         fg:'15171C', title:'0A0A0C', dimTitle:'9AA2B1', onKern:'FFFFFF', muted:'5A6372', staff:'9A6A00', dark:'0A0A0C', noBorder:'D3D7DE' }
};
let C = PAL.dark;
function useTheme(m){ C = PAL[m] || PAL.dark; return C; }

// Date of a day = week's Monday + the day's position in the week (Mon=0 … Sat=5).
function dayDate(st, day){
  const ws = st.meta && st.meta.weekStart; if (!ws) return '';
  const m = String(ws).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return '';
  const i = st.days.indexOf(day); if (i < 0) return '';
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3] + i));
  const pad = n => String(n).padStart(2,'0');
  return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth()+1) + '/' + d.getUTCFullYear();
}
function fmtMin(m){ const n = Number(m); return (m === '' || m == null || isNaN(n)) ? '' : n + '’'; }
function line2(b){
  const t = (b.type||'').trim(), m = fmtMin(b.min);
  if (t && m) return t + ' – ' + m;
  return t || m;
}
function staffLabel(b, staff){
  const present = new Map(staff.filter(s=>s.present).map(s=>[s.id,s.name]));
  return (b.staff||[]).filter(id=>present.has(id)).map(id=>present.get(id)).join(' + ');
}
function hasAbsent(b, staff){
  const present = new Set(staff.filter(s=>s.present).map(s=>s.id));
  return (b.staff||[]).some(id=>!present.has(id));
}
function vormen(day){
  const list = [];
  if (day.warmup && day.warmup.on) list.push({kind:'warm', b:day.warmup});
  (day.kern||[]).forEach(b=>list.push({kind:'kern', b}));
  return list;
}
// Everything that takes session time, gym included (gym gets no card on the detail slide, but it uses minutes).
function timeline(day){
  const list = [];
  if (day.gym && day.gym.on) list.push({kind:'gym', b:day.gym});
  return list.concat(vormen(day));
}
function minutesOf(day){
  return timeline(day).reduce((a,v)=>a+(Number(v.b.min)||0),0);
}
function sessionLength(time){
  const m = String(time||'').match(/(\d{1,2})[:.h](\d{2})\s*[–\-–to]+\s*(\d{1,2})[:.h](\d{2})/);
  if (!m) return null;
  const a = (+m[1])*60+(+m[2]), b = (+m[3])*60+(+m[4]);
  return b > a ? b - a : null;
}
function para(text, size, color, bold, ls){ return {runs:[{text, size, color, bold:!!bold}], ls: ls || size*1.4}; }

// Shrink a single line so it fits the box width (rough DM Sans metrics), never below `floor`.
function fitSize(text, size, width, bold, floor){
  const em = bold ? 0.56 : 0.5;
  const need = String(text).length * size/72 * em;
  if (need <= width) return size;
  return Math.max(floor, Math.floor(size * width/need * 2)/2);
}
function blockShapes(out, b, staff, x, y, w, h, border, sizes, flagAbsent){
  out.push({t:'rect', x, y, w, h, fill:C.blockFill, line:border, lineW:1.5, r:0.06, name:'Block'});
  const tw = w - 0.13;
  const fl0 = Math.max(8, sizes[0]-3), fl1 = Math.max(8, sizes[1]-3);
  const ts = fitSize(b.title||'', sizes[0], tw, true, fl0);
  const paras = [para(b.title||'', ts, C.fg, true, Math.max(ts*1.4, sizes[0]*1.25))];
  const l2 = line2(b); if (l2){ const z = fitSize(l2, sizes[1], tw, false, fl1); paras.push(para(l2, z, C.muted, false, Math.max(z*1.4, sizes[1]*1.25))); }
  const sl = staffLabel(b, staff); if (sl){ const z = fitSize(sl, sizes[1], tw, false, fl1); paras.push(para(sl, z, C.staff, false, Math.max(z*1.4, sizes[1]*1.25))); }
  out.push({t:'text', x:x+0.07, y:y+0.07, w:tw, h:h-0.1, paras, name:'Block text'});
  if (flagAbsent && hasAbsent(b, staff)) out.push({t:'flag', x:x-0.04, y:y-0.04, w:w+0.08, h:h+0.08});
}

function weekShapes(st, preview){
  const out = [];
  const days = st.days.filter(d=>d.active || !d.hidden);
  out.push({t:'text', x:0.44, y:0.28, w:5.6, h:0.55, paras:[para(st.meta.title||'', 28, C.title, true, 34)], name:'Title'});
  out.push({t:'text', x:6.2, y:0.4, w:6.69, h:0.32, align:'right', paras:[para(st.meta.subtitle||'', 14, C.muted, false, 18)], name:'Subtitle'});
  // lane headers
  const hdr = [
    {x:2.62, w:1.78, fill:C.gym, color:C.dark, text:st.meta.gymLabel||'Gym'},
    {x:4.47, w:1.78, fill:C.warm, color:C.dark, text:st.meta.warmLabel||'Warm-up'},
    {x:6.40, w:6.49, fill:C.kern, color:C.onKern, text:st.meta.kernLabel||'Kern'}];
  hdr.forEach(hh=>{
    out.push({t:'rect', x:hh.x, y:0.86, w:hh.w, h:0.41, fill:hh.fill, r:0.08, name:'Header'});
    out.push({t:'text', x:hh.x, y:0.86, w:hh.w, h:0.41, align:'center', valign:'middle', paras:[para(hh.text,14,hh.color,true,17)], name:'Header text'});
  });
  if (!days.length) return out;
  const top = 1.37, bottom = 7.15, gap = 0.1;
  const rowH = Math.min(1.25, (bottom - top - gap*(days.length-1)) / days.length);
  const small = rowH < 0.95;
  days.forEach((d, i)=>{
    const y = top + i*(rowH+gap);
    const di = st.days.indexOf(d);
    out.push({t:'rect', x:0.44, y, w:2.08, h:rowH, fill:C.dayFill, r:0.08, name:'Day', day:di});
    const dp = [para(d.name||'', small?15:17, C.dayText, true, small?18:21)];
    if (!d.active){
      out.push({t:'text', x:0.6, y, w:1.86, h:rowH, valign:'middle', paras:dp, name:'Day text', day:di});
      // one full-width cell: no training
      out.push({t:'rect', x:2.62, y, w:10.27, h:rowH, fill:C.cell, line:C.noBorder, lineW:1, r:0.06, name:'No training'});
      const np = [para(st.meta.noTrainingLabel||'Geen training', small?14:17, C.fg, true, small?18:22)];
      const why = String(d.reason||'').trim();
      if (why) np.push(para(why, fitSize(why, small?11:13, 9.8, false, 9), C.muted, false, small?15:18));
      out.push({t:'text', x:2.85, y, w:9.8, h:rowH, align:'center', valign:'middle', paras:np, name:'No training text'});
      return;
    }
    if (d.time) dp.push(para(d.time, small?12:14, C.dayText, true, small?16:20));
    if (d.place){ const ps = fitSize(d.place, small?12:14, 1.84, false, 9); dp.push(para(d.place, ps, C.dayText, false, small?16:20)); }
    out.push({t:'text', x:0.6, y:y+(small?0.07:0.11), w:1.86, h:rowH-0.12, paras:dp, name:'Day text', day:di});
    // cells
    out.push({t:'rect', x:2.62, y, w:1.78, h:rowH, fill:C.cell, r:0.08, name:'Gym cell'});
    out.push({t:'rect', x:4.47, y, w:1.78, h:rowH, fill:C.cell, r:0.08, name:'Warm-up cell'});
    out.push({t:'rect', x:6.40, y, w:6.49, h:rowH, fill:C.cell, r:0.06, name:'Kern cell'});
    const bp = 0.1, bh = rowH - 2*bp;
    const sz = small ? [11,10] : [13,12];
    if (d.gym && d.gym.on) blockShapes(out, d.gym, st.staff, 2.62+bp, y+bp, 1.78-2*bp, bh, C.gymLine, sz, preview);
    if (d.warmup && d.warmup.on) blockShapes(out, d.warmup, st.staff, 4.47+bp, y+bp, 1.78-2*bp, bh, C.warmLine, sz, preview);
    const k = d.kern || [];
    if (k.length){
      const pad = 0.12, kg = 0.14;
      const bw = (6.49 - 2*pad - kg*(k.length-1)) / k.length;
      let ks = sz;
      if (k.length === 4) ks = small ? [10.5,9.5] : [12,11];
      if (k.length === 5) ks = small ? [9.5,9] : [11,10];
      if (k.length >= 6) ks = small ? [9,8] : [10,9];
      k.forEach((b, j)=> blockShapes(out, b, st.staff, 6.40+pad+j*(bw+kg), y+bp, bw, bh, C.kern2, ks, preview));
    }
  });
  return out;
}

function gridFor(n){
  if (n <= 3) return [n, 1];
  if (n === 4) return [2, 2];
  if (n <= 6) return [3, 2];
  if (n <= 8) return [4, 2];
  return [Math.ceil(n/2), 2];
}

function dayShapes(st, day, preview){
  const out = [];
  out.push({t:'text', x:0.44, y:0.28, w:6.2, h:0.55, paras:[{runs:[
      {text:(day.name||''), size:28, color:C.title, bold:true},
      {text:'  ' + (st.meta.detailLabel||'Training'), size:28, color:C.dimTitle, bold:false}], ls:34}], name:'Title'});
  const right = [dayDate(st, day), day.time, day.place].filter(Boolean).join('   |   ');
  out.push({t:'text', x:6.7, y:0.4, w:6.19, h:0.32, align:'right', paras:[para(right, fitSize(right, 14, 6.19, false, 10), C.muted, false, 18)], name:'Subtitle'});
  const vs = vormen(day);
  if (!vs.length) return out;
  // timeline: proportional to minutes, gym included
  const tl = timeline(day);
  const tx = 0.44, tw = 12.45, ty = 0.98, th = 0.36, tg = 0.05;
  const mins = tl.map(v=>Math.max(Number(v.b.min)||0, 0));
  const total = mins.reduce((a,b)=>a+b,0);
  const minW = 0.55;
  const avail = tw - tg*(tl.length-1);
  let widths = total > 0 ? mins.map(m=>avail*m/total) : tl.map(()=>avail/tl.length);
  // enforce a minimum width, take the difference from the larger segments
  const shortBy = widths.reduce((a,w)=>a + Math.max(0, minW - w), 0);
  if (shortBy > 0){
    const bigSum = widths.filter(w=>w > minW).reduce((a,b)=>a+b,0);
    widths = widths.map(w=> w <= minW ? minW : w - shortBy*(w/bigSum));
  }
  let cx = tx;
  tl.forEach((v,i)=>{
    const w = widths[i];
    const fill = v.kind === 'gym' ? C.gym : v.kind === 'warm' ? C.warm : C.kern;
    const ink = v.kind === 'kern' ? C.onKern : C.dark;
    out.push({t:'rect', x:cx, y:ty, w, h:th, fill, r:0.06, name:'Timeline'});
    const label = w > 1.6 ? [(v.b.title||''), fmtMin(v.b.min)].filter(Boolean).join('  ') : fmtMin(v.b.min);
    out.push({t:'text', x:cx+0.08, y:ty, w:w-0.12, h:th, valign:'middle', paras:[para(label, 11, ink, true, 13)], name:'Timeline text'});
    cx += w + tg;
  });
  // cards
  const [cols, rows] = gridFor(vs.length);
  const gx = 0.2, gy = 0.2, top = 1.56, bottom = 7.12, left = 0.44, width = 12.45;
  const cw = (width - gx*(cols-1)) / cols;
  const ch = (bottom - top - gy*(rows-1)) / rows;
  const tight = cols >= 4;
  vs.forEach((v,i)=>{
    const c = i % cols, r = Math.floor(i / cols);
    const x = left + c*(cw+gx), y = top + r*(ch+gy);
    const border = v.kind === 'warm' ? C.warmLine : C.kern2;
    out.push({t:'rect', x, y, w:cw, h:ch, fill:C.cell, line:border, lineW:1.5, r:0.08, name:'Card'});
    // order badge
    out.push({t:'oval', x:x+cw-0.46, y:y+0.14, w:0.32, h:0.32, fill:C.blockFill, line:border, lineW:1.25, name:'Order'});
    out.push({t:'text', x:x+cw-0.46, y:y+0.14, w:0.32, h:0.32, align:'center', valign:'middle', paras:[para(String(i+1), 11, C.fg, true, 13)], name:'Order text'});
    const hp = [para(v.b.title||'', tight?14:16, C.fg, true, tight?18:20)];
    const l2 = line2(v.b); if (l2) hp.push(para(l2, 12, C.muted, false, 16));
    const sl = staffLabel(v.b, st.staff); if (sl) hp.push(para(sl, 12, C.staff, false, 16));
    out.push({t:'text', x:x+0.18, y:y+0.15, w:cw-0.72, h:0.92, paras:hp, name:'Card header'});
    if (preview && hasAbsent(v.b, st.staff)) out.push({t:'flag', x:x-0.04, y:y-0.04, w:cw+0.08, h:ch+0.08});
    const ny = y + 1.1;
    out.push({t:'rect', x:x+0.1, y:ny, w:cw-0.2, h:ch-1.2, fill:C.notesFill, r:0.06, name:'Notes panel'});
    const notes = String(v.b.notes||'').split('\n');
    out.push({t:'text', x:x+0.22, y:ny+0.12, w:cw-0.44, h:ch-1.44, notes:true,
              paras: notes.map(l=>para(l, rows>1?11:12, C.fg, false, rows>1?15:16.5)), name:'Notes'});
  });
  return out;
}

function slideList(st, withDetail){
  const list = [{kind:'week', label:'Week overview'}];
  if (withDetail) st.days.forEach((d,i)=>{ if (d.active && vormen(d).length) list.push({kind:'day', i, label:d.name||('Day '+(i+1))}); });
  return list;
}
/* Month calendar: `cal` is prepared by the app (weeks -> days -> items), this only lays it out. */
function calendarShapes(st, cal){
  const out = [];
  out.push({t:'text', x:0.44, y:0.28, w:7.2, h:0.55, paras:[{runs:[
      {text:cal.title, size:28, color:C.title, bold:true},
      {text:'  ' + (cal.label||''), size:28, color:C.dimTitle, bold:false}], ls:34}], name:'Title'});
  // legend, laid out from the right edge
  const leg = [{k:'training', t:'Training'}];
  if (cal.projected) leg.push({k:'projected', t:'Not planned yet'});
  leg.push({k:'match', t:'Match'});
  let lx = 12.89;
  leg.slice().reverse().forEach(l=>{
    const tw = l.t.length * 11/72 * 0.6 + 0.12;
    lx -= tw;
    out.push({t:'text', x:lx, y:0.42, w:tw, h:0.26, valign:'middle', paras:[para(l.t, 11, C.muted, false, 13)], name:'Legend'});
    lx -= 0.08 + 0.34;
    if (l.k === 'match') out.push({t:'rect', x:lx, y:0.46, w:0.34, h:0.18, fill:C.gym, r:0.04, name:'Legend swatch'});
    else out.push({t:'rect', x:lx, y:0.46, w:0.34, h:0.18, fill:C.blockFill, line:C.kern2, lineW:1, dash:l.k==='projected', r:0.04, name:'Legend swatch'});
    lx -= 0.32;
  });
  const x0 = 0.44, wkW = 0.5, gap = 0.06, cw = (12.45 - wkW - 7*gap) / 7;
  const colX = c => x0 + wkW + gap + c*(cw + gap);
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((d, c)=>{
    const we = c >= 5;
    out.push({t:'rect', x:colX(c), y:0.84, w:cw, h:0.34, fill:we?C.warm:C.kern, r:0.06, name:'Day header'});
    out.push({t:'text', x:colX(c), y:0.84, w:cw, h:0.34, align:'center', valign:'middle', paras:[para(d, 12, we?C.dark:C.onKern, true, 14)], name:'Day header text'});
  });
  const top = 1.26, bottom = 7.15, n = cal.weeks.length || 1;
  const rh = (bottom - top - gap*(n-1)) / n;
  cal.weeks.forEach((wk, r)=>{
    const y = top + r*(rh + gap);
    out.push({t:'rect', x:x0, y, w:wkW, h:rh, fill:C.cell, r:0.06, name:'Week number'});
    out.push({t:'text', x:x0, y, w:wkW, h:rh, align:'center', valign:'middle', paras:[para('W' + wk.week, 11, C.muted, true, 13)], name:'Week number text'});
    wk.days.forEach((d, c)=>{
      const x = colX(c);
      if (!d.inMonth){
        out.push({t:'rect', x, y, w:cw, h:rh, fill:C.bg, line:C.noBorder, lineW:0.75, r:0.06, name:'Other month'});
        out.push({t:'text', x:x+0.08, y:y+0.05, w:0.6, h:0.22, paras:[para(String(d.dayNum), 11, C.dimTitle, true, 13)], name:'Date'});
        return;
      }
      out.push({t:'rect', x, y, w:cw, h:rh, fill:C.cell, r:0.06, name:'Day cell', date:d.date});
      out.push({t:'text', x:x+0.08, y:y+0.05, w:0.6, h:0.22, paras:[para(String(d.dayNum), 11, C.fg, true, 13)], name:'Date'});
      const items = d.items || [];
      if (!items.length) return;
      const iy0 = y + 0.3, avail = rh - 0.36, ig = 0.04;
      const ih = Math.min(0.5, (avail - ig*(items.length-1)) / items.length);
      const one = ih < 0.27;
      const fs = one ? [8, 7.5] : ih >= 0.44 ? [10.5, 9.5] : [9, 8.5];
      const iw = cw - 0.12, tw = iw - 0.12;
      items.forEach((it, k)=>{
        const iy = iy0 + k*(ih + ig), ix = x + 0.06;
        if (it.kind === 'off'){
          const op = [para(cal.offLabel || 'No training', fs[1], C.muted, true, fs[1]*1.25)];
          if (it.reason) op.push(para(it.reason, fitSize(it.reason, fs[1], tw + 0.1, false, 7), C.muted, false, fs[1]*1.25));
          out.push({t:'text', x:ix+0.02, y:iy+0.02, w:tw+0.1, h:Math.max(ih, 0.4), paras:op, name:'No training'});
          return;
        }
        const isM = it.kind === 'match';
        if (isM) out.push({t:'rect', x:ix, y:iy, w:iw, h:ih, fill:C.gym, r:0.04, name:'Match'});
        else out.push({t:'rect', x:ix, y:iy, w:iw, h:ih, fill:C.blockFill, line:C.kern2, lineW:1, dash:!!it.projected, r:0.04, name:'Training'});
        const ink = isM ? C.dark : C.fg, ink2 = isM ? C.dark : C.muted;
        const l1 = isM ? ('Match' + (it.time ? ' · ' + it.time : '')) : (it.time || 'Training');
        const l2 = isM ? [it.opponent, it.venue ? '(' + it.venue + ')' : ''].filter(Boolean).join(' ') : (it.place || '');
        const single = l1 + (l2 ? ' · ' + l2 : '');
        const paras = one
          ? [para(single, fitSize(single, fs[0], tw, true, 6.5), ink, true, fs[0]*1.2)]
          : [para(l1, fitSize(l1, fs[0], tw, true, 7), ink, true, fs[0]*1.25)].concat(l2 ? [para(l2, fitSize(l2, fs[1], tw, false, 6.5), ink2, false, fs[1]*1.25)] : []);
        out.push({t:'text', x:ix+0.06, y:iy, w:tw, h:ih, valign:'middle', paras, name: isM ? 'Match text' : 'Training text'});
      });
    });
  });
  return out;
}
function shapesFor(st, s, preview){ useTheme(st.options && st.options.theme);
  if (s.kind === 'cal') return calendarShapes(st, s.cal);
  return s.kind === 'week' ? weekShapes(st, preview) : dayShapes(st, st.days[s.i], preview); }

/* ---------- PowerPoint writer ---------- */
function addShapesToSlide(pres, slide, shapes){
  shapes.forEach(sh=>{
    if (sh.t === 'rect' || sh.t === 'oval'){
      const o = {x:sh.x, y:sh.y, w:sh.w, h:sh.h, fill:{color:sh.fill}, objectName:sh.name};
      o.line = sh.line ? (sh.dash ? {color:sh.line, width:sh.lineW||1, dashType:'dash'} : {color:sh.line, width:sh.lineW||1}) : {type:'none'};
      if (sh.t === 'rect' && sh.r){ o.rectRadius = sh.r; slide.addShape(pres.ShapeType.roundRect, o); }
      else slide.addShape(sh.t === 'oval' ? pres.ShapeType.ellipse : pres.ShapeType.rect, o);
    } else if (sh.t === 'text'){
      const runs = [];
      sh.paras.forEach((p, pi)=>{
        p.runs.forEach((r, ri)=>{
          runs.push({text:r.text, options:{fontSize:r.size, color:r.color, bold:r.bold, fontFace:'DM Sans',
            lineSpacing:p.ls, breakLine: (ri === p.runs.length-1 && pi < sh.paras.length-1)}});
        });
      });
      slide.addText(runs, {x:sh.x, y:sh.y, w:sh.w, h:sh.h, margin:0, valign:sh.valign||'top', align:sh.align||'left',
        fontFace:'DM Sans', isTextBox:true, fit: sh.notes ? 'shrink' : 'none', objectName:sh.name});
    }
  });
}
function plBuildDeck(PptxGenJS, st, withDetail, slides){
  useTheme(st.options && st.options.theme);
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = (st.meta.title||'Weekplanning') + ' ' + (st.meta.subtitle||'');
  pres.author = 'WU18 staff';
  (slides || slideList(st, withDetail)).forEach(s=>{
    const slide = pres.addSlide();
    slide.background = {color:C.bg};
    addShapesToSlide(pres, slide, shapesFor(st, s, false));
  });
  return pres;
}
/* ---------- PDF writer (same shapes, vector output) ---------- */
function plBuildPdf(jsPDF, st, withDetail, fonts, slides){
  useTheme(st.options && st.options.theme);
  const doc = new jsPDF({orientation:'landscape', unit:'in', format:[SLIDE_W, SLIDE_H], compress:true});
  let fam = 'helvetica';
  if (fonts && fonts.regular && fonts.bold){
    doc.addFileToVFS('DMSans-Regular.ttf', fonts.regular); doc.addFont('DMSans-Regular.ttf', 'DMSans', 'normal');
    doc.addFileToVFS('DMSans-Bold.ttf', fonts.bold); doc.addFont('DMSans-Bold.ttf', 'DMSans', 'bold');
    fam = 'DMSans';
  }
  doc.setProperties({title:(st.meta.title||'Weekplanning') + ' ' + (st.meta.subtitle||''), author:'WU18 staff'});
  const hex = h => '#' + h;
  const setF = (size, bold) => { doc.setFont(fam, bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  function layoutLines(sh, scale){
    const lines = [];
    sh.paras.forEach(p=>{
      const lh = p.ls * scale / 72;
      if (p.runs.length > 1){ lines.push({segs:p.runs.map(r=>({...r, size:r.size*scale})), lh}); return; }
      const r = p.runs[0], size = r.size * scale;
      setF(size, r.bold);
      let parts;
      if (sh.valign === 'middle'){
        let t = r.text;
        if (doc.getTextWidth(t) > sh.w){ while (t.length > 1 && doc.getTextWidth(t + '…') > sh.w) t = t.slice(0, -1); t = t + '…'; }
        parts = [t];
      } else parts = r.text === '' ? [''] : doc.splitTextToSize(r.text, sh.w);
      parts.forEach(t=>lines.push({segs:[{...r, text:t, size}], lh}));
    });
    return lines;
  }
  function drawText(sh){
    let scale = 1, lines = layoutLines(sh, 1);
    const total = ls => ls.reduce((a,l)=>a+l.lh, 0);
    if (sh.notes){ while (total(lines) > sh.h && scale > 0.6){ scale -= 0.05; lines = layoutLines(sh, scale); } }
    let y = sh.y + (sh.valign === 'middle' ? (sh.h - total(lines)) / 2 : 0);
    lines.forEach(l=>{
      if (sh.notes && y + l.lh > sh.y + sh.h + 0.01) return;
      const mid = y + l.lh / 2;
      let width = 0;
      l.segs.forEach(sg=>{ setF(sg.size, sg.bold); width += doc.getTextWidth(sg.text); });
      let x = sh.align === 'center' ? sh.x + (sh.w - width) / 2 : sh.align === 'right' ? sh.x + sh.w - width : sh.x;
      l.segs.forEach(sg=>{
        setF(sg.size, sg.bold); doc.setTextColor(hex(sg.color));
        if (sg.text) doc.text(sg.text, x, mid, {baseline:'middle'});
        x += doc.getTextWidth(sg.text);
      });
      y += l.lh;
    });
  }
  (slides || slideList(st, withDetail)).forEach((s, k)=>{
    if (k > 0) doc.addPage([SLIDE_W, SLIDE_H], 'landscape');
    doc.setFillColor(hex(C.bg)); doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F');
    shapesFor(st, s, false).forEach(sh=>{
      if (sh.t === 'rect' || sh.t === 'oval'){
        doc.setFillColor(hex(sh.fill));
        let style = 'F';
        doc.setLineDashPattern([], 0);
        if (sh.line){ doc.setDrawColor(hex(sh.line)); doc.setLineWidth((sh.lineW||1)/72); style = 'FD'; if (sh.dash) doc.setLineDashPattern([0.05, 0.035], 0); }
        if (sh.t === 'oval') doc.ellipse(sh.x + sh.w/2, sh.y + sh.h/2, sh.w/2, sh.h/2, style);
        else if (sh.r) doc.roundedRect(sh.x, sh.y, sh.w, sh.h, sh.r, sh.r, style);
        else doc.rect(sh.x, sh.y, sh.w, sh.h, style);
      } else if (sh.t === 'text') drawText(sh);
    });
  });
  return doc;
}
