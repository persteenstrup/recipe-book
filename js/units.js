// Quantities, units, densities, conversion and kitchen-friendly rounding.

const UNICODE_FRACTIONS = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875, '⅕': .2 };

// kind: mass (grams) | volume (millilitres). sys: metric | us
export const UNITS = {
  mg: { kind: 'mass', f: 0.001, sys: 'metric' },
  g: { kind: 'mass', f: 1, sys: 'metric' },
  kg: { kind: 'mass', f: 1000, sys: 'metric' },
  oz: { kind: 'mass', f: 28.3495, sys: 'us' },
  lb: { kind: 'mass', f: 453.592, sys: 'us' },
  ml: { kind: 'volume', f: 1, sys: 'metric' },
  cl: { kind: 'volume', f: 10, sys: 'metric' },
  dl: { kind: 'volume', f: 100, sys: 'metric' },
  l: { kind: 'volume', f: 1000, sys: 'metric' },
  tsp: { kind: 'volume', f: 4.92892, sys: 'spoon' },
  tbsp: { kind: 'volume', f: 14.7868, sys: 'spoon' },
  cup: { kind: 'volume', f: 236.588, sys: 'us' },
  'fl oz': { kind: 'volume', f: 29.5735, sys: 'us' },
  pint: { kind: 'volume', f: 473.176, sys: 'us' },
  quart: { kind: 'volume', f: 946.353, sys: 'us' },
  gallon: { kind: 'volume', f: 3785.41, sys: 'us' },
};

const ALIASES = {
  milligram: 'mg', milligrams: 'mg', gram: 'g', grams: 'g', gr: 'g', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
  millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp', t: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', T: 'tbsp',
  cups: 'cup', c: 'cup', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', floz: 'fl oz', 'fl. oz': 'fl oz',
  pints: 'pint', pt: 'pint', quarts: 'quart', qt: 'quart', gallons: 'gallon', gal: 'gallon',
};

// Grams per millilitre for common ingredients. "dry" ones are weighed in metric kitchens.
// Longer names are matched first, so "brown sugar" wins over "sugar".
const DENSITIES = [
  ['almond flour', .40, true], ['bread flour', .54, true], ['whole wheat flour', .51, true], ['wholemeal flour', .51, true],
  ['rye flour', .43, true], ['cake flour', .48, true], ['self-raising flour', .53, true], ['self-rising flour', .53, true],
  ['flour', .53, true], ['cornstarch', .54, true], ['cornflour', .54, true], ['corn starch', .54, true],
  ['brown sugar', .93, true], ['powdered sugar', .51, true], ['icing sugar', .51, true], ['confectioners', .51, true],
  ['caster sugar', .85, true], ['sugar', .85, true], ['cocoa', .36, true], ['chocolate chips', .72, true],
  ['rolled oats', .38, true], ['oats', .38, true], ['rice', .78, true], ['quinoa', .72, true], ['lentils', .82, true],
  ['breadcrumbs', .45, true], ['panko', .25, true], ['parmesan', .42, true], ['grated cheese', .47, true], ['shredded', .47, true],
  ['raisins', .63, true], ['walnuts', .5, true], ['pecans', .45, true], ['almonds', .6, true], ['nuts', .55, true],
  ['butter', .96, true], ['baking powder', .81, true], ['baking soda', .96, true], ['bicarbonate', .96, true],
  ['salt', 1.2, true], ['yeast', .6, true], ['honey', 1.42, true], ['maple syrup', 1.32, true], ['syrup', 1.37, true],
  ['peanut butter', 1.08, true], ['condensed milk', 1.14, false], ['evaporated milk', 1.07, false], ['yogurt', 1.03, false], ['yoghurt', 1.03, false],
  ['cream', 1.0, false], ['milk', 1.03, false], ['water', 1.0, false], ['stock', 1.0, false], ['broth', 1.0, false],
  ['oil', .92, false], ['wine', .99, false], ['vinegar', 1.01, false], ['juice', 1.04, false],
].sort((a, b) => b[0].length - a[0].length);

export function densityFor(name) {
  const n = name.toLowerCase();
  for (const [k, d, dry] of DENSITIES) if (n.includes(k)) return { d, dry };
  return null;
}

// "2 1/4", "3/4", "1.5", "1,5", "½", "1½", "1-2"
export const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅛⅜⅝⅞⅕]|\d+(?:[.,]\d+)?)`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*`);

export function parseNumber(s) {
  s = s.trim().replace(',', '.');
  let total = 0;
  const uni = s.match(/[½⅓⅔¼¾⅛⅜⅝⅞⅕]/);
  if (uni) { total += UNICODE_FRACTIONS[uni[0]]; s = s.replace(uni[0], '').trim(); }
  for (const part of s.split(/\s+/).filter(Boolean)) {
    if (part.includes('/')) { const [a, b] = part.split('/').map(Number); total += a / b; }
    else total += Number(part);
  }
  return total;
}

function matchUnit(rest) {
  // Try two-word units first ("fl oz", "fluid ounces"), then one word. Unit must be followed by space/end/period.
  const words = rest.split(/\s+/);
  for (const n of [2, 1]) {
    if (words.length < n) continue;
    let cand = words.slice(0, n).join(' ').replace(/\.$/, '');
    const key = UNITS[cand] ? cand : ALIASES[cand] || ALIASES[cand.toLowerCase()] || (UNITS[cand.toLowerCase()] ? cand.toLowerCase() : null);
    // Single-letter aliases (t, T, c) are only units when followed by more text.
    if (key && !(['t', 'T', 'c'].includes(cand) && words.length === n)) {
      return { unit: key, rest: words.slice(n).join(' ') };
    }
  }
  return { unit: null, rest };
}

export function parseIngredientLine(line) {
  let text = line.trim();
  const flags = {};
  text = text.replace(/\s!(fixed|whole|warn)\b/g, (_, f) => { flags[f] = true; return ''; }).trim();

  const ing = { raw: line, qty: null, qtyMax: null, unit: null, name: text, flags };
  const m = text.match(QTY_RE);
  if (!m) return ing;
  ing.qty = parseNumber(m[1]);
  if (m[2]) ing.qtyMax = parseNumber(m[2]);
  let rest = text.slice(m[0].length);
  const u = matchUnit(rest);
  ing.unit = u.unit;
  ing.name = u.rest.replace(/^of\s+/, '');
  // Link to another recipe in the book: "19 oz sweetened condensed milk @sweetened-condensed-milk"
  ing.name = ing.name.replace(/\s@([\w-]+)\b/, (_, slug) => { ing.link = slug; return ''; }).trim();
  // Alternate amounts in brackets right after the unit: "1/2 cup (8 g) cilantro", "32 oz (4 cups; 910 g) milk".
  const alt = ing.unit && ing.name.match(/^\(([^()]*)\)\s*/);
  if (alt) {
    const alts = alt[1].split(';').map(part => {
      const m = part.trim().replace(/^about\s+/i, '').match(QTY_RE);
      if (!m || m[2]) return null;
      const au = matchUnit(part.trim().replace(/^about\s+/i, '').slice(m[0].length));
      return au.unit && !au.rest ? { qty: parseNumber(m[1]), unit: au.unit } : null;
    });
    if (alts.length && alts.every(Boolean)) {
      ing.alts = alts;
      ing.name = ing.name.slice(alt[0].length);
    }
  }
  if (/\begg(s)?\b/i.test(ing.name) && !ing.unit) flags.whole = true;
  return ing;
}

// ---------- formatting ----------

const FRACS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];

export function fraction(x, allowed = [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1]) {
  let whole = Math.floor(x);
  let frac = x - whole;
  let best = allowed[0];
  for (const a of allowed) if (Math.abs(frac - a) < Math.abs(frac - best)) best = a;
  if (best === 1) { whole += 1; best = 0; }
  const sym = FRACS.find(([v]) => Math.abs(v - best) < 1e-6)?.[1] ?? '';
  if (!whole && !sym) return '0';
  return (whole ? String(whole) : '') + sym;
}

function roundTo(x, step) { return Math.round(x / step) * step; }

function trimNum(x, dp = 2) { return String(Number(x.toFixed(dp))); }

function fmtMetricMass(g) {
  if (g >= 1000) return { n: trimNum(roundTo(g, 50) / 1000), u: 'kg' };
  if (g < 10) return { n: trimNum(roundTo(g, 0.5), 1), u: 'g' };
  if (g < 50) return { n: String(Math.round(g)), u: 'g' };
  if (g < 1000) return { n: String(roundTo(g, 5)), u: 'g' };
  return { n: String(roundTo(g, 10)), u: 'g' };
}

function fmtMetricVolume(ml) {
  if (ml >= 1000) return { n: trimNum(roundTo(ml, 50) / 1000), u: 'l' };
  if (ml < 50) return { n: String(Math.max(1, Math.round(ml))), u: 'ml' };
  if (ml < 250) return { n: String(roundTo(ml, 5)), u: 'ml' };
  return { n: String(roundTo(ml, 10)), u: 'ml' };
}

function fmtSpoon(ml) {
  // Spoons are shared by both systems; good for small amounts.
  const tsp = ml / UNITS.tsp.f;
  if (tsp < 2.9) return { n: fraction(tsp, [0, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1]), u: 'tsp' };
  const tbsp = ml / UNITS.tbsp.f;
  return { n: fraction(tbsp, [0, 1 / 2, 1]), u: 'tbsp' };
}

function fmtUsVolume(ml) {
  if (ml < UNITS.cup.f / 4 - 1) return fmtSpoon(ml);
  const cups = ml / UNITS.cup.f;
  const allowed = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
  if (cups < 1) {
    const nearest = allowed.reduce((b, a) => Math.abs(cups - a) < Math.abs(cups - b) ? a : b);
    if (Math.abs(nearest - cups) / cups > 0.06) return fmtSpoon(ml); // e.g. ⅜ cup reads better as 6 tbsp
  }
  const n = fraction(cups, allowed);
  return { n, u: /^(1|[¼⅓½⅔¾])$/.test(n) ? 'cup' : 'cups' };
}

function fmtUsMass(g, keepOz = false) {
  const oz = g / UNITS.oz.f;
  if (oz < 16 || keepOz) return { n: oz < 4 ? fraction(oz, [0, 1 / 4, 1 / 2, 3 / 4, 1]) : String(Math.round(oz)), u: 'oz' };
  const lb = Math.floor(oz / 16);
  const rem = Math.round(oz - lb * 16);
  if (rem === 0 || rem === 16) return { n: String(rem === 16 ? lb + 1 : lb), u: 'lb' };
  return { n: `${lb} lb ${rem}`, u: 'oz' };
}

function fmtCount(x, whole) {
  if (whole) return String(Math.max(1, Math.round(x)));
  return fraction(x, [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1]);
}

// Convert an amount for display. mode: 'original' | 'metric' | 'us'
export function convert(ing, qty, mode) {
  const u = ing.unit ? UNITS[ing.unit] : null;
  // Prefer the author's own alternate amounts (e.g. "1/2 cup (8 g)") over estimates from densities.
  if (u && ing.alts && mode !== 'original' && !(u.sys === 'spoon' && mode === 'metric' && qty * u.f <= 45)) {
    const all = [{ qty: ing.qty, unit: ing.unit }, ...ing.alts];
    const pick = mode === 'metric'
      ? all.find(a => UNITS[a.unit].sys === 'metric')
      : all.find(a => UNITS[a.unit].sys !== 'metric' && UNITS[a.unit].kind === 'volume') || all.find(a => UNITS[a.unit].sys === 'us');
    if (pick && pick !== all[0]) {
      const a = UNITS[pick.unit];
      const base = pick.qty * (qty / ing.qty) * a.f;
      if (a.kind === 'mass') return mode === 'us' ? fmtUsMass(base) : fmtMetricMass(base);
      return mode === 'us' ? fmtUsVolume(base) : (base <= 45 ? fmtSpoon(base) : fmtMetricVolume(base));
    }
  }
  if (!u) return { n: fmtCount(qty, ing.flags.whole), u: '' };

  const base = qty * u.f; // grams or ml
  const dens = densityFor(ing.name);
  let target = mode;
  if (mode === 'original') target = u.sys === 'spoon' ? 'spoon' : u.sys;

  if (u.kind === 'mass') {
    if (target === 'us' && dens && mode === 'us') {
      return fmtUsVolume(base / dens.d);
    }
    if (target === 'us') return fmtUsMass(base, mode === 'original' && ing.unit === 'oz');
    return fmtMetricMass(base);
  }

  // volume
  if (target === 'spoon') {
    return base < UNITS.cup.f / 4 - 1 ? fmtSpoon(base) : fmtUsVolume(base);
  }
  if (target === 'us') return fmtUsVolume(base);
  // metric
  if (base <= 45) return fmtSpoon(base); // small amounts stay in spoons
  if (dens && dens.dry && mode === 'metric') return fmtMetricMass(base * dens.d);
  return fmtMetricVolume(base);
}

export function formatAmount(ing, scale, mode) {
  if (ing.qty == null) return '';
  const s = ing.flags.fixed ? 1 : scale;
  const a = convert(ing, ing.qty * s, mode);
  let str = a.u ? `${a.n} ${a.u}` : a.n;
  if (ing.qtyMax != null) {
    const b = convert(ing, ing.qtyMax * s, mode);
    str = b.u === a.u ? `${a.n}–${b.n}${a.u ? ' ' + a.u : ''}` : `${str}–${b.u ? `${b.n} ${b.u}` : b.n}`;
  }
  return str;
}

// Ingredient name without trailing prep notes (", softened").
export function shortName(ing) {
  return ing.name.replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
}

// "medium onions" -> "medium onion" when the amount is one or less.
export function singular(name) {
  return name.replace(/\b([A-Za-zñé]{3,})\b/g, w => {
    const l = w.toLowerCase();
    if (l === 'leaves') return w.slice(0, -3) + 'f';
    if (/(ss|us|is|ous)$/.test(l) || !l.endsWith('s')) return w;
    if (/toes$/.test(l)) return w.slice(0, -2);
    if (/ies$/.test(l)) return w.slice(0, -3) + 'y';
    if (/(ches|shes)$/.test(l)) return w.slice(0, -2);
    return w.slice(0, -1);
  });
}

// Display name for an amount: singular for counts of one or less.
export function plural(name) {
  return name.replace(/([A-Za-zñé]+)$/, w => {
    const l = w.toLowerCase();
    if (l === 'leaf') return w.slice(0, -1) + 'ves';
    if (/(tomato|potato)$/.test(l)) return w + 'es';
    if (/[^aeiou]y$/.test(l)) return w.slice(0, -1) + 'ies';
    if (/(s|x|ch|sh)$/.test(l)) return w + 'es';
    return w + 's';
  });
}

export function nameFor(ing, amountText, full = false) {
  const short = shortName(ing);
  if (ing.unit || !amountText) return full ? ing.name : short;
  const v = parseNumber(amountText.split(/[–-]/).pop());
  let head = short;
  if (v > 0 && v <= 1) head = singular(short);
  else if (v > 1 && ing.qty <= 1) head = plural(short);
  if (!full) return head;
  return ing.name.startsWith(short) ? head + ing.name.slice(short.length) : ing.name;
}

// Temperatures and lengths inside free text.
export function convertText(text, mode) {
  if (mode === 'original') return text;
  const toIn = v => fraction(v / 2.54, [0, 1 / 2, 1]);
  return text
    // "275°F (135°C)": keep only the one for this mode
    .replace(/(\d+)\s*°\s*([CF])\s*\(\s*(\d+)\s*°\s*([CF])\s*\)/g, (all, a, ua, b, ub) =>
      (mode === 'us' ? (ua === 'F' ? a : b) : (ua === 'C' ? a : b)) + ` °${mode === 'us' ? 'F' : 'C'}`)
    // "9- by 13-inch", "9 x 13 inch", "20 x 30 cm"
    .replace(/(\d+(?:[.,]\d+)?)\s*-?\s*(?:by|x|×)\s*(\d+(?:[.,]\d+)?)\s*-?\s*(cm|inch(?:es)?|in\b|")/g, (all, a, b, unit) => {
      const [x, y] = [a, b].map(v => Number(v.replace(',', '.')));
      if (mode === 'us' && unit === 'cm') return `${toIn(x)} by ${toIn(y)} inch`;
      if (mode === 'metric' && unit !== 'cm') return `${Math.round(x * 2.54)} by ${Math.round(y * 2.54)} cm`;
      return all;
    })
    .replace(/(\d+(?:[.,]\d+)?)\s*°\s*([CF])\b/g, (all, n, unit) => {
      const v = Number(n.replace(',', '.'));
      if (mode === 'us' && unit === 'C') return `${roundTo(v * 9 / 5 + 32, 5)} °F`;
      if (mode === 'metric' && unit === 'F') return `${roundTo((v - 32) * 5 / 9, 5)} °C`;
      return all;
    })
    .replace(/(\d+(?:[.,]\d+)?)(\s*-?\s*)(cm|inch|inches|in\.|")(?=[\s,.)x×]|$)/g, (all, n, sep, unit) => {
      const v = Number(n.replace(',', '.'));
      const dash = sep.includes('-') ? '-' : ' ';
      if (mode === 'us' && unit === 'cm') return `${toIn(v)}${dash}inch`;
      if (mode === 'metric' && unit !== 'cm') return `${Math.round(v * 2.54)}${dash}cm`;
      return all;
    });
}
