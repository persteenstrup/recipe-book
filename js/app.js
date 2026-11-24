import { parseRecipe, parseIndex } from './parse.js';
import { formatAmount, shortName, convertText } from './units.js';

const $ = (sel, el = document) => el.querySelector(sel);
let app = $('#app');

// ---------- preferences (per device) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('rb:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rb:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
let units = store.get('units', 'original');

// ---------- data ----------
const cache = new Map();
async function loadRecipe(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const res = await fetch(`recipes/${encodeURIComponent(slug)}.yaml`);
  if (!res.ok) throw new Error(`Recipe "${slug}" not found`);
  const r = parseRecipe(await res.text(), slug);
  cache.set(slug, r);
  return r;
}
async function loadAll() {
  const res = await fetch('recipes/index.yaml');
  const slugs = parseIndex(await res.text());
  const out = await Promise.all(slugs.map(s => loadRecipe(s).catch(() => null)));
  return out.filter(Boolean);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- list view ----------
async function renderList() {
  document.title = 'Recipe Book';
  app.innerHTML = '<p class="muted">Loading…</p>';
  const recipes = await loadAll();
  const tags = [...new Set(recipes.flatMap(r => r.tags))].sort();
  let q = '', tag = '';

  app.innerHTML = `
    <header class="top"><h1>Recipe Book</h1></header>
    <input id="search" type="search" placeholder="Search recipes or ingredients" autocomplete="off">
    <div class="chips" id="tags">${tags.map(t => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <ul class="cards" id="cards"></ul>`;

  const draw = () => {
    const ql = q.toLowerCase();
    const list = recipes.filter(r =>
      (!tag || r.tags.includes(tag)) &&
      (!ql || r.title.toLowerCase().includes(ql) || r.ingredients.some(i => i.name.toLowerCase().includes(ql))));
    $('#cards').innerHTML = list.map(r => `
      <li><a class="card" href="#/r/${encodeURIComponent(r.slug)}">
        <span class="card-title">${esc(r.title)}</span>
        <span class="muted">${r.yieldLabel === 'makes' ? 'Makes' : 'Serves'} ${r.yield}${r.tags.length ? ' · ' + r.tags.map(esc).join(', ') : ''}</span>
      </a></li>`).join('') || '<li class="muted">No recipes match.</li>';
    for (const b of app.querySelectorAll('.chip')) b.classList.toggle('on', b.dataset.tag === tag);
  };
  $('#search').addEventListener('input', e => { q = e.target.value; draw(); });
  $('#tags').addEventListener('click', e => {
    const t = e.target.closest('.chip')?.dataset.tag; if (t == null) return;
    tag = tag === t ? '' : t; draw();
  });
  draw();
}

// ---------- recipe view ----------
const PORTIONS = { half: 1 / 2, third: 1 / 3, quarter: 1 / 4, twothirds: 2 / 3, threequarters: 3 / 4 };

function renderStep(text, r, scale) {
  const byId = Object.fromEntries(r.ingredients.map(i => [i.id, i]));
  let html = esc(convertText(text, units));
  return html.replace(/\{([\w-]+)(?::([\w]+))?\}/g, (all, id, part) => {
    const ing = byId[id];
    if (!ing) return all;
    const f = part && PORTIONS[part] ? PORTIONS[part] : 1;
    const amt = formatAmount(ing, scale * f, units);
    const name = esc(shortName(ing));
    return amt ? `<span class="inline-amt"><b>${esc(amt)}</b> ${name}</span>` : `<span class="inline-amt">${name}</span>`;
  });
}

async function renderRecipe(slug) {
  app.innerHTML = '<p class="muted">Loading…</p>';
  let r;
  try { r = await loadRecipe(slug); }
  catch (e) { app.innerHTML = `<p>${esc(e.message)}. <a href="#/">Back to recipes</a></p>`; return; }
  document.title = r.title + ' · Recipe Book';

  let servings = store.get('servings:' + slug, r.yield);

  const draw = () => {
    const scale = servings / r.yield;
    const byId = Object.fromEntries(r.ingredients.map(i => [i.id, i]));
    const bigChange = scale >= 1.75 || scale <= 0.6;
    app.innerHTML = `
      <header class="top"><a href="#/" class="back" aria-label="All recipes">‹ Recipes</a></header>
      <h1>${esc(r.title)}</h1>
      ${r.source ? `<p class="muted">From ${esc(r.source)}</p>` : ''}

      <section class="controls" aria-label="Scale and units">
        <div class="scaler">
          <span class="label">${r.yieldLabel === 'makes' ? 'Makes' : 'Serves'}</span>
          <button data-act="minus" aria-label="Fewer">−</button>
          <input id="servings" type="number" inputmode="decimal" min="0.25" step="any" value="${+servings.toFixed(2)}">
          <button data-act="plus" aria-label="More">+</button>
        </div>
        <div class="multipliers">
          ${[0.5, 1, 2, 3].map(m => `<button data-mult="${m}" class="${Math.abs(scale - m) < 1e-6 ? 'on' : ''}">×${m === 0.5 ? '½' : m}</button>`).join('')}
        </div>
        <div class="seg" role="radiogroup" aria-label="Units">
          ${[['original', 'Original'], ['metric', 'Metric'], ['us', 'US']].map(([k, l]) =>
            `<button role="radio" aria-checked="${units === k}" data-units="${k}" class="${units === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </section>

      ${bigChange && r.equipment.length ? `<p class="warn">Scaled ×${+scale.toFixed(2)}: check that your pan, tin or pot sizes still fit, and adjust cooking times.</p>` : ''}

      <div class="layout">
        <section class="ingredients">
          <h2>Ingredients</h2>
          ${r.groups.map(g => `
            ${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
            <ul>${g.ids.map(id => byId[id]).map(i => {
              const amt = formatAmount(i, scale, units);
              return `<li><label><input type="checkbox"> <span><b>${esc(amt)}</b> ${esc(convertText(i.name, units))}${i.flags.fixed && scale !== 1 ? ' <span class="muted">(not scaled)</span>' : ''}</span></label></li>`;
            }).join('')}</ul>`).join('')}
          ${r.equipment.length ? `<h3>Equipment</h3><ul class="plain">${r.equipment.map(e => `<li>${esc(convertText(e.text, units))}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="steps">
          <h2>Method</h2>
          <ol>${r.steps.map(s => `<li><p>${renderStep(s, r, scale)}</p></li>`).join('')}</ol>
          ${r.notes ? `<h3>Notes</h3><p>${esc(r.notes)}</p>` : ''}
        </section>
      </div>`;
  };

  const setServings = v => {
    if (!(v > 0)) return;
    servings = v;
    store.set('servings:' + slug, v);
    draw();
  };

  app.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'minus') setServings(Math.max(r.yield / 4, servings - (r.yield >= 8 ? Math.round(r.yield / 4) : 1)));
    else if (b.dataset.act === 'plus') setServings(servings + (r.yield >= 8 ? Math.round(r.yield / 4) : 1));
    else if (b.dataset.mult) setServings(r.yield * Number(b.dataset.mult));
    else if (b.dataset.units) { units = b.dataset.units; store.set('units', units); draw(); }
  };
  app.onchange = e => { if (e.target.id === 'servings') setServings(Number(e.target.value)); };
  // Tap a step to mark it done.
  app.addEventListener('click', e => { const li = e.target.closest('.steps li'); if (li) li.classList.toggle('done'); });

  draw();
}

// ---------- router ----------
function route() {
  const fresh = app.cloneNode(false); app.replaceWith(fresh); app = fresh; // drop old listeners
  const m = location.hash.match(/^#\/r\/(.+)$/);
  if (m) renderRecipe(decodeURIComponent(m[1]));
  else renderList();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
