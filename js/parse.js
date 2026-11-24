// Parser for the recipe text format described in FORMAT.md.
// A forgiving, line-based subset of YAML: top-level "key: value" pairs,
// "- item" lists, and "id: ingredient line" maps (optionally grouped one level).

import { parseIngredientLine } from './units.js';

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function stripComment(line) {
  // Remove "# comment" only when preceded by whitespace (keeps "#" inside text like "No. #1" rare cases).
  const m = line.match(/^(.*?)\s+#\s.*$/);
  return m ? m[1] : line;
}

function parseScalar(v) {
  v = v.trim();
  if (/^\[.*\]$/.test(v)) {
    return v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function parseRecipe(text, slug = '') {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
    .map(stripComment)
    .filter(l => l.trim() !== '' && !l.trim().startsWith('#'));

  const recipe = { slug, title: slug, tags: [], ingredients: [], groups: [], equipment: [], steps: [], notes: '' };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (indentOf(line) !== 0) { i++; continue; }
    const m = line.match(/^([A-Za-z_][\w ]*?):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1].trim().toLowerCase();
    const rest = m[2];
    i++;

    // Collect the indented block that belongs to this key.
    const block = [];
    while (i < lines.length && indentOf(lines[i]) > 0) block.push(lines[i++]);

    if (key === 'ingredients') {
      parseIngredients(block, recipe);
    } else if (key === 'steps' || key === 'equipment') {
      recipe[key] = parseList(block);
    } else if (key === 'notes' && rest.trim() === '|') {
      recipe.notes = block.map(l => l.trim()).join('\n');
    } else {
      recipe[key] = parseScalar(rest);
    }
  }

  if (typeof recipe.tags === 'string') recipe.tags = [recipe.tags];
  // Yield: "serves" or "makes"
  if (recipe.serves != null) { recipe.yield = Number(recipe.serves) || 1; recipe.yieldLabel = 'serves'; }
  else if (recipe.makes != null) { recipe.yield = Number(recipe.makes) || 1; recipe.yieldLabel = 'makes'; }
  else { recipe.yield = 1; recipe.yieldLabel = 'batch'; }

  recipe.equipment = recipe.equipment.map(e => {
    const warn = /\s!warn\b/.test(e);
    return { text: e.replace(/\s!warn\b/, '').trim(), warn };
  });
  return recipe;
}

function parseList(block) {
  const items = [];
  for (const l of block) {
    const t = l.trim();
    if (t.startsWith('- ')) items.push(t.slice(2).trim());
    else if (items.length) items[items.length - 1] += ' ' + t; // continuation line
  }
  return items;
}

function parseIngredients(block, recipe) {
  if (!block.length) return;
  const base = indentOf(block[0]);
  let group = null;
  for (const l of block) {
    const ind = indentOf(l);
    const t = l.trim();
    const m = t.match(/^([^:]+?):\s*(.*)$/);
    if (ind === base && m && m[2] === '') {
      group = { name: m[1].trim(), ids: [] };
      recipe.groups.push(group);
      continue;
    }
    let id, body;
    if (m && /^[\w-]+$/.test(m[1].trim())) { id = m[1].trim(); body = m[2]; }
    else if (t.startsWith('- ')) { body = t.slice(2); id = 'item' + recipe.ingredients.length; }
    else continue;
    const ing = parseIngredientLine(body);
    ing.id = id;
    recipe.ingredients.push(ing);
    if (group) group.ids.push(id);
  }
  if (!recipe.groups.length) recipe.groups.push({ name: '', ids: recipe.ingredients.map(x => x.id) });
}

export function parseIndex(text) {
  return text.split('\n').map(l => l.replace(/#.*/, '').trim())
    .filter(l => l.startsWith('- ')).map(l => l.slice(2).trim()).filter(Boolean);
}
