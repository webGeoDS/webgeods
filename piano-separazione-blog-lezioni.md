# Piano: separazione Blog / Lezioni — webgeods.com

**Stato: proposta da rivedere, nessun file del progetto ancora toccato.** (26/08/2026)

## 1. Perché separare

Il blog (articoli, PoC/webapp dimostrativi, eventualmente celle interattive a scopo divulgativo) e le lezioni (video + testo + webapp + celle, incorporate in Teachable via iframe) hanno esigenze di navigazione opposte:

- il blog deve essere **scopribile**: indicizzato da Google, con un navbar vero, una pagina indice/listing, categorie, condivisibile sui social — è il motore di acquisizione organica descritto nel Piano Operativo (§6);
- la lezione deve essere **quasi priva di cornice propria**: Teachable fornisce già in automatico sidebar, avanzamento e gerarchia multi-lezione (verificato nella conversazione precedente); un navbar/sidebar costruito lato Quarto sarebbe chrome duplicato dentro un iframe stretto, e probabilmente non va nemmeno indicizzata, trattandosi di contenuto pagato.

Un solo `_quarto.yml` che governa entrambe le cose costringe a un compromesso che non serve a nessuna delle due. La proposta è separare la configurazione di navigazione mantenendo condiviso tutto ciò che è motore/aspetto (JS, CSS, identità di marca).

## 2. Struttura di cartelle proposta

```
webgeods/
├── shared/                      # fonte di verità unica, non un progetto Quarto
│   ├── runtime.js
│   ├── python.js
│   ├── r.js
│   ├── code-cell.js
│   ├── map.js
│   ├── styles.css
│   ├── _brand.yml
│   ├── webgeods-cells.lua
│   └── alidade_smooth.json
│
├── blog/                        # progetto Quarto separato, pubblico
│   ├── _quarto.yml
│   ├── index.qmd                # listing page
│   ├── about.qmd
│   └── posts/
│       └── (vuoto per ora — nessun contenuto reale da migrare)
│
├── lessons/                     # progetto Quarto separato, per iframe Teachable
│   ├── _quarto.yml
│   └── test-architettura.qmd    # spostato qui: è già più un harness/lezione-test
│                                 # che un contenuto da blog
│
└── sync-shared-assets.sh        # script di copia (vedi §4)
```

Due progetti Quarto distinti, non uno con due "profili": più semplice da ragionare, e coerente con il fatto che le due configurazioni di navbar/robots/layout sono davvero diverse, non varianti dello stesso tema.

## 3. Cosa cambia in ciascun `_quarto.yml`

**`blog/_quarto.yml`**
- `project: type: website` (o `type: blog`, che aggiunge gratis listing/categorie/RSS — da valutare se un feed RSS interessa alla strategia di acquisizione)
- navbar vera: Home / Blog / About
- `theme: [cosmo, brand]`, con `_brand.yml` copiato da `shared/` (vedi §4)
- `page-layout: article` per i post di testo; `page-layout: full` da usare pagina per pagina per i PoC/webapp che vogliono più spazio orizzontale (es. una mappa a piena larghezza)
- SEO: `website: open-graph: true`, `sitemap: true` — pensato per essere trovato
- `toc: true` resta utile qui, come indice interno a un articolo lungo

**`lessons/_quarto.yml`**
- **nessun navbar** (Teachable lo fornisce già)
- niente sidebar/gerarchia Quarto — non serve, e sarebbe ridondante dentro l'iframe
- meta `robots: noindex, nofollow` su ogni pagina (contenuto pagato, non deve comparire su Google)
- `embed-resources: true` confermato — è ciò che rende ogni lezione un unico file HTML autosufficiente, il requisito minimo per funzionare dentro un iframe cross-origin senza dipendere da path relativi
- layout pensato per uno spazio stretto (l'iframe), non per la larghezza piena del browser

## 4. Asset condivisi: come evitare di duplicare a mano

Dato il vincolo già stabilito di non usare sintassi ESM/bundler nei file core (per l'inclusione diretta via `<script>` in Quarto), l'opzione più semplice e robusta non è un symlink — molti host statici (inclusi alcuni flussi di deploy di GitHub Pages) non garantiscono di seguire i symlink in pubblicazione — ma una cartella `shared/` come unica fonte di verità, con un piccolo script (`sync-shared-assets.sh`) che copia quei file dentro `blog/` e `lessons/` prima del render. Va lanciato ogni volta che si modifica un file in `shared/`, prima di `quarto render`. Se in futuro si accetta un build step minimo si potrebbe automatizzare meglio (Makefile, npm script), ma non è necessario adesso.

## 5. Hosting (nessuna decisione presa qui — solo l'impatto della separazione)

Entrambi i progetti possono restare inizialmente su GitHub Pages, stesso dominio, con due percorsi separati (es. `webgeods.com/` per il blog, `webgeods.com/lessons/` per le lezioni — più semplice da mantenere con un solo dominio custom rispetto a un sottodominio dedicato, ma è una scelta aperta). Il vantaggio di questa separazione: se in futuro si decide di spostare **solo** le lezioni su un host con funzioni edge (per un vero controllo d'accesso, discusso nella conversazione precedente), il blog non viene toccato — sono due deploy indipendenti fin da subito.

## 6. Cosa NON cambia

Il motore JS (`runtime.js`/`python.js`/`r.js`/`code-cell.js`/`map.js`), il filtro Lua (`webgeods-cells.lua`), le classi delle celle (`.webgeods-python`/`.webgeods-r`) restano identici e condivisi tra le due superfici — l'unica differenza è la cornice (navbar, indicizzazione, layout) attorno al motore, non il motore stesso.

## 7. Passi di esecuzione proposti (dopo approvazione)

1. Creare `shared/` e spostarci le copie di verità dei file elencati al §2 (oggi vivono alla radice del progetto).
2. Creare `lessons/`, spostarci `test-architettura.qmd`, scrivere il suo `_quarto.yml` minimale come da §3.
3. Creare `blog/` con uno scheletro vuoto: `index.qmd` (listing), `about.qmd`, cartella `posts/` vuota — nessun contenuto reale da migrare, come confermato.
4. Scrivere `sync-shared-assets.sh` ed eseguirlo una prima volta.
5. Verificare (con `pandoc` diretto, unico strumento disponibile in questo sandbox — non c'è `quarto` CLI qui) che `lessons/test-architettura.qmd` renderizzi ancora correttamente col filtro Lua dalla nuova posizione.
6. Aggiornare `claude/smoke-test.mjs` se il percorso del file HTML generato cambia.

## 8. Aperture esplicite, non decise qui

- Sottocartella vs sottodominio per le lezioni: proposta la sottocartella come default più semplice, ma è una scelta dell'autore.
- `type: website` vs `type: blog` per il blog: `blog` dà RSS/categorie gratis ma è più "opinionato" nella struttura; da confermare in base a quanto la strategia di marketing vuole un feed.
- Questo piano non decide nulla sul gating d'accesso delle lezioni (obscurity vs controllo su misura legato a Teachable) — resta una decisione separata, rimandata dall'autore.
- Verifica reale del render multi-progetto: non possibile da questo sandbox (nessun `quarto` CLI) — andrà controllata dall'autore prima di considerare la migrazione conclusa.
