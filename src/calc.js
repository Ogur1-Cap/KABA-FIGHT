/*CALC*/
const K = 7700;
const pad = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const r50 = x => Math.round(x / 50) * 50;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function dayMacros(p, kcal) {
  return { kcal, p: p.protein, f: p.fat, c: Math.max(0, Math.round((kcal - p.protein * 4 - p.fat * 9) / 4)) };
}
function isTrain(p, date, days) {
  const d = days[date];
  if (d && d.type) return d.type === 'boxe';
  return (p.trainingDays || []).includes(parse(date).getDay());
}
function targetFor(p, date, days) { return dayMacros(p, isTrain(p, date, days) ? p.kcalTrain : p.kcalRest); }
function totals(day) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const m of (day && day.meals) || []) { t.kcal += +m.kcal || 0; t.p += +m.p || 0; t.c += +m.c || 0; t.f += +m.f || 0; }
  return t;
}
function fwStart(p) { return addDays(p.competitionDate, -4); }
// Point de départ réel : moyenne des 3 premières pesées (le poids de départ du profil peut être approximatif)
function startPoint(p, days) {
  const ks = Object.keys(days || {}).sort().filter(k => k >= p.startDate && typeof days[k].weight === 'number').slice(0, 3);
  if (!ks.length) return { date: p.startDate, w: p.startWeight, real: false };
  return { date: ks[0], w: Math.round(ks.reduce((a, k) => a + days[k].weight, 0) / ks.length * 100) / 100, real: true, n: ks.length };
}
function planWeight(p, date, days) {
  const st = startPoint(p, days), fs = fwStart(p), s = st.date, c = p.competitionDate;
  const w0 = st.w, w1 = Math.min(w0, p.fwTarget);
  if (date <= s) return w0;
  if (date <= fs) return w0 + (w1 - w0) * diffDays(s, date) / Math.max(1, diffDays(s, fs));
  if (date <= c) return w1 + (Math.min(w1, p.targetMorning) - w1) * diffDays(fs, date) / diffDays(fs, c);
  return p.targetMorning;
}
// Tendance lissée (moyenne mobile exponentielle) jour par jour jusqu'à `until`
function trendSeries(p, days, until, alpha = 0.2) {
  const out = []; const st = startPoint(p, days); let t = st.real ? st.w : null;
  for (let d = p.startDate; d <= until; d = addDays(d, 1)) {
    const w = days[d] && typeof days[d].weight === 'number' ? days[d].weight : null;
    if (w !== null) t = t === null ? w : t + alpha * (w - t);
    if (t === null && d === p.startDate) t = p.startWeight;
    out.push({ date: d, w, trend: t });
  }
  return out;
}
// Poids actuel estimé : tendance corrigée de son retard (pente des 7 dernières pesées)
function current(p, days, today, alpha = 0.2) {
  const ser = trendSeries(p, days, today, alpha), last = ser[ser.length - 1];
  const start = addDays(today, -7);
  const pts = ser.filter(r => r.date > start && r.w !== null).map(r => [diffDays(start, r.date), r.w]);
  let slope = 0;
  if (pts.length >= 4) {
    const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const sxx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0), sxy = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0);
    slope = sxx ? clamp(sxy / sxx, -0.2, 0.2) : 0;
  }
  return { trend: last.trend, est: last.trend + slope * (1 - alpha) / alpha, slope, ser };
}
// Dépense réelle estimée sur les 14 derniers jours complets (avant aujourd'hui)
function tdeeEstimate(p, days, today) {
  const end = addDays(today, -1);
  let start = addDays(end, -13);
  if (start < p.startDate) start = p.startDate;
  const n = diffDays(start, end) + 1;
  const ser = trendSeries(p, days, end);
  const logged = [];
  for (let d = start; d <= end; d = addDays(d, 1)) { const k = totals(days[d]).kcal; if (k >= 900) logged.push(k); }
  const pts = ser.filter(r => r.date >= start && r.w !== null).map(r => [diffDays(start, r.date), r.w]);
  const prior = p.tdee0;
  if (n < 5 || logged.length < 4 || pts.length < 4) return { value: prior, obs: null, n: logged.length, source: 'formule' };
  const avg = logged.reduce((a, b) => a + b, 0) / logged.length;
  // pente de la régression linéaire des pesées (kg/jour) : moins de retard que la moyenne lissée
  const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const sxx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0), sxy = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0);
  const slope = sxx ? sxy / sxx : 0;
  const obs = avg - slope * K;
  const w = clamp((logged.length - 3) / 11, 0, 1);
  return { value: Math.round(w * obs + (1 - w) * prior), obs: Math.round(obs), n: logged.length, source: 'données' };
}
function proposal(p, days, today) {
  const trend = current(p, days, today).est;
  const td = tdeeEstimate(p, days, today);
  const fs = fwStart(p);
  const left = Math.max(1, diffDays(today, fs));
  const need = trend - p.fwTarget;
  // Au-dessus de l'objectif : déficit (250 à 750 kcal). Objectif atteint : maintien (on mange à sa dépense),
  // avec un léger surplus seulement si la tendance passe nettement en dessous.
  const deficit = need > 0 ? Math.round(clamp(need * K / left, 0, 750)) : need < -0.5 ? -150 : 0;
  const mode = deficit < 100 ? 'maintien' : 'perte';
  const avg = Math.max(1750, td.value - deficit);
  const nTrain = (p.trainingDays || []).length;
  const rest = r50(avg - 250 * nTrain / 7);
  const train = rest + 250;
  return { trend, tdee: td, deficit, avg: Math.round(avg), train, rest, rate: deficit * 7 / K, need, left, mode };
}
const hourOf = at => { const m = /(\d{1,2})\s*h/i.exec(String(at || '')); return m ? +m[1] : null; };
// Analyse d'une pesée : écart, explication probable (repas et séance de la veille), trajectoire, conseil
function weighVerdict(p, days, date) {
  const d = days[date]; if (!d || typeof d.weight !== 'number') return null;
  const w = d.weight, f1 = (x, n = 1) => x.toFixed(n).replace('.', ',');
  const prev = Object.keys(days).filter(k => k < date && typeof days[k].weight === 'number').sort().pop();
  const delta = prev ? Math.round((w - days[prev].weight) * 10) / 10 : null;
  const y = addDays(date, -1), yd = days[y] || {}, yt = totals(yd), yg = targetFor(p, y, days), yTrain = isTrain(p, y, days);
  const logged = (yd.meals || []).length > 0 && yt.kcal >= 900;
  const lastH = Math.max(-1, ...(yd.meals || []).map(m => hourOf(m.at)).filter(h => h !== null));
  const td = tdeeEstimate(p, days, date).value;
  const fat = logged ? (td - yt.kcal) / K : null; // kg de graisse « expliqués » par la veille (+ = perte)
  const cur = current(p, days, date), plan = planWeight(p, date, days), gap = cur.est - plan;
  const nW = Object.keys(days).filter(k => k >= p.startDate && typeof days[k].weight === 'number').length;
  const out = { delta, prev, lines: [], advice: [], tone: 'ok' };
  const since = prev === y ? 'depuis hier' : prev ? 'depuis le ' + prev.slice(8) + '/' + prev.slice(5, 7) : '';
  out.title = delta === null ? 'Première pesée' : Math.abs(delta) < 0.05 ? 'Stable ' + since : (delta > 0 ? '+' : '−') + f1(Math.abs(delta)) + ' kg ' + since;
  const causes = [];
  if (delta === null) out.lines.push('C’est ton point de départ. Pèse-toi chaque matin dans les mêmes conditions : la tendance devient fiable à partir de 4 pesées.');
  else if (Math.abs(delta) <= 0.3) out.lines.push('Variation normale : le poids bouge de ±0,5 kg d’un jour à l’autre (eau, sel, digestion). C’est la tendance qui compte.');
  else if (delta < 0) {
    out.tone = 'info';
    if (logged && yt.c < 0.7 * yg.c) causes.push('peu de glucides hier (' + Math.round(yt.c) + ' / ' + yg.c + ' g) : moins de glycogène, donc moins d’eau stockée');
    if (yTrain) causes.push('séance de boxe hier : transpiration');
    if (logged && yt.kcal < 0.8 * yg.kcal) causes.push('tu as peu mangé hier (' + Math.round(yt.kcal) + ' / ' + yg.kcal + ' kcal), donc moins de contenu digestif');
    out.lines.push((fat !== null ? 'Ton déficit d’hier n’explique qu’environ ' + Math.max(0, Math.round(fat * 1000)) + ' g de graisse. ' : '') + 'Le reste, c’est surtout de l’eau' + (causes.length ? ' : ' + causes.join(' ; ') + '.' : ', du sel et la digestion.'));
    out.lines.push('Une partie peut revenir quand tu remanges normalement : ce ne sera pas une reprise.');
  } else {
    out.tone = 'warn';
    if (logged && yt.c > 1.15 * yg.c) causes.push('beaucoup de glucides hier (' + Math.round(yt.c) + ' / ' + yg.c + ' g) : le corps stocke de l’eau avec');
    if (lastH >= 21) causes.push('dernier repas tard (vers ' + lastH + 'h) : il est encore en digestion');
    if (logged && yt.kcal > yg.kcal + 200) causes.push('plus de calories que prévu hier (' + Math.round(yt.kcal) + ' / ' + yg.kcal + ' kcal)');
    if (yTrain) causes.push('après une séance, les muscles retiennent de l’eau pour récupérer');
    out.lines.push('Ce n’est pas de la graisse : il faudrait environ ' + Math.round(delta * K / 100) * 100 + ' kcal en trop pour ça. Causes probables : ' + (causes.length ? causes.join(' ; ') : 'sel, sommeil, digestion') + '.');
  }
  if (prev && !logged) out.lines.push('Tes repas d’hier ne sont pas (assez) notés : explication moins précise.');
  const fs = fwStart(p), left = diffDays(date, p.competitionDate), rem = cur.est - p.targetMorning;
  if (date < fs && proposal(p, days, date).mode === 'maintien') {
    out.lines.push('Tendance ' + f1(cur.est) + ' kg : objectif intermédiaire (' + f1(p.fwTarget) + ' kg) ' + (cur.est <= p.fwTarget ? 'atteint' : 'quasiment atteint') + '. Mode maintien : on reste autour de 75 kg jusqu’à la semaine du combat, qui fera le reste.');
    out.advice.push('Mange à ton objectif du jour, sans chercher à perdre plus : garde ton énergie pour la boxe.');
  } else {
    out.lines.push('Tendance ' + f1(cur.est) + ' kg, trajectoire ' + f1(plan) + ' kg : ' + (Math.abs(gap) < 0.15 ? 'dans les temps' : gap < 0 ? f1(-gap) + ' kg d’avance' : f1(gap) + ' kg de retard') + '. Reste ' + f1(Math.max(0, rem)) + ' kg en ' + left + ' jours pour ' + f1(p.targetMorning) + ' kg le matin de la pesée.');
    if (gap > 0.3 && nW >= 4) out.advice.push('Un peu en retard : tiens bien ton objectif calorique, l’appli ajuste tes calories automatiquement.');
  }
  if (delta !== null && delta < -0.3 && logged && yt.c < 0.7 * yg.c) out.advice.push('Aujourd’hui, mange tes glucides normalement, surtout avant la boxe : sans eux, tu boxes à vide.');
  if (delta !== null && delta > 0.3) out.advice.push('Ne compense pas en mangeant moins aujourd’hui : suis ton objectif, la tendance redescendra.');
  if (logged && yt.p < 0.8 * yg.p) out.advice.push('Protéines hier : ' + Math.round(yt.p) + ' / ' + yg.p + ' g. Vise mieux aujourd’hui (whey, skyr, viande, œufs).');
  if (nW < 4) out.advice.push('Encore ' + (4 - nW) + ' pesée' + (4 - nW > 1 ? 's' : '') + ' avant que l’appli puisse ajuster tes calories automatiquement.');
  return out;
}
/*ENDCALC*/