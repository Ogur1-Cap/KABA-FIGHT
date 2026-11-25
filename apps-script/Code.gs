/**
 * KABA Fight : petit serveur qui relie l'appli au Google Sheet « KABA Fight – Données ».
 * À coller dans Extensions > Apps Script du Sheet, puis Déployer > Nouveau déploiement > Application Web
 * (Exécuter en tant que : moi ; Qui a accès : tout le monde).
 *
 * TOKEN : clé privée partagée avec l'appli. Ne la publie pas.
 * Les clés sont mémorisées dans les Propriétés du script dès la première utilisation :
 * aux prochaines mises à jour, tu pourras coller le script tel quel, sans remettre tes clés.
 */
const TOKEN = cle_('TOKEN', 'A_REMPLACER');
const TZ = 'Europe/Paris';
// Analyse des repas en photo : clé API Gemini gratuite (aistudio.google.com > Get API key). Ne la publie pas.
const GEMINI_KEY = cle_('GEMINI_KEY', 'A_REMPLACER');
const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']; // le modèle léger d'abord : bien plus rapide, suffisant pour estimer un repas // complétés automatiquement par la liste des modèles disponibles
const GEMINI_MAX_PAR_JOUR = 80; // garde-fou : au-delà, les analyses sont refusées jusqu'au lendemain

// Lit une clé : la valeur écrite dans le script si elle est renseignée (et on la mémorise), sinon celle mémorisée
function cle_(nom, valeur) {
  const pr = PropertiesService.getScriptProperties();
  if (valeur && valeur !== 'A_REMPLACER') { if (pr.getProperty(nom) !== valeur) pr.setProperty(nom, valeur); return valeur; }
  return pr.getProperty(nom) || valeur;
}

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
  if (b.action === 'logError') { journal('erreur appli', 'erreur', 0, 0, String(b.where || '') + ' : ' + String(b.message || '').slice(0, 300)); return out({ ok: true }); }
  if (b.action === 'chat') {
    const t0 = Date.now();
    try {
      const hist = (b.history || []).slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text).slice(0, 2000) }] }));
      if (!hist.length || hist[hist.length - 1].role !== 'user') throw new Error('question vide');
      const answer = gemini(null, { json: false, contents: hist, system: COACH_PROMPT + '\n\nDONNÉES DE RAPH :\n' + String(b.context || '').slice(0, 12000) });
      journal('coach', 'ok', Date.now() - t0, LAST_TOKENS, String(hist[hist.length - 1].parts[0].text).slice(0, 80));
      coachLog(hist[hist.length - 1].parts[0].text, answer);
      return out({ ok: true, answer });
    } catch (err) {
      const e = String(err.message || err).replace(/key=[^&\s]+/g, 'key=***').replace(/^Expiration du délai.*/, 'gemini lent');
      journal('coach', 'erreur', Date.now() - t0, LAST_TOKENS, e.slice(0, 300));
      return out({ ok: false, error: e });
    }
  }
  if (b.action === 'importRecipe' || b.action === 'analyze') {
    const t0 = Date.now(), label = b.action === 'analyze' ? (b.image ? 'analyse photo' : 'analyse texte') : 'import recette';
    try {
      const res = b.action === 'analyze' ? { result: analyze(b) } : importRecipe(b);
      const n = res.result ? (res.result.items || []).length + ' aliment(s)' : res.links ? res.links.length + ' lien(s)' : (res.recipes || []).length + ' recette(s)';
      journal(label, 'ok', Date.now() - t0, LAST_TOKENS, n + (b.url ? ' · ' + String(b.url).slice(0, 80) : ''));
      return out({ ok: true, ...res });
    } catch (err) {
      journal(label, 'erreur', Date.now() - t0, LAST_TOKENS, String(err.message || err).slice(0, 300));
      return out({ ok: false, error: String(err.message || err).replace(/key=[^&\s]+/g, 'key=***').replace(/^Expiration du délai.*/, 'gemini lent') });
    }
  }
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
  } else if (op.action === 'setRecipe') {
    const r = op.recipe, sh = recSheet(), row = findRow(sh, 1, r.id);
    const vals = [r.id, r.name || '', r.url || '', +r.portions || 2, +r.parts || 2, +r.kcal || 0, +r.p || 0, +r.c || 0, +r.f || 0, r.ingredients || '', "'" + (r.added || ''), +r.eaten || 0, r.status || 'en cours', r.vsrc || ''];
    if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
  } else if (op.action === 'delRecipe') {
    const sh = recSheet(), row = findRow(sh, 1, op.id); if (row) sh.deleteRow(row);
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
  const recipes = rows(recSheet()).filter(r => r[0]).map(r => ({ id: String(r[0]), name: String(r[1]), url: String(r[2]), portions: +r[3] || 2, parts: +r[4] || 2, kcal: +r[5] || 0, p: +r[6] || 0, c: +r[7] || 0, f: +r[8] || 0, ingredients: String(r[9]), added: day(r[10]), eaten: +r[11] || 0, status: String(r[12] || 'en cours'), vsrc: String(r[13] || '') }));
  // Mots de Claude (onglet « Claude » : Date, Heure, Message), écrits par sa tâche planifiée : les 5 derniers
  const csh = ss.getSheetByName('Claude');
  const claude = csh ? rows(csh).filter(r => r[0] && r[2]).slice(-5).map(r => ({ date: day(r[0]), time: String(r[1] || ''), at: day(r[0]) + ' ' + String(r[1] || ''), text: String(r[2]) })) : [];
  return { profile, days, adj, recipes, claude, at: new Date().toISOString() };
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
  const parts = [{ text: PROMPT + '\n\nPrécisions de l\'utilisateur : ' + (b.note || 'aucune') }];
  if (b.image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b.image } });
  return gemini(parts);
}

// Onglet Recettes (créé automatiquement) : valeurs nutritionnelles PAR PORTION Jow
function recSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Recettes');
  if (!sh) {
    sh = ss.insertSheet('Recettes');
    sh.appendRow(['ID', 'Recette', 'Lien', 'Portions Jow', 'Parts', 'Kcal par portion', 'Protéines par portion (g)', 'Glucides par portion (g)', 'Lipides par portion (g)', 'Ingrédients', 'Ajoutée le', 'Parts mangées', 'Statut']);
    sh.setFrozenRows(1); sh.getRange(1, 1, 1, 13).setFontWeight('bold');
  } else if (sh.getRange(1, 12).getValue() === '') {
    sh.getRange(1, 12, 1, 2).setValues([['Parts mangées', 'Statut']]).setFontWeight('bold');
  }
  if (sh.getRange(1, 14).getValue() === '') sh.getRange(1, 14).setValue('Valeurs').setFontWeight('bold');
  return sh;
}

const RECIPE_PROMPT = `Voici le texte d'une page Jow. Elle contient une recette ou un menu de plusieurs recettes. Extrais chaque recette.
Si la page donne des valeurs nutritionnelles par portion, reprends-les exactement. Sinon, estime-les par portion à partir des ingrédients (table Ciqual, sans sous-estimer les matières grasses).
Réponds uniquement avec un objet JSON :
{"recettes":[{"nom":"nom de la recette","ingredients":["2 escalopes de poulet","120 g de riz"],"parPortion":{"kcal":525,"proteines":46,"glucides":22,"lipides":28},"source":"page|estimation"}]}
S'il n'y a aucune recette lisible, renvoie {"recettes":[]}.`;

const JOW = /^https:\/\/([a-z0-9-]+\.)*jow\.(com|fr)\//i;
function fetchJow(url) {
  for (let hop = 0; hop < 4; hop++) {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false, headers: { 'Accept-Language': 'fr-FR', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36' } });
    const code = r.getResponseCode(), h = r.getAllHeaders();
    const loc = h.Location || h.location;
    if (code >= 300 && code < 400 && loc) { url = loc.startsWith('http') ? loc : url.replace(/^(https:\/\/[^/]+).*/, '$1') + loc; continue; }
    const html = r.getContentText();
    // redirection par balise meta ou par script vers une autre page Jow
    const m = html.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i) || html.match(/location(?:\.href)?\s*=\s*["'](https:\/\/[^"']*jow\.(?:com|fr)[^"']*)["']/i);
    if (m && JOW.test(m[1]) && m[1] !== url && hop < 3) { url = m[1].replace(/&amp;/g, '&'); continue; }
    return { code, html, url };
  }
  throw new Error('trop de redirections');
}

// Valeurs nutritionnelles PAR PORTION lues directement sur la fiche Jow (sans IA) : données schema.org, puis texte FR ou EN
function jowFacts(html) {
  const n = re => { const m = html.match(re); return m ? Math.round(parseFloat(String(m[1]).replace(',', '.'))) : null; };
  let f = { kcal: n(/"calories"\s*:\s*"?\s*(\d+(?:[.,]\d+)?)/i), proteines: n(/"proteinContent"\s*:\s*"?\s*(\d+(?:[.,]\d+)?)/i), glucides: n(/"carbohydrateContent"\s*:\s*"?\s*(\d+(?:[.,]\d+)?)/i), lipides: n(/"fatContent"\s*:\s*"?\s*(\d+(?:[.,]\d+)?)/i) };
  if (f.kcal && f.proteines !== null && f.glucides !== null && f.lipides !== null) return f;
  const t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');
  const g = re => { const m = t.match(re); return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : null; };
  f = { kcal: g(/Calories\s*(\d+)\s*k?cal/i) ?? g(/(?:É|E)nergie\s*(\d+)\s*k?cal/i) ?? g(/(\d+)\s*(?:É|E)nergie/i) ?? g(/Energy\s*(\d+)\s*cal/i) ?? g(/(\d+)\s*Energy/i),
    lipides: g(/Mati(?:è|e)res grasses\s*(\d+(?:[.,]\d+)?)\s*g/i) ?? g(/(\d+)\s*g de Mati(?:è|e)res grasses/i) ?? g(/Fat\s*(\d+)\s*g/i) ?? g(/(\d+)\s*g of Fat/i),
    glucides: g(/Glucides\s*(\d+(?:[.,]\d+)?)\s*g/i) ?? g(/(\d+)\s*g de Glucides/i) ?? g(/Carbohydrates\s*(\d+)\s*g/i) ?? g(/(\d+)\s*g of Carbohydrates/i),
    proteines: g(/Prot(?:é|e)ines\s*(\d+(?:[.,]\d+)?)\s*g/i) ?? g(/(\d+)\s*g de Prot(?:é|e)ines/i) ?? g(/Protein\s*(\d+)\s*g/i) ?? g(/(\d+)\s*g of Protein/i) };
  return f.kcal && f.proteines !== null && f.glucides !== null && f.lipides !== null ? f : null;
}
// Remplace les valeurs de Gemini par celles de la fiche Jow quand on peut les lire
function withJowFacts(rec, html) {
  const f = html ? jowFacts(html) : null;
  if (f) { rec.parPortion = f; rec.source = 'jow'; } else rec.source = 'estimation';
  return rec;
}

function importRecipe(b) {
  const url = String(b.url || '').trim();
  if (!JOW.test(url)) throw new Error('lien');
  // Menu partagé depuis l'appli Jow : on lit directement les données du menu
  const q = {}; (url.split('?')[1] || '').split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  if (q.sharingId && q.key && q.userId) return importMenu(q);
  const f = fetchJow(url);
  if (f.code !== 200) throw new Error('jow ' + f.code);
  const html = f.html;
  // Page de menu : on renvoie les liens des recettes pour les importer une par une
  if (!/\/recipes\//.test(f.url)) {
    const links = {};
    (html.match(/(https:\/\/(?:www\.)?jow\.(?:com|fr))?\/[a-z]{2}\/recipes\/[a-z0-9-]+/gi) || []).forEach(l => { links[(l.startsWith('http') ? '' : 'https://jow.com') + l] = 1; });
    const list = Object.keys(links);
    if (list.length) return { links: list };
  }
  const data = (html.match(/<script[^>]*(__NEXT_DATA__|ld\+json)[^>]*>[\s\S]*?<\/script>/gi) || []).join(' ').replace(/<[^>]+>/g, ' ').slice(0, 25000);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(0, 20000);
  let res = null, gErr = null;
  try { res = gemini([{ text: RECIPE_PROMPT + '\n\nADRESSE : ' + f.url + '\n\nTEXTE DE LA PAGE :\n' + text + '\n\nDONNÉES DE LA PAGE :\n' + data }]); } catch (e) { gErr = e; }
  let recs = (res && res.recettes) || [];
  // Gemini saturé ou illisible : si la fiche Jow donne ses valeurs, on importe quand même (nom tiré du titre de la page)
  if (!recs.length && /\/recipes\//.test(f.url) && jowFacts(html)) {
    const t = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<title>([^<]+)/i) || [])[1] || 'Recette Jow';
    recs = [{ nom: t.replace(/\s*[-|–].*$/, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").trim(), ingredients: [] }];
  }
  if (!recs.length && gErr) throw gErr;
  if (recs.length === 1) withJowFacts(recs[0], html); else recs.forEach(r => { r.source = r.source === 'page' ? 'page' : 'estimation'; });
  return { recipes: recs, finalUrl: f.url, preview: text.slice(0, 300) };
}

const MENU_PROMPT = `Voici les données JSON d'un menu partagé depuis l'appli Jow. Extrais chaque recette du menu.
Pour chaque recette : son nom, le nombre de portions (couverts) prévu dans ce menu ("portions", nombre entier), ses ingrédients avec quantités pour CE nombre de portions, et ses valeurs nutritionnelles PAR PORTION. Si les données contiennent des valeurs nutritionnelles, reprends-les en les ramenant à une portion. Sinon, estime-les par portion à partir des ingrédients (table Ciqual, sans sous-estimer les matières grasses).
Si un identifiant et un slug de recette sont présents, construis "lien" sous la forme https://jow.com/fr/recipes/SLUG-ID, sinon laisse "".
Réponds uniquement avec un objet JSON :
{"recettes":[{"nom":"Poulet impérial","lien":"","portions":2,"ingredients":["120 g de poulet","75 g de riz"],"parPortion":{"kcal":650,"proteines":40,"glucides":70,"lipides":20},"source":"donnees|estimation"}]}`;

function importMenu(q) {
  const api = 'https://api.jow.fr/public/share/link/details?key=' + encodeURIComponent(q.key) + '&userId=' + encodeURIComponent(q.userId) + '&sharingId=' + encodeURIComponent(q.sharingId);
  const r = UrlFetchApp.fetch(api, { muteHttpExceptions: true, headers: { 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'fr-FR', 'Origin': 'https://jow.fr', 'Referer': 'https://jow.fr/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' } });
  if (r.getResponseCode() !== 200) throw new Error('api jow ' + r.getResponseCode() + ' : ' + r.getContentText().slice(0, 150));
  const json = r.getContentText();
  const res = gemini([{ text: MENU_PROMPT + '\n\nDONNÉES :\n' + json.slice(0, 120000) }]);
  const recs = (res && res.recettes) || [];
  // Les données du menu n'ont pas les valeurs nutritionnelles : on lit la fiche Jow de chaque recette
  recs.slice(0, 12).forEach(r => {
    let html = null;
    try { if (r.lien && JOW.test(r.lien)) { const f = fetchJow(r.lien); if (f.code === 200) html = f.html; } } catch (e) {}
    withJowFacts(r, html);
  });
  return { recipes: recs, finalUrl: 'https://jow.fr/cooking/recipes-selection/' + q.sharingId, preview: json.slice(0, 300) };
}

let LAST_TOKENS = 0;
function gemini(parts, opt) {
  opt = opt || {}; const json = opt.json !== false;
  if (!GEMINI_KEY || GEMINI_KEY === 'A_REMPLACER') throw new Error('nokey');
  const props = PropertiesService.getScriptProperties(), k = 'gemini_' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const used = Number(props.getProperty(k) || 0);
  if (used >= GEMINI_MAX_PAR_JOUR) throw new Error('limite_jour');
  props.setProperty(k, String(used + 1));
  // Pas de « sortie JSON imposée » ni de réglage de réflexion : cette combinaison fait parfois bloquer Gemini
  // indéfiniment (incidents signalés sur le forum Google). On demande du JSON dans la consigne et on l'extrait du texte.
  const cfg = json ? { temperature: 0.2, maxOutputTokens: 2500 } : { temperature: 0.6, maxOutputTokens: 4000 }; // large : la réflexion de Gemini consomme aussi ce budget (sinon réponses coupées)
  const base = { contents: opt.contents || [{ parts }] };
  if (opt.system) base.systemInstruction = { parts: [{ text: opt.system }] };
  const body = Object.assign({}, base, { generationConfig: cfg });
  const t0 = Date.now();
  let last = '', saturated = false;
  for (const m of geminiModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Date.now() - t0 > 70000) throw new Error('gemini lent');
      const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + GEMINI_KEY,
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
      const code = r.getResponseCode();
      if (code === 200) {
        const j = JSON.parse(r.getContentText());
        LAST_TOKENS = (j.usageMetadata && j.usageMetadata.totalTokenCount) || 0;
        const cand = j.candidates[0], txt = ((cand.content && cand.content.parts) || []).map(x => x.text || '').join('');
        if (!json) return txt.trim() + (cand.finishReason === 'MAX_TOKENS' ? ' […]' : '');
        const a = txt.indexOf('{'), z = txt.lastIndexOf('}');
        if (a < 0 || z < a) throw new Error('réponse illisible');
        return JSON.parse(txt.slice(a, z + 1));
      }
      if (code === 429) throw new Error('quota');
      if (code === 503 || code === 500) { saturated = true; last = 'gemini ' + code; Utilities.sleep(2500); continue; } // saturé : on réessaie, puis modèle suivant
      last = 'gemini ' + code + ' (' + m + ')';
      break; // 404 ou autre : modèle suivant
    }
  }
  throw new Error(saturated ? 'gemini 503' : last);
}

// Liste des modèles Flash disponibles pour ta clé, mise en cache 24 h (Google retire régulièrement d'anciens modèles)
function geminiModels() {
  const cache = CacheService.getScriptCache(), hit = cache.get('gemini_models');
  if (hit) return JSON.parse(hit);
  let names = GEMINI_MODELS.slice();
  try {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + GEMINI_KEY, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const found = (JSON.parse(r.getContentText()).models || [])
        .filter(x => (x.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
        .map(x => x.name.replace('models/', ''))
        .filter(n => /flash/.test(n) && !/image|tts|audio|live|embedding|thinking|exp/.test(n))
        .sort((a, b) => (/preview/.test(a) - /preview/.test(b)) || (/lite/.test(b) - /lite/.test(a)) || b.localeCompare(a, 'en', { numeric: true }));
      names = names.concat(found.filter(n => names.indexOf(n) < 0)).slice(0, 6);
    }
  } catch (e) {}
  cache.put('gemini_models', JSON.stringify(names), 86400);
  return names;
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

const COACH_PROMPT = `Tu es le coach nutrition intégré à l'appli KABA Fight de raph, boxeur de 26 ans qui prépare une compétition (pesée le jour même, l'après-midi).
Réponds en français, en le tutoyant, de façon directe, bienveillante et concrète, en 120 mots maximum sauf s'il demande plus de détails.
Appuie-toi sur ses données ci-dessous (objectifs, pesées, repas, recettes Jow en cours) et cite des chiffres quand c'est utile.
Règles : perte de 0,5 à 1 kg par semaine ; protéines élevées ; alimentation pauvre en fibres seulement les 4 derniers jours (position ISSN 2025) ; jamais de régime extrême, de jeûne ni de sautage de repas avant l'entraînement ; toute déshydratation (sauna, etc.) uniquement avec son coach de boxe ; tu n'es pas médecin et tu le rediriges vers un professionnel pour toute question de santé.
Si une donnée manque, dis-le au lieu d'inventer.`;

// Onglet Coach (créé automatiquement) : questions et réponses, pour que Claude puisse vérifier les conseils de Gemini
function coachLog(q, a) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('Coach');
    if (!sh) { sh = ss.insertSheet('Coach'); sh.appendRow(['Date', 'Question', 'Réponse de Gemini']); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 3).setFontWeight('bold'); }
    sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), String(q).slice(0, 2000), String(a).slice(0, 5000)]);
    if (sh.getLastRow() > 400) sh.deleteRows(2, 50);
  } catch (e) {}
}

// Onglet Journal (créé automatiquement) : chaque appel à Gemini et chaque erreur de l'appli
function journal(action, statut, ms, tokens, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('Journal');
    if (!sh) { sh = ss.insertSheet('Journal'); sh.appendRow(['Date', 'Action', 'Statut', 'Durée (s)', 'Tokens Gemini', 'Détail']); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 6).setFontWeight('bold'); }
    sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), action, statut, Math.round(ms / 100) / 10, tokens || 0, String(detail || '').replace(/key=[^&\s]+/g, 'key=***')]);
    if (sh.getLastRow() > 600) sh.deleteRows(2, 100);
  } catch (e) {}
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
