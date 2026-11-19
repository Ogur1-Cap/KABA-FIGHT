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
const S = { p: { ...DEFAULT }, days: {}, adj: [], cfg: LS.get('cfg', null), outbox: LS.get('outbox', []), syncing: false, lastSync: null };
(function loadCache() { const c = LS.get('cache', null); if (c) { S.p = { ...DEFAULT, ...c.profile }; S.days = c.days || {}; S.adj = c.adj || []; S.lastSync = c.at; } })();

function applyLocal(op) {
  const d = op.date && (S.days[op.date] || (S.days[op.date] = { date: op.date, meals: [] }));
  if (op.action === 'setWeight') d.weight = op.weight;
  else if (op.action === 'setType') d.type = op.type;
  else if (op.action === 'addMeal') { const m = op.meal, dd = S.days[m.date] || (S.days[m.date] = { date: m.date, meals: [] }); if (!dd.meals.some(x => x.id === m.id)) dd.meals.push(m); }
  else if (op.action === 'delMeal') { for (const k in S.days) S.days[k].meals = (S.days[k].meals || []).filter(m => m.id !== op.id); }
  else if (op.action === 'setProfile') S.p = { ...S.p, ...op.profile };
  else if (op.action === 'addAdjust') S.adj = [op.adjust, ...S.adj];
}
function saveCache() { LS.set('cache', { profile: S.p, days: S.days, adj: S.adj, at: S.lastSync }); }
function push(op) {
  applyLocal(op); S.outbox.push(op); LS.set('outbox', S.outbox); saveCache(); renderAll(); sync();
}
function setData(data) {
  S.p = { ...DEFAULT, ...data.profile }; S.days = data.days || {}; S.adj = (data.adj || []).slice().reverse();
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
  $('macroBars').innerHTML = bar('p', 'Protéines', tot.p, tg.p) + bar('', 'Glucides', tot.c, tg.c) + bar('', 'Lipides', tot.f, tg.f);
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
  $('mealList').innerHTML = meals.length ? meals.map(m => '<div class="meal"><div>' + esc(m.name) + '<small>' + esc(m.at || '') + ' · P ' + fr(m.p) + ' · G ' + fr(m.c) + ' · L ' + fr(m.f) + (m.src === 'claude' ? ' · ajouté par Claude' : '') + '</small></div><div class="k">' + fr(m.kcal) + ' kcal<br><button class="x" data-del="' + esc(m.id) + '">supprimer</button></div></div>').join('')
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
  g += '<polyline points="' + planPts.join(' ') + '" fill="none" stroke="var(--glove)" stroke-width="2" stroke-dasharray="6 5"/>';
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
function renderAll() { renderHeader(); renderToday(); renderCourbe(); renderCoach(); renderReglages(); }

/* ---------- navigation ---------- */
const VIEWS = ['today', 'courbe', 'coach', 'reglages'];
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

/* ---------- résumé pour Claude ---------- */
function context() {
  const p = S.p, t = today(), cur = current(p, S.days, t), pr = proposal(p, S.days, t);
  const last = cur.ser.slice(-14).map(r => { const tt = totals(S.days[r.date]); return r.date + ' : poids ' + (r.w ?? '-') + ', ' + Math.round(tt.kcal) + ' kcal, ' + Math.round(tt.p) + ' g prot., ' + (isTrain(p, r.date, S.days) ? 'boxe' : 'repos'); }).join('\n');
  return 'KABA Fight, résumé du ' + t + '\nPoids lissé ' + cur.est.toFixed(1) + ' kg, objectif ' + p.targetMorning + ' kg le matin du ' + p.competitionDate + '.\nObjectifs : ' + p.kcalTrain + ' kcal boxe / ' + p.kcalRest + ' kcal repos, ' + p.protein + ' g protéines.\nDépense estimée ' + pr.tdee.value + ' kcal (' + pr.tdee.source + ').\n14 derniers jours :\n' + last + '\n\nMa question : ';
}
$('copyCtx').onclick = async () => { try { await navigator.clipboard.writeText(context()); toast('Résumé copié : colle-le dans Claude'); } catch { toast('Copie impossible sur cet appareil'); } };

/* ---------- ajout de repas ---------- */
let basket = [];
function openSheet() { $('sheet').classList.add('on'); setMode('aliments'); basket = []; $('foodQ').value = ''; renderFoods(); renderBasket(); }
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
$('manSave').onclick = () => {
  const name = $('manName').value.trim() || 'Repas', k = +$('manK').value || 0;
  if (!k) { toast('Indique au moins les calories'); return; }
  addMeal({ name, kcal: k, p: +$('manP').value || 0, c: +$('manC').value || 0, f: +$('manF').value || 0, src: 'appli' });
  for (const id of ['manName', 'manK', 'manP', 'manC', 'manF']) $(id).value = '';
};
function addMeal(m) {
  const meal = { id: 'm' + Date.now(), date: today(), at: nowHM(), ...m };
  push({ action: 'addMeal', meal }); closeSheet(); toast(meal.name + ' : ' + fr(meal.kcal) + ' kcal ajoutées');
}

/* ---------- démarrage ---------- */
route(); renderAll(); sync();
addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderAll(); sync(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
