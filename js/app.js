import { parseRecipe, parseIndex } from './parse.js';
import { auth, loadNotes, addNote, deleteNote, checkToken, TOKEN_URL } from './notes.js';
import { formatAmount, nameFor, convertText, parseIngredientLine, NUM } from './units.js';

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

// Units that may appear as loose amounts inside step text.
const TEXT_UNIT = String.raw`(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|grams?|g|kilograms?|kg|millilitres?|milliliters?|ml|litres?|liters?|l|ounces?|oz|pounds?|lbs?|lb|quarts?|pints?|fl\.? oz)`;
const LOOSE_RE = new RegExp(String.raw`(?<![\w/-])(${NUM}(?:\s*(?:-|–|to)\s*${NUM})?)\s+(${TEXT_UNIT})(?![\w-])`, 'g');

function amountSpan(line, scale, fixed) {
  const ing = parseIngredientLine(line);
  if (ing.qty == null || !ing.unit) return null;
  const amt = formatAmount(ing, fixed ? 1 : scale, units);
  const note = fixed && Math.abs(scale - 1) > 1e-6 ? ' <span class="not-scaled">not scaled</span>' : '';
  return `<b class="${fixed ? 'fixed-amt' : 'inline-amt'}">${esc(amt)}</b>${note}`;
}

// Step text markup:
//   {id} / {id:half}      ingredient amount + name, scaled
//   [[1/2 cup]]           a loose amount that scales with the recipe
//   [[2 to 3 tbsp !fixed]] converted but never scaled (e.g. "per taco")
// Any other amount with a cooking unit is converted and flagged "not scaled".
function renderStep(text, r, scale) {
  const byId = Object.fromEntries(r.ingredients.map(i => [i.id, i]));
  const parts = [];
  const hold = html => String.fromCharCode(0xE000 + parts.push(html) - 1); // private-use char as placeholder

  let t = text.replace(/\[\[(.+?)\]\]/g, (all, inner) => {
    const fixed = /\s!fixed\b/.test(inner);
    const span = amountSpan(inner.replace(/\s!fixed\b/, ''), scale, fixed);
    return span ? hold(span) : inner;
  });
  t = t.replace(/\{([\w-]+)(?::([\w]+))?\}/g, (all, id, part) => {
    const ing = byId[id];
    if (!ing) return all;
    const f = part && PORTIONS[part] ? PORTIONS[part] : 1;
    const amt = formatAmount(ing, scale * f, units);
    const name = esc(nameFor(ing, amt));
    return hold(amt ? `<span class="inline-amt"><b>${esc(amt)}</b> ${name}</span>` : `<span class="inline-amt">${name}</span>`);
  });
  t = t.replace(LOOSE_RE, all => {
    const span = amountSpan(all, scale, true);
    return span ? hold(span) : all;
  });
  t = esc(convertText(t, units));
  return t.replace(/[\uE000-\uF8FF]/g, c => parts[c.charCodeAt(0) - 0xE000]);
}

async function renderRecipe(slug) {
  app.innerHTML = '<p class="muted">Loading…</p>';
  let r;
  try { r = await loadRecipe(slug); }
  catch (e) { app.innerHTML = `<p>${esc(e.message)}. <a href="#/">Back to recipes</a></p>`; return; }
  document.title = r.title + ' · Recipe Book';

  let servings = store.get('servings:' + slug, r.yield);

  app.innerHTML = '<div id="rbody"></div><section id="my-notes" class="my-notes" aria-label="Notes"></section>';
  const body = $('#rbody', app);
  const notesEl = $('#my-notes', app);

  const draw = () => {
    const scale = servings / r.yield;
    const byId = Object.fromEntries(r.ingredients.map(i => [i.id, i]));
    const bigChange = scale >= 1.75 || scale <= 0.6;
    body.innerHTML = `
      <header class="top"><a href="#/" class="back" aria-label="All recipes">‹ Recipes</a></header>
      <h1>${esc(r.title)}</h1>
      ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ''}
      ${r.source || r.time ? `<p class="muted">${[
        r.source ? 'From ' + (r.url && /^https?:\/\//.test(r.url) ? `<a href="${esc(r.url)}" rel="noopener">${esc(r.source)}</a>` : esc(r.source)) : '',
        r.time ? esc(r.time) : '',
      ].filter(Boolean).join(' · ')}</p>` : ''}

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
              return `<li><label><input type="checkbox"> <span><b>${esc(amt)}</b> ${esc(convertText(nameFor(i, amt, true), units))}${i.flags.fixed && scale !== 1 ? ' <span class="muted">(not scaled)</span>' : ''}</span></label></li>`;
            }).join('')}</ul>`).join('')}
          ${r.equipment.length ? `<h3>Equipment</h3><ul class="plain">${r.equipment.map(e => `<li>${esc(convertText(e.text, units))}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="steps">
          <h2>Method</h2>
          <ol>${r.steps.map(s => `<li><p>${renderStep(s, r, scale)}</p></li>`).join('')}</ol>
          ${r.notes ? `<h3>Recipe notes</h3><p>${esc(r.notes)}</p>` : ''}
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
  renderNotes(slug, notesEl);
}

// ---------- notes ----------
const fmtDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } };

async function renderNotes(slug, el) {
  let notes = [];
  let status = 'Loading notes…';
  let signingIn = false;

  const draw = () => {
    el.innerHTML = `
      <h2>Our notes</h2>
      ${status ? `<p class="muted">${esc(status)}</p>` : ''}
      <ul class="note-list">${notes.map(n => `
        <li>
          <p>${esc(n.text).replace(/\n/g, '<br>')}</p>
          <div class="note-meta muted">${esc(fmtDate(n.date))}${n.author ? ' · ' + esc(n.author) : ''}
            ${auth.signedIn ? `<button class="link" data-del="${esc(n.id)}">Delete</button>` : ''}</div>
        </li>`).join('')}</ul>
      ${!status && !notes.length ? '<p class="muted">No notes yet.</p>' : ''}
      ${auth.signedIn ? `
        <form id="note-form" class="note-form">
          <textarea id="note-text" rows="3" placeholder="How did it go? What would you change next time?" required></textarea>
          <div class="row"><button type="submit" class="primary">Save note</button>
          <span class="muted">Saving as ${esc(auth.name || 'you')} · <button type="button" class="link" data-signout>Sign out</button></span></div>
        </form>` : signingIn ? `
        <form id="signin-form" class="note-form">
          <p>Notes are saved in your GitHub recipe book, so they show on every device. To save from this device, paste a GitHub key once:</p>
          <ol class="howto">
            <li>Open <a href="${TOKEN_URL}" target="_blank" rel="noopener">GitHub's new key page</a>.</li>
            <li>Name it "Recipe book", and set expiration to a year (or "No expiration").</li>
            <li>Under Repository access choose <b>Only select repositories</b> → <b>recipe-book</b>.</li>
            <li>Under Permissions → Repository permissions set <b>Contents</b> to <b>Read and write</b>.</li>
            <li>Click Generate, copy the key and paste it below.</li>
          </ol>
          <label>Your name <input id="si-name" value="${esc(auth.name)}" placeholder="Shown on your notes" required></label>
          <label>GitHub key <input id="si-token" type="password" autocomplete="off" placeholder="github_pat_…" required></label>
          <div class="row"><button type="submit" class="primary">Save key</button> <button type="button" class="link" data-cancel>Cancel</button></div>
        </form>` : `<button data-signin>Add a note</button>`}`;
  };

  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.signin != null) { signingIn = true; draw(); $('#si-name', el)?.focus(); }
    else if (b.dataset.cancel != null) { signingIn = false; draw(); }
    else if (b.dataset.signout != null) { auth.signOut(); draw(); }
    else if (b.dataset.del && confirm('Delete this note?')) {
      status = 'Deleting…'; draw();
      try { notes = await deleteNote(slug, b.dataset.del); status = ''; } catch (err) { status = err.message; }
      draw();
    }
  });

  el.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'signin-form') {
      const token = $('#si-token', el).value, name = $('#si-name', el).value;
      status = 'Checking key…'; draw(); $('#si-name', el).value = name; $('#si-token', el).value = token;
      const ok = await checkToken(token).catch(() => false);
      if (!ok) {
        status = 'That key didn\'t work. Check that it has Contents: Read and write on recipe-book.';
        draw(); $('#si-name', el).value = name; $('#si-token', el).value = token; return;
      }
      auth.save(token, name); signingIn = false; status = '';
      draw();
    } else if (e.target.id === 'note-form') {
      const text = $('#note-text', el).value;
      if (!text.trim()) return;
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving…';
      try { notes = await addNote(slug, text); status = ''; draw(); }
      catch (err) { status = err.message; btn.disabled = false; btn.textContent = 'Save note'; draw(); $('#note-text', el).value = text; }
    }
  });

  draw();
  try { notes = await loadNotes(slug); status = ''; } catch (err) { status = err.message; }
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
