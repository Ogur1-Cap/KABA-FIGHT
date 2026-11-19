/**
 * KABA Fight : petit serveur qui relie l'appli au Google Sheet « KABA Fight – Données ».
 * À coller dans Extensions > Apps Script du Sheet, puis Déployer > Nouveau déploiement > Application Web
 * (Exécuter en tant que : moi ; Qui a accès : tout le monde).
 *
 * TOKEN : clé privée partagée avec l'appli. Ne la publie pas.
 */
const TOKEN = 'A_REMPLACER';
const TZ = 'Europe/Paris';

function doGet(e) {
  const p = e.parameter || {};
  if (p.token !== TOKEN) return out({ ok: false, error: 'cle' });
  if (p.action === 'widget') return out(widget());
  return out({ ok: true, data: readAll() });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'json' }); }
  if (b.token !== TOKEN) return out({ ok: false, error: 'cle' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ops = Array.isArray(b.ops) ? b.ops : [b];
    for (const op of ops) apply(op);
    SpreadsheetApp.flush();
    return out({ ok: true, data: readAll() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}

function apply(op) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (op.action === 'setWeight' || op.action === 'setType') {
    const sh = ss.getSheetByName('Jours');
    const row = findRow(sh, 1, op.date);
    const r = row || sh.getLastRow() + 1;
    if (!row) sh.getRange(r, 1).setValue("'" + op.date);
    if (op.action === 'setWeight') sh.getRange(r, 2).setValue(op.weight === null ? '' : Number(op.weight));
    else sh.getRange(r, 3).setValue(op.type);
  } else if (op.action === 'addMeal') {
    const m = op.meal, sh = ss.getSheetByName('Repas');
    if (findRow(sh, 1, m.id)) return;
    sh.appendRow([m.id, "'" + m.date, m.at || '', m.name || 'Repas', +m.kcal || 0, +m.p || 0, +m.c || 0, +m.f || 0, m.src || 'appli']);
  } else if (op.action === 'delMeal') {
    const sh = ss.getSheetByName('Repas'), row = findRow(sh, 1, op.id);
    if (row) sh.deleteRow(row);
  } else if (op.action === 'setProfile') {
    const sh = ss.getSheetByName('Profil');
    for (const k in op.profile) {
      let v = op.profile[k];
      if (Array.isArray(v)) v = "'" + v.join(',');
      else if (/Date$/.test(k)) v = "'" + v;
      const row = findRow(sh, 1, k);
      if (row) sh.getRange(row, 2).setValue(v); else sh.appendRow([k, v, '']);
    }
  } else if (op.action === 'addAdjust') {
    const a = op.adjust;
    ss.getSheetByName('Ajustements').appendRow(["'" + a.date, a.oldTrain, a.oldRest, a.train, a.rest, a.tdee, a.source || '']);
  } else throw new Error('action inconnue : ' + op.action);
}

function readAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const profile = {};
  for (const [k, v] of rows(ss.getSheetByName('Profil'))) {
    if (!k) continue;
    if (k === 'trainingDays') profile[k] = String(v).split(',').filter(x => x !== '').map(Number);
    else if (/Date$/.test(k)) profile[k] = day(v);
    else profile[k] = (typeof v === 'number' || isNaN(Number(v))) ? v : Number(v);
  }
  const days = {};
  for (const [d, w, t] of rows(ss.getSheetByName('Jours'))) {
    const k = day(d); if (!k) continue;
    days[k] = { date: k, meals: [] };
    if (w !== '' && w !== null) days[k].weight = Number(w);
    if (t) days[k].type = String(t);
  }
  for (const [id, d, at, name, kcal, p, c, f, src] of rows(ss.getSheetByName('Repas'))) {
    const k = day(d); if (!k || !id) continue;
    if (!days[k]) days[k] = { date: k, meals: [] };
    days[k].meals.push({ id: String(id), at: String(at), name: String(name), kcal: +kcal || 0, p: +p || 0, c: +c || 0, f: +f || 0, src: String(src) });
  }
  const adj = rows(ss.getSheetByName('Ajustements')).filter(r => r[0]).map(r => ({ date: day(r[0]), oldTrain: r[1], oldRest: r[2], train: r[3], rest: r[4], tdee: r[5], source: r[6] }));
  return { profile, days, adj, at: new Date().toISOString() };
}

// Résumé court pour un widget Android (KWGT, etc.)
function widget() {
  const d = readAll(), p = d.profile, today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const t = d.days[today] || { meals: [] };
  const eaten = t.meals.reduce((s, m) => s + m.kcal, 0), prot = t.meals.reduce((s, m) => s + m.p, 0);
  const train = t.type ? t.type === 'boxe' : (p.trainingDays || []).indexOf(new Date(today + 'T12:00:00').getDay()) >= 0;
  const target = train ? p.kcalTrain : p.kcalRest;
  const ws = Object.keys(d.days).sort().filter(k => typeof d.days[k].weight === 'number');
  const last = ws.length ? d.days[ws[ws.length - 1]].weight : p.startWeight;
  const j = Math.round((new Date(p.competitionDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / 864e5);
  return { ok: true, jours: j, dernierPoids: last, resteKg: Math.round((last - p.targetMorning) * 10) / 10, kcalMangees: eaten, kcalObjectif: target, kcalRestantes: target - eaten, proteines: prot, proteinesObjectif: p.protein, typeJour: train ? 'boxe' : 'repos' };
}

function rows(sh) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues(); }
function day(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function findRow(sh, col, key) {
  const n = sh.getLastRow(); if (n < 2) return 0;
  const vals = sh.getRange(2, col, n - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i][0];
    if ((v instanceof Date ? day(v) : String(v)) === String(key)) return i + 2;
  }
  return 0;
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
