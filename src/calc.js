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
function planWeight(p, date) {
  const fs = fwStart(p), s = p.startDate, c = p.competitionDate;
  if (date <= s) return p.startWeight;
  if (date <= fs) return p.startWeight + (p.fwTarget - p.startWeight) * diffDays(s, date) / diffDays(s, fs);
  if (date <= c) return p.fwTarget + (p.targetMorning - p.fwTarget) * diffDays(fs, date) / diffDays(fs, c);
  return p.targetMorning;
}
// Tendance lissée (moyenne mobile exponentielle) jour par jour jusqu'à `until`
function trendSeries(p, days, until, alpha = 0.2) {
  const out = []; let t = null;
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
  const deficit = Math.round(clamp(need * K / left, 250, 750));
  const avg = Math.max(1750, td.value - deficit);
  const nTrain = (p.trainingDays || []).length;
  const rest = r50(avg - 250 * nTrain / 7);
  const train = rest + 250;
  return { trend, tdee: td, deficit, avg: Math.round(avg), train, rest, rate: deficit * 7 / K, need, left };
}
/*ENDCALC*/