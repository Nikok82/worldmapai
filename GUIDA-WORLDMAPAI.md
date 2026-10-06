# WorldMapAI — come attivare l’aggiornamento automatico settimanale

Tempo richiesto: circa 15 minuti, una volta sola. Costo: zero.
Alla fine, ogni lunedì mattina GitHub aggiornerà da solo l’elenco degli strumenti, e nell’app basterà premere **⟳ Aggiorna elenco**.

Ti servono tre account gratuiti: **GitHub**, **Tavily** e **Google** (quello di Gmail va benissimo).

---

## Passo 1 — Crea il repository su GitHub

1. Vai su <https://github.com> ed entra (o crea un account gratuito).
2. In alto a destra premi **+** › **New repository**.
3. In *Repository name* scrivi `worldmapai`.
4. Scegli **Public**. Il repository deve essere pubblico perché l’app possa leggere il file senza password; i minuti di GitHub Actions sono gratuiti per i repository pubblici.
5. Premi **Create repository**.

## Passo 2 — Carica i file

1. Nella pagina del repository appena creato premi **uploading an existing file** (oppure **Add file › Upload files**).
2. Apri sul PC la cartella `D:\PHP\htdocs\NikoText\worldmapai`.
3. Trascina nella pagina di GitHub: `worldmapai.json`, `README.md`, `GUIDA-WORLDMAPAI.md` e la cartella `scripts`.
4. In fondo premi **Commit changes**.

## Passo 2b — Crea il file dell’aggiornamento automatico

Windows e l’app non permettono di preparare la cartella `.github` sul PC, quindi la crei direttamente su GitHub:

1. Nel repository premi **Add file › Create new file**.
2. Nel nome del file scrivi esattamente: `.github/workflows/update-worldmapai.yml`
   (scrivendo le barre `/` GitHub crea da solo le cartelle).
3. Sul PC apri con il Blocco note il file `D:\PHP\htdocs\NikoText\worldmapai\workflow\update-worldmapai.yml`, copia tutto il testo e incollalo nella pagina di GitHub.
4. Premi **Commit changes**.

## Passo 3 — Chiave Tavily (le ricerche sul web)

1. Vai su <https://app.tavily.com> e registrati (gratis, senza carta di credito).
2. Nella dashboard copia la **API Key** (inizia con `tvly-`).
3. Il piano gratuito dà 1.000 ricerche al mese: l’aggiornamento settimanale ne usa circa 50.

## Passo 4 — Chiave Gemini (l’AI che legge i risultati)

1. Vai su <https://aistudio.google.com/apikey> ed entra con il tuo account Google.
2. Premi **Create API key** e copiala.
3. Il piano gratuito basta e avanza (circa 6 richieste a settimana). Nota: sul piano gratuito Google può usare i contenuti inviati per migliorare i suoi prodotti; qui inviamo solo informazioni pubbliche sugli strumenti AI.

## Passo 5 — Inserisci le chiavi nei “Secrets” di GitHub

1. Nel repository vai su **Settings › Secrets and variables › Actions**.
2. Premi **New repository secret**:
   - *Name*: `TAVILY_API_KEY` — *Secret*: la chiave Tavily → **Add secret**.
3. Premi di nuovo **New repository secret**:
   - *Name*: `GEMINI_API_KEY` — *Secret*: la chiave Gemini → **Add secret**.

Le chiavi restano private: non si vedono nel repository pubblico.

## Passo 6 — Prima esecuzione di prova

1. Vai nella scheda **Actions** del repository. Se GitHub lo chiede, premi **I understand my workflows, go ahead and enable them**.
2. A sinistra scegli **Aggiorna WorldMapAI**, poi a destra **Run workflow › Run workflow**.
3. Dopo qualche minuto compare un pallino verde ✅. Aprendo l’esecuzione vedi l’elenco delle modifiche fatte (o “Nessuna modifica questa settimana”).

Da qui in poi parte da sola ogni lunedì alle 06:00 UTC.

## Passo 7 — Collega l’app

1. Nel repository apri il file `worldmapai.json` e premi il pulsante **Raw**.
2. Copia l’indirizzo della pagina: sarà simile a
   `https://raw.githubusercontent.com/TUO-UTENTE/worldmapai/main/worldmapai.json`
3. Nell’app apri **WorldMapAI**, premi **⚙**, incolla l’indirizzo e premi **Salva**.
4. Premi **⟳ Aggiorna elenco**: in alto vedrai la data dell’ultimo aggiornamento.

---

## Sicurezze dello script

- Cambia al massimo **10 voci a settimana**.
- Modifica un prezzo o una descrizione solo se Gemini indica una **fonte** trovata con la ricerca.
- Aggiunge al massimo 3 strumenti nuovi a settimana, e solo se il loro sito risponde.
- Toglie uno strumento solo se il sito **non risponde per due settimane di fila**.
- Se Tavily o Gemini non funzionano, il file resta com’era.

L’AI può comunque sbagliare un prezzo: le schede mostrano la data di verifica, e il pulsante **Apri ↗** porta sempre alla pagina ufficiale.

## Se qualcosa non va

- **Pallino rosso in Actions** → apri l’esecuzione e leggi l’errore.
  - *Gemini HTTP 404*: il nome del modello è cambiato. Vai su **Settings › Secrets and variables › Actions › Variables › New repository variable**, nome `GEMINI_MODEL`, valore il nome di un modello Flash attuale (lo trovi su <https://ai.google.dev/gemini-api/docs/models>).
  - *Tavily HTTP 401*: la chiave Tavily è sbagliata o scaduta: ricreala e aggiorna il secret.
- **L’app dice “il file non ha il formato atteso”** → controlla di aver copiato l’indirizzo **Raw**, non quello della pagina GitHub.
- Per modificare l’elenco a mano: apri `worldmapai.json` su GitHub, premi la matita ✏️, cambia e premi **Commit changes**.
