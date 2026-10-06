// WorldMapAI — aggiornamento settimanale automatico di worldmapai.json
// Gira su GitHub Actions (vedi .github/workflows/update-worldmapai.yml). Node 20+, nessuna dipendenza.
//
// Come funziona:
//  1. per ogni strumento cerca sul web le informazioni recenti (Tavily: prezzi, se è ancora gratuito senza account);
//  2. cerca anche strumenti nuovi (2 ricerche);
//  3. chiede a Gemini (piano gratuito) di proporre SOLO modifiche supportate da una fonte;
//  4. applica al massimo MAX_CHANGES modifiche, controlla che i link funzionino e salva.
// Sicurezze: se qualcosa va storto il file non viene toccato; uno strumento viene tolto solo se il link non risponde
// per 2 settimane di fila; i nuovi strumenti entrano solo se il loro sito risponde.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'worldmapai.json');
const TAVILY_KEY = process.env.TAVILY_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_CHANGES = parseInt(process.env.MAX_CHANGES || '10', 10);
const MAX_TOOLS = 60;
const DRY_RUN = process.env.DRY_RUN === '1';
const today = new Date().toISOString().slice(0, 10);
const year = today.slice(0, 4);

const log = (...a) => console.log('[worldmapai]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withTimeout(p, ms, what) {
  let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(what + ': tempo scaduto')), ms); });
  try { return await Promise.race([p, timer]); } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- Tavily
async function tavily(query) {
  const r = await withTimeout(fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TAVILY_KEY },
    body: JSON.stringify({ api_key: TAVILY_KEY, query, search_depth: 'basic', max_results: 4, include_answer: false })
  }), 30000, 'Tavily');
  if (!r.ok) throw new Error('Tavily HTTP ' + r.status);
  const j = await r.json();
  return (j.results || []).map((x) => ({ url: x.url, title: x.title, text: String(x.content || '').slice(0, 700) }));
}

// ---------------------------------------------------------------- Gemini
async function gemini(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODEL) + ':generateContent';
  const r = await withTimeout(fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } })
  }), 90000, 'Gemini');
  if (!r.ok) throw new Error('Gemini HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return JSON.parse(text.replace(/^```json\s*|```$/g, '').trim());
}

// ---------------------------------------------------------------- link
async function ping(url) {
  const once = (method) => withTimeout(fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 WorldMapAI-bot' } }), 15000, 'link');
  try {
    let r = await once('HEAD');
    if ([403, 405, 501].includes(r.status)) r = await once('GET');
    return r.status < 400 || r.status === 403 || r.status === 429;
  } catch { return false; }
}

// ---------------------------------------------------------------- validazione
const CATS = ['Chat e assistenti', 'Ricerca', 'Immagini', 'Video', 'Audio e voce', 'Scrittura e traduzione', 'Grafica e design',
  'Programmazione', 'Siti e app', 'Presentazioni e documenti', 'Riunioni e produttività', 'Marketing', 'Laboratorio'];
function cleanTool(t) {
  if (!t || typeof t !== 'object') return null;
  const name = String(t.name || '').trim().slice(0, 60);
  const url = String(t.url || '').trim();
  if (!name || !/^https:\/\/[^\s]+$/i.test(url)) return null;
  const id = String(t.id || name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return {
    id, name, url,
    category: CATS.includes(t.category) ? t.category : 'Laboratorio',
    free: t.free === true,
    desc: String(t.desc || '').trim().slice(0, 300),
    price: String(t.price || '').trim().slice(0, 140) || (t.free === true ? 'Gratis, senza account' : 'Prezzo da verificare sul sito'),
    verified: /^\d{4}-\d{2}-\d{2}$/.test(t.verified || '') ? t.verified : ''
  };
}

// ---------------------------------------------------------------- principale
async function main() {
  const raw = await fs.readFile(FILE, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.tools)) throw new Error('worldmapai.json non valido');
  if (!TAVILY_KEY || !GEMINI_KEY) { log('Chiavi mancanti (TAVILY_API_KEY / GEMINI_API_KEY): nessuna modifica.'); return; }

  // 1) ricerche per ogni strumento
  const evidence = {};
  for (const t of data.tools) {
    const q = t.free
      ? `${t.name} AI free without account login ${year}`
      : `${t.name} pricing plans per month ${year}`;
    try { evidence[t.id] = await tavily(q); } catch (e) { log('Ricerca fallita per', t.name, e.message); evidence[t.id] = []; }
    await sleep(300);
  }
  // 2) ricerche di strumenti nuovi
  const discovery = [];
  for (const q of [`best new free AI tools no sign up required ${year}`, `new AI tools for designers and web agencies launched this month ${year}`]) {
    try { discovery.push(...await tavily(q)); } catch (e) { log('Ricerca novità fallita', e.message); }
  }

  // 3) Gemini in blocchi da 12 strumenti
  const proposals = { updates: [], additions: [] };
  const ids = data.tools.map((t) => t.id);
  for (let i = 0; i < data.tools.length; i += 12) {
    const block = data.tools.slice(i, i + 12).map((t) => ({ tool: t, evidence: evidence[t.id] || [] }));
    const prompt = `Sei il curatore di un elenco italiano di strumenti AI. Oggi è ${today}.
Per ogni strumento qui sotto hai le informazioni attuali e alcuni risultati di ricerca web.
Proponi una modifica SOLO se un risultato di ricerca la dimostra chiaramente (indica l'URL della fonte in "source").
Regole:
- "free": true SOLO se lo strumento si usa gratis SENZA creare un account; altrimenti false.
- "price": per gli strumenti a pagamento indica i piani principali con prezzo mensile e valuta, es. "Pro 20 $/mese · Max 100 $/mese" (max 140 caratteri). Per i gratuiti descrivi i limiti, es. "Gratis, senza account (limitato)".
- "desc": italiano semplice, max 220 caratteri; cambiala solo se lo strumento è cambiato in modo importante.
- "status": "discontinued" se la fonte dice che il servizio è chiuso o non più disponibile.
- Se non ci sono prove di cambiamenti, NON includere lo strumento.
Rispondi solo con JSON: {"updates":[{"id":"...","price":"...","free":true|false,"desc":"...","status":"ok|discontinued","source":"https://..."}]}
DATI:
${JSON.stringify(block)}`;
    try {
      const r = await gemini(prompt);
      if (Array.isArray(r.updates)) proposals.updates.push(...r.updates.filter((u) => u && ids.includes(u.id) && /^https?:\/\//.test(u.source || '')));
    } catch (e) { log('Gemini (aggiornamenti) fallito:', e.message); }
    await sleep(4000); // rispetta i limiti al minuto del piano gratuito
  }
  try {
    const prompt = `Sei il curatore di un elenco italiano di strumenti AI utili a una web agency (grafica, video, testi, siti, produttività). Oggi è ${today}.
Elenco attuale (nomi): ${data.tools.map((t) => t.name).join(', ')}.
Dai risultati di ricerca qui sotto proponi AL MASSIMO 3 strumenti NUOVI, affidabili e utili, non già presenti.
Per ognuno: {"name","url" (sito ufficiale https),"category" (una tra: ${CATS.join(', ')}),"free" (true solo se si usa senza account),"desc" (italiano, max 220 caratteri),"price","source"}.
Se non ci sono strumenti davvero validi, restituisci una lista vuota.
Rispondi solo con JSON: {"additions":[...]}
RISULTATI:
${JSON.stringify(discovery)}`;
    const r = await gemini(prompt);
    if (Array.isArray(r.additions)) proposals.additions = r.additions.slice(0, 3);
  } catch (e) { log('Gemini (novità) fallito:', e.message); }

  // 4) applicazione con limiti
  let changes = 0;
  const changelog = [];
  const byId = Object.fromEntries(data.tools.map((t) => [t.id, t]));
  for (const u of proposals.updates) {
    if (changes >= MAX_CHANGES) break;
    const t = byId[u.id]; if (!t) continue;
    if (u.status === 'discontinued') { t._discontinued = true; changelog.push(`${t.name}: segnalato come chiuso (${u.source})`); changes++; continue; }
    const before = JSON.stringify([t.price, t.free, t.desc]);
    if (typeof u.price === 'string' && u.price.trim()) t.price = u.price.trim().slice(0, 140);
    if (typeof u.free === 'boolean') t.free = u.free;
    if (typeof u.desc === 'string' && u.desc.trim()) t.desc = u.desc.trim().slice(0, 300);
    if (before !== JSON.stringify([t.price, t.free, t.desc])) { t.verified = today; changes++; changelog.push(`${t.name}: aggiornato (${u.source})`); }
  }
  for (const a of proposals.additions) {
    if (changes >= MAX_CHANGES || data.tools.length >= MAX_TOOLS) break;
    const t = cleanTool({ ...a, verified: today });
    if (!t || byId[t.id] || data.tools.some((x) => x.name.toLowerCase() === t.name.toLowerCase())) continue;
    if (!(await ping(t.url))) { log('Scartato (link non risponde):', t.name); continue; }
    data.tools.push(t); byId[t.id] = t; changes++; changelog.push(`${t.name}: aggiunto (${a.source || 'ricerca'})`);
  }

  // 5) controllo link: si toglie solo dopo 2 controlli falliti di fila (o chiuso + link morto)
  const kept = [];
  for (const t of data.tools) {
    const ok = await ping(t.url);
    t.fails = ok ? 0 : (t.fails || 0) + 1;
    const remove = (t.fails >= 2) || (t._discontinued && !ok);
    delete t._discontinued;
    if (remove && changes < MAX_CHANGES) { changes++; changelog.push(`${t.name}: rimosso (sito non raggiungibile)`); continue; }
    if (!t.fails) delete t.fails;
    kept.push(t);
  }
  data.tools = kept.map((t) => ({ ...cleanTool(t), ...(t.fails ? { fails: t.fails } : {}) })).filter((t) => t && t.id);

  if (!changes) { log('Nessuna modifica questa settimana.'); if (!DRY_RUN) await fs.writeFile(FILE, JSON.stringify({ ...data, checked: today }, null, 2) + '\n'); return; }
  data.updated = today;
  data.source = 'Aggiornamento automatico settimanale (Tavily + Gemini)';
  data.changelog = changelog.slice(0, 30);
  if (DRY_RUN) { log('DRY_RUN — modifiche:', changelog); return; }
  await fs.writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
  log('Modifiche applicate:', changes); changelog.forEach((c) => log(' -', c));
}

main().catch((e) => { console.error('[worldmapai] ERRORE, file non modificato:', e.message); process.exitCode = 0; });
