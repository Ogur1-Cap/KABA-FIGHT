/**
 * KABA Fight : petit serveur qui relie l'appli au Google Sheet « KABA Fight – Données ».
 * À coller dans Extensions > Apps Script du Sheet, puis Déployer > Nouveau déploiement > Application Web
 * (Exécuter en tant que : moi ; Qui a accès : tout le monde).
 *
 * TOKEN : clé privée partagée avec l'appli. Ne la publie pas.
 */
const TOKEN = 'A_REMPLACER';
const TZ = 'Europe/Paris';
// Analyse des repas en photo : clé API Gemini gratuite (aistudio.google.com > Get API key). Ne la publie pas.
const GEMINI_KEY = 'A_REMPLACER';
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

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
  if (b.action === 'analyze') { try { return out({ ok: true, result: analyze(b) }); } catch (err) { return out({ ok: false, error: String(err.message || err) }); } }
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

const PROMPT = `Tu es nutritionniste du sport et tu aides un boxeur de 26 ans en perte de poids avant une compétition.
Estime le contenu nutritionnel du repas photographié ou décrit.
Règles :
- Utilise les valeurs moyennes françaises (table Ciqual de l'ANSES) pour des aliments tels que consommés (cuits si cuits).
- Les applis photo sous-estiment souvent les calories d'environ un tiers : compte les matières grasses de cuisson, les sauces, le fromage, les boissons. Si une portion est incertaine, prends la plus probable, pas la plus petite.
- Détaille chaque aliment avec son poids estimé en grammes.
- Si ce n'est pas un repas, renvoie "items": [].
Réponds uniquement avec un objet JSON de cette forme :
{"nom":"nom court du repas","items":[{"aliment":"riz blanc cuit","grammes":150,"kcal":195,"proteines":4,"glucides":42,"lipides":0.5}],"confiance":"faible|moyenne|bonne","question":"une question courte pour préciser l'estimation, ou chaîne vide"}`;

function analyze(b) {
  if (!GEMINI_KEY || GEMINI_KEY === 'A_REMPLACER') throw new Error('nokey');
  const parts = [{ text: PROMPT + '\n\nPrécisions de l\'utilisateur : ' + (b.note || 'aucune') }];
  if (b.image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b.image } });
  const body = { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
  let last = '';
  for (const m of GEMINI_MODELS) {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + GEMINI_KEY,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    const code = r.getResponseCode();
    if (code === 200) {
      const j = JSON.parse(r.getContentText());
      const txt = j.candidates[0].content.parts.map(x => x.text || '').join('');
      return JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim());
    }
    last = code === 429 ? 'quota' : 'gemini ' + code;
    if (code !== 404) break;
  }
  throw new Error(last);
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

// À lancer une fois depuis l'éditeur (bouton Exécuter) pour autoriser l'accès à Internet (analyse photo).
function autoriser() { UrlFetchApp.fetch('https://generativelanguage.googleapis.com/', { muteHttpExceptions: true }); SpreadsheetApp.getActiveSpreadsheet().getName(); }
