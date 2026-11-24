// Recipe notes, stored as notes/<slug>.json in the GitHub repository.
// Everyone can read them through the website. Writing needs a GitHub token
// (fine-grained, "Contents: read and write" on this repository only), saved on that device.

const OWNER = 'persteenstrup';
const REPO = 'recipe-book';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

const ls = {
  get(k) { try { return localStorage.getItem('rb:' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('rb:' + k) : localStorage.setItem('rb:' + k, v); } catch { /* ignore */ } },
};

export const auth = {
  get token() { return ls.get('gh-token'); },
  get name() { return ls.get('gh-name') || ''; },
  get signedIn() { return !!ls.get('gh-token'); },
  save(token, name) { ls.set('gh-token', token.trim()); ls.set('gh-name', name.trim()); },
  signOut() { ls.set('gh-token', null); },
};

const b64encode = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));

function headers() {
  return { Authorization: `Bearer ${auth.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

// Read through the GitHub API when signed in (always fresh), otherwise from the website.
async function readFile(slug) {
  const path = `notes/${encodeURIComponent(slug)}.json`;
  if (auth.signedIn) {
    const res = await fetch(`${API}/${path}?ref=${BRANCH}`, { headers: headers(), cache: 'no-store' });
    if (res.status === 404) return { notes: [], sha: null };
    if (res.status === 401) throw new Error('Your GitHub key was not accepted. Sign in again.');
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
    const j = await res.json();
    return { notes: JSON.parse(b64decode(j.content)), sha: j.sha };
  }
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) return { notes: [], sha: null };
  try { return { notes: await res.json(), sha: null }; } catch { return { notes: [], sha: null }; }
}

export async function loadNotes(slug) {
  return (await readFile(slug)).notes;
}

// Apply a change to the latest version of the file and save it. Retries once if someone saved in between.
async function update(slug, change, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { notes, sha } = await readFile(slug);
    const next = change(notes);
    const res = await fetch(`${API}/notes/${encodeURIComponent(slug)}.json`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, branch: BRANCH, content: b64encode(JSON.stringify(next, null, 2) + '\n'), ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return next;
    if ((res.status === 409 || res.status === 422) && attempt === 0) continue;
    if (res.status === 401 || res.status === 403) throw new Error('GitHub refused the save. Check that your key can write to the recipe-book repository.');
    throw new Error(`Saving failed (GitHub error ${res.status}).`);
  }
}

export function addNote(slug, text) {
  const note = { id: Date.now().toString(36), date: new Date().toISOString().slice(0, 10), author: auth.name, text: text.trim() };
  return update(slug, notes => [...notes, note], `Add note to ${slug}`);
}

export function deleteNote(slug, id) {
  return update(slug, notes => notes.filter(n => n.id !== id), `Remove note from ${slug}`);
}

export async function checkToken(token) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return false;
  const j = await res.json();
  return !!(j.permissions && j.permissions.push);
}

export const TOKEN_URL = `https://github.com/settings/personal-access-tokens/new`;
