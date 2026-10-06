# WorldMapAI — elenco aggiornato

Questo repository contiene `worldmapai.json`, l’elenco degli strumenti AI usato dal modulo **WorldMapAI** di NikoText / Army Knife.
Ogni lunedì GitHub lo aggiorna da solo (file `.github/workflows/update-worldmapai.yml`; una copia è in `workflow/`), usando Tavily per le ricerche e Gemini per leggere i risultati.

- Lo script è `scripts/update.mjs` (Node 22, nessuna dipendenza).
- Le chiavi stanno nei *Secrets* del repository: `TAVILY_API_KEY` e `GEMINI_API_KEY`.
- Modifiche massime per settimana: 10. Se qualcosa va storto il file resta com’era.
