'use strict';

// ---------- Opslag ----------
const STORE_KEY = 'voeding.v1';
const MEALS = [1, 2, 3, 4, 5, 6].map(n => ({ id: 'm' + n, name: 'Meal ' + n }));
const MIN_MEALS = 5; // altijd zichtbaar; meer via "+ Meal toevoegen"

// Calorieën altijd uit de macro's: 4 kcal per g koolhydraten en eiwit, 9 per g vet.
function kcalOf(x) {
  return 4 * (x.c || 0) + 4 * (x.p || 0) + 9 * (x.f || 0);
}

// Noah's vaste voedingsmiddelen: standaard favoriet (de twee desembroden staan bij Jumbo).
const MY_FOODS = BUILTIN_FOODS.filter(f => f.id.startsWith('n-')).map(f => f.id).concat(['j722826', 'j705480']);

function defaultState() {
  return {
    foods: {},      // eigen voedingsmiddelen + aangepaste ingebouwde (zelfde id)
    hidden: [],     // verborgen ingebouwde voedingsmiddelen
    log: {},        // { 'JJJJ-MM-DD': { ontbijt: [entry], ... } }
    recent: [],
    favs: [...MY_FOODS],
    favsSeeded: true,
    targets: { k: 0, c: 0, p: 0, f: 0 },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(Object.assign(defaultState(), JSON.parse(raw)));
  } catch (e) { /* begin leeg */ }
  return defaultState();
}

// Eerste versie had benoemde maaltijden; zet die om naar Meal 1-4.
function migrate(st) {
  const old = { ontbijt: 'm1', lunch: 'm2', diner: 'm3', snacks: 'm4' };
  for (const day of Object.values(st.log)) {
    for (const [from, to] of Object.entries(old)) {
      if (day[from]) { day[to] = (day[to] || []).concat(day[from]); delete day[from]; }
    }
  }
  // Noah's eigen voedingsmiddelen eenmalig als favoriet zetten.
  if (!st.favsSeeded) {
    const mine = MY_FOODS;
    st.favs = [...st.favs, ...mine.filter(id => !st.favs.includes(id))];
    st.favsSeeded = true;
  }
  return st;
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Opslaan mislukt: ' + e.message);
  }
}

// Vraag de browser om de gegevens niet zomaar op te ruimen.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Hulpjes ----------
const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n, d = 0) {
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

function num(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(',', '.').trim());
  return isFinite(n) ? n : NaN;
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function dateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function keyToDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(k, n) {
  const d = keyToDate(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
const todayKey = () => dateKey(new Date());

function dayLabel(k) {
  const t = todayKey();
  if (k === t) return 'Vandaag';
  if (k === addDays(t, -1)) return 'Gisteren';
  if (k === addDays(t, 1)) return 'Morgen';
  const s = keyToDate(k).toLocaleDateString('nl-BE', { weekday: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function longDate(k) {
  return keyToDate(k).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ---------- Voedingsmiddelen ----------
function allFoods() {
  const hidden = new Set(state.hidden);
  const map = new Map();
  for (const f of BUILTIN_FOODS) if (!hidden.has(f.id)) map.set(f.id, f);
  for (const f of Object.values(state.foods)) if (!hidden.has(f.id)) map.set(f.id, f);
  return [...map.values()];
}

function getFood(id) {
  return state.foods[id] || BUILTIN_FOODS.find(f => f.id === id) || null;
}

function isBuiltin(id) {
  return BUILTIN_FOODS.some(f => f.id === id);
}

// Waarden voor een hoeveelheid in gram, uit waarden per 100 g.
function scale(per, g) {
  const r = g / 100;
  return { k: kcalOf(per) * r, c: per.c * r, p: per.p * r, f: per.f * r };
}

function sum(list) {
  const t = { k: 0, c: 0, p: 0, f: 0 };
  for (const x of list) { t.k += x.k; t.c += x.c; t.p += x.p; t.f += x.f; }
  return t;
}

function entryGrams(e) { return e.qty * e.ug; }
function entryTotals(e) { return scale(e.per, entryGrams(e)); }

function dayLog(k, create) {
  if (!state.log[k]) {
    if (!create) return null;
    state.log[k] = {};
  }
  return state.log[k];
}
function mealEntries(k, meal) {
  const d = dayLog(k, false);
  return (d && d[meal]) || [];
}
function dayTotals(k) {
  const d = dayLog(k, false);
  if (!d) return sum([]);
  return sum(Object.values(d).flat().map(entryTotals));
}
function dayHasEntries(k) {
  const d = dayLog(k, false);
  return !!d && Object.values(d).some(a => a.length);
}

function foodSub(f) {
  const parts = [];
  if (f.brand) parts.push(esc(f.brand));
  parts.push(`${fmt(kcalOf(f))} kcal / 100 g`);
  if (f.portions && f.portions.length) {
    const p = f.portions[0];
    parts.push(`1 ${esc(p.n)} = ${fmt(p.g)} g (${fmt(kcalOf(f) * p.g / 100)} kcal)`);
  }
  return parts.join(' · ');
}

function amountLabel(e) {
  if (e.unit === 'g') return `${fmt(e.qty, 1)} g`;
  return `${fmt(e.qty, 2)} × ${esc(e.unit)} (${fmt(entryGrams(e))} g)`;
}

// Aantal bewerkingen (letter erbij, eraf, anders of twee omgewisseld) tussen a en b.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Hoe goed past één zoekwoord bij een voedingsmiddel: 0 = begin van een woord, 0,5 = ergens in een woord,
// 1-2 = tikfout, null = niet.
function wordScore(w, tokens, hay) {
  if (tokens.some(t => t.startsWith(w))) return 0;
  if (hay.includes(w)) return 0.5;
  const allowed = w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2;
  if (!allowed) return null;
  let best = Infinity;
  for (const t of tokens) {
    // vergelijk met het hele woord en met het begin ervan (voor half getypte woorden)
    best = Math.min(best, editDistance(w, t), editDistance(w, t.slice(0, w.length)));
  }
  return best <= allowed ? best : null;
}

function searchFoods(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const fav = new Set(state.favs);
  const rec = state.recent;
  const rank = f => (fav.has(f.id) ? 0 : 2) + (rec.includes(f.id) ? 0 : 1);
  const scored = [];
  for (const f of allFoods()) {
    const hay = norm(`${f.name} ${f.brand || ''} ${f.alias || ''}`);
    const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const w of words) {
      const s = wordScore(w, tokens, hay);
      if (s === null) { score = null; break; }
      score += s;
    }
    if (score !== null) scored.push({ f, score });
  }
  scored.sort((a, b) => a.score - b.score || rank(a.f) - rank(b.f) || a.f.name.localeCompare(b.f.name, 'nl'));
  return scored.map(x => x.f);
}

// In welke groep valt een voedingsmiddel: de macro die de meeste calorieën levert.
function dominance(f) {
  const parts = [['carb', 4 * (f.c || 0)], ['protein', 4 * (f.p || 0)], ['fat', 9 * (f.f || 0)]];
  const total = parts.reduce((t, [, v]) => t + v, 0);
  if (!total) return '';
  const [key] = parts.sort((a, b) => b[1] - a[1])[0];
  const label = { carb: 'Carb dominant', protein: 'Protein dominant', fat: 'Fat dominant' }[key];
  return `<span class="dom dom-${key}">${label}</span>`;
}

function toggleFav(id) {
  const i = state.favs.indexOf(id);
  if (i >= 0) state.favs.splice(i, 1); else state.favs.unshift(id);
  save();
}

function pushRecent(id) {
  state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, 40);
}

// ---------- Navigatie ----------
let tab = 'dag';
let cur = todayKey();
let weekOffset = 0;

document.querySelectorAll('.tabbar button').forEach(b => {
  b.addEventListener('click', () => {
    tab = b.dataset.tab;
    if (tab === 'week') weekOffset = 0;
    render();
    window.scrollTo(0, 0);
  });
});

function render() {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'dag') renderDag();
  else if (tab === 'week') renderWeek();
  else if (tab === 'voeding') renderVoeding();
  else renderInstellingen();
}

// ---------- Dagboek ----------
function bar(val, goal, color) {
  if (!goal) return '';
  const pct = Math.min(100, (val / goal) * 100);
  const over = val > goal * 1.0001;
  return `<div class="bar ${over ? 'over' : ''}"><span style="width:${pct}%;background:${color}"></span></div>`;
}

function renderDag() {
  const t = dayTotals(cur);
  const g = state.targets;
  const kcalRest = g.k ? g.k - t.k : null;

  let html = `
    <div class="brand"><img src="icons/icon-192.png" alt=""><span>NT <b>Nutrition</b></span></div>
    <div class="datebar">
      <button class="iconbtn" data-act="prevday" aria-label="Vorige dag">‹</button>
      <div class="label">
        <strong>${dayLabel(cur)}</strong>
        <span class="muted small">${longDate(cur)}</span>
        <input type="date" id="datepick" value="${cur}" aria-label="Kies datum">
      </div>
      <button class="iconbtn" data-act="nextday" aria-label="Volgende dag">›</button>
    </div>

    <div class="card totals">
      <div class="kcal-row">
        <div><span class="kcal-big">${fmt(t.k)}</span> <span class="muted">kcal</span></div>
        <div class="muted small" style="text-align:right">
          ${g.k ? `doel ${fmt(g.k)}<br><strong style="color:${kcalRest < 0 ? 'var(--over)' : 'var(--text)'}">${kcalRest < 0 ? fmt(-kcalRest) + ' te veel' : fmt(kcalRest) + ' over'}</strong>` : ''}
        </div>
      </div>
      ${bar(t.k, g.k, 'var(--c-kcal)')}
      <div class="macros">
        ${macroBlock('Koolhydraten', t.c, g.c, 'var(--c-carb)')}
        ${macroBlock('Eiwit', t.p, g.p, 'var(--c-prot)')}
        ${macroBlock('Vet', t.f, g.f, 'var(--c-fat)')}
      </div>
    </div>`;

  for (const m of MEALS.slice(0, visibleMeals(cur))) {
    const entries = mealEntries(cur, m.id);
    const mt = sum(entries.map(entryTotals));
    html += `
      <div class="card">
        <div class="meal-head">
          <h2>${m.name}</h2>
          <div class="sum">${entries.length ? `<strong style="color:var(--text)">${fmt(mt.k)} kcal</strong><br>KH ${fmt(mt.c)} · E ${fmt(mt.p)} · V ${fmt(mt.f)}` : ''}</div>
        </div>
        ${entries.length ? `<ul class="entries">${entries.map(e => {
          const et = entryTotals(e);
          return `<li data-act="editentry" data-meal="${m.id}" data-id="${e.id}">
            <div><div class="e-name">${esc(e.name)}</div><div class="e-sub">${amountLabel(e)} · KH ${fmt(et.c, 1)} · E ${fmt(et.p, 1)} · V ${fmt(et.f, 1)}</div></div>
            <div class="e-kcal">${fmt(et.k)}</div>
          </li>`;
        }).join('')}</ul>` : ''}
        <div class="meal-actions">
          <button class="btn grow" data-act="add" data-meal="${m.id}">+ Toevoegen</button>
          ${entries.length ? `<button class="btn ghost" data-act="copymeal" data-meal="${m.id}">Kopiëren</button>` : ''}
        </div>
      </div>`;
  }

  const shown = visibleMeals(cur);
  if (shown < MEALS.length) {
    html += `<button class="btn block" data-act="addmeal" style="margin-bottom:12px">+ ${MEALS[shown].name} toevoegen</button>`;
  }
  if (dayHasEntries(cur)) {
    html += `<button class="btn ghost block" data-act="copyday">Hele dag kopiëren naar…</button>`;
  }
  view.innerHTML = html;

  $('#datepick').addEventListener('change', e => {
    if (e.target.value) { cur = e.target.value; render(); }
  });
}

// Toon minstens MIN_MEALS maaltijden, en tot de laatste die iets bevat.
const extraMeals = {};
function visibleMeals(k) {
  let n = Math.max(MIN_MEALS, extraMeals[k] || 0);
  MEALS.forEach((m, i) => { if (mealEntries(k, m.id).length) n = Math.max(n, i + 1); });
  return Math.min(n, MEALS.length);
}

function macroBlock(name, val, goal, color) {
  return `<div class="macro">
    <div class="name">${name}</div>
    <div class="val">${fmt(val)}${goal ? ` <span class="muted small">/ ${fmt(goal)} g</span>` : ' g'}</div>
    ${bar(val, goal, color)}
  </div>`;
}

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'prevday') { cur = addDays(cur, -1); render(); }
  else if (act === 'nextday') { cur = addDays(cur, 1); render(); }
  else if (act === 'add') openAdd(el.dataset.meal);
  else if (act === 'editentry') {
    const entry = mealEntries(cur, el.dataset.meal).find(x => x.id === el.dataset.id);
    if (entry) openQty({ entry, meal: el.dataset.meal });
  }
  else if (act === 'addmeal') { extraMeals[cur] = visibleMeals(cur) + 1; render(); }
  else if (act === 'copymeal') openCopy(el.dataset.meal);
  else if (act === 'copyday') openCopy(null);
  else if (act === 'prevweek') { weekOffset--; render(); }
  else if (act === 'nextweek') { weekOffset++; render(); }
  else if (act === 'gotoday') { cur = el.dataset.day; tab = 'dag'; render(); window.scrollTo(0, 0); }
  else if (act === 'newfood') openFoodEditor(null);
  else if (act === 'editfood') openFoodEditor(getFood(el.dataset.id));
  else if (act === 'savetargets') saveTargets();
  else if (act === 'export') exportData();
  else if (act === 'import') $('#importfile').click();
});

// ---------- Sheet (volledig scherm) ----------
let sheetCleanup = null;
function openSheet(html) {
  sheet.innerHTML = `<div class="inner">${html}</div>`;
  sheet.classList.remove('hidden');
  sheet.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  sheet.classList.add('hidden');
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
}

// ---------- Toevoegen: zoeken ----------
let addMode = 'favs';
function openAdd(meal) {
  const mealName = MEALS.find(m => m.id === meal).name;
  if (!state.favs.length && addMode === 'favs') addMode = 'alles';
  openSheet(`
    <div class="sheet-head">
      <button class="btn ghost" data-s="close">Sluiten</button>
      <h2>${mealName}</h2>
      <button class="btn ghost" data-s="new">+ Nieuw</button>
    </div>
    <input class="search" id="q" type="search" placeholder="Zoek voedingsmiddel…" autocomplete="off">
    <div class="seg" id="seg">
      <button data-mode="favs">Favorieten</button>
      <button data-mode="recent">Recent</button>
      <button data-mode="alles">Alles</button>
    </div>
    <div class="card" style="padding-top:2px;padding-bottom:2px"><ul class="list" id="results"></ul></div>
  `);

  const q = $('#q', sheet);
  const draw = () => {
    const text = q.value.trim();
    $('#seg', sheet).classList.toggle('hidden', !!text);
    sheet.querySelectorAll('#seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === addMode));
    let list;
    if (text) list = searchFoods(text);
    else if (addMode === 'recent') list = state.recent.map(getFood).filter(f => f && !state.hidden.includes(f.id));
    else if (addMode === 'favs') list = state.favs.map(getFood).filter(f => f && !state.hidden.includes(f.id));
    else list = searchFoods('');
    const fav = new Set(state.favs);
    $('#results', sheet).innerHTML = list.length ? list.slice(0, 200).map(f => `
      <li data-s="pick" data-id="${esc(f.id)}">
        <div class="f-main"><div class="f-name">${esc(f.name)}</div><div class="f-sub">${foodSub(f)}</div>${dominance(f)}</div>
        <button class="star ${fav.has(f.id) ? 'on' : ''}" data-s="fav" data-id="${esc(f.id)}" aria-label="Favoriet">${fav.has(f.id) ? '★' : '☆'}</button>
      </li>`).join('')
      : `<li class="empty">${text ? 'Niets gevonden. Tik op “+ Nieuw” om het toe te voegen.' : addMode === 'favs' ? 'Nog geen favorieten. Tik op ☆ om er een te maken.' : 'Nog niets recent gegeten.'}</li>`;
  };
  q.addEventListener('input', draw);
  draw();

  sheet.onclick = e => {
    const el = e.target.closest('[data-s], [data-mode]');
    if (!el) return;
    if (el.dataset.mode) { addMode = el.dataset.mode; draw(); return; }
    const s = el.dataset.s;
    if (s === 'close') closeSheet();
    else if (s === 'fav') { e.stopPropagation(); toggleFav(el.dataset.id); draw(); }
    else if (s === 'pick') openQty({ food: getFood(el.dataset.id), meal, back: () => openAdd(meal) });
    else if (s === 'new') openFoodEditor(null, { name: q.value.trim(), after: f => openQty({ food: f, meal, back: () => openAdd(meal) }) });
  };
}

// ---------- Hoeveelheid kiezen / item bewerken ----------
function openQty({ food, entry, meal, back }) {
  const editing = !!entry;
  // Bij bewerken: neem de actuele gegevens van het voedingsmiddel als het nog bestaat, anders de opgeslagen kopie.
  const f = food || getFood(entry.foodId) || { id: entry.foodId, name: entry.name, brand: entry.brand, ...entry.per, portions: [] };
  const per = editing ? entry.per : { k: f.k, c: f.c, p: f.p, f: f.f };
  const units = [{ n: 'g', g: 1, label: 'gram' }].concat((f.portions || []).map(p => ({ n: p.n, g: p.g, label: `${p.n} (${fmt(p.g)} g)` })));
  if (editing && !units.some(u => u.n === entry.unit)) units.push({ n: entry.unit, g: entry.ug, label: `${entry.unit} (${fmt(entry.ug)} g)` });

  let unit = editing ? entry.unit : (units[1] ? units[1].n : 'g');
  let qty = editing ? entry.qty : (unit === 'g' ? 100 : 1);
  const fav = state.favs.includes(f.id);

  openSheet(`
    <div class="sheet-head">
      <button class="btn ghost" data-s="back">${editing ? 'Annuleren' : 'Terug'}</button>
      <h2>${editing ? 'Bewerken' : 'Toevoegen'}</h2>
      <button class="star ${fav ? 'on' : ''}" data-s="fav" aria-label="Favoriet">${fav ? '★' : '☆'}</button>
    </div>
    <div class="card">
      <h2>${esc(f.name)}</h2>
      <div class="muted small">${f.brand ? esc(f.brand) + ' · ' : ''}${fmt(kcalOf(per))} kcal · KH ${fmt(per.c, 1)} · E ${fmt(per.p, 1)} · V ${fmt(per.f, 1)} per 100 g</div>
      ${dominance(per)}
    </div>
    <div class="card">
      <div class="row2">
        <label class="field"><span>Hoeveelheid</span><input id="qty" inputmode="decimal" value="${fmt(qty, 2)}" autocomplete="off"></label>
        <label class="field"><span>Eenheid</span><select id="unit">${units.map(u => `<option value="${esc(u.n)}" ${u.n === unit ? 'selected' : ''}>${esc(u.label)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Maaltijd</span><select id="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
      <div class="preview" id="preview"></div>
      <button class="btn primary block" data-s="ok">${editing ? 'Opslaan' : 'Toevoegen'}</button>
      ${editing ? '<button class="btn danger block" data-s="del" style="margin-top:8px">Verwijderen</button>' : ''}
    </div>
  `);

  const qtyEl = $('#qty', sheet), unitEl = $('#unit', sheet);
  const ug = () => units.find(u => u.n === unitEl.value).g;
  const draw = () => {
    const q = num(qtyEl.value);
    const t = scale(per, (isFinite(q) ? q : 0) * ug());
    $('#preview', sheet).innerHTML = `
      <div><div class="v">${fmt(t.k)}</div><div class="l">kcal</div></div>
      <div><div class="v">${fmt(t.c, 1)}</div><div class="l">KH (g)</div></div>
      <div><div class="v">${fmt(t.p, 1)}</div><div class="l">Eiwit (g)</div></div>
      <div><div class="v">${fmt(t.f, 1)}</div><div class="l">Vet (g)</div></div>`;
  };
  qtyEl.addEventListener('input', draw);
  qtyEl.addEventListener('focus', () => qtyEl.select());
  unitEl.addEventListener('change', () => {
    // Behoud ongeveer hetzelfde gewicht bij wisselen tussen gram en stuks.
    const prevG = units.find(u => u.n === unit).g;
    const q = num(qtyEl.value);
    if (isFinite(q)) {
      const nq = (q * prevG) / ug();
      qtyEl.value = fmt(unitEl.value === 'g' ? Math.round(nq) : Math.round(nq * 4) / 4, 2);
    }
    unit = unitEl.value;
    draw();
  });
  draw();

  const goBack = () => (back ? back() : closeSheet());

  sheet.onclick = e => {
    const el = e.target.closest('[data-s]');
    if (!el) return;
    const s = el.dataset.s;
    if (s === 'back') goBack();
    else if (s === 'fav') {
      toggleFav(f.id);
      const on = state.favs.includes(f.id);
      el.classList.toggle('on', on);
      el.textContent = on ? '★' : '☆';
    }
    else if (s === 'del') {
      const list = dayLog(cur, true)[meal];
      const i = list.findIndex(x => x.id === entry.id);
      if (i >= 0) list.splice(i, 1);
      save(); closeSheet(); render(); toast('Verwijderd');
    }
    else if (s === 'ok') {
      const q = num(qtyEl.value);
      if (!isFinite(q) || q <= 0) { toast('Vul een hoeveelheid in'); return; }
      const newMeal = $('#meal', sheet).value;
      const day = dayLog(cur, true);
      const item = {
        id: editing ? entry.id : uid('e'),
        foodId: f.id, name: f.name, brand: f.brand || '',
        per, qty: q, unit: unitEl.value, ug: ug(),
      };
      if (editing) {
        const old = day[meal] || [];
        const i = old.findIndex(x => x.id === entry.id);
        if (newMeal === meal && i >= 0) old[i] = item;
        else { if (i >= 0) old.splice(i, 1); (day[newMeal] = day[newMeal] || []).push(item); }
      } else {
        (day[newMeal] = day[newMeal] || []).push(item);
        pushRecent(f.id);
      }
      save(); closeSheet(); render();
      toast(editing ? 'Opgeslagen' : `${f.name} toegevoegd`);
    }
  };
}

// ---------- Kopiëren ----------
function openCopy(meal) {
  const what = meal ? MEALS.find(m => m.id === meal).name : 'Hele dag';
  const target = cur === todayKey() ? addDays(cur, 1) : todayKey();
  openSheet(`
    <div class="sheet-head">
      <button class="btn ghost" data-s="close">Annuleren</button>
      <h2>Kopiëren</h2>
      <span style="min-width:70px"></span>
    </div>
    <div class="card">
      <p style="margin-top:0"><strong>${what}</strong> van ${dayLabel(cur).toLowerCase()} (${longDate(cur)}) kopiëren naar:</p>
      <label class="field"><span>Datum</span><input type="date" id="cdate" value="${target}"></label>
      ${meal ? `<label class="field"><span>Maaltijd</span><select id="cmeal">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>` : ''}
      <p class="muted small">De items worden toegevoegd aan wat er op die dag al staat.</p>
      <button class="btn primary block" data-s="ok">Kopiëren</button>
    </div>
  `);
  sheet.onclick = e => {
    const el = e.target.closest('[data-s]');
    if (!el) return;
    if (el.dataset.s === 'close') closeSheet();
    else if (el.dataset.s === 'ok') {
      const to = $('#cdate', sheet).value;
      if (!to) { toast('Kies een datum'); return; }
      const dest = dayLog(to, true);
      const pairs = meal ? [[meal, $('#cmeal', sheet).value]] : MEALS.map(m => [m.id, m.id]);
      let n = 0;
      for (const [from, toMeal] of pairs) {
        for (const x of mealEntries(cur, from)) {
          (dest[toMeal] = dest[toMeal] || []).push({ ...x, per: { ...x.per }, id: uid('e') });
          n++;
        }
      }
      save(); closeSheet();
      cur = to; render(); window.scrollTo(0, 0);
      toast(`${n} item${n === 1 ? '' : 's'} gekopieerd`);
    }
  };
}

// ---------- Week ----------
function renderWeek() {
  const base = keyToDate(addDays(cur, weekOffset * 7));
  const dow = (base.getDay() + 6) % 7; // maandag = 0
  const monday = addDays(dateKey(base), -dow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const g = state.targets;
  const rows = days.map(k => ({ k, t: dayTotals(k), has: dayHasEntries(k) }));
  const logged = rows.filter(r => r.has);
  const avg = sum(logged.map(r => r.t));
  const n = logged.length || 1;
  const maxK = Math.max(g.k || 0, ...rows.map(r => r.t.k), 1) * 1.1;

  const short = k => keyToDate(k).toLocaleDateString('nl-BE', { weekday: 'short' }).replace('.', '');
  const cls = (v, goal) => (goal && v > goal * 1.0001 ? 'over' : '');

  view.innerHTML = `
    <div class="datebar">
      <button class="iconbtn" data-act="prevweek" aria-label="Vorige week">‹</button>
      <div class="label"><strong>Week</strong><span class="muted small">${longDate(days[0])} – ${longDate(days[6])}</span></div>
      <button class="iconbtn" data-act="nextweek" aria-label="Volgende week">›</button>
    </div>

    <div class="card">
      <h2>Calorieën per dag</h2>
      <div class="chart">
        ${g.k ? `<div class="goal" style="bottom:${20 + (g.k / maxK) * 120}px"></div>` : ''}
        ${rows.map(r => `<div class="col" data-act="gotoday" data-day="${r.k}">
          <div class="b ${cls(r.t.k, g.k)}" style="height:${(r.t.k / maxK) * 120}px"></div>
          <div class="d">${short(r.k)}</div></div>`).join('')}
      </div>
    </div>

    <div class="card">
      <table class="week-table">
        <thead><tr><th>Dag</th><th>kcal</th><th>KH</th><th>Eiwit</th><th>Vet</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr class="${r.k === todayKey() ? 'today' : ''}" data-act="gotoday" data-day="${r.k}">
            <td>${short(r.k)} ${keyToDate(r.k).getDate()}/${keyToDate(r.k).getMonth() + 1}</td>
            <td class="${cls(r.t.k, g.k)}">${r.has ? fmt(r.t.k) : '–'}</td>
            <td class="${cls(r.t.c, g.c)}">${r.has ? fmt(r.t.c) : '–'}</td>
            <td>${r.has ? fmt(r.t.p) : '–'}</td>
            <td class="${cls(r.t.f, g.f)}">${r.has ? fmt(r.t.f) : '–'}</td>
          </tr>`).join('')}
          <tr class="avg"><td>Gemiddeld*</td><td>${fmt(avg.k / n)}</td><td>${fmt(avg.c / n)}</td><td>${fmt(avg.p / n)}</td><td>${fmt(avg.f / n)}</td></tr>
          ${g.k || g.c || g.p || g.f ? `<tr class="avg muted"><td>Doel</td><td>${fmt(g.k)}</td><td>${fmt(g.c)}</td><td>${fmt(g.p)}</td><td>${fmt(g.f)}</td></tr>` : ''}
        </tbody>
      </table>
      <p class="muted small">* Gemiddelde over de ${logged.length} ${logged.length === 1 ? 'dag' : 'dagen'} waarop je iets hebt ingevuld. KH, eiwit en vet in gram. Tik op een dag om hem te openen.</p>
    </div>`;
}

// ---------- Voedingsmiddelen beheren ----------
let foodQuery = '';
function renderVoeding() {
  view.innerHTML = `
    <h1>Voedingsmiddelen</h1>
    <input class="search" id="fq" type="search" placeholder="Zoek…" value="${esc(foodQuery)}" autocomplete="off">
    <div style="margin:10px 0"><button class="btn primary block" data-act="newfood">+ Nieuw voedingsmiddel</button></div>
    <div class="card" style="padding-top:2px;padding-bottom:2px"><ul class="list" id="flist"></ul></div>`;
  const draw = () => {
    const list = foodQuery.trim() ? searchFoods(foodQuery) : searchFoods('').sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    $('#flist').innerHTML = list.map(f => `
      <li data-act="editfood" data-id="${esc(f.id)}">
        <div class="f-main"><div class="f-name">${esc(f.name)}${!isBuiltin(f.id) ? '<span class="tag">eigen</span>' : state.foods[f.id] ? '<span class="tag">aangepast</span>' : ''}</div>
        <div class="f-sub">${foodSub(f)}<br>KH ${fmt(f.c, 1)} · E ${fmt(f.p, 1)} · V ${fmt(f.f, 1)} per 100 g</div>${dominance(f)}</div>
      </li>`).join('') || '<li class="empty">Niets gevonden.</li>';
  };
  $('#fq').addEventListener('input', e => { foodQuery = e.target.value; draw(); });
  draw();
}

function openFoodEditor(food, opts = {}) {
  const isNew = !food;
  const f = food || { name: opts.name || '', brand: '', k: '', c: '', p: '', f: '', portions: [] };
  const portion = (f.portions && f.portions[0]) || { n: '', g: '' };
  const builtin = !isNew && isBuiltin(f.id);
  const v = x => (x === '' || x == null ? '' : fmt(x, 2));

  openSheet(`
    <div class="sheet-head">
      <button class="btn ghost" data-s="close">Annuleren</button>
      <h2>${isNew ? 'Nieuw voedingsmiddel' : 'Bewerken'}</h2>
      <button class="btn ghost" data-s="ok">Bewaar</button>
    </div>
    <div class="card">
      <label class="field"><span>Naam</span><input id="fname" value="${esc(f.name)}" placeholder="bv. Griekse yoghurt 0%"></label>
      <label class="field"><span>Merk / winkel (optioneel)</span><input id="fbrand" value="${esc(f.brand || '')}" placeholder="bv. Jumbo"></label>
      <div class="row2">
        <label class="field"><span>Portie-naam (optioneel)</span><input id="pname" value="${esc(portion.n)}" placeholder="bv. stuk, ei, sneetje"></label>
        <label class="field"><span>Gewicht 1 portie (g)</span><input id="pg" inputmode="decimal" value="${v(portion.g)}" placeholder="bv. 60"></label>
      </div>
      <label class="field"><span>Ik vul de voedingswaarden in per</span>
        <select id="basis"><option value="100">100 gram</option><option value="portie">1 portie</option></select></label>
      <div class="row2">
        <label class="field"><span>Koolhydraten (g)</span><input id="fc" inputmode="decimal" value="${v(f.c)}"></label>
        <label class="field"><span>Eiwit (g)</span><input id="fp" inputmode="decimal" value="${v(f.p)}"></label>
        <label class="field"><span>Vet (g)</span><input id="ff" inputmode="decimal" value="${v(f.f)}"></label>
      </div>
      <p class="muted small" style="margin-top:0">Calorieën worden berekend uit de macro's: 4 kcal per gram koolhydraten en eiwit, 9 per gram vet.</p>
    </div>
    ${!isNew ? `<div class="card">
      ${builtin && state.foods[f.id] ? '<button class="btn block" data-s="reset" style="margin-bottom:8px">Originele waarden terugzetten</button>' : ''}
      <button class="btn danger block" data-s="del">${builtin ? 'Verbergen uit de lijst' : 'Verwijderen'}</button>
      <p class="muted small">Wat je al in je dagboek hebt gezet, blijft gewoon staan.</p>
    </div>` : ''}
  `);

  const basisEl = $('#basis', sheet);
  // Bij overschakelen naar "per portie" de getoonde waarden omrekenen, en omgekeerd.
  let basis = '100';
  basisEl.addEventListener('change', () => {
    const pg = num($('#pg', sheet).value);
    if (!(pg > 0)) {
      if (basisEl.value === 'portie') { toast('Vul eerst het gewicht van 1 portie in'); basisEl.value = basis; }
      return;
    }
    const factor = basisEl.value === 'portie' ? pg / 100 : 100 / pg;
    for (const id of ['fc', 'fp', 'ff']) {
      const el = $('#' + id, sheet), n = num(el.value);
      if (isFinite(n)) el.value = fmt(n * factor, 2);
    }
    basis = basisEl.value;
  });

  sheet.onclick = e => {
    const el = e.target.closest('[data-s]');
    if (!el) return;
    const s = el.dataset.s;
    if (s === 'close') { closeSheet(); render(); }
    else if (s === 'reset') {
      delete state.foods[f.id];
      save(); closeSheet(); render(); toast('Originele waarden teruggezet');
    }
    else if (s === 'del') {
      if (builtin) state.hidden.push(f.id); else delete state.foods[f.id];
      state.favs = state.favs.filter(x => x !== f.id);
      state.recent = state.recent.filter(x => x !== f.id);
      save(); closeSheet(); render(); toast(builtin ? 'Verborgen' : 'Verwijderd');
    }
    else if (s === 'ok') {
      const name = $('#fname', sheet).value.trim();
      if (!name) { toast('Geef een naam'); return; }
      const c = num($('#fc', sheet).value) || 0, p = num($('#fp', sheet).value) || 0, fat = num($('#ff', sheet).value) || 0;
      const pn = $('#pname', sheet).value.trim(), pg = num($('#pg', sheet).value);
      const hasPortion = pg > 0;
      const factor = basisEl.value === 'portie' && hasPortion ? 100 / pg : 1;
      const r2 = x => Math.round(x * factor * 100) / 100;
      const saved = {
        id: isNew ? uid('c') : f.id,
        name, brand: $('#fbrand', sheet).value.trim(),
        c: r2(c), p: r2(p), f: r2(fat),
        portions: hasPortion ? [{ n: pn || 'portie', g: pg }] : [],
      };
      saved.k = Math.round(kcalOf(saved) * 10) / 10;
      state.foods[saved.id] = saved;
      save(); closeSheet();
      toast('Bewaard');
      if (opts.after) opts.after(saved); else render();
    }
  };
}

// ---------- Instellingen ----------
function renderInstellingen() {
  const g = state.targets;
  const v = x => (x ? fmt(x, 1) : '');
  const nLogged = Object.keys(state.log).filter(dayHasEntries).length;
  view.innerHTML = `
    <h1>Instellingen</h1>
    <div class="card">
      <h2>Dagdoelen</h2>
      <p class="muted small">Optioneel. Laat leeg wat je niet wil volgen.</p>
      <div class="row2">
        <label class="field"><span>Calorieën (kcal)</span><input id="tk" inputmode="decimal" value="${v(g.k)}"></label>
        <label class="field"><span>Koolhydraten (g)</span><input id="tc" inputmode="decimal" value="${v(g.c)}"></label>
        <label class="field"><span>Eiwit (g)</span><input id="tp" inputmode="decimal" value="${v(g.p)}"></label>
        <label class="field"><span>Vet (g)</span><input id="tf" inputmode="decimal" value="${v(g.f)}"></label>
      </div>
      <button class="btn primary block" data-act="savetargets">Doelen bewaren</button>
    </div>
    <div class="card">
      <h2>Back-up</h2>
      <p class="muted small">Je gegevens staan alleen op dit toestel (${nLogged} ${nLogged === 1 ? 'dag' : 'dagen'} ingevuld, ${Object.keys(state.foods).length} eigen/aangepaste voedingsmiddelen). Maak af en toe een back-up, bijvoorbeeld voor je van gsm wisselt.</p>
      <div class="meal-actions">
        <button class="btn grow" data-act="export">Back-up opslaan</button>
        <button class="btn grow" data-act="import">Back-up terugzetten</button>
      </div>
      <input type="file" id="importfile" accept="application/json,.json" class="hidden">
    </div>
    <p class="muted small" style="text-align:center">NT Nutrition v0.2 · ${BUILTIN_FOODS.length} ingebouwde voedingsmiddelen</p>`;

  $('#importfile').addEventListener('change', importData);
}

function saveTargets() {
  const r = id => { const n = num($('#' + id).value); return isFinite(n) && n > 0 ? n : 0; };
  state.targets = { k: r('tk'), c: r('tc'), p: r('tp'), f: r('tf') };
  save(); toast('Doelen bewaard');
}

async function exportData() {
  const json = JSON.stringify({ app: 'voeding', version: 1, exported: new Date().toISOString(), state }, null, 1);
  const name = `voeding-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // Op de gsm: deel-menu (bewaren in Bestanden, mailen…). Anders: downloaden.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.app !== 'voeding' || !data.state) throw new Error('geen back-up van deze app');
      if (!confirm('Je huidige gegevens worden vervangen door deze back-up. Doorgaan?')) return;
      state = Object.assign(defaultState(), data.state);
      save(); render(); toast('Back-up teruggezet');
    } catch (err) {
      toast('Kon de back-up niet lezen: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ---------- Start ----------
// Een nieuwe dag na middernacht: spring naar vandaag als de app weer geopend wordt.
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayKey() !== lastToday) {
    if (cur === lastToday) cur = todayKey();
    lastToday = todayKey();
    if (sheet.classList.contains('hidden')) render();
  }
});

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
