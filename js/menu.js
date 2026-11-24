// Menu (saved on this device) and the combined shopping list built from it.
import { UNITS, densityFor, shortName, singular, plural, formatAmount, fraction } from './units.js';

// ---------- menu storage ----------
const KEY = 'rb:menu';
export function getMenu() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function saveMenu(menu) {
  try { localStorage.setItem(KEY, JSON.stringify(menu)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('menuchange'));
}
export function addToMenu(slug, servings) {
  const menu = getMenu();
  const item = menu.find(m => m.slug === slug);
  if (item) item.servings = servings; else menu.push({ slug, servings, make: {} });
  saveMenu(menu);
}
export function removeFromMenu(slug) {
  saveMenu(getMenu().filter(m => m.slug !== slug));
}

// ---------- amounts ----------
// The best base amount for an ingredient line: mass if known (most accurate), else volume, else a count.
function baseAmounts(ing) {
  if (ing.qty == null) return null;
  const all = [{ qty: ing.qty, unit: ing.unit }, ...(ing.alts || [])];
  const masses = all.filter(a => a.unit && UNITS[a.unit].kind === 'mass');
  const mass = masses.find(a => UNITS[a.unit].sys === 'metric') || masses[0]; // grams are the most precise
  const vol = all.find(a => a.unit && UNITS[a.unit].kind === 'volume');
  const out = { ratio: ing.qtyMax != null ? ing.qtyMax / ing.qty : 1 };
  // Spoon-measured amounts stay as spoons on the list.
  if (mass && !(ing.unit && UNITS[ing.unit].sys === 'spoon')) out.mass = mass.qty * UNITS[mass.unit].f;
  if (vol) out.volume = vol.qty * UNITS[vol.unit].f;
  if (!ing.unit) out.count = ing.qty;
  return out;
}

// ---------- names ----------
const PREP = /\b(chopped|diced|minced|sliced|fresh|freshly|finely|roughly|crumbled|melted|softened|peeled|cubed|halved|large|medium|small|whole|ripe|boneless|skinless|packed|firmly|warm|cold|room-temperature|plain or|homemade)\b/gi;

export function itemName(ing) {
  let n = shortName(ing).replace(PREP, ' ').replace(/\s+/g, ' ').trim();
  if (/garlic/i.test(n)) n = 'garlic cloves';
  return n || shortName(ing);
}
function keyFor(name) {
  return singular(name.toLowerCase()).replace(/[^a-zæøåäöüéèñ ]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- store sections ----------
const SECTIONS = [
  ['Frozen', /\bfrozen\b/],
  ['Pantry', /stock|broth|paste|sauce|\boil\b|vinegar|canned|tinned/],
  ['Produce', /garlic|onion|shallot|carrot|celery|mushroom|potato|squash|pumpkin|lime|lemon|orange|apple|tomatillo|tomato(?! paste)|jalape|chil|pepper(?!corn)s?\b(?<!salt and pepper)|cilantro|parsley|basil|mint|herb|ginger root|lettuce|spinach|cabbage|leek|zucchini|courgette|avocado|banana|berr/],
  ['Meat & fish', /chicken|pork|beef|lamb|bacon|sausage|turkey|fish|salmon|shrimp|prawn|mince/],
  ['Dairy & eggs', /milk|cream|butter|cheese|cheddar|parmesan|queso|egg|yogurt|yoghurt|crème/],
  ['Bread & tortillas', /tortilla|bread|bun|pita|wrap|pie dough|pastry/],
  ['Spices & herbs', /\bground\b|salt|pepper|cinnamon|nutmeg|clove|thyme|oregano|bay lea|cumin|paprika|chili powder|vanilla/],
  ['Baking', /flour|sugar|baking|yeast|cocoa|chocolate|syrup|honey|cornstarch/],
  ['Pantry', /.*/],
];
export const SECTION_ORDER = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bread & tortillas', 'Frozen', 'Pantry', 'Baking', 'Spices & herbs'];
function sectionFor(name) {
  const n = name.toLowerCase();
  return SECTIONS.find(([, re]) => re.test(n))[0];
}

// ---------- sub-recipes ----------
// How many batches of a linked recipe are needed for this ingredient amount.
function batchesFor(ing, scale, sub) {
  const unit = sub.yieldUnit && (UNITS[sub.yieldUnit] ? sub.yieldUnit : Object.keys(UNITS).find(u => sub.yieldUnit.replace(/s$/, '') === u));
  const b = baseAmounts(ing);
  if (unit && b) {
    const yieldBase = sub.yield * UNITS[unit].f;
    if (UNITS[unit].kind === 'volume' && b.volume) return (b.volume * scale) / yieldBase;
    if (UNITS[unit].kind === 'mass' && b.mass) return (b.mass * scale) / yieldBase;
  }
  return Math.max(1, Math.ceil(scale)); // fall back to whole batches
}

// Expand the menu into a flat list of { recipe, scale, forTitle } including sub-recipes being made.
export function expandMenu(menu, recipes) {
  const bySlug = Object.fromEntries(recipes.map(r => [r.slug, r]));
  const out = [];
  const walk = (r, scale, make, forTitle, depth) => {
    out.push({ recipe: r, scale, forTitle, make, depth });
    for (const ing of r.ingredients) {
      if (ing.link && make[`${r.slug}:${ing.id}`] && bySlug[ing.link] && depth < 4) {
        const sub = bySlug[ing.link];
        walk(sub, batchesFor(ing, scale, sub), make, r.title, depth + 1);
      }
    }
  };
  for (const m of menu) {
    const r = bySlug[m.slug];
    if (r) walk(r, m.servings / r.yield, m.make || {}, null, 0);
  }
  return out;
}

// ---------- shopping list ----------
export function buildShoppingList(menu, recipes) {
  const items = new Map();
  for (const { recipe, scale, make } of expandMenu(menu, recipes)) {
    for (const ing of recipe.ingredients) {
      if (ing.link && make[`${recipe.slug}:${ing.id}`]) continue; // made from scratch: its ingredients are listed instead
      if (ing.flags.made) continue; // made in an earlier step of the recipe
      const s = ing.flags.fixed ? 1 : scale;
      const name = ing.qty == null ? ing.name.replace(/\s*\(optional\)/i, '') : itemName(ing);
      const key = keyFor(name);
      let it = items.get(key);
      if (!it) items.set(key, it = { key, name, mass: 0, volume: 0, count: 0, volEq: 0, volEqOk: true, uncounted: false, whole: false, dens: densityFor(name), from: new Set(), section: sectionFor(name), optional: /optional/i.test(ing.name) });
      it.from.add(recipe.title);
      if (!/optional/i.test(ing.name)) it.optional = false;
      const b = baseAmounts(ing);
      if (!b) { it.uncounted = true; continue; }
      const r = b.ratio; // use the top of a range
      if (b.volume != null) it.volEq += b.volume * s * r; else it.volEqOk = false;
      if (b.mass != null) it.mass += b.mass * s * r;
      else if (b.volume != null) it.volume += b.volume * s * r;
      else { it.count += b.count * s * r; if (ing.flags.whole) it.whole = true; }
    }
  }
  return [...items.values()];
}

// Text for one shopping list amount. mode: 'metric' | 'us'
export function formatItem(it, mode) {
  const parts = [];
  let { mass, volume } = it;
  // In US mode, use cups when every recipe gave a volume (e.g. "32 oz (4 cups; 910 g) milk").
  if (mode === 'us' && it.volEqOk && it.volEq && mass && !it.count) { mass = 0; volume = it.volEq; }
  if (mass && volume && it.dens) { mass += volume * it.dens.d; volume = 0; }
  const fmt = (qty, unit) => formatAmount({ qty, unit, name: it.name, flags: {}, alts: null }, 1, mode);
  if (mass) parts.push(fmt(mass, 'g'));
  if (volume) parts.push(fmt(volume, 'ml'));
  if (it.count) parts.push(String(Math.ceil(it.count - 0.01)));
  return parts.join(' + ');
}

export function itemLabel(it) {
  // Plural/singular agreement for counted items.
  if (it.count && !it.mass && !it.volume) {
    const n = Math.ceil(it.count - 0.01);
    return n <= 1 ? singular(it.name) : (singular(it.name) === it.name ? plural(it.name) : it.name);
  }
  return it.name;
}

export { fraction };
