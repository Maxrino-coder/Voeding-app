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
  // Eigen voedingsmiddelen zonder macro's opruimen.
  for (const [id, f] of Object.entries(st.foods)) if (!isBuiltinId(id) && kcalOf(f) === 0) delete st.foods[id];
  // Noah's eigen voedingsmiddelen eenmalig als favoriet zetten.
  if (!st.favsSeeded) {
    const mine = MY_FOODS;
    st.favs = [...st.favs, ...mine.filter(id => !st.favs.includes(id))];
    st.favsSeeded = true;
  }
  return st;
}

function isBuiltinId(id) { return BUILTIN_FOODS.some(f => f.id === id); }

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Saving failed: ' + e.message);
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
  return n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: d });
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
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  if (k === addDays(t, 1)) return 'Tomorrow';
  const s = keyToDate(k).toLocaleDateString('en-GB', { weekday: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function longDate(k) {
  return keyToDate(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
  // Voedingsmiddelen zonder macro's (0 kcal) horen niet in de lijsten.
  return [...map.values()].filter(f => kcalOf(f) > 0);
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
  if (e.unit === '100 g') return `${fmt(entryGrams(e))} g`;
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

// Aandeel van elke macro in de calorieën, grootste eerst.
const DOM_LABEL = { carb: 'Carb dominant', protein: 'Protein dominant', fat: 'Fat dominant' };
function macroShares(x) {
  const parts = [['protein', 4 * (x.p || 0)], ['carb', 4 * (x.c || 0)], ['fat', 9 * (x.f || 0)]];
  const total = parts.reduce((t, [, v]) => t + v, 0);
  if (!total) return [];
  return parts.map(([key, v]) => ({ key, pct: (v / total) * 100 })).sort((a, b) => b.pct - a.pct);
}

// In welke groep valt een voedingsmiddel: de macro die de meeste calorieën levert.
function dominance(x, small) {
  const top = macroShares(x)[0];
  if (!top) return '';
  return `<span class="dom dom-${top.key}${small ? ' dom-sm' : ''}">${DOM_LABEL[top.key]}</span>`;
}

// Rangschikking van de drie macro's voor een hele meal.
function mealRanking(t) {
  const shares = macroShares(t);
  if (!shares.length) return '';
  return `<div class="ranking">${shares.map((x, i) =>
    `<div class="rank-row${i === 0 ? ' top' : ''}"><span class="dot dom-${x.key}"></span>${DOM_LABEL[x.key]}<span class="pct">${fmt(x.pct)}%</span></div>`).join('')}</div>`;
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
  else if (tab === 'goals') renderGoals();
  else renderInstellingen();
}

// ---------- Dagboek ----------
// Zonder doel toont het balkje het aandeel van deze macro in de kcal van vandaag.
function bar(val, goal, color, share) {
  if (!goal && share == null) return '';
  const pct = goal ? Math.min(100, (val / goal) * 100) : share;
  const over = goal && val > goal * 1.0001;
  return `<div class="bar ${over ? 'over' : ''}"><span style="width:${pct}%;background:${color}"></span></div>`;
}

function renderDag() {
  const t = dayTotals(cur);
  const g = { ...state.targets };
  if (!g.k) g.k = 4 * (g.c || 0) + 4 * (g.p || 0) + 9 * (g.f || 0);
  const kcalRest = g.k ? g.k - t.k : null;

  let html = `
    <div class="brand"><img src="icons/icon-192.png" alt=""><span><b>NT</b>rition</span></div>
    <div class="datebar">
      <button class="iconbtn" data-act="prevday" aria-label="Previous day">‹</button>
      <div class="label">
        <strong>${dayLabel(cur)}</strong>
        <span class="muted small">${longDate(cur)}</span>
        <input type="date" id="datepick" value="${cur}" aria-label="Pick date">
      </div>
      <button class="iconbtn" data-act="nextday" aria-label="Next day">›</button>
    </div>

    <div class="card totals">
      <div class="totals-grid">
        ${kcalRing(t, g.k)}
        <div class="macros-col">
          ${macroBlock('Carbs', t.c, g.c, 'var(--c-carb)', t.k ? (4 * t.c / t.k) * 100 : 0)}
          ${macroBlock('Protein', t.p, g.p, 'var(--c-prot)', t.k ? (4 * t.p / t.k) * 100 : 0)}
          ${macroBlock('Fat', t.f, g.f, 'var(--c-fat)', t.k ? (9 * t.f / t.k) * 100 : 0)}
        </div>
      </div>
      ${g.k ? `<div class="kcal-left ${kcalRest < 0 ? 'over' : ''}">${kcalRest < 0 ? fmt(-kcalRest) + ' kcal over goal' : fmt(kcalRest) + ' kcal left'}</div>`
        : `<button class="btn block" data-act="gotogoals" style="margin-top:12px">🎯 Set your goals</button>`}
    </div>`;

  for (const m of MEALS.slice(0, visibleMeals(cur))) {
    const entries = mealEntries(cur, m.id);
    const mt = sum(entries.map(entryTotals));
    html += `
      <div class="card">
        <div class="meal-head">
          <h2>${m.name}</h2>
          <div class="sum">${entries.length ? `<strong style="color:var(--text)">${fmt(mt.k)} kcal</strong><br>C ${fmt(mt.c)} · P ${fmt(mt.p)} · F ${fmt(mt.f)}` : ''}</div>
        </div>
        ${entries.length ? mealRanking(mt) : ''}
        ${entries.length ? `<ul class="entries">${entries.map(e => {
          const et = entryTotals(e);
          return `<li class="swipe" data-meal="${m.id}" data-id="${e.id}">
            <button class="e-del" data-act="delentry">Delete</button>
            <div class="e-row" data-act="editentry">
              <div><div class="e-name">${esc(e.name)} ${dominance(e.per, true)}</div><div class="e-sub">${amountLabel(e)} · C ${fmt(et.c, 1)} · P ${fmt(et.p, 1)} · F ${fmt(et.f, 1)}</div></div>
              <div class="e-kcal">${fmt(et.k)}</div>
            </div>
          </li>`;
        }).join('')}</ul>` : ''}
        <div class="meal-actions">
          <button class="btn grow" data-act="add" data-meal="${m.id}">+ Add food</button>
          ${entries.length ? `<button class="btn ghost" data-act="copymeal" data-meal="${m.id}">Copy</button>` : ''}
        </div>
      </div>`;
  }

  const shown = visibleMeals(cur);
  if (shown < MEALS.length) {
    html += `<button class="btn block" data-act="addmeal" style="margin-bottom:12px">+ Add ${MEALS[shown].name}</button>`;
  }
  if (dayHasEntries(cur)) {
    html += `<button class="btn ghost block" data-act="copyday">Copy whole day to…</button>`;
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

// Cirkel die vult naarmate je dichter bij je kcal-doel komt (half gevuld = helft van je doel).
// Het gevulde deel is verdeeld in de kleuren van carbs, protein en fat. Zonder doel is de cirkel
// helemaal gevuld en toont hij alleen de verdeling.
function kcalRing(t, goal) {
  const val = t.k;
  const r = 54, c = 2 * Math.PI * r;
  const frac = goal ? Math.min(1, val / goal) : (val ? 1 : 0);
  const over = goal && val > goal * 1.0001;
  const parts = [[4 * t.c, 'var(--c-carb)'], [4 * t.p, 'var(--c-prot)'], [9 * t.f, 'var(--c-fat)']];
  let start = 0, arcs = '';
  for (const [kc, color] of parts) {
    const len = val ? (kc / val) * frac * c : 0;
    if (len > 0.5) {
      arcs += `<circle cx="64" cy="64" r="${r}" class="ring-fg" stroke="${color}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-start}" transform="rotate(-90 64 64)"/>`;
    }
    start += len;
  }
  return `<div class="ring">
    <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true">
      <circle cx="64" cy="64" r="${r}" class="ring-bg ${over ? 'over' : ''}"/>
      ${arcs}
    </svg>
    <div class="ring-text"><span class="kcal-big">${fmt(val)}</span><span class="muted small">${goal ? `of ${fmt(goal)} kcal` : 'kcal'}</span></div>
  </div>`;
}

function macroBlock(name, val, goal, color, share) {
  return `<div class="macro">
    <div class="name">${name}</div>
    <div class="val">${fmt(val)}${goal ? ` <span class="muted small">/ ${fmt(goal)} g</span>` : ' g'}</div>
    ${bar(val, goal, color, share)}
  </div>`;
}

// Swipe naar links op een item toont een rode Delete-knop.
const SWIPE_W = 88;
let swipe = null, swipedAt = 0;
function closeSwipes(except) {
  view.querySelectorAll('li.swipe.open').forEach(li => {
    if (li === except) return;
    li.classList.remove('open'); li.querySelector('.e-row').style.transform = '';
  });
}
view.addEventListener('touchstart', e => {
  const li = e.target.closest('li.swipe');
  if (!li || e.target.closest('.e-del')) return;
  const t = e.touches[0];
  swipe = { li, row: li.querySelector('.e-row'), x: t.clientX, y: t.clientY, dx: 0, dir: null, base: li.classList.contains('open') ? -SWIPE_W : 0 };
}, { passive: true });
view.addEventListener('touchmove', e => {
  if (!swipe) return;
  const t = e.touches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  if (!swipe.dir) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    swipe.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (swipe.dir === 'h') { closeSwipes(swipe.li); swipe.row.style.transition = 'none'; }
  }
  if (swipe.dir !== 'h') return;
  e.preventDefault();
  swipe.dx = dx;
  const x = Math.max(-SWIPE_W - 30, Math.min(0, swipe.base + dx));
  swipe.row.style.transform = `translateX(${x}px)`;
}, { passive: false });
view.addEventListener('touchend', () => {
  if (!swipe) return;
  const s = swipe; swipe = null;
  if (s.dir !== 'h') return;
  s.row.style.transition = '';
  const open = s.base + s.dx < -SWIPE_W / 2;
  s.li.classList.toggle('open', open);
  s.row.style.transform = open ? `translateX(${-SWIPE_W}px)` : '';
  swipedAt = Date.now();
});

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'prevday') { cur = addDays(cur, -1); render(); }
  else if (act === 'nextday') { cur = addDays(cur, 1); render(); }
  else if (act === 'add') openAdd(el.dataset.meal);
  else if (act === 'editentry') {
    const li = el.closest('li');
    if (li.classList.contains('open')) { closeSwipes(); return; }
    const entry = mealEntries(cur, li.dataset.meal).find(x => x.id === li.dataset.id);
    if (entry) openQty({ entry, meal: li.dataset.meal });
  }
  else if (act === 'delentry') {
    const li = el.closest('li');
    const list = dayLog(cur, true)[li.dataset.meal];
    const i = list.findIndex(x => x.id === li.dataset.id);
    if (i >= 0) list.splice(i, 1);
    save(); render(); toast('Deleted');
  }
  else if (act === 'addmeal') { extraMeals[cur] = visibleMeals(cur) + 1; render(); }
  else if (act === 'copymeal') openCopy(el.dataset.meal);
  else if (act === 'copyday') openCopy(null);
  else if (act === 'prevweek') { weekOffset--; render(); }
  else if (act === 'nextweek') { weekOffset++; render(); }
  else if (act === 'gotoday') { cur = el.dataset.day; tab = 'dag'; render(); window.scrollTo(0, 0); }
  else if (act === 'newfood') openFoodEditor(null);
  else if (act === 'editfood') openFoodEditor(getFood(el.dataset.id));
  else if (act === 'gotogoals') { tab = 'goals'; render(); window.scrollTo(0, 0); }
  else if (act === 'cleargoals') { state.targets = { k: 0, c: 0, p: 0, f: 0 }; save(); render(); toast('Goals cleared'); }
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
      <button class="btn ghost" data-s="close">Close</button>
      <h2>${mealName}</h2>
      <button class="btn ghost" data-s="new">+ New</button>
    </div>
    <input class="search" id="q" type="search" placeholder="Search food…" autocomplete="off">
    <div class="seg" id="seg">
      <button data-mode="favs">Favourites</button>
      <button data-mode="recent">Recent</button>
      <button data-mode="alles">All</button>
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
    else if (addMode === 'recent') list = state.recent.map(getFood).filter(f => f && !state.hidden.includes(f.id) && kcalOf(f) > 0);
    else if (addMode === 'favs') list = state.favs.map(getFood).filter(f => f && !state.hidden.includes(f.id) && kcalOf(f) > 0);
    else list = searchFoods('');
    const fav = new Set(state.favs);
    $('#results', sheet).innerHTML = list.length ? list.slice(0, 200).map(f => `
      <li data-s="pick" data-id="${esc(f.id)}">
        <div class="f-main"><div class="f-name">${esc(f.name)}</div><div class="f-sub">${foodSub(f)}</div>${dominance(f)}</div>
        <button class="star ${fav.has(f.id) ? 'on' : ''}" data-s="fav" data-id="${esc(f.id)}" aria-label="Favourite">${fav.has(f.id) ? '★' : '☆'}</button>
      </li>`).join('')
      : `<li class="empty">${text ? 'Nothing found. Tap “+ New” to add it.' : addMode === 'favs' ? 'No favourites yet. Tap ☆ to add one.' : 'Nothing eaten recently.'}</li>`;
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
  const units = [{ n: 'g', g: 1, label: 'grams' }, { n: '100 g', g: 100, label: '× 100 g' }].concat((f.portions || []).map(p => ({ n: p.n, g: p.g, label: `${p.n} (${fmt(p.g)} g)` })));
  if (editing && !units.some(u => u.n === entry.unit)) units.push({ n: entry.unit, g: entry.ug, label: `${entry.unit} (${fmt(entry.ug)} g)` });

  // Nieuw item: laatst gebruikte eenheid van dit voedingsmiddel, anders portie of gram.
  const lastUnit = (state.units || {})[f.id];
  let unit = editing ? entry.unit : units.some(u => u.n === lastUnit) ? lastUnit : (units[2] ? units[2].n : 'g');
  let qty = editing ? entry.qty : (unit === 'g' ? 100 : 1);
  const fav = state.favs.includes(f.id);

  openSheet(`
    <div class="sheet-head">
      <button class="btn ghost" data-s="back">${editing ? 'Cancel' : 'Back'}</button>
      <h2>${editing ? 'Edit' : 'Add food'}</h2>
      <button class="star ${fav ? 'on' : ''}" data-s="fav" aria-label="Favourite">${fav ? '★' : '☆'}</button>
    </div>
    <div class="card">
      <h2>${esc(f.name)}</h2>
      <div class="muted small">${f.brand ? esc(f.brand) + ' · ' : ''}${fmt(kcalOf(per))} kcal · C ${fmt(per.c, 1)} · P ${fmt(per.p, 1)} · F ${fmt(per.f, 1)} per 100 g</div>
      ${dominance(per)}
    </div>
    <div class="card">
      <div class="row2">
        <label class="field"><span>Amount</span><input id="qty" inputmode="decimal" value="${fmt(qty, 2)}" autocomplete="off"></label>
        <label class="field"><span>Unit</span><select id="unit">${units.map(u => `<option value="${esc(u.n)}" ${u.n === unit ? 'selected' : ''}>${esc(u.label)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Meal</span><select id="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
      <div class="preview" id="preview"></div>
      <button class="btn primary block" data-s="ok">${editing ? 'Save' : 'Add'}</button>
      ${editing ? '<button class="btn danger block" data-s="del" style="margin-top:8px">Delete</button>' : ''}
    </div>
  `);

  const qtyEl = $('#qty', sheet), unitEl = $('#unit', sheet);
  const ug = () => units.find(u => u.n === unitEl.value).g;
  const draw = () => {
    const q = num(qtyEl.value);
    const t = scale(per, (isFinite(q) ? q : 0) * ug());
    $('#preview', sheet).innerHTML = `
      <div><div class="v">${fmt(t.k)}</div><div class="l">kcal</div></div>
      <div><div class="v">${fmt(t.c, 1)}</div><div class="l">Carbs (g)</div></div>
      <div><div class="v">${fmt(t.p, 1)}</div><div class="l">Protein (g)</div></div>
      <div><div class="v">${fmt(t.f, 1)}</div><div class="l">Fat (g)</div></div>`;
  };
  qtyEl.addEventListener('input', draw);
  qtyEl.addEventListener('focus', () => qtyEl.select());
  unitEl.addEventListener('change', () => {
    // Behoud ongeveer hetzelfde gewicht bij wisselen tussen gram en stuks.
    const prevG = units.find(u => u.n === unit).g;
    const q = num(qtyEl.value);
    if (isFinite(q)) {
      const nq = (q * prevG) / ug();
      qtyEl.value = fmt(unitEl.value === 'g' ? Math.round(nq) : unitEl.value === '100 g' ? Math.round(nq * 100) / 100 : Math.round(nq * 4) / 4, 2);
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
      save(); closeSheet(); render(); toast('Deleted');
    }
    else if (s === 'ok') {
      const q = num(qtyEl.value);
      if (!isFinite(q) || q <= 0) { toast('Enter an amount'); return; }
      const newMeal = $('#meal', sheet).value;
      const day = dayLog(cur, true);
      const item = {
        id: editing ? entry.id : uid('e'),
        foodId: f.id, name: f.name, brand: f.brand || '',
        per, qty: q, unit: unitEl.value, ug: ug(),
      };
      (state.units = state.units || {})[f.id] = unitEl.value;
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
      toast(editing ? 'Saved' : `${f.name} added`);
    }
  };
}

// ---------- Kopiëren ----------
function openCopy(meal) {
  const what = meal ? MEALS.find(m => m.id === meal).name : 'Whole day';
  const target = cur === todayKey() ? addDays(cur, 1) : todayKey();
  openSheet(`
    <div class="sheet-head">
      <button class="btn ghost" data-s="close">Cancel</button>
      <h2>Copy</h2>
      <span style="min-width:70px"></span>
    </div>
    <div class="card">
      <p style="margin-top:0">Copy <strong>${what}</strong> from ${longDate(cur)} to:</p>
      <label class="field"><span>Date</span><input type="date" id="cdate" value="${target}"></label>
      ${meal ? `<label class="field"><span>Meal</span><select id="cmeal">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>` : ''}
      <p class="muted small">The items are added to whatever is already logged that day.</p>
      <button class="btn primary block" data-s="ok">Copy</button>
    </div>
  `);
  sheet.onclick = e => {
    const el = e.target.closest('[data-s]');
    if (!el) return;
    if (el.dataset.s === 'close') closeSheet();
    else if (el.dataset.s === 'ok') {
      const to = $('#cdate', sheet).value;
      if (!to) { toast('Pick a date'); return; }
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
      toast(`${n} item${n === 1 ? '' : 's'} copied`);
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

  const short = k => keyToDate(k).toLocaleDateString('en-GB', { weekday: 'short' }).replace('.', '');
  const cls = (v, goal) => (goal && v > goal * 1.0001 ? 'over' : '');

  view.innerHTML = `
    <div class="datebar">
      <button class="iconbtn" data-act="prevweek" aria-label="Previous week">‹</button>
      <div class="label"><strong>Week</strong><span class="muted small">${longDate(days[0])} – ${longDate(days[6])}</span></div>
      <button class="iconbtn" data-act="nextweek" aria-label="Next week">›</button>
    </div>

    <div class="card">
      <h2>Calories per day</h2>
      <div class="chart">
        ${g.k ? `<div class="goal" style="bottom:${20 + (g.k / maxK) * 120}px"></div>` : ''}
        ${rows.map(r => `<div class="col" data-act="gotoday" data-day="${r.k}">
          <div class="b ${cls(r.t.k, g.k)}" style="height:${(r.t.k / maxK) * 120}px"></div>
          <div class="d">${short(r.k)}</div></div>`).join('')}
      </div>
    </div>

    <div class="card">
      <table class="week-table">
        <thead><tr><th>Day</th><th>kcal</th><th>Carbs</th><th>Protein</th><th>Fat</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr class="${r.k === todayKey() ? 'today' : ''}" data-act="gotoday" data-day="${r.k}">
            <td>${short(r.k)} ${keyToDate(r.k).getDate()}/${keyToDate(r.k).getMonth() + 1}</td>
            <td class="${cls(r.t.k, g.k)}">${r.has ? fmt(r.t.k) : '–'}</td>
            <td class="${cls(r.t.c, g.c)}">${r.has ? fmt(r.t.c) : '–'}</td>
            <td>${r.has ? fmt(r.t.p) : '–'}</td>
            <td class="${cls(r.t.f, g.f)}">${r.has ? fmt(r.t.f) : '–'}</td>
          </tr>`).join('')}
          <tr class="avg"><td>Average*</td><td>${fmt(avg.k / n)}</td><td>${fmt(avg.c / n)}</td><td>${fmt(avg.p / n)}</td><td>${fmt(avg.f / n)}</td></tr>
          ${g.k || g.c || g.p || g.f ? `<tr class="avg muted"><td>Goal</td><td>${fmt(g.k)}</td><td>${fmt(g.c)}</td><td>${fmt(g.p)}</td><td>${fmt(g.f)}</td></tr>` : ''}
        </tbody>
      </table>
      <p class="muted small">* Average over the ${logged.length} ${logged.length === 1 ? 'day' : 'days'} with entries. Carbs, protein and fat in grams. Tap a day to open it.</p>
    </div>`;
}

// ---------- Voedingsmiddelen beheren ----------
let foodQuery = '';
function renderVoeding() {
  view.innerHTML = `
    <h1>Foods</h1>
    <input class="search" id="fq" type="search" placeholder="Search…" value="${esc(foodQuery)}" autocomplete="off">
    <div style="margin:10px 0"><button class="btn primary block" data-act="newfood">+ New food</button></div>
    <div class="card" style="padding-top:2px;padding-bottom:2px"><ul class="list" id="flist"></ul></div>`;
  const draw = () => {
    const list = foodQuery.trim() ? searchFoods(foodQuery) : searchFoods('').sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    $('#flist').innerHTML = list.map(f => `
      <li data-act="editfood" data-id="${esc(f.id)}">
        <div class="f-main"><div class="f-name">${esc(f.name)}${!isBuiltin(f.id) ? '<span class="tag">custom</span>' : state.foods[f.id] ? '<span class="tag">edited</span>' : ''}</div>
        <div class="f-sub">${foodSub(f)}<br>C ${fmt(f.c, 1)} · P ${fmt(f.p, 1)} · F ${fmt(f.f, 1)} per 100 g</div>${dominance(f)}</div>
      </li>`).join('') || '<li class="empty">Nothing found.</li>';
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
      <button class="btn ghost" data-s="close">Cancel</button>
      <h2>${isNew ? 'New food' : 'Edit food'}</h2>
      <button class="btn ghost" data-s="ok">Save</button>
    </div>
    <div class="card">
      <label class="field"><span>Name</span><input id="fname" value="${esc(f.name)}" placeholder="e.g. Griekse yoghurt 0%"></label>
      <label class="field"><span>Brand / store (optional)</span><input id="fbrand" value="${esc(f.brand || '')}" placeholder="e.g. Jumbo"></label>
      <div class="row2">
        <label class="field"><span>Serving name (optional)</span><input id="pname" value="${esc(portion.n)}" placeholder="e.g. piece, egg, slice"></label>
        <label class="field"><span>Weight of 1 serving (g)</span><input id="pg" inputmode="decimal" value="${v(portion.g)}" placeholder="e.g. 60"></label>
      </div>
      <label class="field"><span>Values entered per</span>
        <select id="basis"><option value="100">100 grams</option><option value="portie">1 serving</option></select></label>
      <div class="row2">
        <label class="field"><span>Carbs (g)</span><input id="fc" inputmode="decimal" value="${v(f.c)}"></label>
        <label class="field"><span>Protein (g)</span><input id="fp" inputmode="decimal" value="${v(f.p)}"></label>
        <label class="field"><span>Fat (g)</span><input id="ff" inputmode="decimal" value="${v(f.f)}"></label>
      </div>
      <p class="muted small" style="margin-top:0">Calories are calculated from the macros: 4 kcal per gram of carbs and protein, 9 per gram of fat.</p>
    </div>
    ${!isNew ? `<div class="card">
      ${builtin && state.foods[f.id] ? '<button class="btn block" data-s="reset" style="margin-bottom:8px">Restore original values</button>' : ''}
      <button class="btn danger block" data-s="del">${builtin ? 'Hide from the list' : 'Delete'}</button>
      <p class="muted small">Anything already in your diary stays as it is.</p>
    </div>` : ''}
  `);

  const basisEl = $('#basis', sheet);
  // Bij overschakelen naar "per portie" de getoonde waarden omrekenen, en omgekeerd.
  let basis = '100';
  basisEl.addEventListener('change', () => {
    const pg = num($('#pg', sheet).value);
    if (!(pg > 0)) {
      if (basisEl.value === 'portie') { toast('Enter the weight of 1 serving first'); basisEl.value = basis; }
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
      save(); closeSheet(); render(); toast('Original values restored');
    }
    else if (s === 'del') {
      if (builtin) state.hidden.push(f.id); else delete state.foods[f.id];
      state.favs = state.favs.filter(x => x !== f.id);
      state.recent = state.recent.filter(x => x !== f.id);
      save(); closeSheet(); render(); toast(builtin ? 'Hidden' : 'Deleted');
    }
    else if (s === 'ok') {
      const name = $('#fname', sheet).value.trim();
      if (!name) { toast('Enter a name'); return; }
      const c = num($('#fc', sheet).value) || 0, p = num($('#fp', sheet).value) || 0, fat = num($('#ff', sheet).value) || 0;
      if (!(c + p + fat > 0)) { toast('Enter at least one of carbs, protein or fat'); return; }
      const pn = $('#pname', sheet).value.trim(), pg = num($('#pg', sheet).value);
      const hasPortion = pg > 0;
      const factor = basisEl.value === 'portie' && hasPortion ? 100 / pg : 1;
      const r2 = x => Math.round(x * factor * 100) / 100;
      const saved = {
        id: isNew ? uid('c') : f.id,
        name, brand: $('#fbrand', sheet).value.trim(),
        c: r2(c), p: r2(p), f: r2(fat),
        portions: hasPortion ? [{ n: pn || 'serving', g: pg }] : [],
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
    <h1>Settings</h1>
    <div class="card">
      <h2>Backup</h2>
      <p class="muted small">Your data is stored on this device only (${nLogged} ${nLogged === 1 ? 'day' : 'days'} logged, ${Object.keys(state.foods).length} custom/edited foods). Save a backup now and then, for example before switching phones.</p>
      <div class="meal-actions">
        <button class="btn grow" data-act="export">Save backup</button>
        <button class="btn grow" data-act="import">Restore backup</button>
      </div>
      <input type="file" id="importfile" accept="application/json,.json" class="hidden">
    </div>
    <p class="muted small" style="text-align:center">NTrition v0.5 · ${BUILTIN_FOODS.length} built-in foods</p>`;

  $('#importfile').addEventListener('change', importData);
}

// ---------- Goals ----------
const GOAL_MACROS = [
  { key: 'c', name: 'Carbs', color: 'var(--c-carb)', kcal: 4, max: 600, step: 1 },
  { key: 'p', name: 'Protein', color: 'var(--c-prot)', kcal: 4, max: 400, step: 1 },
  { key: 'f', name: 'Fat', color: 'var(--c-fat)', kcal: 9, max: 250, step: 1 },
];

function renderGoals() {
  const g = state.targets;
  // Keuzelijst per macro; op de iPhone verschijnt die als draaiwiel.
  const options = m => {
    const vals = [];
    for (let v = 0; v <= m.max; v += m.step) vals.push(v);
    if (g[m.key] && !vals.includes(g[m.key])) vals.push(g[m.key]);
    return vals.sort((a, b) => a - b).map(v => `<option value="${v}" ${v === (g[m.key] || 0) ? 'selected' : ''}>${v} g</option>`).join('');
  };
  view.innerHTML = `
    <h1>🎯 Goals</h1>
    <div class="card goal-total">
      <div class="muted small">Daily calorie goal</div>
      <div><span class="kcal-big" id="gk">0</span> <span class="muted">kcal</span></div>
      <div class="split" id="gsplit"></div>
    </div>
    <div class="card">
      <div class="goal-cols">
        ${GOAL_MACROS.map(m => `<div class="goal-col">
          <div class="gname" style="color:${m.color}">${m.name}</div>
          <div class="gpct" id="pct-${m.key}">0%</div>
          <select class="gsel" id="g-${m.key}" aria-label="${m.name} in grams">${options(m)}</select>
          <div class="muted small" id="kc-${m.key}">0 kcal</div>
        </div>`).join('')}
      </div>
      <p class="muted small" style="margin-bottom:0">Tap the grams to change them. The percentages and calories update right away: 4 kcal per gram of carbs and protein, 9 per gram of fat.</p>
    </div>
    ${g.k ? '<button class="btn ghost block" data-act="cleargoals">Clear goals</button>' : ''}`;

  const draw = () => {
    const kc = Object.fromEntries(GOAL_MACROS.map(m => [m.key, (state.targets[m.key] || 0) * m.kcal]));
    const total = kc.c + kc.p + kc.f;
    $('#gk').textContent = fmt(total);
    for (const m of GOAL_MACROS) {
      $('#pct-' + m.key).textContent = (total ? fmt((kc[m.key] / total) * 100) : 0) + '%';
      $('#kc-' + m.key).textContent = fmt(kc[m.key]) + ' kcal';
    }
    $('#gsplit').innerHTML = total ? GOAL_MACROS.map(m => `<span style="width:${(kc[m.key] / total) * 100}%;background:${m.color}"></span>`).join('') : '';
  };
  for (const m of GOAL_MACROS) {
    $('#g-' + m.key).addEventListener('change', e => {
      const t = { ...state.targets, [m.key]: Number(e.target.value) };
      t.k = 4 * (t.c || 0) + 4 * (t.p || 0) + 9 * (t.f || 0);
      state.targets = t;
      save(); draw();
    });
  }
  draw();
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
      if (!data || data.app !== 'voeding' || !data.state) throw new Error('not a backup of this app');
      if (!confirm('Your current data will be replaced by this backup. Continue?')) return;
      state = Object.assign(defaultState(), data.state);
      save(); render(); toast('Backup restored');
    } catch (err) {
      toast('Could not read the backup: ' + err.message);
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
  // Komt er een nieuwe versie binnen, laad dan één keer opnieuw zodat je meteen de update ziet.
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
}
