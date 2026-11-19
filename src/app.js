const DEFAULT = {
  name: 'raph', heightCm: 176, age: 26, sex: 'M',
  startDate: '2026-11-19', startWeight: 77.5, targetMorning: 74.5, fwTarget: 75.3,
  competitionDate: '2026-12-11', category: 75, trainingDays: [2, 4],
  kcalTrain: 2050, kcalRest: 1800, protein: 155, fat: 55, tdee0: 2400
};
// Aliments courants, valeurs pour 100 g (moyennes approximatives inspirées de la table Ciqual) + portion type
const FOODS = [
  ['Riz blanc cuit', 130, 2.7, 28, 0.3, 150], ['Pâtes cuites', 150, 5.2, 30, 0.9, 180], ['Pommes de terre cuites', 80, 2, 17, 0.1, 200],
  ['Semoule cuite', 115, 3.8, 23, 0.4, 150], ['Pain blanc (baguette)', 270, 9, 55, 1.2, 50], ['Pain complet', 240, 9, 44, 3, 50],
  ['Flocons d’avoine', 370, 13, 59, 7, 50], ['Lentilles cuites', 115, 9, 17, 0.5, 150], ['Blanc de poulet cuit', 150, 31, 0, 3, 150],
  ['Steak haché 5 % cuit', 160, 26, 0, 6, 125], ['Bœuf (steak) cuit', 170, 28, 0, 6, 150], ['Saumon cuit', 200, 24, 0, 11, 130],
  ['Thon au naturel', 115, 26, 0, 1, 100], ['Cabillaud cuit', 100, 22, 0, 1, 150], ['Jambon blanc', 115, 20, 1, 3.5, 40],
  ['Œuf (1 œuf = 55 g)', 140, 12.5, 0.5, 10, 55], ['Bacon (filet fumé)', 130, 20, 1, 5, 30], ['Lard fumé (tranche)', 300, 15, 0.5, 27, 20],
  ['Fromage blanc 0 %', 50, 7.5, 4, 0.2, 150], ['Skyr nature', 60, 10, 4, 0.2, 150], ['Yaourt nature', 60, 4.5, 5.5, 2, 125],
  ['Lait demi-écrémé', 46, 3.3, 4.8, 1.6, 250], ['Emmental', 380, 28, 0, 29, 30], ['Banane', 90, 1.1, 20, 0.3, 120],
  ['Pomme', 54, 0.3, 12, 0.2, 150], ['Orange', 47, 0.9, 9, 0.2, 150], ['Jus d’orange', 45, 0.7, 10, 0.1, 200],
  ['Compote sans sucre ajouté', 60, 0.3, 13, 0.2, 100], ['Haricots verts cuits', 30, 2, 4, 0.2, 150], ['Brocolis cuits', 30, 2.5, 3, 0.4, 150],
  ['Carottes', 35, 0.8, 6, 0.3, 100], ['Salade, tomates', 20, 1, 3, 0.2, 100], ['Huile d’olive (1 c. à s. = 10 g)', 900, 0, 0, 100, 10],
  ['Beurre', 745, 0.7, 0.6, 82, 10], ['Amandes', 600, 25, 7, 50, 25], ['Chocolat noir 70 %', 570, 8, 33, 42, 20],
  ['Pizza', 260, 11, 30, 10, 300], ['Kebab (sandwich)', 230, 12, 22, 10, 350], ['Burger (fast-food)', 260, 13, 26, 11, 220]
];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fr = (x, d = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => dstr(new Date());
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const fdate = s => { const d = parse(s); return JOURS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + 'h' + pad(d.getMinutes()); };
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => el.style.display = 'none', 2600); }

/* ---------- stockage local (cache hors ligne + file d'attente) ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('kaba.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kaba.' + k, JSON.stringify(v)); } catch {} }
};
const S = { p: { ...DEFAULT }, days: {}, adj: [], recipes: [], cfg: LS.get('cfg', null), outbox: LS.get('outbox', []), syncing: false, lastSync: null };
(function loadCache() { const c = LS.get('cache', null); if (c) { S.p = { ...DEFAULT, ...c.profile }; S.days = c.days || {}; S.adj = c.adj || []; S.recipes = c.recipes || []; S.lastSync = c.at; } })();

function applyLocal(op) {
  const d = op.date && (S.days[op.date] || (S.days[op.date] = { date: op.date, meals: [] }));
  if (op.action === 'setWeight') d.weight = op.weight;
  else if (op.action === 'setType') d.type = op.type;
  else if (op.action === 'addMeal') { const m = op.meal, dd = S.days[m.date] || (S.days[m.date] = { date: m.date, meals: [] }); if (!dd.meals.some(x => x.id === m.id)) dd.meals.push(m); }
  else if (op.action === 'delMeal') { for (const k in S.days) S.days[k].meals = (S.days[k].meals || []).filter(m => m.id !== op.id); }
  else if (op.action === 'setProfile') S.p = { ...S.p, ...op.profile };
  else if (op.action === 'addAdjust') S.adj = [op.adjust, ...S.adj];
  else if (op.action === 'setRecipe') S.recipes = [...S.recipes.filter(r => r.id !== op.recipe.id), op.recipe];
  else if (op.action === 'delRecipe') S.recipes = S.recipes.filter(r => r.id !== op.id);
}
function saveCache() { LS.set('cache', { profile: S.p, days: S.days, adj: S.adj, recipes: S.recipes, at: S.lastSync }); }
function push(op) {
  applyLocal(op); S.outbox.push(op); LS.set('outbox', S.outbox); saveCache(); renderAll(); sync();
}
function setData(data) {
  S.p = { ...DEFAULT, ...data.profile }; S.days = data.days || {}; S.adj = (data.adj || []).slice().reverse();
  // Si le script Google est ancien, il ne renvoie pas le statut des recettes : on garde celui du téléphone
  const prev = new Map(S.recipes.map(r => [r.id, r]));
  S.recipes = (data.recipes || []).map(r => ('status' in r) ? r : { ...r, status: (prev.get(r.id) || {}).status || 'en cours', eaten: (prev.get(r.id) || {}).eaten || 0 });
  for (const op of S.outbox) applyLocal(op);
  S.lastSync = data.at; saveCache(); renderAll();
}
async function sync() {
  if (!S.cfg || S.syncing) return;
  S.syncing = true; renderSync();
  try {
    let r;
    if (S.outbox.length) {
      const sent = S.outbox.slice();
      r = await fetch(S.cfg.url, { method: 'POST', body: JSON.stringify({ token: S.cfg.token, ops: sent }) }).then(x => x.json());
      if (r.ok) { S.outbox = S.outbox.slice(sent.length); LS.set('outbox', S.outbox); }
    } else {
      r = await fetch(S.cfg.url + '?token=' + encodeURIComponent(S.cfg.token) + '&t=' + Date.now()).then(x => x.json());
    }
    if (r.ok) { setData(r.data); $('status').textContent = ''; }
    else $('status').textContent = r.error === 'cle' ? 'Code de connexion refusé : vérifie-le dans Réglages.' : 'Erreur du Google Sheet : ' + r.error;
  } catch (e) {
    $('status').textContent = navigator.onLine ? 'Synchronisation impossible pour l’instant. Tes saisies sont gardées et partiront plus tard.' : 'Hors connexion : tes saisies partiront au retour du réseau.';
  } finally { S.syncing = false; renderSync(); if (S.outbox.length && navigator.onLine && !sync.retry) { sync.retry = setTimeout(() => { sync.retry = null; sync(); }, 15000); } }
}
function renderSync() {
  const n = S.outbox.length;
  $('sync').textContent = !S.cfg ? 'Non connecté à ton Google Sheet' : S.syncing ? 'Synchronisation…' : n ? n + ' saisie(s) en attente' : S.lastSync ? 'Synchronisé à ' + new Date(S.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
}
function connect(code) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!o.u || !o.t || !/^https:\/\/script\.google(usercontent)?\.com\//.test(o.u)) throw 0;
    S.cfg = { url: o.u, token: o.t }; LS.set('cfg', S.cfg); toast('Connecté à ton Google Sheet'); renderAll(); sync(); return true;
  } catch { toast('Code de connexion invalide'); return false; }
}

/* ---------- rendu ---------- */
function renderHeader() {
  const p = S.p, t = today(), left = diffDays(t, p.competitionDate);
  $('cdN').textContent = left > 0 ? 'J-' + left : left === 0 ? 'JOUR J' : 'FINI';
  $('cdL').textContent = left > 0 ? 'avant la pesée' : left === 0 ? 'pesée cet après-midi' : 'compétition passée';
  $('hsub').textContent = 'Objectif ' + fr(p.targetMorning, 1) + ' kg le matin du ' + fdate(p.competitionDate);
  renderSync();
}
let lastRemoved = null;
function renderToday() {
  const p = S.p, t = today(), day = S.days[t] || { meals: [] };
  const tg = targetFor(p, t, S.days), tot = totals(day), train = isTrain(p, t, S.days);
  $('todayTitle').textContent = 'Aujourd’hui, ' + fdate(t);
  $('typeBtn').innerHTML = train ? '<span class="chip box">Jour boxe</span>' : '<span class="chip">Jour repos</span>';
  $('typeBtn').setAttribute('aria-label', 'Changer le type de journée');
  const rem = tg.kcal - tot.kcal, ratio = clamp(tot.kcal / tg.kcal, 0, 1);
  $('ringV').style.strokeDashoffset = 326.7 * (1 - ratio);
  $('ringV').style.stroke = rem < 0 ? 'var(--glove)' : 'var(--mat)';
  $('ringN').textContent = fr(Math.abs(Math.round(rem)));
  $('ringL').textContent = rem < 0 ? 'kcal au-dessus' : 'kcal restantes';
  $('ringSub').textContent = fr(tot.kcal) + ' / ' + fr(tg.kcal) + ' kcal';
  const bar = (cls, lab, v, g) => '<div class="bar ' + cls + '"><div class="t"><span>' + lab + '</span><span>' + fr(v) + ' / ' + fr(g) + ' g</span></div><div class="tr"><i style="width:' + Math.round(clamp(v / g, 0, 1) * 100) + '%"></i></div></div>';
  $('macroBars').innerHTML = bar('p', 'Protéines', tot.p, tg.p) + bar('', 'Glucides', tot.c, tg.c) + bar('f', 'Lipides', tot.f, tg.f);
  const cur = current(p, S.days, t), plan = planWeight(p, t);
  if (typeof day.weight === 'number' && !renderToday.edit) {
    const gap = cur.est - plan;
    $('weighBox').innerHTML = '<div class="weigh"><span class="big">' + fr(day.weight, 1) + ' kg</span><button class="x" id="wEdit">modifier</button></div>' +
      '<p class="mute" style="margin:6px 0 0">Poids lissé ' + fr(cur.est, 1) + ' kg · trajectoire ' + fr(plan, 1) + ' kg · ' +
      (Math.abs(gap) < 0.15 ? 'pile dans les temps' : gap < 0 ? fr(-gap, 1) + ' kg d’avance' : fr(gap, 1) + ' kg de retard') +
      ' · reste ' + fr(Math.max(0, cur.est - p.targetMorning), 1) + ' kg</p>';
    $('wEdit').onclick = () => { renderToday.edit = true; renderToday(); };
  } else {
    $('weighBox').innerHTML = '<form class="weigh" id="wForm"><input id="wIn" type="number" step="0.1" min="40" max="150" inputmode="decimal" placeholder="Ex. 76,3" style="flex:1 1 140px" value="' + (typeof day.weight === 'number' ? day.weight : '') + '"><button type="submit">Enregistrer</button></form><p class="mute" style="margin:6px 0 0">Le matin, à jeun, après être allé aux toilettes, toujours sur la même balance.</p>';
    $('wForm').onsubmit = e => {
      e.preventDefault(); const v = parseFloat(String($('wIn').value).replace(',', '.'));
      if (!(v > 40 && v < 150)) { toast('Poids invalide'); return; }
      renderToday.edit = false; push({ action: 'setWeight', date: t, weight: Math.round(v * 10) / 10 }); toast('Pesée enregistrée');
    };
  }
  const meals = day.meals || [];
  $('mealList').innerHTML = meals.length ? meals.map(m => '<div class="meal"><div>' + esc(m.name) + '<small>' + esc(m.at || '') + ' · P ' + fr(m.p) + ' · G ' + fr(m.c) + ' · L ' + fr(m.f) + (m.src === 'claude' ? ' · ajouté par Claude' : m.src === 'photo' ? ' · photo' : m.src === 'recette' ? ' · recette Jow' : '') + '</small></div><div class="k">' + fr(m.kcal) + ' kcal<br><button class="x" data-del="' + esc(m.id) + '">supprimer</button></div></div>').join('')
    : '<p class="mute">Rien pour l’instant. Ajoute ton repas, ou envoie une photo à Claude.</p>';
  for (const b of $('mealList').querySelectorAll('[data-del]')) b.onclick = () => {
    const m = meals.find(x => x.id === b.dataset.del); if (!m) return;
    push({ action: 'delMeal', id: m.id }); lastRemoved = { ...m, date: t };
    const el = $('toast'); el.innerHTML = 'Repas supprimé · <button class="x" id="undo" style="color:inherit">annuler</button>'; el.style.display = 'block';
    clearTimeout(toast.h); toast.h = setTimeout(() => el.style.display = 'none', 5000);
    $('undo').onclick = () => { if (lastRemoved) { push({ action: 'addMeal', meal: { ...lastRemoved, id: 'm' + Date.now() } }); lastRemoved = null; el.style.display = 'none'; } };
  };
  const fs = fwStart(p), c = p.competitionDate;
  let fw = '';
  if (t >= addDays(fs, -3) && t < fs) fw = '<div class="card"><h2>Semaine du combat dans ' + diffDays(t, fs) + ' j</h2><p class="mute" style="margin:0">À partir du ' + fdate(fs) + ', l’appli passe en mode final. Prévois des courses pauvres en fibres : riz blanc, pâtes blanches, pain blanc, viandes et poissons maigres, œufs, compotes.</p></div>';
  else if (t >= fs && t < c) fw = '<div class="card banner"><h2>Semaine du combat</h2><ul class="check" style="margin:0;padding-left:18px">' +
    (t >= addDays(c, -3) ? '<li><b>Pauvre en fibres (moins de 10 g/jour)</b> : pas de légumes crus, de légumineuses, de céréales complètes ni de fruits secs.</li>' : '<li>Encore normal aujourd’hui. Les fibres baissent à partir du ' + fdate(addDays(c, -3)) + '.</li>') +
    '<li>Moins de sel : pas de plats industriels, de charcuterie ni de sauces.</li><li>Bois normalement. Aucune déshydratation sans ton coach.</li><li>Pèse-toi chaque matin pour savoir où tu en es.</li></ul></div>';
  else if (t === c) fw = '<div class="card banner"><h2>Jour J</h2><ul class="check" style="margin:0;padding-left:18px"><li>Pèse-toi en te levant : vise ' + fr(p.targetMorning, 1) + ' kg ou moins.</li><li>Petit déjeuner léger, pauvre en fibres, et petites gorgées d’eau jusqu’à la pesée.</li><li>Pèse-toi chez toi avant de partir.</li><li>Après la pesée : boisson de réhydratation, puis glucides rapides et faciles à digérer, peu de fibres.</li></ul></div>';
  $('fwBanner').innerHTML = fw;
}
function renderChart() {
  const p = S.p, t = today(), s = $('chart'), box = $('chartBox');
  const end = p.competitionDate > t ? p.competitionDate : t;
  const ser = trendSeries(p, S.days, t);
  const W = box.clientWidth, H = box.clientHeight; if (!W) return;
  const n = diffDays(p.startDate, end);
  const ws = ser.flatMap(r => [r.w, r.trend]).filter(v => v != null).concat([p.startWeight, p.targetMorning, p.category]);
  const lo = Math.floor(Math.min(...ws) - 0.5), hi = Math.ceil(Math.max(...ws) + 0.5);
  const L = 38, R = 10, T = 12, B = 26;
  const x = d => L + (W - L - R) * diffDays(p.startDate, d) / Math.max(1, n);
  const y = v => T + (H - T - B) * (hi - v) / (hi - lo);
  let g = '';
  for (let v = lo; v <= hi; v++) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--mute)">' + v + '</text>';
  g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p.category) + '" y2="' + y(p.category) + '" stroke="var(--glove)" stroke-dasharray="2 4"/><text x="' + (W - R) + '" y="' + (y(p.category) - 4) + '" text-anchor="end" font-size="11" fill="var(--glove)">catégorie ' + p.category + ' kg</text>';
  const step = W < 520 ? 7 : 3;
  for (let i = 0; i <= n; i += step) { const d = addDays(p.startDate, i), pd = parse(d); g += '<text x="' + x(d) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--mute)">' + pd.getDate() + '/' + (pd.getMonth() + 1) + '</text>'; }
  const planPts = []; for (let i = 0; i <= n; i++) { const d = addDays(p.startDate, i); planPts.push(x(d) + ',' + y(planWeight(p, d))); }
  g += '<polyline points="' + planPts.join(' ') + '" fill="none" stroke="var(--silver)" stroke-width="2" stroke-dasharray="6 5"/>';
  g += ser.filter(r => r.w != null).map(r => '<circle cx="' + x(r.date) + '" cy="' + y(r.w) + '" r="3.5" fill="var(--mute)"/>').join('');
  const tr = ser.filter(r => r.trend != null).map(r => x(r.date) + ',' + y(r.trend));
  if (tr.length > 1) g += '<polyline points="' + tr.join(' ') + '" fill="none" stroke="var(--mat)" stroke-width="3" stroke-linejoin="round"/>';
  g += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--mute)" stroke-dasharray="2 3"/>';
  s.setAttribute('viewBox', '0 0 ' + W + ' ' + H); s.innerHTML = g;
}
function renderCourbe() {
  const p = S.p, t = today(), cur = current(p, S.days, t), ser = cur.ser;
  const lost = p.startWeight - cur.est, plan = planWeight(p, t), gap = cur.est - plan;
  $('trendTitle').textContent = lost > 0.05 ? fr(lost, 1) + ' kg de perdus depuis le ' + fdate(p.startDate) : 'Ta tendance';
  $('trendSub').textContent = 'Poids lissé ' + fr(cur.est, 1) + ' kg, trajectoire ' + fr(plan, 1) + ' kg : ' + (Math.abs(gap) < 0.15 ? 'tu es dans les temps.' : gap < 0 ? 'tu as ' + fr(-gap, 1) + ' kg d’avance.' : 'tu as ' + fr(gap, 1) + ' kg de retard.');
  renderChart();
  const rows = ser.slice().reverse().filter(r => r.w != null || (S.days[r.date] && (S.days[r.date].meals || []).length));
  $('histT').innerHTML = '<tr><th>Jour</th><th>Poids</th><th>Lissé</th><th>Kcal</th><th>Prot.</th></tr>' + (rows.length ? rows.map(r => { const tt = totals(S.days[r.date]); return '<tr><td>' + fdate(r.date) + (isTrain(p, r.date, S.days) ? ' 🥊' : '') + '</td><td>' + (r.w != null ? fr(r.w, 1) : '–') + '</td><td>' + fr(r.trend, 2) + '</td><td>' + (tt.kcal ? fr(tt.kcal) : '–') + '</td><td>' + (tt.p ? fr(tt.p) : '–') + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="mute">Tes pesées et tes repas apparaîtront ici.</td></tr>');
}
function renderCoach() {
  const p = S.p, t = today(), pr = proposal(p, S.days, t);
  const same = Math.abs(pr.train - p.kcalTrain) < 50 && Math.abs(pr.rest - p.kcalRest) < 50;
  const past = t >= fwStart(p);
  $('weekCard').innerHTML = '<h2>Bilan et ajustement</h2>' +
    '<div class="grid2"><div><label>Dépense estimée</label><b class="num" style="font-size:28px">' + fr(pr.tdee.value) + '</b> kcal<div class="mute">' + (pr.tdee.source === 'formule' ? 'Calcul de base (pas encore assez de données : ' + pr.tdee.n + '/4 jours notés).' : 'D’après tes ' + pr.tdee.n + ' derniers jours notés.') + '</div></div>' +
    '<div><label>Rythme visé</label><b class="num" style="font-size:28px">' + fr(pr.rate, 2) + '</b> kg/sem.<div class="mute">Pour atteindre ' + fr(p.fwTarget, 1) + ' kg de poids lissé le ' + fdate(fwStart(p)) + '.</div></div></div>' +
    (past ? '<p class="mute">Semaine du combat : on ne change plus les calories, on suit la checklist.</p>' :
     pr.tdee.source === 'formule' ? '<p class="mute" style="margin:12px 0 0">Je te proposerai un ajustement dès que j’aurai au moins 4 jours de pesées et de repas notés. D’ici là, garde ' + fr(p.kcalTrain) + ' kcal les jours de boxe et ' + fr(p.kcalRest) + ' kcal les jours de repos.</p>' :
      '<p style="margin:12px 0 6px">Proposition : <b>' + fr(pr.train) + ' kcal</b> les jours de boxe, <b>' + fr(pr.rest) + ' kcal</b> les jours de repos <span class="mute">(actuel : ' + fr(p.kcalTrain) + ' / ' + fr(p.kcalRest) + ')</span>.</p>' +
      (same ? '<p class="mute" style="margin:0">Tes objectifs actuels sont bons, rien à changer.</p>' : '<div class="btns"><button id="adjOk">Appliquer</button><button class="ghost" id="adjNo">Garder les miens</button></div>'));
  if ($('adjOk')) {
    $('adjOk').onclick = () => {
      push({ action: 'addAdjust', adjust: { date: t, oldTrain: p.kcalTrain, oldRest: p.kcalRest, train: pr.train, rest: pr.rest, tdee: pr.tdee.value, source: pr.tdee.source } });
      push({ action: 'setProfile', profile: { kcalTrain: pr.train, kcalRest: pr.rest } });
      toast('Objectifs mis à jour');
    };
    $('adjNo').onclick = () => toast('On garde tes objectifs');
  }
}
function renderReglages() {
  const p = S.p;
  $('connState').textContent = S.cfg ? 'Connecté. Tes données sont enregistrées dans ton Google Sheet « KABA Fight – Données ».' : 'Pas encore connecté : colle le code que Claude t’a donné.';
  if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('#setForm')) {
    $('sTrain').value = p.kcalTrain; $('sRest').value = p.kcalRest; $('sProt').value = p.protein; $('sFat').value = p.fat; $('sTarget').value = p.targetMorning; $('sComp').value = p.competitionDate;
    $('sDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => '<button type="button" class="' + ((p.trainingDays || []).includes(d) ? '' : 'ghost') + '" data-d="' + d + '" aria-pressed="' + (p.trainingDays || []).includes(d) + '">' + JOURS[d] + '</button>').join('');
    for (const b of $('sDays').querySelectorAll('button')) b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.className = on ? '' : 'ghost'; };
  }
  $('adjList').innerHTML = S.adj.length ? S.adj.map(a => '<div>' + fdate(a.date) + ' : ' + fr(a.oldTrain) + '/' + fr(a.oldRest) + ' → <b style="color:var(--ink)">' + fr(a.train) + '/' + fr(a.rest) + '</b> kcal (dépense ' + fr(a.tdee) + ')</div>').join('') : 'Aucun ajustement pour l’instant.';
}
function renderAll() { renderHeader(); renderToday(); renderCourbe(); renderCoach(); renderRecettes(); renderReglages(); if ($('chatLog')) renderChat(); }

/* ---------- navigation ---------- */
const VIEWS = ['today', 'courbe', 'coach', 'recettes', 'reglages'];
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith('connect=')) { connect(h.slice(8)); history.replaceState(null, '', location.pathname + '#reglages'); }
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
  for (const x of VIEWS) $('v-' + x).classList.toggle('on', x === v);
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('on', a.dataset.v === v);
  if (v === 'courbe') renderChart();
}
addEventListener('hashchange', route);
const ro = new ResizeObserver(() => renderChart()); ro.observe($('chartBox'));

/* ---------- réglages ---------- */
$('connForm').onsubmit = e => { e.preventDefault(); if (connect($('connIn').value)) $('connIn').value = ''; };
$('syncBtn').onclick = () => { if (!S.cfg) toast('Connecte d’abord ton Google Sheet'); else sync(); };
$('setForm').onsubmit = e => {
  e.preventDefault();
  const num = (id, d) => { const v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) ? v : d; };
  const days = [...$('sDays').querySelectorAll('button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.dataset.d);
  const prof = { kcalTrain: Math.round(num('sTrain', S.p.kcalTrain)), kcalRest: Math.round(num('sRest', S.p.kcalRest)), protein: Math.round(num('sProt', S.p.protein)), fat: Math.round(num('sFat', S.p.fat)), targetMorning: num('sTarget', S.p.targetMorning), competitionDate: $('sComp').value || S.p.competitionDate, trainingDays: days };
  document.activeElement.blur(); push({ action: 'setProfile', profile: prof }); toast('Objectifs enregistrés');
};
$('typeBtn').onclick = () => { const t = today(); push({ action: 'setType', date: t, type: isTrain(S.p, t, S.days) ? 'repos' : 'boxe' }); };

/* ---------- coach intégré (Gemini via le Google Sheet) ---------- */
function context() {
  const p = S.p, t = today(), cur = current(p, S.days, t), pr = proposal(p, S.days, t), tg = targetFor(p, t, S.days), tt = totals(S.days[t]);
  const last = cur.ser.slice(-14).map(r => { const x = totals(S.days[r.date]); return r.date + ' : poids ' + (r.w ?? '-') + ', ' + Math.round(x.kcal) + ' kcal, ' + Math.round(x.p) + ' g prot., ' + (isTrain(p, r.date, S.days) ? 'boxe' : 'repos'); }).join('\n');
  const meals = ((S.days[t] || {}).meals || []).map(m => m.name + ' ' + m.kcal + ' kcal ' + m.p + ' g prot.').join(' ; ') || 'rien noté';
  const recs = S.recipes.filter(r => r.status !== 'archivée').map(r => { const x = partOf(r); return r.name + ' : ' + left(r) + ' part(s) restante(s) de ' + x.kcal + ' kcal / ' + x.p + ' g prot.'; }).join('\n') || 'aucune';
  return 'Aujourd’hui ' + t + ' (' + (isTrain(p, t, S.days) ? 'jour de boxe' : 'jour de repos') + '), pesée de compétition le ' + p.competitionDate + ' (J-' + diffDays(t, p.competitionDate) + '), objectif ' + p.targetMorning + ' kg le matin, catégorie ' + p.category + ' kg.\n' +
    'Profil : homme 26 ans, 1,76 m, boxe mardi 20-22h et jeudi 20h30-22h, travail assis.\nPoids lissé ' + cur.est.toFixed(1) + ' kg (départ ' + p.startWeight + ' kg le ' + p.startDate + ').\n' +
    'Objectifs : ' + p.kcalTrain + ' kcal jour boxe / ' + p.kcalRest + ' kcal repos, ' + p.protein + ' g protéines, ' + p.fat + ' g lipides. Dépense estimée ' + pr.tdee.value + ' kcal (' + pr.tdee.source + ').\n' +
    'Aujourd’hui : ' + Math.round(tt.kcal) + '/' + tg.kcal + ' kcal, ' + Math.round(tt.p) + '/' + tg.p + ' g protéines. Repas : ' + meals + '\n' +
    'Recettes Jow en cours :\n' + recs + '\n14 derniers jours :\n' + last;
}
S.chat = LS.get('chat', []);
function renderChat() {
  $('chatLog').innerHTML = S.chat.length ? S.chat.slice(-20).map(m => '<div class="msg ' + (m.role === 'user' ? 'user' : 'assistant') + '">' + esc(m.text) + '</div>').join('')
    : '<p class="mute">Pas encore de question. Exemples : « Qu’est-ce que je mange ce soir avec ce qu’il me reste ? », « Je suis en avance ou en retard ? »</p>';
}
$('chatSend').onclick = async () => {
  const q = $('chatIn').value.trim(); if (!q) return;
  if (!S.cfg) { toast('Connecte d’abord ton Google Sheet'); return; }
  if (!navigator.onLine) { toast('Le coach demande une connexion'); return; }
  S.chat.push({ role: 'user', text: q }); $('chatIn').value = ''; renderChat();
  const wait = document.createElement('div'); wait.className = 'msg assistant'; wait.textContent = '…'; $('chatLog').appendChild(wait);
  $('chatSend').disabled = true;
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 90000);
    const r = await fetch(S.cfg.url, { method: 'POST', signal: ctl.signal, body: JSON.stringify({ token: S.cfg.token, action: 'chat', context: context(), history: S.chat.slice(-12) }) }).then(x => x.json()).finally(() => clearTimeout(tm));
    if (r.ok) S.chat.push({ role: 'assistant', text: r.answer });
    else { S.chat.pop(); $('chatIn').value = q; toast(/action inconnue/.test(r.error) ? 'Script Google pas à jour pour le coach' : /gemini 5|gemini lent/.test(r.error) ? 'Gemini est saturé, réessaie dans un moment' : r.error === 'quota' ? 'Limite gratuite atteinte, réessaie dans une minute' : 'Erreur : ' + r.error); }
  } catch (e) { S.chat.pop(); $('chatIn').value = q; toast(e && e.name === 'AbortError' ? 'Gemini met trop de temps, réessaie plus tard' : 'Pas de réponse du Google Sheet'); }
  finally { S.chat = S.chat.slice(-40); LS.set('chat', S.chat); $('chatSend').disabled = false; renderChat(); }
};
$('chatClear').onclick = () => { S.chat = []; LS.set('chat', S.chat); renderChat(); };

/* ---------- ajout de repas ---------- */
let basket = [];
function openSheet() { $('mealDay').innerHTML = dayOptions(today()); $('sheet').classList.add('on'); setMode('aliments'); basket = []; $('foodQ').value = ''; renderFoods(); renderBasket(); }
function closeSheet() { $('sheet').classList.remove('on'); }
function setMode(m) {
  for (const b of $('shTabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.m === m);
  $('mAliments').hidden = m !== 'aliments'; $('mRecents').hidden = m !== 'recents'; $('mManuel').hidden = m !== 'manuel'; $('mPhoto').hidden = m !== 'photo';
  if (m === 'recents') renderRecents();
}
$('addMealBtn').onclick = openSheet; $('shClose').onclick = closeSheet;
$('sheet').onclick = e => { if (e.target === $('sheet')) closeSheet(); };
for (const b of $('shTabs').querySelectorAll('button')) b.onclick = () => setMode(b.dataset.m);
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function renderFoods() {
  const q = norm($('foodQ').value.trim());
  const list = FOODS.map((f, i) => [f, i]).filter(([f]) => !q || norm(f[0]).includes(q));
  $('foodList').innerHTML = list.length ? list.map(([f, i]) => '<button class="food" data-f="' + i + '"><span>' + esc(f[0]) + '</span><small>' + f[1] + ' kcal/100 g</small></button>').join('') : '<p class="mute">Pas trouvé : utilise l’onglet Manuel.</p>';
  for (const b of $('foodList').querySelectorAll('[data-f]')) b.onclick = () => { const f = FOODS[+b.dataset.f]; basket.push({ f, g: f[5] }); renderBasket(); };
}
$('foodQ').oninput = renderFoods;
const per = (f, g) => ({ kcal: f[1] * g / 100, p: f[2] * g / 100, c: f[3] * g / 100, f: f[4] * g / 100 });
function renderBasket() {
  if (!basket.length) { $('basket').innerHTML = '<p class="mute" style="margin-top:10px">Touche un aliment pour l’ajouter, puis ajuste les grammes.</p>'; return; }
  const t = basket.reduce((a, b) => { const x = per(b.f, b.g); a.kcal += x.kcal; a.p += x.p; a.c += x.c; a.f += x.f; return a; }, { kcal: 0, p: 0, c: 0, f: 0 });
  $('basket').innerHTML = '<div class="card" style="margin-top:12px"><h2>Ton repas</h2>' + basket.map((b, k) => '<div class="it"><span>' + esc(b.f[0]) + '</span><input type="number" inputmode="numeric" data-k="' + k + '" value="' + b.g + '" aria-label="Grammes"><span style="text-align:right">' + fr(per(b.f, b.g).kcal) + ' kcal</span><button class="x" data-rm="' + k + '" aria-label="Retirer">✕</button></div>').join('') +
    '<p style="margin:10px 0"><b>' + fr(t.kcal) + ' kcal</b> · P ' + fr(t.p) + ' g · G ' + fr(t.c) + ' g · L ' + fr(t.f) + ' g</p><div class="btns"><button id="bSave">Enregistrer ce repas</button></div></div>';
  for (const i of $('basket').querySelectorAll('[data-k]')) i.onchange = () => { basket[+i.dataset.k].g = Math.max(0, +i.value || 0); renderBasket(); };
  for (const b of $('basket').querySelectorAll('[data-rm]')) b.onclick = () => { basket.splice(+b.dataset.rm, 1); renderBasket(); };
  $('bSave').onclick = () => addMeal({ name: basket.map(b => b.f[0].replace(/ \(.*\)/, '')).join(', '), kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f), src: 'appli' });
}
function renderRecents() {
  const seen = new Map();
  for (const k of Object.keys(S.days).sort().reverse()) for (const m of (S.days[k].meals || [])) if (!seen.has(m.name)) seen.set(m.name, m);
  const list = [...seen.values()].slice(0, 25);
  $('recentList').innerHTML = list.length ? list.map((m, i) => '<button class="food" data-r="' + i + '"><span>' + esc(m.name) + '</span><small>' + fr(m.kcal) + ' kcal</small></button>').join('') : '<p class="mute">Tes repas déjà notés apparaîtront ici pour les ajouter en un geste.</p>';
  for (const b of $('recentList').querySelectorAll('[data-r]')) b.onclick = () => { const m = list[+b.dataset.r]; addMeal({ name: m.name, kcal: m.kcal, p: m.p, c: m.c, f: m.f, src: 'appli' }); };
}
let manMode = 'total';
function manValues() {
  const q = +$('manQty').value || 0, k = manMode === '100' ? q / 100 : 1;
  return { kcal: Math.round((+$('manK').value || 0) * k), p: Math.round((+$('manP').value || 0) * k), c: Math.round((+$('manC').value || 0) * k), f: Math.round((+$('manF').value || 0) * k), q };
}
function renderMan() {
  for (const b of $('manMode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mm === manMode);
  $('manQtyBox').hidden = manMode !== '100';
  $('manHint').textContent = manMode === '100' ? 'Recopie les valeurs « pour 100 g » de l\u2019étiquette, puis la quantité mangée.' : 'Recopie les valeurs de ta portion.';
  const v = manValues();
  $('manCalc').innerHTML = manMode === '100' && v.q && +$('manK').value ? 'Pour ' + fr(v.q) + ' g : <b>' + fr(v.kcal) + ' kcal</b> · P ' + fr(v.p) + ' g · G ' + fr(v.c) + ' g · L ' + fr(v.f) + ' g' : '';
}
for (const b of $('manMode').querySelectorAll('button')) b.onclick = () => { manMode = b.dataset.mm; renderMan(); };
for (const id of ['manQty', 'manK', 'manP', 'manC', 'manF']) $(id).oninput = renderMan;
$('manSave').onclick = () => {
  const name = $('manName').value.trim() || 'Repas', v = manValues();
  if (!v.kcal) { toast(manMode === '100' && !v.q ? 'Indique la quantité mangée' : 'Indique au moins les calories'); return; }
  addMeal({ name: manMode === '100' ? name + ' (' + fr(v.q) + ' g)' : name, kcal: v.kcal, p: v.p, c: v.c, f: v.f, src: 'appli' });
  for (const id of ['manName', 'manQty', 'manK', 'manP', 'manC', 'manF']) $(id).value = '';
  renderMan();
};
function addMeal(m, date) {
  const d = date || ($('mealDay') && $('sheet').classList.contains('on') ? $('mealDay').value : today());
  const meal = { id: 'm' + Date.now() + Math.floor(Math.random() * 100), date: d, at: d === today() ? nowHM() : '', ...m };
  push({ action: 'addMeal', meal }); closeSheet(); toast(meal.name + ' : ' + fr(meal.kcal) + ' kcal ajoutées ' + dayLabel(d));
}

/* ---------- analyse photo (Gemini via le Google Sheet) ---------- */
let photoB64 = null, draft = null;
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.8));
    }; img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
async function onPhoto(input) {
  const f = input.files[0]; if (!f) return;
  try { const url = await shrink(f); photoB64 = url.split(',')[1]; $('photoPrev').src = url; $('photoPrev').hidden = false; }
  catch { toast('Photo illisible, essaie une autre'); }
  input.value = '';
}
$('camIn').onchange = () => onPhoto($('camIn'));
$('photoIn').onchange = () => onPhoto($('photoIn'));
$('anaBtn').onclick = async () => {
  const note = $('photoNote').value.trim();
  if (!photoB64 && !note) { toast('Prends une photo ou décris ton repas'); return; }
  if (!S.cfg) { toast('Connecte d’abord ton Google Sheet'); return; }
  if (!navigator.onLine) { toast('L’analyse demande une connexion'); return; }
  $('anaBtn').disabled = true; $('anaBtn').textContent = 'Analyse en cours…'; $('anaOut').innerHTML = '';
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 90000);
    const r = await fetch(S.cfg.url, { method: 'POST', signal: ctl.signal, body: JSON.stringify({ token: S.cfg.token, action: 'analyze', image: photoB64, note }) }).then(x => x.json()).finally(() => clearTimeout(tm));
    if (!r.ok) {
      $('anaOut').innerHTML = '<p class="mute">' + (r.error === 'nokey' ? 'L’analyse photo n’est pas encore activée : il manque la clé Gemini dans le script du Google Sheet.' : /gemini 5|gemini lent/.test(r.error) ? 'Gemini est saturé ou trop lent en ce moment. Réessaie dans quelques minutes, ou passe par Aliments ou Manuel.' : r.error === 'limite_jour' ? 'Limite de sécurité du jour atteinte (80 analyses). Ça repart demain.' : r.error === 'quota' ? 'Limite gratuite atteinte pour le moment. Réessaie dans une minute, ou passe par l’onglet Manuel.' : 'L’analyse a échoué (' + esc(r.error) + '). Réessaie ou passe par l’onglet Manuel.') + '</p>';
      return;
    }
    const v = r.result || {};
    const items = (Array.isArray(v.items) ? v.items : []).map(i => ({ aliment: String(i.aliment || '?'), g0: +i.grammes || 0, g: +i.grammes || 0, kcal: +i.kcal || 0, p: +i.proteines || 0, c: +i.glucides || 0, f: +i.lipides || 0 }));
    if (!items.length) { $('anaOut').innerHTML = '<p class="mute">Je n’ai pas reconnu de repas. Essaie une autre photo ou décris-le.</p>'; return; }
    draft = { name: String(v.nom || 'Repas'), items, conf: v.confiance || '', q: v.question || '' };
    renderDraft();
  } catch (e) { $('anaOut').innerHTML = '<p class="mute">' + (e && e.name === 'AbortError' ? 'Gemini met trop de temps à répondre (plus de 90 s). Réessaie plus tard, ou passe par Aliments ou Manuel.' : 'Pas de réponse du Google Sheet. Réessaie dans un moment.') + '</p>'; report('analyse', e && e.name); }
  finally { $('anaBtn').disabled = false; $('anaBtn').textContent = 'Analyser'; }
};
const scaled = i => { const k = i.g0 ? i.g / i.g0 : 1; return { kcal: i.kcal * k, p: i.p * k, c: i.c * k, f: i.f * k }; };
function draftTot() { const t = { kcal: 0, p: 0, c: 0, f: 0 }; for (const i of draft.items) { const s = scaled(i); t.kcal += s.kcal; t.p += s.p; t.c += s.c; t.f += s.f; } return t; }
function renderDraft() {
  const t = draftTot();
  $('anaOut').innerHTML = '<div class="card" style="margin-top:12px"><label for="dName">Nom du repas</label><input id="dName" value="' + esc(draft.name) + '">' +
    '<p class="mute" style="margin:10px 0 4px">Vérifie les grammages : c’est ce qui compte le plus. Confiance : ' + esc(draft.conf || '?') + '.</p>' +
    draft.items.map((i, k) => '<div class="it"><span>' + esc(i.aliment) + '</span><input type="number" inputmode="numeric" data-k="' + k + '" value="' + Math.round(i.g) + '" aria-label="Grammes de ' + esc(i.aliment) + '"><span style="text-align:right">' + fr(scaled(i).kcal) + ' kcal</span><button class="x" data-rm="' + k + '" aria-label="Retirer">✕</button></div>').join('') +
    '<p style="margin:10px 0"><b>' + fr(t.kcal) + ' kcal</b> · P ' + fr(t.p) + ' g · G ' + fr(t.c) + ' g · L ' + fr(t.f) + ' g</p>' + warnHtml(doubt(t, 'repas')) +
    (draft.q ? '<p class="mute">Question : ' + esc(draft.q) + ' Précise dans le champ ci-dessus et relance si besoin.</p>' : '') +
    '<div class="btns"><button id="dSave">Enregistrer ce repas</button></div></div>';
  for (const inp of $('anaOut').querySelectorAll('[data-k]')) inp.onchange = () => { draft.items[+inp.dataset.k].g = Math.max(0, +inp.value || 0); draft.name = $('dName').value; renderDraft(); };
  for (const b of $('anaOut').querySelectorAll('[data-rm]')) b.onclick = () => { draft.items.splice(+b.dataset.rm, 1); draft.name = $('dName').value; renderDraft(); };
  $('dSave').onclick = () => {
    const t2 = draftTot();
    addMeal({ name: $('dName').value.trim() || draft.name, kcal: Math.round(t2.kcal), p: Math.round(t2.p), c: Math.round(t2.c), f: Math.round(t2.f), src: photoB64 ? 'photo' : 'texte' });
    photoB64 = null; draft = null; $('photoIn').value = ''; $('photoPrev').hidden = true; $('photoNote').value = ''; $('anaOut').innerHTML = '';
  };
}

/* ---------- choix du jour d'un repas ---------- */
function dayOptions(sel) {
  const t = today(); let h = '';
  for (let i = 0; i < 8; i++) { const d = addDays(t, -i); h += '<option value="' + d + '"' + (d === sel ? ' selected' : '') + '>' + (i === 0 ? 'Aujourd’hui' : i === 1 ? 'Hier' : i === 2 ? 'Avant-hier' : fdate(d)) + '</option>'; }
  return h;
}
const dayLabel = d => d === today() ? 'aujourd’hui' : d === addDays(today(), -1) ? 'hier' : 'le ' + fdate(d);

/* ---------- contrôle de ce que renvoie Gemini ---------- */
// Vérifie que les calories collent aux macros (4 kcal/g prot. et gluc., 9 kcal/g lip.) et repère les valeurs extrêmes
function doubt(x, kind) {
  const calc = 4 * x.p + 4 * x.c + 9 * x.f, w = [];
  if (x.kcal > 0 && Math.abs(calc - x.kcal) / x.kcal > 0.25) w.push('calories (' + fr(x.kcal) + ') et macros (' + fr(calc) + ' kcal) ne collent pas');
  if (kind === 'repas' && (x.kcal > 1600 || x.kcal < 60)) w.push('valeur inhabituelle pour un repas');
  if (kind === 'portion' && (x.kcal > 1500 || x.kcal < 150)) w.push('valeur inhabituelle pour une portion');
  return w;
}
const warnHtml = w => w.length ? '<p style="margin:6px 0;color:var(--glove);font-size:14px">⚠️ À vérifier : ' + esc(w.join(' ; ')) + '.</p>' : '';

/* ---------- recettes Jow ---------- */
const partOf = r => { const k = (r.portions || 2) / (r.parts || 2); return { kcal: Math.round(r.kcal * k), p: Math.round(r.p * k), c: Math.round(r.c * k), f: Math.round(r.f * k) }; };
const left = r => Math.max(0, (r.parts || 2) - (r.eaten || 0));
const isArch = r => r.status === 'archivée';
function recCard(r) {
  const x = partOf(r), id = esc(r.id);
  if (isArch(r)) return '<div class="rec"><h3 style="color:var(--mute)">' + esc(r.name) + '</h3><div class="mute">' + (r.eaten || 0) + '/' + r.parts + ' parts notées · ' + fr(x.kcal) + ' kcal la part</div><div class="row"><button class="ghost" data-restore="' + id + '">Remettre en cours</button>' + ((r.eaten || 0) > 0 ? '<button class="ghost" data-undo="' + id + '">↩ Annuler la dernière part</button>' : '') + '<button class="x" data-delrec="' + id + '">supprimer</button></div></div>';
  return '<div class="rec"><h3>' + esc(r.name) + '</h3>' + warnHtml(doubt({ kcal: r.kcal, p: r.p, c: r.c, f: r.f }, 'portion')) +
    '<div class="mute">1 part = <b style="color:var(--mat)">' + fr(x.kcal) + ' kcal</b> · P ' + fr(x.p) + ' g · G ' + fr(x.c) + ' g · L ' + fr(x.f) + ' g</div>' +
    '<div class="mute" style="margin-top:2px">' + r.portions + ' portion' + (r.portions > 1 ? 's' : '') + ' Jow en ' + r.parts + ' parts · <b style="color:var(--ink)">' + left(r) + ' restante' + (left(r) > 1 ? 's' : '') + '</b></div>' +
    (suggestParts(r) !== r.parts ? '<div class="mute" style="font-size:13px">Conseillé pour tes objectifs : ' + suggestParts(r) + ' parts</div>' : '') +
    '<div class="row"><select data-day="' + id + '" aria-label="Jour du repas">' + dayOptions(today()) + '</select><button data-eat="' + id + '">J’en mange 1 part</button></div>' +
    '<div class="row"><select data-parts="' + id + '" aria-label="Nombre de parts">' + [1, 2, 3, 4, 5, 6].map(n => '<option value="' + n + '"' + (n === r.parts ? ' selected' : '') + '>' + n + (n > 1 ? ' parts' : ' part') + '</option>').join('') + '</select>' +
    '<button class="ghost" data-done="' + id + '">Déjà mangée, terminer</button></div>' +
    ((r.eaten || 0) > 0 ? '<div class="row"><button class="ghost" data-undo="' + id + '">↩ Annuler la dernière part</button><span class="mute" style="font-size:13px">' + r.eaten + ' part' + (r.eaten > 1 ? 's' : '') + ' notée' + (r.eaten > 1 ? 's' : '') + '</span></div>' : '') +
    '<details><summary>Ingrédients et lien</summary><p>' + esc(r.ingredients) + '</p>' + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="color:var(--mat)">Ouvrir dans Jow</a> · ' : '') + '<button class="x" data-delrec="' + id + '">supprimer la recette</button></details></div>';
}
function renderRecettes() {
  const sorted = S.recipes.slice().sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  const act = sorted.filter(r => !isArch(r)), arch = sorted.filter(isArch);
  if (!renderRecettes.tab) renderRecettes.tab = 'act';
  const tab = renderRecettes.tab;
  $('recList').innerHTML = '<div class="tabs" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0"><button data-rtab="act" class="' + (tab === 'act' ? 'on' : '') + '">En cours (' + act.length + ')</button><button data-rtab="arch" class="' + (tab === 'arch' ? 'on' : '') + '">Terminées (' + arch.length + ')</button></div>' +
    (tab === 'act' ? (act.length ? act.map(recCard).join('') : '<p class="mute">Aucune recette en cours. Importe tes recettes Jow ci-dessus.</p>')
      : (arch.length ? arch.map(recCard).join('') : '<p class="mute">Les recettes terminées ou déjà mangées se rangent ici.</p>'));
  for (const b of $('recList').querySelectorAll('[data-rtab]')) b.onclick = () => { renderRecettes.tab = b.dataset.rtab; renderRecettes(); };
  const find = id => S.recipes.find(x => x.id === id);
  for (const s of $('recList').querySelectorAll('[data-parts]')) s.onchange = () => { const r = find(s.dataset.parts); if (r) push({ action: 'setRecipe', recipe: { ...r, parts: +s.value } }); };
  for (const b of $('recList').querySelectorAll('[data-eat]')) b.onclick = () => {
    const r = find(b.dataset.eat); if (!r) return;
    const day = $('recList').querySelector('[data-day="' + CSS.escape(r.id) + '"]').value, x = partOf(r);
    addMeal({ name: r.name + ' (1/' + r.parts + ')', ...x, src: 'recette' }, day);
    const eaten = (r.eaten || 0) + 1, done = eaten >= r.parts;
    push({ action: 'setRecipe', recipe: { ...r, eaten, status: done ? 'archivée' : 'en cours' } });
    if (done) setTimeout(() => toast('Dernière part : ' + r.name + ' est terminée et archivée'), 2700);
  };
  // Annule la dernière part notée : retire le repas le plus récent de cette recette et remet la part
  for (const b of $('recList').querySelectorAll('[data-undo]')) b.onclick = () => {
    const r = find(b.dataset.undo); if (!r || !(r.eaten > 0)) return;
    let last = null;
    for (const k of Object.keys(S.days).sort()) for (const m of (S.days[k].meals || [])) if (m.src === 'recette' && m.name.startsWith(r.name + ' (1/') && (!last || m.id > last.id)) last = m;
    if (last) push({ action: 'delMeal', id: last.id });
    push({ action: 'setRecipe', recipe: { ...r, eaten: r.eaten - 1, status: 'en cours' } });
    toast('Part annulée' + (last ? ' : le repas a été retiré' : ''));
  };
  for (const b of $('recList').querySelectorAll('[data-done]')) b.onclick = () => { const r = find(b.dataset.done); if (r) { push({ action: 'setRecipe', recipe: { ...r, status: 'archivée' } }); toast(r.name + ' archivée, sans rien compter'); } };
  for (const b of $('recList').querySelectorAll('[data-restore]')) b.onclick = () => { const r = find(b.dataset.restore); if (r) push({ action: 'setRecipe', recipe: { ...r, status: 'en cours', eaten: Math.min(r.eaten || 0, r.parts - 1) } }); };
  for (const b of $('recList').querySelectorAll('[data-delrec]')) b.onclick = () => { push({ action: 'delRecipe', id: b.dataset.delrec }); toast('Recette supprimée'); };
}
function mealTarget() { const p = S.p; return Math.round(((p.kcalTrain * (p.trainingDays || []).length + p.kcalRest * (7 - (p.trainingDays || []).length)) / 7) * 0.4); }
function suggestParts(r) { const total = r.kcal * (r.portions || 2); return clamp(Math.ceil(total / mealTarget() - 0.05), 1, 6); }
const jowLinks = txt => [...new Set((String(txt).match(/https?:\/\/[^\s"'<>]*jow\.(com|fr)\/[^\s"'<>]+/gi) || []))];
function makeRec(v, url, portions, parts) {
  const pp = v.parPortion || {};
  const rec = { id: 'r' + Date.now() + Math.floor(Math.random() * 1000), name: String(v.nom || 'Recette Jow'), url, portions, parts: 2, eaten: 0, status: 'en cours', kcal: Math.round(+pp.kcal || 0), p: Math.round(+pp.proteines || 0), c: Math.round(+pp.glucides || 0), f: Math.round(+pp.lipides || 0), ingredients: (v.ingredients || []).join(', '), added: today() };
  rec.parts = parts || suggestParts(rec);
  return rec;
}
// Renvoie { links } (menu Jow à déplier) ou { recs } (recettes importées)
async function importOne(url, portions, parts) {
  const r = await fetch(S.cfg.url, { method: 'POST', body: JSON.stringify({ token: S.cfg.token, action: 'importRecipe', url }) }).then(x => x.json());
  if (!r.ok) throw new Error(r.error === 'nokey' ? 'clé Gemini manquante' : r.error === 'quota' ? 'quota' : r.error === 'limite_jour' ? 'limite de sécurité du jour atteinte (80 analyses), reprise demain' : /action inconnue|importRecipe|is not defined/.test(r.error) ? 'script Google pas à jour' : r.error);
  if (Array.isArray(r.links) && r.links.length) return { links: r.links };
  const list = Array.isArray(r.recipes) ? r.recipes : r.recipe ? [r.recipe] : [];
  const recs = list.filter(v => v && v.parPortion && +v.parPortion.kcal).map(v => makeRec(v, v.lien || (list.length === 1 ? url : (r.finalUrl || url)), portions, parts));
  if (!recs.length) throw new Error('aucune recette lisible' + (r.preview ? ' (page : « ' + String(r.preview).slice(0, 120) + '… »)' : ''));
  for (const rec of recs) push({ action: 'setRecipe', recipe: rec });
  return { recs };
}
async function importAll(urls) {
  if (!S.cfg) { toast('Connecte d’abord ton Google Sheet'); return; }
  if (!navigator.onLine) { toast('L’import demande une connexion'); return; }
  const portions = +$('recPortions').value, parts = +$('recParts').value;
  const queue = urls.slice(), seen = new Set(urls); let done = 0;
  $('recBtn').disabled = true; const lines = [];
  const show = () => { $('recOut').innerHTML = '<div style="margin-top:10px">' + lines.join('') + '</div>'; };
  while (queue.length) {
    const url = queue.shift(); done++;
    $('recBtn').textContent = 'Import ' + done + '/' + (done + queue.length) + '…';
    try {
      let res;
      // Gemini gratuit peut être saturé (503) ou limité (quota) : on réessaie deux fois en patientant
      for (let tryN = 0; ; tryN++) {
        try { res = await importOne(url, portions, parts); break; }
        catch (e) {
          if (tryN < 2 && /quota|gemini 5\d\d/.test(e.message)) {
            lines.push('<p class="mute" style="margin:4px 0">⏳ Gemini est occupé, nouvel essai dans ' + (tryN ? 30 : 15) + ' s…</p>'); show();
            await new Promise(r => setTimeout(r, tryN ? 30000 : 15000)); lines.pop();
          } else throw e;
        }
      }
      if (res.links) {
        const fresh = res.links.filter(l => !seen.has(l)); fresh.forEach(l => { seen.add(l); queue.push(l); });
        lines.push('<p style="margin:4px 0">📋 Menu Jow : ' + fresh.length + ' recette' + (fresh.length > 1 ? 's' : '') + ' trouvée' + (fresh.length > 1 ? 's' : '') + '</p>');
      } else for (const rec of res.recs) { const x = partOf(rec); const w = doubt({ kcal: rec.kcal, p: rec.p, c: rec.c, f: rec.f }, 'portion'); lines.push('<p style="margin:4px 0">' + (w.length ? '⚠️' : '✅') + ' <b>' + esc(rec.name) + '</b> : ' + rec.parts + ' part' + (rec.parts > 1 ? 's' : '') + ' de ' + fr(x.kcal) + ' kcal (' + fr(x.p) + ' g prot.)' + (w.length ? ' · à vérifier' : '') + '</p>'); }
    } catch (e) { lines.push('<p class="mute" style="margin:4px 0">❌ ' + esc(url.slice(0, 60)) + '… : ' + esc(e.message) + '</p>'); }
    show();
    if (queue.length) await new Promise(r => setTimeout(r, 4000));
  }
  $('recBtn').disabled = false; $('recBtn').textContent = 'Importer'; $('recUrl').value = '';
  if (S.shared && lines.some(l => l.includes('❌'))) { lines.push('<p class="mute" style="margin-top:10px">Texte reçu de Jow :</p><p style="white-space:pre-wrap;font-size:13px">' + esc(S.shared.slice(0, 800)) + '</p>'); show(); }
  S.shared = null;
  toast('Import terminé');
}
$('recForm').onsubmit = e => {
  e.preventDefault();
  const urls = jowLinks($('recUrl').value);
  if (!urls.length) { toast('Colle au moins un lien de recette Jow'); return; }
  importAll(urls);
};
// Partage depuis Jow (Android) : l'appli reçoit le ou les liens dans l'adresse
(function sharedLink() {
  const q = new URLSearchParams(location.search);
  if (!q.toString()) return;
  const txt = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
  history.replaceState(null, '', location.pathname + '#recettes');
  const urls = jowLinks(txt);
  if (urls.length) { S.shared = txt; $('recUrl').value = urls.join('\n'); setTimeout(() => importAll(urls), 500); }
  else $('recOut').innerHTML = '<p class="mute">Ce partage ne contient pas de lien de recette Jow. Voici ce que l’appli a reçu (envoie une capture à Claude si besoin) :</p><p style="white-space:pre-wrap;font-size:13px">' + esc(txt.slice(0, 600)) + '</p>';
})();

/* ---------- dictée ---------- */
function wireDictation(btnId, fieldId) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const btn = $(btnId); btn.hidden = false;
  let rec = null;
  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false;
    const base = $(fieldId).value ? $(fieldId).value + ' ' : '';
    rec.onresult = e => { let s = ''; for (const r of e.results) s += r[0].transcript; $(fieldId).value = base + s; };
    rec.onerror = e => { if (e.error === 'not-allowed') toast('Autorise le micro pour dicter'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Dictée interrompue'); };
    rec.onend = () => { rec = null; btn.classList.remove('on'); btn.textContent = '🎙 Dicter'; };
    try { rec.start(); btn.classList.add('on'); btn.textContent = '⏹ Arrêter'; } catch { rec = null; }
  };
}
wireDictation('micBtn', 'photoNote'); wireDictation('chatMic', 'chatIn');

/* ---------- remontée des erreurs vers le Journal du Google Sheet ---------- */
let errCount = 0;
function report(where, message) {
  if (!S.cfg || errCount >= 5 || !navigator.onLine) return; errCount++;
  fetch(S.cfg.url, { method: 'POST', body: JSON.stringify({ token: S.cfg.token, action: 'logError', where, message: String(message).slice(0, 300) + ' | ' + navigator.userAgent.slice(0, 80) }) }).catch(() => {});
}
addEventListener('error', e => report('erreur', (e.message || '') + ' @' + (e.lineno || '?')));
addEventListener('unhandledrejection', e => report('promesse', e.reason && (e.reason.message || e.reason)));

/* ---------- démarrage ---------- */
route(); renderAll(); sync();
addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderAll(); sync(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
