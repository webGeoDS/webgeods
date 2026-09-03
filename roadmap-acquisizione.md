# Roadmap — Blog, Tool, Deploy (webgeods)

**Stato: documento vivo.** Aggiornalo ogni volta che una fase si
conclude, una priorità cambia, o arrivano dati reali (Search Console,
uso dei tool) che confermano o smentiscono un'ipotesi qui dentro. Non
è un piano scritto una volta e archiviato — è la fonte di verità su
cosa fare dopo, da consultare all'inizio di ogni sessione di lavoro sul
progetto.

**Questo file è l'unico riferimento di pianificazione per l'intero
progetto** (deciso esplicitamente dall'autore il 2026-09-02) — non
crearne altri: se emerge una nuova decisione di piano in una
conversazione futura, va integrata qui, non lasciata solo in
conversazione o in un artifact separato.

**Origine**: sintesi di più conversazioni — la valutazione critica
dello stato del progetto (architettura solida, contenuti indietro), la
riprioritizzazione dei tool con l'introduzione del modello a due
livelli Core Tools / Vertical Apps, e la discussione sulla struttura
dell'Academy (corsi generalisti vs mini-corsi verticali). Sostituisce
la versione precedente pubblicata come artifact "Bussola
d'Acquisizione", ormai superata da questo documento.

---

## Stato attuale (2026-09-02)

- **Blog**: 2 articoli pubblicati (`geometry-validity.qmd`,
  `topology-errors.qmd`), 1 tool standalone
  (`tools/geojson-shapefile-validator.qmd`), navbar con voce
  "Tools", tutto il sito tradotto in inglese.
- **Deploy**: **non live**. Nessun hosting reale, nessuna CI, nessun
  analytics, nessun `robots.txt`/Search Console. Il progetto **non è
  nemmeno un repository git** (`git status` fallisce con "not a
  git repository") — prerequisito bloccante prima di qualunque deploy
  su GitHub Pages, non ancora affrontato.
- **Lezioni** (`lessons/`): solo contenuto placeholder/infrastrutturale
  (`index.qmd`/`about.qmd` sono demo interne, non lezioni vere) più due
  lezioni tecniche sul bridge Python/R → MapLibre. Nessun corso di
  dominio reale.
- **Motore**: stabile, interamente in inglese, architettura JS-first
  verificata (R/Python restituiscono GeoJSON puro, JS decide la
  visualizzazione). Aggiungere un nuovo tool richiede pochissimo
  JavaScript nuovo — confermato empiricamente con il Validator
  (~95% del motore riusato, una sola funzione nuova per il download).

## Principio guida

Due livelli, non una lista piatta di dieci tool:

```
webgeods
              │
    ┌─────────┴─────────┐
    │                    │
CORE TOOLS          VERTICAL APPS
    │                    │
motore generico,    mini-app per settore,
riusabile,          Problem → Article →
dimostra la         Demo → Tool → Course
tecnologia
```

I Core Tools si costruiscono ORA, in ordine di costo/beneficio. Le
Vertical Apps si progettano ma **non si costruiscono** finché non ci
sono segnali reali (traffico, query, engagement) su cui basare quale
verticale vale la pena — vedi Fase 4.

---

## Stima temporale (schema)

**Premessa da rileggere prima di usare questi numeri**: sono stime di
*sforzo*, ricalibrate su **lavoro a tempo pieno** (confermato
dall'autore il 2026-09-02 — la versione precedente assumeva part-time,
vedi changelog). Vanno lette distinguendo due colonne: **lavoro
attivo** (giorni di sviluppo effettivi) e **tempo di calendario
minimo** (quanto passa comunque, indipendentemente da quanto si lavora
veloce — propagazione DNS, indicizzazione Google, raccolta dati Search
Console). Questa distinzione conta ancora di più a tempo pieno: il
collo di bottiglia smette di essere "quanto lavoro posso fare" e
diventa "quanto devo aspettare che arrivino segnali reali" — vedi nota
in fondo.

| Fase | Contenuto | Lavoro attivo | Tempo di calendario minimo | Dipendenza |
|---|---|---|---|---|
| 0.0–0.6 | git init, hosting, CI, SEO, robots/Search Console, analytics, `type: blog` | 1–2 giorni | +1–2 giorni (DNS) | Nessuna — si parte da qui |
| 0.7 | Raccolta dati sufficiente in Search Console per decisioni informate | — (attesa, non lavoro) | **2–4 settimane** dopo l'indicizzazione | Segue 0.4 — **non si accorcia lavorando più veloce** |
| 1.2 | GeoSpatial File Inspector | 1–2 giorni | — | Nessuna (riusa motore Validator) |
| 1.3 | CRS Inspector & Converter | 2–3 giorni | — | Nessuna |
| 1.4 | Topology Check standalone | 0,5 giorno | — | Bassa priorità, rimandabile |
| **Totale Fase 1** | | **~4–6 giorni (< 1 settimana)** | | |
| 2.x | Geometry Simplification, Overlay Explorer, Buffer/Proximity | 4–7 giorni totali | — | Meglio dopo segnali da Fase 0.7 |
| **Totale Fase 2** | | **~1–1,5 settimane** | | |
| 3.x | Raster Inspector, Raster Calculator, NDVI Calculator | 4–6 giorni totali | — | Nessuna tecnica, ma bassa priorità finché 1–2 non mostrano trazione |
| **Totale Fase 3** | | **~1–1,5 settimane** | | |
| 4 | Vertical Apps | **non stimabile a priori** | Gate su dati, non su calendario | Blog live + Fase 1 spedita + settimane di dati reali |
| 5 | Corso (Teachable) | Dipende dalla verticale scelta in Fase 4 | — | Fase 4 validata |

**Lettura d'insieme**: Fase 0 (lavoro attivo) + Fase 1 stanno in
**circa 1 settimana lavorativa piena**. A quel punto, però, i dati di
Search Console (0.7) non sono ancora pronti — servono comunque 2–4
settimane di calendario dall'indicizzazione, indipendentemente da
quanto velocemente si è arrivati fin lì. Fasi 2 e 3, se eseguite
entrambe per intero, aggiungono altre **2–3 settimane** di lavoro.

**Conseguenza pratica del tempo pieno**: con part-time il consiglio
era "fermati dopo la Fase 1 e aspetta i dati prima di continuare". A
tempo pieno il lavoro attivo di Fase 1 finisce PRIMA che i dati di
Search Console siano pronti — quindi ha senso **iniziare il lavoro di
sviluppo della Fase 2 nella finestra di attesa**, invece di restare
fermi. Quello che NON cambia: le **decisioni di priorità/ordine**
dentro la Fase 2 (quale dei tre tool costruire per primo, se
riordinarli) restano condizionate ai dati reali quando arrivano, non
al fatto di avere tempo libero da riempire. Lavorare a tempo pieno
compra più margine di manovra sul *quando*, non una licenza per
saltare il *perché aspettare i dati* del principio guida.

---

## Piano operativo — prossima settimana (aggiunto 2026-09-02)

Traduzione di Fase 0 + Inspector + CRS in giorni concreti. Dominio,
DNS e Search Console avviati per primi perché impiegano giorni a
propagare/indicizzare — corrono in parallelo al resto, non bloccano.

- **Giorno 0 (prima di tutto, corretto 2026-09-02)**: **acquistare
  `webgeods.com`** se non già posseduto — non blocca tecnicamente il
  resto (GitHub Pages funziona anche sul sottodominio gratuito
  `*.github.io` prima di avere un dominio custom), ma `site-url:
  https://webgeods.com` è già scritto in `blog/_quarto.yml` (sitemap,
  tag canonici, Open Graph puntano già lì) — e la propagazione DNS
  (fino a 24-48h) è l'attesa più lunga della settimana insieme a
  Search Console, quindi va avviata per prima. **Registrar: OVH**
  (confermato 2026-09-02) — GitHub non vende domini, solo li ospita
  via Pages. Configurazione DNS su OVH per GitHub Pages: 4 record
  **A** verso `185.199.108.153` / `.109.153` / `.110.153` / `.111.153`
  per l'apex `webgeods.com`, oppure un **CNAME** verso
  `<utente>.github.io` per `www.webgeods.com`.

  **✅ Fatto (2026-09-02)**: dominio `webgeods.com` acquistato su OVH,
  2 anni (02/09/26 → 02/09/28), zona DNS installata. Incluso
  automaticamente nell'ordine, gratis il primo anno: **Zimbra
  Starter**, organizzazione creata, dominio aggiunto con configurazione
  consigliata (MX + record di autenticazione email), casella
  **`info@webgeods.com` configurata e attiva**. Rinnovo dal secondo
  anno: 3,60€/anno se non cancellata, trascurabile.
  I 4 record A per GitHub Pages aggiunti e **verificati nella zona
  DNS** (`webgeods.com.` → `185.199.108/109/110/111.153`, apex
  corretto, coesistono senza conflitto con i 3 record MX + 2 CNAME
  DKIM di Zimbra) — propagazione partita in anticipo rispetto al
  Giorno 1. **Giorno 0 chiuso.**
- **Giorno 1**: 0.0 (backup, git init, repo GitHub, push) → 0.1
  (GitHub Pages + CNAME + DNS, ora che il dominio è posseduto) → 0.4
  (proprietà Search Console creata, avviata subito).

  **✅ 0.0 fatto (2026-09-02)**: backup verificato (996 file, 35MB,
  fuori dal progetto). `.gitignore` creato (build output, dipendenze,
  stato locale `.claude/` escluso dopo revisione — solo permessi dello
  strumento, nessun segreto). Primo commit (119 file). Account GitHub
  `webGeoDS` autenticato in locale. Repository creato e pushato:
  **`github.com/webGeoDS/webgeods`** (pubblico, branch `main`).
  Nota tecnica risolta: il credential helper di git puntava ancora
  all'account `DSwing` (già presente in locale per
  `DSwing/webgeods-assets`) nonostante `gh` avesse `webGeoDS` attivo —
  sistemato con `gh auth setup-git`.
  **✅ 0.1 + 0.2 fatti insieme (2026-09-02)**: "abilitare Pages" senza
  un modo di costruire l'output non avrebbe avuto senso, quindi fatti
  in un solo passaggio. Creato `.github/workflows/deploy-blog.yml`
  (render `blog/` con Quarto — **nessun R/Python necessario in CI**,
  girano lato browser via WASM, verificato prima di scrivere il
  workflow). Pages abilitato via API (`build_type=workflow`), dominio
  custom `webgeods.com` impostato. Un bug reale trovato e corretto in
  corsa: `./sync-shared-assets.sh` falliva in CI (exit 126, bit di
  esecuzione perso nel checkout Linux) — risolto invocando `bash
  sync-shared-assets.sh`. Deploy riuscito al secondo tentativo,
  **sito confermato online**: `webgeods.com` risolve in HTTP (200) —
  propagazione DNS più veloce del previsto (poche ore, non 24-48h).
  **HTTPS non ancora pronto** (GitHub deve completare il provisioning
  del certificato dopo la verifica DNS, tipicamente minuti-ore) — da
  riverificare, non un errore.
  **Riverificato (2026-09-03, dopo il fix 0.6)**: ancora non pronto —
  `gh api repos/webGeoDS/webgeods/pages` mostra `https_enforced:
  false` e nessun oggetto `https_certificate` nella risposta; il
  certificato servito è ancora quello generico `*.github.io`, non uno
  emesso per `webgeods.com` (confermato sia con curl locale che con
  WebFetch: entrambi rifiutano l'handshake TLS per mismatch di
  hostname). Il sito funziona correttamente in HTTP (confermato: feed
  RSS raggiungibile e valido su `http://webgeods.com/index.xml`).
  Probabile causa del ritardo: l'incidente DNS OVH (redirect di
  default) risolto solo il giorno prima potrebbe aver fatto ripartire
  da zero il tentativo automatico di GitHub. Se non si risolve da
  solo entro 24h da questa nota, l'azione nota per "sbloccare" è
  rimuovere e re-impostare il custom domain nelle impostazioni Pages
  (forza un nuovo tentativo di emissione) — non eseguita
  automaticamente, richiede conferma esplicita prima di toccare
  un'impostazione di dominio live.

  **✅ Sbloccato manualmente (2026-09-03, poche ore dopo)**: non
  aspettate le 24h — la causa probabile (tentativo iniziale caduto
  nella finestra DNS ancora sporca) rendeva improbabile un recupero
  automatico. Rimosso e re-impostato il custom domain via
  `gh api -X PUT repos/webGeoDS/webgeods/pages -f cname=...` (prima
  vuoto, poi di nuovo `webgeods.com`) — confermato con l'utente prima
  di toccare l'impostazione live. Nessuna interruzione del sito
  durante l'operazione (verificato: HTTP 200 subito dopo). Nuovo
  tentativo di emissione certificato partito da zero — normalmente
  minuti-ore, da riverificare.

  **✅ HTTPS live (2026-09-03, ~30-60 min dopo lo sblocco)**:
  `https_certificate.state: "approved"` (copre `webgeods.com` e
  `www.webgeods.com`, scade 2026-12-02). Verificato con WebFetch (TLS
  reale, non ignorato) e con `curl -sL http://webgeods.com/` →
  redirect a `https://webgeods.com/`, 200. Attivato anche **"Enforce
  HTTPS"** (`https_enforced: true` via API, sintassi corretta:
  `gh api -F https_enforced=true`, non `-f` che tratta il valore come
  stringa e viene rifiutato) — coerente con `site-url:
  https://webgeods.com` già dichiarato ovunque (sitemap, tag
  canonici, Open Graph, RSS) fin dall'inizio, non una nuova decisione.
  **Fase 0 di deploy/infrastruttura effettivamente chiusa al 100%.**

  **✅ Incidente DNS trovato e risolto (2026-09-02/03)**: il sito
  risultava intermittente (~1 richiesta su 5 falliva) — causa: OVH
  aggiunge di default una **redirezione parcheggio** su ogni dominio
  nuovo (apex → www "visibile", www → pagina "welcome" OVH
  "invisibile"), che inietta un record A proprio (`213.186.33.5`)
  in round-robin con i 4 IP corretti di GitHub. Non visibile come
  "record DNS normale" — va cercata in una sezione **Redirezione/
  Multisito** separata dalla Zona DNS. Cancellata (con un errore del
  pannello OVH alla prima cancellazione, poi effettivamente rimossa
  nonostante il messaggio di errore — verificare sempre lo stato
  reale, non fidarsi solo del messaggio del pannello). **Verificato
  a fondo**: nslookup pulito su due resolver pubblici (8.8.8.8,
  1.1.1.1) — solo i 4 IP GitHub; 8/8 richieste HTTP consecutive a
  200. **Lezione per il futuro**: quando si registra un dominio su
  OVH (o probabilmente altri registrar) per puntarlo altrove, cercare
  esplicitamente ed eliminare qualunque redirezione/parcheggio di
  default PRIMA di aggiungere i propri record — non assumere che la
  Zona DNS mostri tutto quello che è attivo sul dominio.
  Opzionale, non fatto: CNAME `www` → `webgeods.github.io.` (il sito
  funziona già senza `www.`).
  Prossimo: 0.4 (Search Console) — 0.3 (verifica OG/sitemap
  sull'output pubblicato) può slittare a dopo che HTTPS è pronto,
  dato che Search Console preferisce l'URL https.
- **Giorno 2**: 0.3 (verifica OG/sitemap sull'output pubblicato) →
  0.4 (robots.txt, invio sitemap) → 0.6 (`type: blog`).

  **✅ 0.3 + 0.4 fatti (2026-09-03)**: OG tags verificati live
  (`og:title`, `og:site_name` presenti e corretti). `robots.txt`
  verificato live (generato automaticamente da Quarto, referenzia
  correttamente la sitemap). Proprietà Search Console creata
  (prefisso URL, verificata via tag HTML), sitemap
  `https://webgeods.com/sitemap.xml` verificata (200, contiene tutte
  le pagine) e inviata.

  **✅ 0.6 fatto (2026-09-03)**: vedi dettaglio nella sezione 0.6 più
  sotto — `type: blog` non esiste, RSS ottenuto via `feed: true` sul
  listing, più un bug indipendente (`embed-resources: true`
  sopprimeva il feed) trovato e corretto. Giorno 2 chiuso.
- **Giorno 3**: 0.5 (analytics + eventi tool/funnel definiti in 0.5,
  collegati al Validator esistente) → 0.8 (form newsletter + lead
  magnet cheatsheet, riusa contenuto già scritto).

  **✅ 0.5 fatto (2026-09-03)**: vedi dettaglio nella sezione 0.5 più
  sotto — GoatCounter scelto e live, eventi instrumentati al livello
  condiviso invece che per singolo tool.

  **✅ 0.8 fatto (2026-09-03)**: vedi dettaglio nella sezione 0.8 più
  sotto — Kit scelto e live, form sui due articoli e sul tool
  Validator, cheatsheet scaricabile. Giorno 3 chiuso.
- **Giorno 4-5**: 1.2 GeoSpatial File Inspector — upload, statistiche
  (riusa la logica diagnosi del Validator), cross-link verso
  Validate/Repair/Topology, render + verifica funzionale + eventi.
- **Giorno 6-7 (buffer)**: 1.3 CRS Inspector & Converter — rileva CRS,
  euristica di mismatch (magnitudine coordinate), conversione/download,
  cross-link, render + verifica. Se non entra nei 5 giorni pieni,
  scivola all'inizio della settimana successiva — stima onesta già
  sopra (2-3 giorni per il solo tool), non una scadenza.

  **✅ 1.4 fatto in anticipo, fuori ordine (2026-09-03)**: durante una
  revisione del Validator (vedi 1.1 sopra: ridisegnato a pulsanti,
  Python-only), il costo marginale di estrarre anche `topology-errors`
  in un tool standalone è risultato basso — pattern appena costruito,
  motore già scritto. Vedi dettaglio nella tabella Fase 1 più sotto.
  Non tocca la stima di 1.2/1.3, entrambi ancora da fare.

  **✅ Rassegna UX del sito pubblicato (2026-09-03)**, su richiesta
  esplicita prima di continuare con 1.2/1.3: giro completo del sito
  live (screenshot desktop+mobile, ogni pagina) prima di costruire
  altro. Trovati e corretti: nessun feedback durante l'attesa a
  freddo di 30-40s su Validate/Check (aggiunta animazione pulse +
  nota esplicita sui tempi, `shared/styles.css`); mappa/tabella/
  risultato vuoti mostrati PRIMA del pulsante su entrambi i tool
  (riordinato: pulsante prima, risultati dopo); il pulsante Fix del
  Validator cliccabile anche prima di Validate (ora disabilitato via
  `mutable validateSucceeded`, si abilita al primo successo); il
  messaggio di default upload ("premi Run sulle celle sotto") ancora
  mostrato sui tool ridisegnati che non hanno più celle visibili
  (genericizzato in `shared/upload.js`); descrizione di
  `tools/index.qmd` ancora "Python and R" (corretta); `topology-
  errors.qmd` non linkava ancora il proprio tool standalone (aggiunto,
  come già faceva `geometry-validity.qmd`).

  **Rimandato allora, fatto ora**: la pagina About era ancora un
  placeholder ("About webgeods.").

  **✅ Testo vuoto della tabella corretto (2026-09-04)**: "No matching
  records found" (default di Grid.js, suona come una ricerca senza
  risultati — fuorviante prima che qualunque check sia mai stato
  eseguito) sostituito con "No results yet" su tutte e quattro le
  pagine con tabella. Nessuna modifica a `shared/map.js`/`table.js`
  necessaria: `table()` inoltra già ogni opzione non riconosciuta al
  costruttore di Grid.js (solo `rowClassName` viene estratto a parte)
  — bastava aggiungere `language: { noRecordsFound: "..." }`
  all'oggetto `options` già passato a `tableCell()` in ciascun file.

  **✅ Pagina About scritta (2026-09-04)**: struttura sulle quattro
  domande che contano per acquisizione fredda (cos'è / per chi / cosa
  la differenzia / cosa ci si può fare), non autobiografia né elenco
  tecnologie. Scritta dopo aver criticato una bozza esterna proposta
  dall'utente: tolta una sezione dedicata alle tecnologie che
  contraddiceva il proprio stesso principio dichiarato ("non
  enfatizzare la tecnologia"), accorciate ~8 sezioni a 5, sostituita
  una lista generica di categorie professionali con una descrizione
  del problema durevole (non legata ai soli due tool di oggi — non
  invecchierà male quando Inspector/CRS/Academy esisteranno),
  registro allineato al resto del sito (niente "at the heart of X").
  Aggiunto il form newsletter — l'unico passaggio del funnel "learn →
  use → subscribe → course" dichiarato ma assente dalla bozza
  originale. Nessuna CTA "compra un corso" — non c'è ancora nulla da
  vendere. Verificato: nessun errore, link CTA funzionanti, form
  identico alle altre pagine.

**Fuori da questa settimana, esplicitamente**: Fase 2, Vertical Apps,
ads (esclusi dal piano).

---

## Fase 0 — Deploy e gestione del blog

**Bloccante per tutto il resto**: zero acquisizione è possibile finché
il blog non vive a un URL reale, indicizzabile.

### 0.0 Backup, poi inizializzare git

**Aggiunto 2026-09-02, su suggerimento esterno**: prima di toccare il
version control, una copia verificata del progetto così com'è oggi —
non perché git non sia affidabile, ma perché il passaggio da
"progetto locale non versionato" a "repository remoto" è esattamente
il momento in cui vale la pena avere una rete di sicurezza a costo
quasi zero. Poi, il prerequisito già identificato: il progetto non è
un repository git.

- **Backup**: copia verificata dell'intero progetto (non solo
  `git init` a freddo) prima di qualunque comando che tocchi la
  struttura delle cartelle.
- `git init`, primo commit con lo stato attuale.
- Creare il repository remoto (GitHub), push.
- Decidere cosa entra in `.gitignore` (`_site/`, `.quarto/`, eventuali
  cartelle di render temporanee, `node_modules/`).

### 0.1 Hosting

- GitHub Pages sul dominio già configurato in `blog/_quarto.yml`
  (`site-url: https://webgeods.com`) — serve `CNAME` + record DNS.
- Confermare la struttura: `webgeods.com/` per il blog. `lessons/` resta
  un progetto Quarto separato, pensato per essere incorporato via
  iframe in Teachable — la sua strategia di hosting è una decisione
  aperta, non affrontata in questa fase (vedi `piano-separazione-blog-lezioni.md`
  §5 e §8).

### 0.2 CI/CD

- GitHub Action minima: `quarto render` su `blog/` a ogni push su
  main, deploy automatico su `gh-pages` (o branch equivalente). Oggi
  tutto il render è manuale via script bash
  (`sync-shared-assets.sh` + `quarto render`).

### 0.3 Verifica SEO in output reale

- Confermare che `_site/` contenga davvero tag Open Graph corretti e
  un `sitemap.xml` valido — `open-graph: true` e `site-url` sono già
  impostati in `blog/_quarto.yml`, ma non ancora verificati
  sull'output effettivo pubblicato.

### 0.4 Indicizzazione

- `robots.txt` esplicito per il blog (indicizzabile — a differenza di
  `lessons/`, già correttamente `noindex`).
- Creare proprietà su Google Search Console, inviare la sitemap.

### 0.5 Analytics

- **✅ fatto (2026-09-03)**: **GoatCounter** scelto tra le alternative
  (vs Plausible: nessun piano gratuito permanente; vs GA4: richiede
  banner di consenso GDPR, in contrasto col posizionamento
  privacy-friendly) — gratuito, nessun cookie, nessun banner
  necessario. Account creato (`webgeods.goatcounter.com`), script
  incorporato in `blog/_quarto.yml`.

  Instrumentazione fatta **al livello generico condiviso**
  (`shared/runtime.js`, `shared/code-cell.js`, `shared/upload.js`),
  non pagina per pagina — ogni tool presente e futuro (Inspector, CRS
  Converter, ...) eredita il tracciamento gratis, senza wiring
  ripetuto:
  - `window.WebGeoDS.track(name, props)` (in `runtime.js`): wrapper
    sicuro (no-op se GoatCounter non è caricato) attorno a
    `goatcounter.count()`.
  - `code_run_started`/`code_run_completed`/`code_run_error` (in
    `code-cell.js`, dentro `run()`): fira per OGNI esecuzione di cella
    Python/R, ovunque nel sito, con `cellId`+`language`. **Sostituisce**
    `validation_started/completed` e `repair_started/completed`
    previsti sotto — stessi eventi, nome più generico
    (distinguibili a posteriori filtrando per `cellId`, es.
    `geometry-diagnose-py` vs `geometry-repair-py`), riusabile da
    qualunque tool futuro senza codice nuovo.
  - `file_uploaded` (in `upload.js`, con `kind`): su ogni upload
    riuscito, ovunque `WebGeoDS.Upload` sia usato.
  - `tool_click` (listener generico in `blog/_quarto.yml`, click su
    qualunque link a `/tools/`): cattura l'intento di click-through
    anche se il runtime WASM di destinazione non finisce di caricare.

  Specifici solo per il Validator (non generici):
  `tool_loaded`, `download_clicked` — aggiunti direttamente in
  `geojson-shapefile-validator.qmd`.

  `article_view` non ha codice dedicato: GoatCounter traccia le
  pageview in automatico, e la visita a un articolo È già una
  pageview.

  **Non ancora implementati** (dipendono da funzionalità non ancora
  esistenti): `newsletter_view`/`newsletter_signup` (0.8, prossimo),
  `course_page_view`/`checkout_started`/`purchase` (Fase 5, Academy —
  non esiste ancora nulla da tracciare).

  Verificato: 51/51 check della suite `lessons/test-architettura`
  ancora verdi dopo le modifiche al motore condiviso; script
  GoatCounter e chiamate di tracking confermati presenti
  sull'HTML live (`http://webgeods.com/tools/geojson-shapefile-validator.html`).

### 0.6 `type: website` → `type: blog`

- **✅ fatto (2026-09-03), ma non come previsto**: `type: blog` **non
  è un tipo di progetto Quarto valido** — il commento nel codice che
  lo suggeriva era sbagliato (`quarto render` fallisce con `ERROR:
  Unsupported project type blog`; i tipi validi sono
  `default`/`website`/`book`/`manuscript`). Resta `type: website`,
  comment corretto in `_quarto.yml`.
  RSS/categorie si ottengono comunque, dalla configurazione del
  listing stesso (`categories: true` e `feed: true` su
  `blog/index.qmd`), non dal tipo di progetto — obiettivo raggiunto,
  meccanismo diverso da quello ipotizzato.
  Nel farlo, trovato e risolto un secondo bug indipendente:
  `embed-resources: true` (impostato nel blog, probabilmente per
  copia da `lessons/_quarto.yml`, dove è invece un requisito reale
  per l'embedding in iframe Teachable) sopprimeva silenziosamente la
  generazione di `index.xml` — nessun errore, nessun warning, feed
  semplicemente assente. Corretto a `embed-resources: false`, che è
  anche la scelta architetturalmente corretta per il blog (pagine
  scopribili/condivisibili con asset condivisi tra pagine via
  `site_libs/`, non file singoli autosufficienti) — non solo un
  workaround per l'RSS. Aggiunto anche `description:` sotto
  `website:`, richiesto insieme a `site-url` perché Quarto generi il
  feed. Verificato con render pulito: `index.xml` generato
  correttamente, `sitemap.xml` invariato, pagine ancora corrette
  (asset caricati da `site_libs/`, non più incorporati). Commit
  `25dd1a0`, push effettuato — CI in corso.

### 0.7 Gestione continuativa (non un evento singolo)

- **Cadenza di pubblicazione**: definire un ritmo sostenibile (es. un
  pezzo ogni 1–2 settimane) prima di impegnarsi in contenuti più
  ambiziosi — meglio costante che a raffica seguita da silenzio.
- **Monitoraggio**: controllo periodico di Search Console (quali query
  portano traffico, quali pagine si posizionano) — è l'input diretto
  per le decisioni di Fase 1.3/1.4 e per il gate della Fase 4.
- **Backup/versioning**: una volta inizializzato git (0.0) e con CI
  (0.2), il repository stesso è il backup — non serve altro, ma vale
  la pena confermarlo esplicitamente invece di darlo per scontato.
- **Processo di verifica prima di ogni pubblicazione**: `quarto
  render` + `static-server.mjs` + una passata funzionale (upload,
  esempio, diagnosi/correzione se applicabile) prima del push — stessa
  disciplina già usata in questa sessione per ogni nuova pagina.

### 0.8 Newsletter (aggiunta 2026-09-02)

Il funnel oggi è "visitatore gratuito → acquisto diretto", senza
nessun passaggio intermedio — con **acquisizione a freddo pura**
(confermato dall'autore: nessun pubblico di partenza), questo converte
male: una singola visita raramente basta a convincere qualcuno a
pagare. Serve un passaggio che permetta più contatti nel tempo.

- **Meccanismo**: form di iscrizione su ogni pagina tool/articolo
  (servizio leggero — Buttondown/ConvertKit/Mailchimp free tier,
  nessuna infrastruttura propria da costruire).
- **Lead magnet**: qualcosa di piccolo e immediatamente utile,
  coerente col posizionamento "QA geodati" già stabilito — es. un
  cheatsheet "errori geometrici e topologici comuni: come riconoscerli
  in Python e R" (riusa contenuto già scritto negli articoli, costo di
  produzione quasi zero).
- **Sequenza di nurture**: 3–5 email automatiche dopo l'iscrizione —
  presentazione dei tool, il differenziatore bilingue, e infine
  l'offerta del primo mini-corso disponibile. Non serve costruirla
  prima che esista almeno un mini-corso da offrire (Fase 4/5) — il
  meccanismo di raccolta (form + lead magnet) va live da subito,
  la sequenza di vendita quando c'è qualcosa da vendere.
- **Perché conta per le stime**: sposta la conversione da "singola
  visita a freddo" a "lista che cresce ogni mese e converte nel
  tempo" — è la differenza principale tra le stime precedenti e quelle
  rinnovate più sotto.

**✅ fatto (2026-09-03)**: **Kit** scelto (vs Buttondown/MailerLite/
Beehiiv — confronto su tetto iscritti gratis, automazioni incluse,
consegna lead magnet; vedi confronto sotto). Piano gratuito
"Newsletter": 10.000 iscritti, form/broadcast illimitati, consegna
incentivo inclusa — nessuna automazione a pagamento necessaria finché
non esiste un mini-corso da vendere (coerente col resto del punto).
Nota: il flusso di signup mostra un trial di 14gg del piano a
pagamento (Creator) — senza inserire una carta, l'account ricade da
solo sul piano gratuito Newsletter, nessun addebito.

Cheatsheet "Geometric & topological errors, at a glance" prodotto
(2 pagine, contenuto dagli articoli esistenti, stile grafico
allineato a `_brand.yml`) e servito direttamente da
`webgeods.com/downloads/geometric-topological-errors-cheatsheet.pdf`
(non solo caricato su Kit — resta scaricabile anche se si cambia
servizio email in futuro).

Form incorporato (inline, si auto-renderizza) in fondo alle due
pagine articolo e al tool Validator — non su index/about, non è un
punto naturale di iscrizione lì. Redirect dopo submit punta
direttamente al PDF (gratificazione immediata); email di conferma
(doppio opt-in mantenuto attivo, per proteggere la deliverability fin
dall'inizio — vedi discussione) riconosce che il file è già stato
scaricato invece di ripeterlo come se fosse la prima volta.

Stile del form allineato al brand via Custom CSS di Kit (classi
`.formkit-*`, verificate dalla documentazione ufficiale, non
indovinate) — font, colori, bordi squadrati coerenti col resto del
sito. Verificato visivamente via screenshot Playwright sul sito live
dopo ogni iterazione (il primo template aveva uno slot immagine vuoto
a sinistra, risolto passando a un layout senza immagine; il testo
dell'header restava bianco/illeggibile su un form ricreato da zero,
serviva ripetere il CSS perché non si porta dietro tra un form e
l'altro con UID diverso).

### 0.9 Marketing a pagamento — escluso dal piano a 24 mesi

**Corretto due volte il 2026-09-02, dopo aver verificato i conti due
volte.** Primo giro: 400-500$/mese in ads quando in fondo al funnel
c'è solo un'iscrizione newsletter gratuita (nessun prodotto prima del
mese 9) generava ~85-100$/mese di ricavo marginale — ROI negativo di
4-5x. Corretto spostando l'avvio al mese 9 (primo mini-corso) con
budget ridotto. Secondo giro, su richiesta esplicita dell'autore
("elimina gli ads prima dei 18 mesi"): con avvio al mese 18 e un
ramp-up prudente (50→100→150$/mese, coerente con "test, non volume"),
il confronto a 24 mesi qui sotto mostra che **la spesa non fa in tempo
a ripagarsi nemmeno a fine periodo** — la variante con ads resta
leggermente SOTTO quella con la sola newsletter per tutta la finestra
mese 18–24, non solo nei primi mesi.

**Conclusione**: dato questo modello (conversioni, prezzi, ramp-up),
**gli ads non sono nel piano a 24 mesi**, punto — non "rimandati a
dopo", proprio esclusi come voce operativa. Il periodo di payback del
canale, a questa scala di budget, supera l'orizzonte del piano
stesso. Da riconsiderare solo con dati reali dal mese 18 in poi (tasso
di conversione lista reale, non stimato) — se a quel punto i numeri
reali sono più favorevoli di questa stima, è una decisione per
allora, non presa qui.

I canali restano elencati come opzioni pronte per quando (e se) quella
rivalutazione li giustificherà, non come voci programmate:

- **Reddit Ads** (r/gis, r/rstats, r/Python, r/datascience) — CPC
  tipicamente basso per community tecniche di nicchia.
- **Google Search Ads** sulle stesse query ad alto intento già
  targetizzate organicamente ("geojson validator online", "fix
  invalid geometry python", "geopandas vs sf").
- **Sponsorizzazioni di newsletter di settore GIS/data science**.
- **LinkedIn Ads** — CPC sensibilmente più alto dei canali sopra.
- **Sponsorizzazioni di conferenze** (FOSS4G, State of the Map) —
  costo più alto, gioco di brand/relazioni — comunque fuori
  dall'orizzonte di questo piano.

---

## Fase 1 — Core Tools (QA & Ispezione geodati)

Ordine aggiornato secondo la discussione su impatto/difficoltà/valore
differenziante di webgeods.

**Convenzione tool standalone (stabilita 2026-09-03, vale per 1.2/1.3
e ogni tool futuro)**: un tool in `/tools/` è a **pulsanti**, non a
celle di codice editabili — "stesso motore, meno prosa" è la sua
stessa proposta di valore, un editor con "▶ Run" da cliccare la
contraddice. Il codice resta nell'engine (nascosto via CSS,
**mai `display:none`** — verificato che rompe il caricamento di
`maplibre-gl.js`, vedi commento in `geojson-shapefile-validator.qmd` —
usare `height:0; overflow:hidden;`), eseguito da bottoni che chiamano
`.run()` programmaticamente. Un solo linguaggio, non entrambi: misurare
Python vs R sul carico REALE del tool specifico prima di scegliere
(non assumere — il margine è variato da ~45% a ~15% tra Validator e
Topology Checker pur usando gli stessi pacchetti) — finora Python ha
sempre vinto, ma va riverificato per ogni nuovo tool. L'articolo
completo (celle editabili, entrambi i linguaggi, confronto Python/R)
resta il posto per chi vuole leggere/modificare il codice — linkato
in modo prominente dal tool, mai duplicato.

**Aggiunta importante (2026-09-03), stessa convenzione**: un tool
Python-only deve chiamare `WebGeoDS.Upload.load(files, { languages:
["python"] })`, non `WebGeoDS.Upload.load(files)` nudo — il default è
`["python", "r"]` (giusto per gli articoli bilingue, che ne hanno
bisogno). Trovato empiricamente: senza l'opzione esplicita, caricare
un file su un tool Python-only faceva comunque partire il caricamento
completo di webR in background (ogni `writeFile()` carica prima
l'intero motore se non già attivo) — vanificando silenziosamente la
scelta Python-only fatta apposta per la velocità. Nessun errore
visibile, si scopre solo controllando la console o i tempi reali.

**Parametri di soglia/giudizio (gap/sliver e simili in tool futuri)**:
esporli come slider. Prima scelta (2026-09-03, mattina): nativi
(`<input type="range">`) per evitare la dipendenza da CDN esterni di
Observable Inputs. **Decisione ribaltata lo stesso giorno, su
richiesta esplicita**: Observable Inputs **vendorizzata** localmente
(non più caricata da CDN — il problema originale era il CDN, non la
libreria in sé) e usata per gli stessi slider. Il meccanismo
`#| inject` (documentato da tempo, mai usato prima d'ora) resta lo
strumento giusto per farli arrivare a Python/R: legge da
`window[nome]`, quindi va impostato dentro il click del pulsante
(letto dal DOM dello slider — `el.id` assegnato a mano, non dal
valore reattivo OJS — altrimenti il pulsante si ricrea a ogni tick di
trascinamento). Funziona identicamente sia con lo slider nativo che
con quello di Observable Inputs, dato che entrambi espongono
`.value` sull'elemento.

**Vendoring di Observable Inputs — due insidie reali trovate
(`vendor-observable-inputs.sh`, `shared/observable-inputs.min.js` +
`shared/htl.min.js`)**:
1. Il bundle UMD richiede **`htl` (hypertext literal) come vero
   global `window.htl`**, non incluso nel bundle stesso — va
   vendorizzato a parte. Quarto usa `htl` internamente nel proprio
   runtime OJS ma non lo espone su `window`: non dare per scontato che
   sia già disponibile solo perché appare nei log di errore delle
   celle OJS.
2. **Solo `Inputs.file` esiste** come funzione pubblica (non
   `Inputs.files`, nonostante il minified suggerisca il contrario a
   un grep superficiale). **Corretto il 2026-09-03/04**: la nota
   precedente qui diceva che il suo valore fosse un wrapper tipo
   "Observable file attachment" (letto dalla documentazione ufficiale,
   che in realtà descrive `FileAttachment`, un'API diversa) e
   scartava la sostituzione per costo sproporzionato — **conclusione
   sbagliata**. Leggendo il sorgente vendorizzato direttamente
   (funzione `e.file=`), con `multiple:true` il valore è un `Array` di
   veri `File` nativi. `shared/upload.js`'s `toFileArray()` già
   gestiva `Array.isArray(value)`, e `load()`/`baseName()` usano solo
   `.name`/`.arrayBuffer()` — zero modifiche necessarie a quelle tre
   funzioni. **`createInput()` sostituita e rimossa** (vedi voce 1.5
   sotto): sostituzione a basso rischio, non un costo sproporzionato.
   Lezione: quando il codice sorgente vendorizzato è leggibile
   direttamente, verificarlo così invece di fidarsi di un riassunto
   di documentazione — ha portato a una conclusione opposta e
   corretta.
3. Ogni pagina che vendorizza un asset condiviso deve caricarlo con
   **path assoluto** (`src="/htl.min.js"`, non `src="htl.min.js"`) —
   un tool sotto `/tools/` risolve un path relativo contro quella
   sottocartella, non contro la radice dove i file vengono
   effettivamente copiati. Bug reale, trovato e corretto prima del
   deploy, non solo teorico.

| # | Tool | Stato | Priorità | Difficoltà | Note |
|---|---|---|---|---|---|
| 1.1 | **Geometry Validation & Repair** | ✅ Fatto | — | — | `blog/tools/geojson-shapefile-validator.qmd`, live in produzione, ridisegnato a pulsanti (vedi 2026-09-03 sotto), cross-linkato con l'articolo |
| 1.2 | **GeoSpatial File Inspector** | Da fare | Alta | Bassa-media | Vedi dettaglio sotto — probabilmente il tool più economico rimasto |
| 1.3 | **CRS Inspector & Converter** | Da fare | Alta | Media | Vedi dettaglio sotto |
| 1.4 | **Topology Check & Report** (standalone) | ✅ Fatto (2026-09-03) | — | — | `blog/tools/topology-checker.qmd`, live in produzione — costruito fuori dall'ordine originale (dopo 1.1, prima di 1.2/1.3): costo marginale basso avendo appena costruito il pattern a pulsanti per 1.1, motore già scritto in `topology-errors.qmd`. Solo diagnosi, niente Fix (una topologia rotta richiede quasi sempre una decisione umana). **Soglie sliver/gap rese configurabili (2026-09-03)** — prima con slider nativi hand-rolled (niente libreria, per evitare il CDN esterno di Observable Inputs), **poi Observable Inputs vendorizzata su richiesta esplicita** (`shared/observable-inputs.min.js` + `shared/htl.min.js`, sua dipendenza runtime non ovvia — vedi sezione dedicata più sotto) e usata per gli stessi due slider. `#| inject` resta la prima vera applicazione del meccanismo nel progetto |

**Input di upload migrato a Observable Inputs (2026-09-04)**:
`shared/upload.js`'s `createInput()` rimossa del tutto — ogni pagina
chiama `window.Inputs.file({ multiple: true, accept:
WebGeoDS.Upload.accept, label: "Upload" })` direttamente (coerente col
pattern già usato dagli slider, nessun wrapper `shared/` per una
chiamata a una riga). `accept` esposta come costante pubblica invece
che incapsulata in una funzione. Le 3 pagine che non caricavano ancora
`htl.min.js`/`observable-inputs.min.js` (`geometry-validity.qmd`,
`topology-errors.qmd`, `geojson-shapefile-validator.qmd`) ora li
caricano. Verificato end-to-end su tutte e 4 le pagine (upload, esito
Validate/Check, nome file scaricato) + 16/16 map-tests + 51/51
smoke-test lessons — nessuna regressione.

**Tabelle Grid.js: NON sostituite con `Inputs.table()`, deciso
esplicitamente (2026-09-04)**. Stessa indagine sul sorgente
vendorizzato: la visualizzazione dati funzionerebbe (stessa forma di
array di righe), ma **non esiste un equivalente di `rowClassName`**
(l'unico hook è un formatter per cella, senza riferimento alla riga) —
la colorazione rosso/verde delle righe errore, in uso su tutte e
quattro le pagine con tabella, non ha un modo pulito di essere
riprodotta. Neanche l'aggiornamento in-place esiste (ogni chiamata
crea un `<form>` nuovo). In cambio si guadagnerebbe una vera selezione
righe (`.value` = oggetti riga selezionati, non indici — si
collegherebbe bene a `highlight()` già esistente in `map.js`, mai
usato da nessuna pagina) — ma nessuna pagina oggi userebbe quella
capacità. Deciso con l'utente: lasciare Grid.js com'è. Da
riconsiderare solo se si costruisce davvero l'interazione
mappa↔tabella (candidato naturale: l'Inspector, non ancora
pianificato nel dettaglio) — a quel punto va risolto anche il
problema della colorazione riga persa, non prima.

### 1.2 — GeoSpatial File Inspector (dettaglio)

Il "front door" della suite: upload → statistiche immediate.

```
Dataset
──────────────────
Features       12,453
Geometry       Polygon
CRS            EPSG:4326
Bounds         ...
Attributes     14
Invalid        23
Empty          4
Duplicates     17
```

Costo basso perché quasi tutti questi dati sono già sottoprodotti
della logica di diagnosi già scritta per il Validator (conteggio
feature, tipo di geometria, validità). Punto di ingresso naturale
verso gli altri tool:

```
Inspector
   │
   ├── Validate (già esiste)
   ├── Repair (già esiste)
   ├── Topology (esiste come articolo)
   ├── Reproject (Fase 1.3)
   └── Export
```

### 1.3 — CRS Inspector & Converter (dettaglio)

```
Upload → rileva CRS → visualizza → converti
```

Funzione distintiva, non solo un convertitore: **"Why does my layer
look wrong?"** — euristica di mismatch basata sulla magnitudine delle
coordinate:

```
EPSG:4326: coordinate 12.4, 41.9    → sembra lon/lat
EPSG:3857: coordinate 1380000, ...  → sembra Web Mercator
```

Probabilmente il tool con il **maggior potenziale di traffico** di
tutta la Fase 1: "la mia mappa è nel posto sbagliato" è spesso il
primo problema GIS che una persona incontra, prima ancora di sapere
cosa sia una geometria invalida.

---

## Fase 2 — Core Tools (Spatial Analysis)

Seconda ondata, dopo che la Fase 1 ha generato i primi segnali reali.

| Tool | Note |
|---|---|
| **Geometry Simplification & Generalization** | Slider di tolleranza, originale vs semplificato, riduzione vertici — introduce didatticamente Douglas-Peucker. Tool + articolo + esercizio nascono dallo stesso componente. |
| **Spatial Join / Overlay Explorer** | Intersection/Union/Difference/Symmetric Difference tra due layer caricati, con visualizzazione immediata. Il più "Spatial Data Science" dei tre, non solo QA — ponte naturale verso `sf`/`geopandas` come librerie, non solo come motore interno. |
| **Buffer / Distance / Proximity Tool** | Più semplice ma utile; può diventare un piccolo laboratorio ("quante feature entro 500m?"). |
| **Network / Routing Analysis** (aggiunto 2026-09-02) | Terza famiglia accanto a Vector/Raster, non una vertical app a sé — chiude il buco tecnico già segnalato in Fase 4 (l'Accessibility Calculator urbanistico "richiede routing, non solo buffer"). Reti stradali, service area, shortest-path, connettività. **Rischio tecnico da verificare prima di investirci sviluppo**: lato R, `sfnetworks` (sf + tidygraph, pensato esattamente per reti geospaziali) mostra build wasm-release OK su R-universe, ma dipende da `igraph`, il cui stato di build risultava FAIL in una verifica separata — discrepanza non risolta, solo ricostruita per ipotesi (probabile binario da una build precedente riuscita). Prima mossa concreta: `webr::install.packages("sfnetworks")` reale + un'operazione di routing minima, stessa disciplina già usata per `mapgl`, non fiducia nella sola dashboard. Lato Python: `networkx` confermato disponibile in Pyodide (3.4.2), nessun rischio noto. |

## Fase 3 — Core Tools (Raster)

Terza ondata — qui il progetto inizia davvero a differenziarsi dalla
miriade di tool vector online gratuiti.

| Tool | Note |
|---|---|
| **Raster Inspector & Statistics** | Dimensioni, risoluzione, bande, CRS, NoData, min/max/mean, istogramma. |
| **Raster Calculator / Band Math** | Espressioni tipo `(B4 - B3) / (B4 + B3)`. |
| **NDVI / Spectral Index Calculator** | Apre la porta al corso di Remote Sensing. |

**Nota di contesto**: `stars`/`xarray` sono già vendorizzati e
benchmarkati (`stars` ~2,5× più veloce di `terra`) ma senza nessun
contenuto corrispondente — questa fase riattiva un investimento
ingegneristico già fatto e finora senza ritorno.

---

## Fase 4 — Vertical Apps (condizionata, non pianificata nel dettaglio)

**Gate esplicito**: questa fase non si avvia finché non sono vere
TUTTE le condizioni seguenti:
1. Fase 0 completa (blog live, analytics attivo).
2. Almeno la Fase 1 (Inspector + CRS) spedita e con qualche settimana
   di dati reali — non solo Search Console, vedi framework sotto.
3. È stata fatta una scelta esplicita di **una sola** verticale da
   validare per prima — non un rollout parallelo su più settori.

### Come si sceglie la verticale (framework a 4 fattori, aggiunto 2026-09-02)

**Search Console da solo non basta come criterio**: una query può
generare molte impression e pochissimo uso reale del tool, o
viceversa (poco traffico ma completion rate altissimo). La decisione
va guardata da quattro angoli, non uno — non necessariamente con una
formula matematica, ma come lista di controllo esplicita prima di
impegnarsi su una verticale:

| Fattore | Cosa misura | Fonte |
|---|---|---|
| **Domanda** | Volume di ricerca/impression sulla query correlata | Search Console |
| **Engagement** | Chi arriva usa davvero il tool, non solo lo apre | Tool Utility Rate (vedi "Metriche da leggere") |
| **Monetizzabilità** | Segnali di disponibilità a pagare (non solo interesse) — es. click su link verso `lessons/`, risposte a un sondaggio, richieste dirette | Analytics + interazione diretta |
| **Costo di implementazione** | Quanto della vertical app è motore già esistente vs capacità nuova da costruire — es. un vero Accessibility Calculator richiede routing (vedi sotto), non solo buffer | Valutazione tecnica diretta |

Una verticale con domanda alta ma costo di implementazione alto
(routing, dataset di dominio reali da procurarsi) non batte
automaticamente una con domanda media ma costo quasi zero — la
decisione finale pesa tutti e quattro i fattori insieme, non il primo
che supera una soglia.

### Perché condizionata, non scartata

Il modello Problem → Article → Interactive Demo → Tool → Course è
strategicamente valido: risolve il problema, identificato nella
valutazione critica del progetto, che `lessons/` non ha ancora nessun
contenuto di dominio reale. **La prima vertical app che dimostra
trazione reale diventa candidata naturale per il primo vero
mini-corso** — una decisione guidata da dati, non da un'ipotesi a
tavolino.

### Perché non si decide ORA quale verticale

- La lista di candidati (telecom, urbanistica, ambiente, agricoltura,
  remote sensing, trasporti) è ampia — costruire una vertical app
  specifica prima di sapere quali query/argomenti generano interesse
  reale è la stessa scommessa a tavolino che ha già prodotto, in
  questo progetto, cicli di costruisci-e-scarta (il bridge a coda
  Python/R rimosso dopo essere stato costruito e testato per intero).
- **Non tutte le verticali sono ugualmente economiche**, anche se il
  motore sottostante è condiviso. Esempio concreto: *Buffer/Proximity*
  rietichettato come "Site Suitability" è quasi gratis (stesso
  `buffer()`/`st_buffer()` già disponibile). Un vero **Accessibility
  Calculator** urbanistico, nell'accezione standard del settore, vuole
  isocrone basate su rete stradale/tempo di percorrenza, non un buffer
  euclideo — richiede un motore di routing che oggi non esiste nello
  stack. Va verificato caso per caso prima di promettere una vertical
  app specifica.
- Le verticali che minimizzano il bisogno di dati di dominio reali
  (urbanistica/ambiente, dati sintetici illustrativi come le geometrie
  farfalla/clessidra già usate) sono più economiche da validare per
  prime rispetto a quelle che presuppongono dataset reali (telecom,
  agricoltura — infrastruttura o immagini satellitari).

### Candidati emersi (da validare con dati reali, non decisi)

- **Urbanistica / real estate**: Accessibility Calculator*, Service
  Area Analysis, Site Suitability Analysis.
- **Ambiente / ecologia**: habitat fragmentation, overlap con aree
  protette, connettività ecologica, hotspot spaziali.
- **Agricoltura**: analisi di parcella, statistiche zonali, NDVI time
  series, change detection.
- **Telecom**: copertura rete in fibra, service area, analisi di
  prossimità a infrastruttura.
- **Trasporti**: accessibilità, strutture più vicine, aree di
  cattura, network analysis.
- **Sanità / epidemiologia spaziale** (aggiunta 2026-09-02): diffusione
  geografica di malattie, cluster spaziali di esiti sanitari,
  disparità geografiche in indicatori di salute. Coerente col brand
  (resta "geo", non biostatistica generica senza componente spaziale)
  e si costruisce sugli stessi strumenti vettoriali già pianificati
  (overlay, hotspot spaziali) — nessun nuovo Core Tool necessario nel
  breve periodo, cambia solo il framing e il dataset d'esempio.

*(Accessibility Calculator marcato: richiede routing, non solo
buffer — ora coperto da Network/Routing Analysis in Fase 2.)*

---

## Fase 5 — Academy (corsi)

Sostituisce il placeholder attuale di `lessons/index.qmd`/`about.qmd`.
Fino a quando questa fase non parte, nessun lavoro su `lessons/` oltre
alla manutenzione di quanto già esiste (le due lezioni bridge restano,
vedi sotto).

### Modello a due binari, non un'unica lista di corsi

- **Corsi generalisti** (2, per ora): ampi, cumulativi, costruiti
  sopra i Core Tools già in roadmap (Fase 1–3) — gate **debole**,
  perché quei tool si giustificano comunque per SEO/acquisizione,
  corso o non corso.
- **Mini-corsi verticali/tecnici** (N, uno per vertical o tema
  validato): stretti, riusano ~80% di articolo+tool+demo già scritti
  — gate **forte** (Fase 4): non si scrive un mini-corso su un
  settore che non ha ancora mostrato trazione reale.
- **Fase futura, non pianificata**: estendere la stessa logica
  Core-Tools-prima a Spatial Statistics/Geostatistics e Spatial ML
  (vedi sotto) — non decisa ora, solo la direzione naturale una volta
  che la Fase 1–3 avrà dato segnali.

### I 5 corsi originari (visione a lungo periodo dell'autore), riclassificati

| Corso | Tipo | Allineamento oggi | Note |
|---|---|---|---|
| 1. Spatial Workflows & GIS Automation | Generalista | **Forte** | Distillazione dei Core Tools Fase 1–2 |
| 2. webgeods stack (Serverless Dashboards) | Mini-corso tecnico | Riclassificato | Pubblico sviluppatori, non praticanti GIS; le due lezioni bridge già scritte coprono metà del lavoro |
| 3. Remote Sensing | Generalista | **Forte** | Distillazione dei Core Tools Fase 3 (raster) |
| 4. Spatial Statistics & Geostatistics | Futuro, non pianificato | Assente | Serve prima una fase Core Tools dedicata (es. Autocorrelation Explorer, Interpolation/Kriging) |
| 5. Spatial Machine Learning | Futuro, non pianificato | Assente | Stesso problema di #4, più marcato — attenzione all'asimmetria R/Python: l'ecosistema R per spatial ML (`tidymodels`/`spatialsample`/`CAST`) è più frammentato di quello Python (`scikit-learn`-centrico), verificare la parità bilingue prima di costruirci sopra, non darla per scontata (stesso tipo di rischio già incontrato con `mapgl` in R) |

Il calendario originale ("un modulo ogni 6 mesi, 24–30 mesi totali")
resta **visione**, non impegno preso: la sequenza reale dei corsi 4 e
5 dipende dai dati di Fase 4 e dalle metriche di resa qui sotto, non
da una data fissata oggi.

**Idea futura, non decisa (2026-09-03): motore JS-first come estensione
Quarto pubblica**, legata al corso #2 sopra. `#| inject`,
`getCellValue()` e il caricamento lazy dei motori (Pyodide/webR
caricati solo al primo uso reale, non da subito) sono vantaggi
concreti già verificati in questa codebase rispetto a
[quarto-live](https://github.com/r-wasm/quarto-live) (l'estensione
di riferimento, mantenuta dal team r-wasm/webR) — ma il confronto
preciso (interop OJS di quarto-live, suo comportamento di default sul
caricamento, se supporti davvero `terra`) non è stato verificato
empiricamente, solo ipotizzato. `terra` in sé funziona in webR
(confermato: più lento di `stars` per il linking dinamico di GDAL,
vedi [[project-webgeods-raster-libraries]] — non "non supportato").

**Ritorno economico diretto: debole.** Le estensioni Quarto non hanno
un mercato a pagamento — nessun marketplace, distribuzione gratuita
via `quarto add`. Sponsorizzazioni (GitHub Sponsors) irrilevanti a
questa scala. **Ritorno indiretto plausibile**: credibilità e lead-gen
per il mini-corso "webgeods stack" (sviluppatori, non praticanti GIS)
— "l'ho costruita io, funziona, eccola" è un pitch forte. Contro: il
costo di manutenzione continua compete con un progetto già
affermato/finanziato (r-wasm/webR), ed è **fuori dal framework Core
Tools/Vertical Apps attuale** — stessa logica di gate già usata per
la Fase 4 (non costruire prima che il funnel principale abbia dati
reali) si applica qui, anzi più forte, dato lo stato attuale del sito
(giorno 3, zero iscritti reali).

**Packaging interno (solo per uso tra `blog/`/`lessons/`, indipendente
dalla domanda "pubblicarla o no")**: verificato che **non converrebbe
farlo ora**. Le estensioni Quarto non si installano centralmente, si
copiano dentro `_extensions/` di ogni progetto consumatore — stesso
problema di duplicazione che risolve già `sync-shared-assets.sh`,
solo con la cerimonia di `quarto add`/`quarto update` al posto di un
copia-e-incolla via script, e se l'estensione vive su GitHub ogni
modifica richiederebbe commit→push→tag prima che `quarto update` la
veda (contro il ciclo attuale: modifica `shared/*.js` → script →
`quarto render`, pochi secondi). I vantaggi del packaging
(versionamento, meccanismo di update standard, portabilità) pagano
solo quando esiste un pubblico esterno — cioè nel momento stesso in
cui si decidesse di pubblicarla, non prima.

**Conclusione**: rimandata, non abbandonata. Riconsiderare quando la
Fase 1 avrà dati reali E si starà pianificando concretamente il
mini-corso "webgeods stack" — a quel punto, prima di impegnarsi,
verificare empiricamente il confronto con quarto-live (pagina
quarto-live minima, provare `terra`, controllare l'interop OJS e il
network waterfall al caricamento) invece di assumerlo.

### Prezzo (ipotesi di partenza, da correggere con dati reali)

- **Corsi generalisti**: 149–249 $. Ampiezza, progressione,
  differenziatore bilingue reale — prodotto di punta, fascia corso
  tecnico comprensivo.
- **Mini-corsi verticali/tecnici**: 19–39 $. Deve restare un acquisto
  quasi d'impulso, cliccabile direttamente dalla pagina del
  tool/articolo gratuito — basso attrito, filtra solo chi è
  interessato davvero.
- **Bundle verticale** (es. "tutto Urbanistica: 79$"): idea per dopo,
  prematura finché non esistono almeno 2–3 mini-corsi nello stesso
  settore.

### Metriche di resa (da tracciare appena i primi prodotti esistono)

Non "quale vince", ma quale numero decide davvero la composizione tra
i due binari:

1. **Ricavo per ora di produzione** — probabilmente a favore dei
   mini-corsi nel breve periodo (costo di produzione basso).
2. **Tasso di conversione** da visitatore gratuito (tool/articolo) ad
   acquisto.
3. **Quota di acquirenti di un mini-corso che comprano poi anche un
   generalista** entro un periodo definito (es. 6 mesi) — è il numero
   che dice se i due binari si compongono (mini-corso come tripwire
   verso il generalista) o servono pubblici davvero separati.
4. **Revenue per Acquired User** (aggiunta 2026-09-02): ricavo medio
   generato per visitatore acquisito, non solo per vendita. Un
   mini-corso da 29$ con conversione 2,5% e un generalista da 199$ con
   conversione 0,4% possono sembrare molto diversi guardando solo il
   prezzo, ma questa metrica normalizza sul traffico effettivamente
   speso per ottenerli — è il numero giusto per confrontare
   l'efficienza dei due binari sullo stesso traffico, non solo il
   ricavo per vendita.

**Previsione di lavoro, non un fatto**: i mini-corsi vinceranno
probabilmente su "ricavo per ora di produzione" nel breve periodo — è
lo strumento più economico per rispondere alla domanda di fondo
("qualcuno paga webgeods per contenuto formativo?") a rischio minimo.
I generalisti vinceranno probabilmente su "ricavo per cliente" e
valore composto nel tempo (reputazione, referral, community). Se la
metrica 3 sopra risulta alta, il modello a comporre (mini-corso →
upsell verso generalista) è la scelta giusta; se resta bassa, sono
davvero due prodotti per due pubblici separati, e vanno pianificati
come tali.

### Relazione con la Fase 4

Ogni vertical app che dimostra trazione reale in Fase 4 genera la
candidatura per un mini-corso verticale — stesso meccanismo, non due
piani paralleli da riconciliare: la Fase 4 e questa Fase 5 sono due
metà dello stesso processo.

---

## Metriche da leggere, una volta live (Fase 0 completata)

- **Search Console**: impression/click per query — input diretto per
  decidere l'ordine reale tra Fase 1.3/1.4, se avviare la Fase 2, e
  uno dei quattro fattori del framework di scelta verticale in Fase 4.
- **Tool Utility Rate** (aggiunta 2026-09-02, sostituisce la voce
  generica "pagine viste + azioni completate"): non solo traffico, ma
  la quota di chi apre il tool e completa davvero un'azione utile —
  richiede gli eventi tool definiti in 0.5. Esempio per il Validator,
  a numeri di traffico ipotetici:

  ```
  10.000 tool_loaded
   7.200 file_uploaded      (72% — apre e carica)
   6.100 validation_completed (61% — arriva al risultato)
   4.300 download_clicked    (43% — porta via qualcosa)
  ```

  Distingue traffico SEO, interesse, uso effettivo e valore prodotto
  — molto più informativo delle sole page views, ed è l'input diretto
  del fattore "Engagement" nel framework di Fase 4.
- **Click interni** dal blog verso `lessons/`, una volta che esisterà
  una vera landing — segnale di funnel blog → corso funzionante.

---

## Previsione di ricavi e crescita (illustrativa, non un obiettivo)

**Leggi questa sezione come uno scheletro di modello, non come un
numero da centrare.** Zero dati reali esistono oggi (zero visitatori,
zero iscritti, zero acquirenti) — ogni cifra qui sotto è una stima
Fermi basata su benchmark di settore per prodotti tecnici di nicchia,
non su dati specifici di webgeods. Il valore della sezione è mostrare
**a quali leve il risultato è sensibile**, così i primi dati reali
possano sostituire le stime una per una, non l'intera tabella in
blocco.

**Struttura**: confronto tra tre varianti di funnel sulla stessa
traiettoria di traffico (scenario base). **Semplificata il 2026-09-02**
(su suggerimento esterno: la versione precedente rischiava di sembrare
più precisa di quanto un modello a zero dati reali dovrebbe sembrare)
— due checkpoint invece di quattro, cifre arrotondate, dettaglio
numerico ridotto. Il valore della sezione resta lo stesso: mostrare
quale leva conta, non produrre un numero da centrare.

### Assunzioni

| Leva | Valore usato |
|---|---|
| Iscrizione newsletter | 3% dei visitatori/mese (varianti B, C) |
| Conversione mensile lista cumulata → mini-corso / generalista | 1%/mese, 0,15%/mese degli iscritti cumulati |
| Conversione diretta visitatore → mini-corso / generalista (senza email) | 0,4% / 0,05% |
| Prezzo medio mini-corso / generalista | 29 $ / 199 $ |
| Primo mini-corso live / primo generalista live | Mese 9 / Mese 15 |
| Ads (solo variante C) | Da mese 18, non prima — ramp-up prudente (50→150$/mese), mai 300-500$/mese |

### Confronto — ricavo mensile

| | Mese 12 | Mese 24 |
|---|---|---|
| **A** — senza newsletter | ~1.000-1.500 $ | ~3.500-4.000 $ |
| **B** — con newsletter | ~1.500-2.000 $ | ~7.000-8.000 $ |
| **C** — newsletter + ads (da mese 18) | ~1.500-2.000 $ (ads non ancora attivi) | ~7.000-7.500 $ netto |

*(Mese 6: zero ricavi in tutte le varianti — nessun prodotto esiste ancora.)*

### Lettura onesta

- **La newsletter è l'unica leva che conta in questo modello**: circa
  raddoppia i ricavi a 24 mesi rispetto a nessuna raccolta email —
  compone ogni mese anche prima che ci sia qualcosa da vendere.
- **Gli ads, anche rimandati al mese 18 con un ramp-up prudente,
  restano a pareggio o leggermente sotto la variante senza ads** per
  tutta la finestra — 6 mesi non bastano a ripagare la spesa attraverso
  il meccanismo della lista. Non un problema di sequenza (già corretto
  una volta), un problema di periodo di payback che eccede l'orizzonte
  del piano — per questo in 0.9 sono esclusi, non solo rimandati.
- **Da correggere appena ci sono dati reali, in ordine di priorità**:
  (1) tasso di iscrizione newsletter reale; (2) conversione lista →
  acquisto, dal mese 9; (3) conversione reale se e quando si testano
  gli ads dal mese 18.

---

## Changelog di questo documento

- **2026-09-02**: creazione. Sostituisce/dettaglia l'artifact "Bussola
  d'Acquisizione" (Fase 0 pubblicata invariata nelle linee generali,
  qui dettagliata in sotto-passi inclusi il prerequisito git e la
  gestione continuativa). Fase 1 riordinata: Geometry Validation
  (fatto) → GeoSpatial File Inspector → CRS Inspector & Converter →
  Topology standalone (bassa priorità, valore già catturato
  dall'articolo). Introdotto il modello a due livelli Core Tools /
  Vertical Apps, con la Fase 4 esplicitamente condizionata a dati
  reali invece che pianificata a priori.
- **2026-09-02**: aggiunta la sezione "Stima temporale (schema)" —
  stime di sforzo (assumendo lavoro part-time/da solo, da ricalibrare)
  distinte da tempo di calendario minimo (attese esterne: DNS,
  indicizzazione, raccolta dati Search Console). Nessuna stima per la
  Fase 4: è un gate su dati, non su durata.
- **2026-09-02**: ricalibrata la stima temporale su lavoro **a tempo
  pieno** (confermato dall'autore) invece di part-time — Fase 0+1 in
  ~1 settimana lavorativa invece di 5–7. Aggiunta nota pratica: a
  tempo pieno il lavoro attivo di Fase 1 finisce prima che i dati di
  Search Console (0.7) siano pronti, quindi ha senso iniziare lo
  sviluppo della Fase 2 nella finestra di attesa — ma le decisioni di
  priorità dentro la Fase 2 restano comunque condizionate ai dati
  reali, non al tempo libero disponibile.
- **2026-09-02**: riscritta la Fase 5 (Academy) con la struttura a due
  binari — 2 corsi generalisti (GIS Automation, Remote Sensing) + N
  mini-corsi verticali/tecnici (incluso webgeods stack, riclassificato
  da corso generalista a mini-corso), più una fase futura non
  pianificata per Core Tools di Spatial Statistics/ML. Aggiunte fasce
  di prezzo ipotetiche (149–249$ generalisti, 19–39$ mini-corsi) e tre
  metriche di resa da tracciare per decidere la composizione reale tra
  i due binari. Confermato esplicitamente: questo file è l'unico
  riferimento di pianificazione per l'intero progetto.
- **2026-09-02**: confermato dall'autore acquisizione a freddo pura
  (nessun pubblico di partenza). Aggiunta la Fase 0.8 (Newsletter —
  form di iscrizione, lead magnet, sequenza di nurture) e la Fase 0.9
  (canali di acquisizione a pagamento: Reddit Ads, Google Search Ads
  su query ad alto intento, sponsorizzazioni newsletter di settore,
  LinkedIn Ads e conferenze come mosse successive — budget illustrativo
  300–500$/mese, non confermato). Aggiunta la sezione "Previsione di
  ricavi e crescita" con scenari rinnovati mese 6/mese 12 che
  incorporano newsletter e ads — esplicitamente etichettata come
  scheletro di modello da correggere con dati reali, non un obiettivo.
- **2026-09-02**: verificato il ROI degli ads richiesto dall'autore —
  a budget 400-500$/mese contro un prodotto inesistente (nessun corso
  live prima del mese 9), il ricavo marginale attribuibile era
  ~85-100$/mese: ROI negativo di 4-5x. Corretta la Fase 0.9: **nessuna
  spesa pubblicitaria prima del primo mini-corso** (mese 9), budget
  che parte piccolo (50-100$/mese come test) e sale solo se il ritorno
  si conferma. Riscritta la "Previsione di ricavi e crescita" come
  confronto a 24 mesi tra tre varianti di funnel (senza newsletter /
  con newsletter / con newsletter+ads sequenziati correttamente) sulla
  stessa traiettoria di traffico — trovato e corretto anche un errore
  di merge nella versione precedente (traffico "con ads" finiva più
  basso di quello organico-only). Risultato: la newsletter raddoppia i
  ricavi a 24 mesi, gli ads aggiungono un margine modesto (~570$/mese
  di vantaggio netto a fine periodo contro ~500$/mese di spesa) anche
  sequenziati bene — la newsletter resta la priorità, gli ads
  un'ottimizzazione successiva.
- **2026-09-02**: su richiesta esplicita dell'autore ("elimina gli ads
  prima dei 18 mesi"), spostato l'avvio degli ads dal mese 9 al mese
  18 in 0.9, con ramp-up prudente (50→100→150$/mese, non
  300-500$/mese). Ricalcolato il confronto a 24 mesi: con soli 6 mesi
  di finestra (mese 18→24), la spesa non fa in tempo a ripagarsi — la
  variante con ads resta netta SOTTO quella con la sola newsletter per
  tutta la finestra mostrata (mese 24: ~7.480$ vs ~7.600$ di B).
  Conclusione aggiornata in 0.9: gli ads sono **esclusi dal piano a 24
  mesi**, non solo rimandati — il periodo di payback del canale, a
  questa scala di budget, supera l'orizzonte del piano stesso.
- **2026-09-02**: revisione esterna del piano (valutazione 8,5/10),
  sei modifiche recepite. Alta priorità: (1) aggiunto **0.0 Backup**
  prima di `git init`, non solo il prerequisito git; (2) definiti gli
  **eventi analytics** (tool ed eventi funnel) da tracciare fin dal
  lancio, prima che manchino i dati per rispondere alle domande che
  contano; (3) aggiunta la metrica **Tool Utility Rate**
  (tool_loaded → file_uploaded → validation_completed →
  download_clicked) in "Metriche da leggere". Media priorità: (4) il
  gate della Fase 4 ora usa un **framework a 4 fattori** (domanda ×
  engagement × monetizzabilità × costo di implementazione), non solo
  Search Console; (5) aggiunta **Revenue per Acquired User** come
  quarta metrica di resa in Fase 5. Bassa priorità: (6) semplificata
  la "Previsione di ricavi e crescita" — due checkpoint invece di
  quattro, cifre arrotondate in fasce invece di numeri puntuali, per
  non dare un'impressione di precisione che il modello (zero dati
  reali) non ha. Confermato dalla revisione: nessun cambiamento alla
  sequenza delle fasi né al principio guida — il piano resta
  sostanzialmente lo stesso, solo più concreto in questi punti.
- **2026-09-02**: esplorate nicchie alternative (network analysis,
  time series, biostatistica) che riuserebbero la stessa architettura
  bilingue/browser-native. Trovato che le versioni generiche
  romperebbero la coerenza col brand (il nome stesso contiene "geo"),
  ma le loro intersezioni spaziali no — e coincidono con buchi già
  segnalati nel piano. Aggiunta **Network/Routing Analysis** come
  quarta famiglia di Core Tools in Fase 2 (non una vertical app: chiude
  il gap tecnico dell'Accessibility Calculator) e **Spatial
  epidemiologia** alla lista candidati di Fase 4. Verificato lo stato
  WASM: `networkx` disponibile in Pyodide senza rischi noti;
  `sfnetworks` (R) mostra build wasm-release OK ma dipende da `igraph`,
  il cui stato risultava FAIL in un controllo separato — discrepanza
  segnalata esplicitamente nel testo, non risolta, con una verifica
  empirica diretta (`webr::install.packages("sfnetworks")` + un
  routing reale) indicata come primo passo prima di investire sviluppo,
  stessa disciplina già usata per `mapgl`. Time series e biostatistica
  generiche scartate come fuori brand; le loro varianti spaziali
  (spatio-temporal, spatial epidemiology) già coperte da Fase 3 e dalla
  nuova voce di Fase 4.
- **2026-09-03**: seconda revisione esterna, questa volta del sito
  pubblicato (non del piano) — valutazione sintetica 8/10, punto
  debole indicato in SEO/content breadth (5,5/10, coerente con 0.7:
  solo 2 articoli, troppo presto per giudicare traffico). Tre
  suggerimenti genuinamente nuovi accettati e implementati: nome del
  file scaricato derivato dal file caricato invece di un nome generico
  (`WebGeoDS.Upload.baseName()`, promosso a `shared/upload.js`);
  callout "Private by design" su entrambi i tool, per rendere "il file
  non lascia il browser" un'affermazione di brand visibile invece di
  una frase nel testo; `tools/index.qmd` riformulata come "Spatial
  Data Quality Toolkit" con sequenza Inspect → Validate → Check
  Topology → CRS Inspector, onesta su quali esistono e quali sono
  "planned". Un suggerimento respinto esplicitamente: accelerare il
  calendario dei corsi sulla base della qualità della demo — la review
  stessa non ha potuto eseguire i tool con un browser reale, e zero
  iscritti/traffico reali non giustificano di derogare al gate già
  stabilito (Fase 4/5 attendono dati, non un giudizio di qualità).
