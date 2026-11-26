# Design Principles

The single source of truth for layout, spacing, color, typography and component
sizing. Consult this before changing any of them.

## Navigation

- Private sections live under `/admin` (`/admin/notes`, `/admin/todo`,
  `/admin/library`, `/admin/principles`, `/admin/influences`,
  `/admin/stocks`, `/admin/ask`, `/admin/businesses/cubiq`,
  `/admin/businesses/trading`); old section URLs `307` to their `/admin`
  twin. `/` is the public homepage: published notes grouped by year then
  month, both toggleable. `/notes/[id]` is the public note view (drafts
  `404`); the private note editor lives at `/admin/notes/[id]`. Public
  presentation lives in DB `public_config` and is fetched by the server for
  public routes. Private admin presentation (the reminder) lives in DB
  `admin_config`; theme, entries language, column width and the summary
  prompt stay browser-only preferences.
  `GET /api/public/config` is safe for anonymous visitors, while
  `PATCH /api/config/public` belongs to the admin API namespace.
  The URL is
  the section state — no session storage, no `?from=` return links. Detail
  pages go back with browser history, falling back to their section root.
  The admin shell (header, Market card, section pills, composer, settings)
  lives in the `admin` layout; route pages only render their section.

## Layout

- **Page container** (every route): `mx-auto max-w-2xl px-6 pt-14 pb-24`.
  The width follows the Column width setting (Narrow `max-w-xl`, Standard
  `max-w-2xl`, Wide `max-w-4xl`); one value drives every route so the heatmap,
  the timeline and the tag pages line up on desktop. The public pages (`/`,
  `/notes/<id>`, `/tools/<id>`) read the same `fermentario.config` entry on
  mount, so they match `/admin` in the same browser.
- **Public header** (`PublicHeader.svelte`): every non-admin route shares one
  header — the `siteTitle` from `public_config`, a `House` button to `/` when
  the page is not `/` itself, a search button that opens the global palette,
  a help button, and the `Dashboard` pill to `/admin/notes`. The title links
  to `/`, and the slogan sits next to it from `md` up. A new public or tool
  page must render it inside its own container; the admin shell keeps its own
  header.
- **Reminder** (every admin view, between the header and Market): one optional
  message from Settings → General, stored in the journal
  (`admin_config.motto`, max 500 characters, line breaks kept). Warm amber
  card with a centered quote icon and `text-lg`/`sm:text-xl` text. Type `[[`
  to pick a note or principle; the `[[id]]` token renders as the shared link
  pill, with the label resolved live. It renders only when the text is not
  empty and carries no dismiss or collapse control, because the point is to
  keep it visible. It never appears on the public pages or in the bare EPUB
  reader.
- **Market rail scope**: holdings and trading sit under the header on the
  section views only (`/admin/notes`, `/admin/todo`, `/admin/library`,
  `/admin/principles`, `/admin/influences`, `/admin/stocks`,
  `/admin/businesses/*`). Heatmaps, Tags, a single note or task, Ask,
  Diagnostics and Settings pages open without the market rail.
- **Help dialog** (`HelpModal.svelte`, opened from the header): the slogan
  `Your sovereign life's dashboard` (`src/lib/brand.ts`) and two pill tabs.
  **Shortcuts** holds the 16:9 walkthrough placeholder and the shortcut list
  from `src/lib/shortcuts.ts`; **Commands** renders the registry from
  `src/lib/commands.ts`, with each command's code. Add every new shortcut to
  that file and every new command to the registry in the same change; AGENTS.md
  makes it a rule. Shortcut chips use `Kbd always` so they stay visible on
  small screens. The Commands tab explains `:`, the code, and the
  bare exact-code search.
  The heatmap is the one view that needs more room than
  672px for its 53-column grid, so its grid scrolls horizontally inside the
  container rather than widening the page.
- **Composer** (fixed bottom bar): `mx-auto max-w-2xl px-6 pb-8`. Same width as
  the page, so the bar and the content align with no gap. The bar is light
  grey (`bg-stone-100/95`) in light mode, not white, so the floating surface
  separates from the page; `FixedBottomBar` uses the same surface. Dark mode
  keeps `stone-900/95`. Focusing the bar
  shows a visual-only scrim behind it (`fixed inset-0 z-10`, same glass as
  the loading state: `white/25` plus `backdrop-blur-md`, `stone-950/25` in
  dark). It fades with the shared backdrop timing, stays while any bar
  control has focus, hides in fullscreen editor mode, and never blocks taps.
  Publishing a note or asking a question releases the bar, so the scrim fades
  and the result is visible; do not leave an empty focused bar blurring the
  page.
  The full-screen note
  editor carries an optional date/time pill; an empty value uses the current
  time. The chosen time becomes the note's `created_at` and the card enters the
  timeline in date order, not always at the top. The edit forms (timeline
  dialog and single-note page) expose the same date/time field; a changed date
  reorders the card, and a date below the loaded page removes it from view with
  a scroll-down toast.
- **Bottom clearance**: the page reserves `pb-[calc(var(--composer-h,4.5rem)+2.5rem)]`
  so the last note is never hidden behind the bar. The bar publishes its height
  as `--composer-h` via a `ResizeObserver`.
- **Holdings** (every view, between the header and the section bar): a
  touch-friendly horizontal
  carousel (`overflow-x-auto no-scrollbar snap-x`, no visible bar) of square
  boxes. First card is the black USD total — whole dollars, no cents, never
  truncated — with the BRL and UYU equivalents in grey beneath it, plus
  as-of date, stale mark, refresh, Stats (holding-stats modal) and the goals
  modal. Cash holdings follow the totals card in their API order, then the
  rest by monetary value, highest first, position only breaking ties. A BTC
  slot is always visible:
  it shows the holding when one exists, otherwise a fixed placeholder that
  opens the add form prefilled with BTC. A chevron header slides the strip
  shut (state in `ferm:holdings-collapsed`); the chevron rotates and, with
  the title, forms one toggle button. The collapsed row shows USD, BRL and
  UYU totals, with only the USD total bold, plus a small refresh button
  immediately after the last total that mirrors the totals card.
  Each box shows ticker bold
  top-left — the official orange Bitcoin coin, not the `₿` glyph or a line
  icon, sits left of a BTC ticker — with a category-health dot once goals
  exist: green when the
  category is within 2 points of its goal, yellow within 5, red beyond; no
  goals means no dot, individual holdings have no goals of their own, and
  absolute value targets never change the dot — and
  the monetary value big; below it the share count
  (`146 shares`, `0,1 BTC` — never a currency, shares are not money),
  the share of the total in percent, and an approximation in the other
  currency (`≈ R$ …` for USD holdings, `≈ $…` otherwise). The trend shows
  `—` with no previous day, `0.0%` when flat, otherwise the day-over-day
  percent; a quote older than a day appends `stale` with its date in the
  tooltip. Cash cards keep
  the account-currency total and show one `≈` line for every other known
  currency — BRL → USD and UYU, USD → BRL and UYU, UYU → USD and BRL —
  skipping a line when that rate is missing.
  Tap a box edits ticker, 3-letter currency, category, bank, country and the
  average cost; the amount only appears when adding. One `HoldingDialog`
  serves both: card taps open its Config tab, the card `+` opens its Trade
  tab (buy/sell form, market price, value graph, action ledger). A small grey `+` at the
  top-right corner opens the buy/sell modal instead of the edit form.
  Delete is confirmed. The modal states when the price was last written
  (`price_updated_at`), so a stale quote is visible before editing. There is no
  price field: every quote comes from the market through the cache. Cash
  holdings name their bank and country; the ticker
  is derived from the bank and the price stays 1. Fiat converts through cached
  `fx_rates`, BTC-ticker rows take the fetched BTC price, and B3/FII tickers
  take the Google Finance quote, with Fundamentus as fallback. Google updates
  intraday; Fundamentus only reports the regular-session close. Refresh runs
  at most once a day per quote: home
  open asks quietly and the server answers from cache until a quote is a day
  old, while failures keep cached values with a stale mark. The
  totals-card refresh button always forces (`{force: true}`) and refetches
  every auto-priced holding, even a quote fetched minutes ago. Staleness
  reads `price_updated_at`, never `updated_at`, so an amount edit cannot
  make an old quote look fresh. A
  forced holdings refresh also runs every 5 minutes while the tab is visible
  (quiet, 30-second check, skipped while hidden or while a refresh runs; any
  manual refresh restarts the clock). Both refresh buttons spin while it runs,
  including the collapsed-header one. A changed
  ticker or category drops the old quote and re-arms auto mode immediately,
  so a saved edit never freezes a price. The cache lives in `fx_rates`.
  Display cards share one height without a fixed value: the rail uses
  `items-stretch`, so the tallest card sets the row and every card matches it.
  Cards must not use `h-44`; that fixed box left ~30 px of dead space between
  the detail lines and Delete after forms moved to global modals.
  Card content starts at the top edge in every card: the asset card's edit
  button is a flex column, because a stretched `<button>` centres its content
  and drops the label and amount below the totals card's. The totals footer
  and the asset Delete row both sit on the bottom edge.
  The add form renders in the slot that opened it (BTC placeholder or `+`
  box), tracked by one flag, never in both.
- **Prices roadmap**: BTC auto-prices (Coinbase spot); B3 quotes come from
  Google Finance first (embedded `["TICKER","BVMF"]…[price,change,pct],null,
  previousClose` block, updated intraday) with the Fundamentus `Cotação` row
  as fallback (comma decimals normalized, regular-session close only); every
  other ticker uses the Yahoo chart, and fiat converts for the USD total.
  Every quote attempt is logged to `quote_fetch_log` (ticker, source,
  success, price, error). The **Quote fetches** button in Settings →
  Database opens the shared history, newest first — the single place for
  every stock, FII, BTC and Ripio fetch attempt. Ripio's venue price is
  `BTC_USDC` from the public `trade/public/tickers` endpoint (no key,
  60-second cache, stale served on throttle), shown as USD; it never
  touches the holdings BTC price (Coinbase), and the venue stays disabled
  until its trading rules exist. A
  full exchange
  API and a scheduled refresh are future work; the schema (`price`,
  `price_auto`, `currency`, `fx_rates`) already carries them, so no migration
  was needed when quotes landed. The UI never sends a price: the API keeps
  `price` for compatibility, and a supplied price still clears auto mode.
  Amounts are share counts, never money — cards show `146 shares`, value comes
  from shares × price.
- **Allocation goals**: tapping the total card opens the goals modal. Its
  allocation section edits BTC/FII/cash target percents, which must add to
  100 (`category_goals`, enforced server-side).
  Every holding card carries a category-health dot when goals exist: green
  within 2 points of the category goal, yellow within 5, red beyond. The
  Stats modal shows per-category USD, actual and goal percent, each asset
  as a share of its own category, and the gap amount in USD, BRL and UYU
  (`Need` when under, `Trim` when over). Holdings carry a category
  (`btc`/`fii`/`cash`, auto from ticker with an in-form override) and no
  goal of their own. Cash holdings count at face value.
- **Card order**: totals card first, then every cash holding, then the BTC
  placeholder when no BTC row exists, then the remaining holdings by value.
  Cash is the money you can spend, so it sits next to the total and ignores
  the value sort; several cash accounts keep their API order. Cash cards use a
  muted emerald tint (`border-emerald-200/80 bg-emerald-50/80`,
  `dark:border-emerald-900/70 dark:bg-emerald-950/40`), softer than the black
  totals card but distinct from the white asset cards. Cash and non-cash cards
  share one snippet, so their markup cannot drift.
- **Value targets** are independent from allocation goals: a category can keep
  its percent goal and also store an optional absolute target in
  `category_value_goals`. The goals modal edits both sections in one save.
  BTC targets are in USD; FII and cash targets are in BRL, fixed server-side.
  The Stats modal adds a neutral progress bar (emerald when reached) with the
  current value, target, percent of target and the signed gap. The ±2/±5
  allocation bands do not apply. A missing FX rate shows "rate unavailable"
  and null progress; never assume 1:1. The growth target is display-only and
  never changes the category-health dot.
- **Breakpoints**: mobile-first. `sm:` (640px) is the only breakpoint in use,
  for the desktop adjustments already present (composer padding, modal placement,
  heatmap height).
- **Section bar**: the left group (Notes, To-Do, Library, Principles,
  Influences) keeps drag reorder and scrolls as one line. Businesses and
  Stocks are fixed on the right, outside the persisted order and the Settings
  section list. Desktop is one row (`justify-between`, left group scrolls);
  mobile stacks the fixed pair on its own right-aligned line.
- **Stocks** (`StocksTab`): two tabs, **Consumables** and **Durables**, with
  counts, persisted in `ferm:stocks-tab`. Consumables group by category. Each
  category with a goal (`stock_category_goals`: `g`, `kg`, `ml` or `L`
  **per person**, people count, note; target = `people × amount`) shows a
  **Stock status** card at the top, one line per category: `have / target`,
  red bar below 60%, amber from 60%, emerald once covered, `Need X more` or `Covered`, buy estimate,
  people and note. The card collapses like Holdings: chevron rotates,
  content slides at 180 ms, state persists in `ferm:stocks-status-collapsed`;
  collapsed it reads `N need · N covered · N no goal`.
  Categories without a goal show `No goal` with an **Edit** button;
  every category row, with or without a goal, opens `StockCategoryModal`.
  The empty state links to the full `StockGoalsModal`. Item rows follow the card directly under it, grouped by
  parent group and category. The status card shows unmet goals always,
  covered goals behind a **Covered (N)** toggle and goal-less categories
  behind **Without goal (N)**, with a text filter for long category lists;
  cards show name, brand · category and `packages × size = total`,
  sorted by name; there is no days or price field on consumables. The
  consumable name is optional: the display title falls back name → brand →
  category → “Consumable”. Categories carry an optional parent group
  (Food, Fun…) stored on the category row; the status card and item lists
  group under it. `StockCategoryModal` is the only place to assign it:
  category name read-only, **Group** with existing-name suggestions, and an
  optional goal. Empty amount saves only the group and clears the goal.
  Each group block is a
  toggle with a chevron and `N` categories; collapsed state persists in
  `ferm:stocks-groups-collapsed`. The card header carries **Collapse all**
  and **Expand all** text buttons that set or clear that same key, so the
  status card and the item lists below it stay in sync. Stock adds `quantity × package_size` in the goal
  unit (`kg → g`, `L → ml`); mass items never count toward volume goals and
  vice versa. The category modal shows which units a category uses and defaults
  a new goal to that family's base unit (`g` or `L`); the header names the
  mismatch when the units differ. The old one-row days goal remains in the
  database for old backups and is no longer shown.
  Goal entry points: the empty-state link opens the full editor with a filter;
  **Edit** on any category header opens `StockCategoryModal` for that
  category, which saves group and goal in one request. The empty state also
  links to the goals modal.
  A package must carry a size (g/kg/ml/L); the form rejects an empty size so
  the item always counts toward its goal. Goal text lives in the category
  header. Item views show recent consumptions (`stock_item_actions`): the
  **Consume** button logs how much was used in the item's unit family and
  deducts the matching package fraction, clamped at zero and recorded in
  one step. Consumables carry an optional expiration date (`Expires
  (optional)` in the form); expired items sort first, then expiring soon,
  and the status card flags `N expired` or `N expire within 30 days`.
  **Print** and **Shopping** open `/api/stocks/print?scope=all|shopping`
  in a new tab: plain HTML with a Print button and print CSS, no download.
  `all` is the stock report. `shopping` is a simple checkbox list: group
  headings, then `N × size item · category` per unmet goal, or the missing
  amount when no package estimate exists. No stock/target, percentage,
  people, note, expiration or brand columns in the shopping list. Manual
  **Extras** sit below the grouped lines: a text field adds a line, and its
  `×` deletes the row permanently. Extras have no history and never appear
  in `scope=all`; the add form and delete buttons hide in print.
  Brand and Category are dynamic registries (`stock_registries`): the form
  fields suggest existing names and offer Create for a new one; saving the
  item reuses or creates the entry (case and Unicode normalized). Cards show
  `Brand · Category` under the name. Small info buttons open `FieldHelp`
  modals for packages, package size, brand and category.
  The form stacks its field pairs on mobile and scrolls inside the modal.
  Durables show bought date, where, price through the currency rule (currency
  defaults to BRL, editable, BRL/USD/UYU quick picks) and a localized age
  from the purchase date: `Hace 1 año`, `Hace 22 días`, `Hace 1 mes y 22 días`
  in Spanish; `Owned …` / `Tem …` in the other entries languages. Ended items
  show the lifespan (`Duró …`) under the ended date. Calendar years, months
  and days, never 30-day months. The status word (`Owned`, `Hace`, `Duró`)
  stays neutral; only the time span carries the emerald or muted colour.
  A density switcher next to the kind tabs toggles detailed and compact
  cards (`LayoutGrid` / `LayoutList`, persisted as `ferm:stocks-view`).
  Compact consumables keep the name and one package line; compact durables keep the name,
  purchase/price line and the split-colour age. Both compact views open the
  same item view. On `sm` and up a compact row is a single line (~48 px):
  thumbnail, inline name and data, status right-aligned; the stacked card
  stays mobile-only. Durables sit in a two-column grid from `sm`
  up; mobile stays one card per line. Cards carry the first photo and a `+N`
  badge (or the package icon); tapping a card opens a read-only item view
  with the full photo gallery and data. **Edit** is a text button in that
  view; Delete lives there too, with the usual confirmation. Up to eight
  photos per item, each downscaled to 1280 px JPEG and stored as a BLOB in
  `stock_item_photos` with its MIME; the first photo fills the card. Lists
  never embed bytes; images load from `/api/stocks/photos/<photoId>`. The old
  single-photo column is migrated into the gallery and the old item-photo URL
  still serves the first image.
  Businesses is a real pill with a placeholder page until its own build.
- **Task rows (To-Do)**: pills — status, tags, comment count — share one wrapped
  row under the title on mobile (< `sm`, `pl-12` indent); the comment pill is
  pushed to the card's bottom-right edge with `ml-auto` (a bare row right-aligns
  it on its own line). On desktop the same pills move inline into the title
  line, right-aligned just before the `⋮` actions button (`hidden sm:flex` on
  the inline group, `sm:hidden` on the stacked row). Principle cards do not
  follow this: their comment pill floats absolutely in the card's top-right
  corner (see **Principles** below) and only their chips row is right-aligned
  (`px-4` padding). Existing pills
  render twice in the DOM, once per breakpoint; do not re-stack them on
  desktop. The title line is `items-start sm:items-center`: mobile keeps
  first-line alignment, on desktop every element shares the ⋮ button's vertical
  centre. Right-align by flex (`ml-auto`), never `position: absolute` — an
  absolute pill overlays the open thread's Add form. Clicking a task title
  opens `/admin/todo/[id]`; it never opens the editor. Edit lives in the row `⋮`
  menu and as a text button on the task page, and both use the same
  `TaskEditModal` (text, video URL, and the group selector when more than one
  group exists). Detail pages link back with browser history, falling back
  to their section root.
 - **Nostr**: `/admin/nostr` — publishing plus a backup relay for one
   account. A status row at the very top carries a green dot (relay running)
   or a red dot (relay stopped) and the `Start relay` / `Stop relay` button;
   the page polls it every five seconds. Then, top to bottom: the two-color
   heatmap (published notes amber, replies blue), the **Backup relay** card
   (relay address + copy, notes and replies counts, last backup,
   `Sync now`), the account relay list (NIP-65 kind 10002, read-only), and the
   latest **five** notes. The only publishing action is the bottom bar's
   `Publish a note`; there is no list, delete,
   edit or wipe, because Nostr events are immutable and the local table is
   a cache of them. With no account the page says to add an nsec in
   Settings → Nostr instead of showing an empty "Nothing published yet".
   The publish modal has an account selector, a textarea, and a search that
   loads a Fermentario note's text as an editable draft. It never
   auto-publishes: only the Publish button signs and sends. Signing uses the
   nsec stored in Settings → Nostr; the nsec stays in the journal DB,
   backups carry it, and no response ever returns it.

   **Settings → Nostr** has one writable field, the nsec. The npub is
   derived; name, about and picture come from the account's kind 0 metadata;
   the relay list comes from kind 10002. All three are fetched from the
   account's relays on save and on `Refresh from relays`, shown read-only,
   and cached in the journal so publishing works offline.

   **Backup relay policy** (`/relay`): the relay stores the account's own
   kind-1 notes and replies in the active journal's `nostr_events` table. It
   writes only events signed by the configured pubkey and refuses every
   other author with `OK false` `restricted`; there is no AUTH handshake.
   Reads are open, because the notes are public. Backup means *pull*: the
   app imports the account's history from the relays that carry it. The
   admin shell starts the import on every page load when an account is
   configured, and reactively when an account is saved in Settings, so the
   section never owns the trigger. With no account, nothing runs. The client
   pages in the background (`until` cursor, 500 events per batch, 2 s
   between batches) so it never depends on a click and never bursts a relay.
   The newest batch always comes first, so new posts are picked up on every
   run even when the history is already stored; older pages stop at the
   first full batch that adds nothing new. The Nostr section shows the live
   count while it runs and the last check time. Events are deduplicated by
   id across relays by `INSERT OR IGNORE`. The only write to the network is
   the Publish button. Remove a relay address from another client and the
   events stay here.

   The import does **not** require this relay to be configured in another
   client: it pulls from every relay in the account's NIP-65 list plus the
   defaults. Adding `wss://<domain>/relay` as a write relay in Primal only
   makes new notes arrive by push instead of on the next visit.

   The WebSocket lives on the same HTTP server as the app. Production
   attaches it in `scripts/start.mjs`; development attaches the same module to
   Vite's server, so `/relay` works on `:4173` too. `Start relay` /
   `Stop relay` flips a `relay_enabled` flag in `data/registry.db`; a stopped
   relay destroys the handshake, and the flag survives a restart.
   `GET /relay` serves the NIP-11 document in both states. A reverse
   proxy in front must forward `Upgrade` and `Connection` for that path, or
   the handshake fails. In Primal, add the address the card shows
   (`wss://<domain>/relay` once the app is on its domain, or
   `ws://<lan-ip>:<port>/relay` locally) as a write relay for the account;
   `FERMENTARIO_NOSTR_RELAYS` (comma separated) replaces the fallback
   discovery relays for a self-hosted setup.
 - **Library (EPUB reader)**: `/admin/library` lists books as cards (title,
   author · size · progress · last read, `Read` pill, trash behind the
   standard confirm); the section bottom bar is one `Upload EPUB` button on
   a hidden file input. EPUB bytes live in the journal DB (`books.bytes`);
   uploads are multipart `POST /api/books` and title/author are parsed from
   the file **in the browser** (epub.js), so the server stores bytes
   verbatim and never unzips. DRM (a zip carrying `encryption.xml`) is
   rejected with a clear error. Reading opens `/admin/book/[id]`: the admin
   layout renders it **bare** (no shell, Market, pills or composer — the
   `bareReader` branch), because epub.js measures its container at mount and
   the page needs a definite `h-dvh` height chain (`min-h-dvh` resolves
   `height: 100%` to 0 and renders nothing). The bytes are fetched and
   handed to epub.js as an **ArrayBuffer**: an extension-less URL is treated
   as an unpacked directory — epub.js requests `META-INF/container.xml`,
   gets a 404 and hangs without ever rejecting. While opening, a soft
   `Opening book…` pill shows until the first view renders; a real failure
   gets the rose overlay, never a black void.
   TAPPING A MARK: one tap on a highlight opens its action sheet —
   `Highlight` + excerpt, then Add note / Edit note and Delete highlight
   — the same dialog standard as the list menus (backdrop fade, panel fly,
   Escape/backdrop close). It opens through the annotation click callback
   plus a parent-side hit-test fallback (marks-pane binds its proxy to the
   iframe document that existed when the pane was born; that document can
   be replaced, and a tap that misses the proxy must still open the sheet)
   . A mark tap is a dead gesture for chrome-toggling and paging. The reader shows only the book
   plus floating controls: back (history, falling back to Library), text
   size `A− A+`, `Index` (TOC) and `Notes` in a top-right glass cluster, a
   right-side drawer for both lists, and prev/next chapter pills docked in
   the bottom corners (safe-area aware, lighter glass than the content,
   hidden while the selection toolbar or note editor is open). SWIPE: a
   fast, mostly-horizontal touch drag pages the book — left = next, right
   = previous (< 600 ms, |dx| > 60 px, |dx| > 2|dy|), read from the touch
   events epub.js forwards out of the content iframe plus a direct
   parent-realm listener on each section document; a timeStamp gate makes
   the double delivery handle exactly once. CONTROLS
   TOGGLE: an `eye-off` button in the cluster hides the whole chrome (back,
   cluster, corner pills) and leaves only a faint eye pill at the top-right;
   a short unmoved tap on the page toggles the same way — guarded by touch
   time/distance, the touch-then-synthetic-click dedupe, taps landing on
   marks/links/buttons, and an open drawer (its first tap only closes it).
   The last CFI position, percentage
   and chapter save throttled (1.2 s), on tab
   hide and on `pagehide` with `keepalive`; opening restores from the CFI.
   Selecting text raises the bottom toolbar (Highlight / + Note); an empty
   window selection (iOS timing) falls back to
   `rendition.getRange(cfi).toString()` before the toolbar is dismissed.
   WebKit NEVER fires `selectionchange` inside the content iframes, so the
   engine's `selected` event stays silent on iOS: capture also runs 220 ms
   after every forwarded `touchend`/`mouseup`, reading the live selection
   and building the CFI with `new EpubCFI(range, contents.cfiBase)` — the
   same call the library makes internally. Both paths feed one
   `applySelection`, deduped by CFI so multi-path delivery is a no-op; the
   capture is scheduled BEFORE the tap-toggle tests, because the long-press
   gesture that selects always fails the tap path. iOS needs a second read
   (~500 ms later — the selection settles after touchend) and a per-section
   belt: `rendition.hooks.content.register` attaches the same capture to
   each section's own Contents, so no hop in epub.js event passing can
   silence it. A selection found WITHOUT the EpubCFI constructor is a
   broken import and must toast, never fail silently.
   `rendition.getContents()` returns an ARRAY (one Contents per
   view) — treating it as one object was enough to kill the whole capture;
   the poll loops over every view.
   FULLSCREEN: the cluster renders its button ONLY where the platform
   truly supports element fullscreen (capability check on
   `Element.prototype.requestFullscreen/webkitRequestFullscreen` plus
   `document.fullscreenEnabled`): desktop Safari/Chrome and Android.
   iPhone Safari has no element Fullscreen in a browser tab OR in PWA
   standalone — there the button simply does not exist; no toast
   explaining other features, no dead controls. `fullscreenchange` keeps
   the icon in sync. The hidden-chrome eye pill keeps a LIGHT surface
   with a dark icon in both themes: the book paper is always light.
   Highlights are amber marks stored in `book_notes` as CFI ranges +
   excerpt + optional note, tappable to jump, listed strictly newest-first
   — no client re-sort, which would fight the drawer's PAGING: the API
   pages by `(created_at, id)` cursor (`?limit=50`), the drawer loads on
   scroll with the shared TradeHistory sentinel + IntersectionObserver
   pattern rooted at its own scroll box, and the badge/header count comes
   from the response `total`, not the loaded rows. epub.js paints marks in
   an SVG pane: the styles argument is SVG ATTRIBUTES (`fill`,
   `fill-opacity`) — CSS properties like `background-color` are silently
   ignored. Text
   size persists in `ferm:reader-scale` (device preference, not journal
   data). No DRM, no search/RAG indexing of book text yet.
- **Businesses**: `/admin/businesses/cubiq` and `/admin/businesses/trading` routes, with
  the sub-tab pills linking between them. Cubiq is a Soon placeholder only. Trading is the
  swing-trade admin panel: one org at a time (B3 active; Ripio trades the
  same once enabled, prices in USD, and shows a Watch badge while off), open
  positions with live quotes and targets, the diary, and
  the rolling monthly exemption panel. Orders are raw events; a sale always
  closes the full position and only the latest order can be corrected or
  deleted (pencil and `×` in the diary row, which prefill the same sheet —
  the ticker and side are fixed there, and the server recomputes the
  money). The
  venue rules (fee %, dedo-duro %, fixed fee, monthly limit) are editable;
  new orders use them, past orders keep theirs. Each order stores the four
  rates it was recorded with (`fee_rate`, `spread_rate`, `irrf_rate`,
  `fixed_fee`); the edit sheet shows that snapshot as `Costs at the buy`
  (rate, the doubled total when the fee applies both ways, and the money at
  the typed values), an edit recomputes with those rates, and an open
  position's goal price uses the net-weighted average of its buys' rates.
  A fee change therefore never rewrites a past order, diary line or target.
  Ripio quotes use the
  signed Market ticker (`GET /trade/ticker/{pair}`) when API credentials
  are saved in Settings → Trading — real time, and `Test quote` labels the
  source. Without credentials, or after a 401/403 from a bad key, the
  public endpoint still answers (it lags up to 30 s); a key problem logs
  and never empties the cards. Credentials live in the journal DB
  (`api_credentials`; backups carry them), the admin endpoints report only
  `{configured, updatedAt}` — token and secret never leave the server —
  and read-only keys are the documented advice. The Ripio venue shows
  two cards side by side — `BTC · Ripio` (its footer names the source:
  `API key (live)`, `public`, or `public (API key rejected)`) and
  `BTC · Global` (Coinbase, `GET /api/quotes/btc-global`, which serves the
  same stored fx_rates BTC row Holdings prices with, under a day old; it
  deliberately never writes the quote log, since refreshRates already logs
  the Coinbase line). The two prices are the whole panel: no spread, bid/ask
  or gap line goes under them. `Refresh` bypasses every cache (Ripio
  `force=1`, Coinbase `force=1`, panel summary `refresh+force`). Ripio has no `Disable` button: the venue stays on. An
off venue shows a Watch badge and one `Enable` button. The
  forward call and the
  potential percent are net-based through one shared helper: a sale repays
  fees, dedo-duro and the fixed fee from the current rules, so `Sell`
  means the net profit clears the target. The ticker field suggests
  from the B3 universe in `b3_tickers` (seeded liquid names, custom rows for
  the future admin, 24-hour server cache); free text still saves any
  well-formed ticker. SELL mode ranks open tickers first. A sale past target
  shows green `Sell` only when the position is older than today; a position
  opened today shows a soft red `Day trade` pill instead. Diary lines show
  the exact date plus the bare duration (`12 Nov · 7 days`) — no verb, so
  no language can leak through; position cards show the localized open age
  (`open 7 days ago`, `abierta hace 7 días`). Featured notes sit in the
  shared toggleable section, like every collapsible group. The
  home page carries a trading strip below the holdings carousel, always
  visible once loaded: same card rail, one card per open ticker with its
  swing call
  (`Sell`, `Day trade`, `Hold`, `No quote`) with the quantity, the current
  price, and a goal group in its own inset box (`rounded-xl`, muted fill,
  9 px `Goal` label). It is a labelled column, not one ambiguous line:
  `price R$ 45,36`, `gross R$ 136,08` (price × quantity), `net R$ 136,03`
  (cost × (1 + target), i.e. after the sale costs) and emerald
  `gain +R$ 3,96`. The gross row exists so the reader's own multiplication
  lands on a number the card prints; without it the price and the net look
  inconsistent. One snippet renders it in compact and detail cards. The
  trade detail modal repeats the same chain under its `Goal` row: gross at
  goal, the itemised sale costs at that price, then `= net · +gain`, so the
  modal never claims a net the reader cannot rebuild from the price. Plus
  the average
  buy with the `Δ to goal` gap (red below the goal, green once reached),
  and the trend, plus an empty state that opens Businesses → Trading. A
  crypto card prints the bare quantity and drops the coin name after it:
  `BTC` already sits in the header, and the name after eight decimals
  squeezed the pill into `Ho…`. B3 keeps `3 shares`, space included. The
  strip reloads on every diary change, every 60 seconds, and when the tab
  becomes visible again. One collapsible Market
  card groups the holdings rail, the trading rail and a single action line:
  global `Update` (one forced refresh for holdings plus every open trading
  ticker via `POST /api/market/refresh`, button spinner only, never the
  global loader) and `Logs` (the shared quote history, grouped by day).
  The action line renders only while Market is expanded
  (`CollapsibleSection` prop `actionsOnExpandOnly`): Update and Logs act
  on hidden content otherwise. Update is the only global refresh. A card
  refreshes its own ticker instead: on a holding card the refresh icon sits
  top-right, left of the buy/sell `+`; on a trading position card it sits
  immediately right of the Info icon. Cash and a hand-priced holding
  (`priceAuto` false) show no refresh icon.
  On every strip read a position whose live
  quote reaches or passes its target (`recommendation` `sell` or
  `daytrade`) alerts once through a success toast **with sound**
  (`showToast(text, 'success', true)`): edge-triggered per `orgId:ticker`,
  remembered in `localStorage` (`ferm:trading-goal-alerts`) so reloads and
  the 60-second reload never repeat it; dropping below target or closing
  the position forgets the key. Simultaneous crossings share one toast.
  One shared `CollapsibleSection`
  implements the toggle pattern (chevron, `slide` over `motionMs(180)`,
  `localStorage` memory) so all collapsibles animate identically. Tapping any position card
  opens its detail modal: free TradingView chart (`BMFBOVESPA:TICKER`, daily — the widget resolves B3 under `BMFBOVESPA`, not `BVMF`),
  average buy, latest market price with fetch time, current total, and the
  goal price with its distance from the market. From the home strip the
  modal also offers `Open in Trading`. Card and modal totals are net: the
  quote value minus the sell fee, dedo-duro and fixed fee — what a sale
  would actually yield. The monthly panel counts sales, buy-plus-sell fees,
  dedo-duro and realized profit per month; the R$ 20,000 ceiling sees sales
  only, and months without sales say so instead of printing zeros. Section
  order is positions → monthly panel → diary. Every collapsible group —
  Market, Holdings, Trading, open positions, Featured — is one shared
  `CollapsibleSection` (chevron, `slide` over `motionMs(180)`, remembered
  state read synchronously at init so remounts never flash open-then-shut).
  The tab root and page wrapper guard horizontal overflow with
  `overflow-x: hidden` (universal support — `clip` silently does nothing on
  older engines, which reads exactly like a fix that never landed); the
  diary table keeps its own internal scroll, grid items carry `min-w-0`, and
  the header action row wraps down to 320 px screens. The diary is a table
  (`Date | Operation | Qty | Unit | Value | B3 fee | Dedo-duro | Net |
  Profit | delete`): the two levies stay in their own columns, dedo-duro  shows `—` on buys. The Ripio diary is `Date | Operation | Qty | Price |
  Value | Fee | Goal | Goal price | Net | delete` — Fee is never dropped
  when the goal columns are added. Its cell states the round-trip total —
  the order's fee doubled, since the venue charges it on the buy and again
  on the sell — with the rate in parentheses and an `ArrowRightLeft` icon.
  Only `+ Buy` (emerald) sits in the Trading header row; the cost rules
  open from the `Fees` button. A sale starts from the open-position card's
  rose `Sell` button, because a sale always closes one whole position:
  that sheet asks only for the price the venue offers (plus the date) and
  shows the gross, the net and the delta against the cost — green `Earns`,
  rose `Loses` with the note "Below cost after fees" — then a
  `ConfirmDialog` records it. Profit and delta percentages print two
  decimals on every trading surface (card, sheet, diary, strip); the goal
  rate prints one decimal where it is shown. One number, one precision. The
  header no longer carries `− Sell`, and the diary gains no sell action.
- **To-Do group row**: the new-group `+`, the in-progress filter and every
  group pill share ONE line at every width. The row is a horizontal carousel
  (`overflow-x-auto no-scrollbar snap-x`) and never wraps on desktop; extra
  groups scroll sideways.
- **Comment count pills**: zero comments uses `bg-stone-100 dark:bg-stone-800`
  with muted text. A count above zero uses one darker step,
  `bg-stone-200 dark:bg-stone-700`, with darker text. The difference is subtle
  but visible at a glance, and the count remains the primary signal.
- **Comments standard (all surfaces)**: there is no comment input outside a
  modal and no comment list in any list row. The modal only takes text for
  ONE new comment (`CommentModal`: plain "Add comment" title, textarea,
  Add button below the textarea right-aligned like every form dialog) and
  closes itself after the comment is stored — it never shows a thread and never deletes.
  The comment list lives ONLY on the single item page
  (`/admin/todo/[id]`, `/notes/[id]` public, `/admin/notes/[id]` private, `/admin/principles/[id]`): rows with date and four
  actions — copy, pin, edit and a confirmed `×` delete (danger
  `ConfirmDialog`, `aria-label="Delete comment"`) — plus an "Add comment"
  button that opens the same modal. Edit reuses `CommentModal` with the
  existing text prefilled,
  "Edit comment" title and a Save button. The list shows pinned comments
  first, then newest first (`pinned DESC, created_at DESC, id DESC`); a new
  comment is added to the local list and re-sorted without a reload. A pin
  button sits before edit (`Pin` icon, amber and filled when pinned,
  `aria-pressed`, `Pin comment` / `Unpin comment`); several pinned comments
  keep the newest-created first. Copy uses the `Copy` icon and writes the raw
  comment text; on success it swaps to a green `Check` and `Comment copied`
  for 1.5 s, the icon equivalent of the note menu's `Copied`. A missing
  clipboard API shows the standard toast. `PATCH
  /api/{notes,todo/items,principles}/[id]/comments/[commentId]` accepts
  `{ content? }`, `{ pinned? }` or both; edits keep `created_at`, so the
  newest-first order and the comment's position do not change. Comment text
  is `text-xs` (12px), one
  step below the single-item content. A comment longer than one rendered
  line is clamped to one line with an ellipsis; click the comment text to
  expand, click again to contract, exactly like notes. Short comments stay
  plain and non-clickable. The fold uses the note standard's 180 ms
  max-height animation, honors reduced motion, and persists expanded ids in
  `localStorage` (`ferm:expanded-comments`); long comments start collapsed.
  The count pill on list cards is the add entry point everywhere
  (`aria-haspopup="dialog"`). Comment routes and count bookkeeping stay per
  surface. Notes carry the same standard end to end since: `note_comments`
  table + `/api/notes/[id]/comments(-/[commentId])` routes,
  `Note.commentCount` batched with the tags query, the pill on note cards
  in every timeline mount (bottom row on mobile, inline before the ⋮ on
  desktop) and a module-shared delta map so both mounted timelines show
  the same count. Principles have a single page too
  (`/principles/[id]`, reached through the card actions menu's first
  "Open" item); it renders content, tags, video and the comments section.
- **Note titles**: notes have an optional single-line title, edited only in
  the two edit forms (the timeline dialog and `/admin/notes/[id]`), never in
  the composer. Whitespace collapses, the value is trimmed and capped at 120
  characters, and an empty value clears it. A title renders above the content
  everywhere: 15 px semibold in list rows and an 18 px heading on both
  single-note views. It never replaces the body. The public index shows the
  title alone, or the excerpt when the note has no title. The public page `<title>` and social titles use it
  when present; the description stays derived from the content.
- **One note body, every note surface**: `src/lib/components/NoteBody.svelte`
  renders the note on the admin timeline, the tag pages, the admin note page
  and the public note page. Fixed order: cover, title, linked pills, markdown
  body, tags, video. The body folds the same way on all four: chevron, one
  clamped line when collapsed, the same 180 ms animation and the same stored
  fold ids. `variant` only changes the title size (15 px row, 18 px page) and
  the cover cap (`max-h-40`, `max-h-80`). Never hand-write this markup again
  in a note row or a note page.
- **The public index is a blog list**: `/` lists each published note as
  cover, title (or the 160-character excerpt when the note has no title),
  date, comment count and linked pills. It never renders the body, never
  folds, and shows no tags or video. Only `/notes/<id>` renders the note.
  Do not reuse `NoteBody` here.
- **Notes fold + markdown**: any note longer than one rendered line folds
  to one clamped line (native `line-clamp` ellipsis) when you tap the note
  text, and expands on tap again — long paragraphs without newlines are
  foldable too (foldability is measured from the rendered height, not
  counted from newlines). A persisted fold is trusted without re-measuring
  its length, but a reloaded fold must also carry the one-line `max-height`
  cap beside the clamp — WebKit under-clamps with the clamp alone and shows
  the card half contracted — so the measure pass gives every collapsed id
  without a cap the same `ceil(lineHeight)` value a manual fold ends with.
  Short notes stay plain, non-tappable text. Tags, video pill, featured
  star and amber border stay visible while folded. The fold animates over
  180 ms by measuring the full text height: the one-line clamp comes off before
  expansion and returns only after contraction finishes. The collapsed
  one-line `max-height` stays until expansion — clearing it in the same frame
  as the clamp paints leaves one unclamped frame, so the card flashes back to
  full height. The clamp lives on an
  inner span inside the text button, not on the button itself: WebKit does not
  reduce a button's layout height for `-webkit-line-clamp`. Reduced motion turns
  the height animation off. Folds persist in
  `localStorage` (`ferm:collapsed-notes`, array of note ids) across reloads until
  expanded. THE FOLD MAP IS MODULE-STATE, SHARED BY EVERY MOUNTED TIMELINE:
  the home page (and tag pages) render two timelines at once (featured
  section + history) that hold the same ids, so a per-instance map with a
  shared storage key let the last fold wipe earlier ones. Storage loads
  once per page view and is only pruned on expand. Note text renders light
  markdown — `**bold**` and `*italic*` only
  (`src/lib/markdown-inline.ts`, escape-first then two tag rules) — in the
  timeline (folded and full) and the note page; editors, copies and
  exports stay raw. The fold lives in `src/lib/note-fold.svelte.ts`, so the
  public homepage folds exactly like the admin list, with the same storage
  key. Single-note pages show the full body and do not fold.
- **Note links**: `[[uuid]]` links to a note or a principle — notes resolve
  first, then principles — and the label always renders live from the
  target's first line, both inline (as a pill) and in the linked-entries pill
  row at the top of the card and the detail page. Typing `[[` in the composer,
  fullscreen editor, note edit dialog or principle add/edit fields opens an
  inline finder over `/api/search` (notes and principles, Enter picks,
  arrows move, Escape closes). A finder pick writes the id into the raw
  text, so copies and exports carry `[[id]]`. Deleted targets render as
  muted text, never a dead link. Links are derived from content at read
  time (`linkedNotes` batched in `withTags` and the principle queries); no
  link table, no migration. The target follows the surface: public surfaces
  link notes to `/notes/<id>`, the private app to `/admin/notes/<id>`;
  principles always open at `/admin/principles/<id>` (no public page). Principle surfaces stay markdown-free: pills
  render through a links-only pass, and tapping a card-embedded pill never
  folds the note or opens the edit dialog.
- **Holdings add/edit** opens in a global modal (same overlay standard as the
  comment modal), so the carousel cards never resize around a form. The modal
  owns its draft, validation and saving; the carousel only opens it with an
  initial value and refreshes on success.
- **Buy/sell ledger** also opens in a global modal: a small form at the top,
  the recorded actions scrolling below it. Buys and deposits are green, sells
  and withdrawals are red. The opening row is the quantity the holding had
  when the ledger started, and its price is the average cost. Every later row
  records the price paid or received; the field defaults to the market quote,
  can be edited, and has a **Use market** shortcut. The card keeps showing the
  live quote. A sell larger than the current total is rejected, and an amount edit
  through the API shifts the opening row so the ledger still sums to the
  total. Cash rows hide the stored face-value unit price: the deposit,
  withdrawal or opening balance shows one signed money value, never
  `R$ 1,00 / unit` or a repeated total. v1 records only: no backdating,
  editing or deleting past actions.
- **Value history** keeps one point per holding per day plus one portfolio
  total per day (`holding_value_history`, `portfolio_value_history`). Later
  fetches upsert the same day, so the day holds the last value seen. The
  buy/sell modal shows a 1-year line chart of the holding value in its native
  currency; the totals card has a chart button for the portfolio total in USD.
  Every card, cash included, carries a trend icon: green `TrendingUp`, red
  `TrendingDown`, or a neutral `Minus` at `0.0%`. The delta compares the
  current day with the **previous day**; same-day refreshes only update
  today's row. The first day has no previous day and shows `0.0%`. The totals
  card carries the same icon, comparing `totalUsd` with the previous day's
  portfolio row.
- **Category groups**: group names are category labels, not a separate
  registry. The `StockCategoryModal` group dropdown lists existing names and
  gives each one an `×`; deleting a group clears it from every category using
  it after a confirmation, and the categories stay.
- **Note print**: every note's ⋮ menu carries **Print / PDF**, in lists and on
  the note's own page. It opens `/api/notes/<id>/print` in a new tab: plain
  HTML with the title, date, cover, the same light markdown as the note body
  (bold and italic, line breaks preserved), tags and
  the YouTube link, plus a **Save as PDF** button that calls `window.print()`.
  The browser dialog saves the PDF; there is no download and no server-side
  PDF. The bar prints as the title and only its button hides. The shared shell
  and `esc` live in `src/lib/print.ts`; the stock print page reuses them.
- **Note card gestures**: the fold toggles only from a small chevron at
  the text's left edge (rotating `ChevronDown`, 20 px so it stays under
  the one-line cap, `aria-expanded`) — the note body itself is plain
  selectable text and must never swallow drag-selection, so copying from
  the list works everywhere. Opening a note lives in the ⋮ menu ("Open
  note"; not offered by the ⋮ menu on the note's own page). Comments use
  the identical chevron pattern. Every note card puts all its metadata in
  **one** header row, never in a left column: the time link, the `Public`
  pill, the `edited` marker and the featured star sit on the left; the
  comment count and the ⋮ actions button sit right, `ml-auto` at 28–32 px
  so the row is one compact line on mobile and desktop alike. The body and
  tags then span the full card width under that row. `edited` is inline
  text at 10 px uppercase with the exact timestamp in its `title`, not a
  separate bottom row, so a short note uses one line of chrome, not three.
  The same one-row header standard applies to the single-note pages, whose
  `edited` marker already sits in the date row.

## Spacing

A `0.5rem` rhythm. The values already in use:

| Token | Value | Used for |
|---|---|---|
| `gap-1` | 0.25rem | chips, tight rows |
| `gap-2` | 0.5rem | buttons, list items |
| `gap-3` | 0.75rem | card internals |
| `mt-2` / `mb-2` | 0.5rem | chip rows, small separators |
| `mb-4` | 1rem | day sections, card groups |
| `pt-14` | 3.5rem | legacy page top (retired: no fixed header anymore; the page uses `pt-[max(1rem,env(safe-area-inset-top))]`) |
| `pb-24` | 6rem | page bottom |
| `px-6` | 1.5rem | horizontal page and composer padding (page uses `px-2` below `sm`) |

Do not introduce a new spacing value without checking this table first.

## Color

- **Neutral**: the Tailwind `stone` scale. `stone-100` fills, `stone-200` empty
  heatmap cells, `stone-300` borders, `stone-400` secondary text, `stone-500`
  chip text, `stone-600` buttons, `stone-900` primary actions and headings.
- **Heat**: the `amber` scale, five steps by note count (`amber-200` → `amber-500`),
  relative to the busiest day. `stone-200` is the single neutral for every day
  without notes, past or future.
- **Danger**: `rose-600` text, `rose-50` fills, `rose-300` borders, for delete and
  destructive confirmations.
- **Success**: `emerald-600` text, `emerald-50` fills, for confirmations.
- **Accent**: `amber-400/50` for the weekly recap and processing states.
- **Published pill**: `/admin/notes` carries one soft green filter pill next to
  `N notes loaded`. It is off by default and shows every note; pressed, it sets
  `published=only` on the shared `NotePager`, reloads the same list and updates
  pagination, so the filter never depends on what was already loaded. OFF is a
  plain white pill with an `emerald-300` border and emerald text; ON is a solid
  `emerald-600` fill with white text and a leading `Check` icon, so the state is
  visible at a glance (soft tints alone read as the same pill). It never uses
  the `stone-900` active fill of the section pills. Unpublishing a note while
  the filter is on removes it from the list at once.
- **Task images**: the `New task` form has the same `Choose image` control as
  `EditNoteDialog` (`fileToPhotoUrl`, then a 28×20 thumbnail with a remove
  button). The item is created first, then the image is posted to
  `/api/todo/items/<id>/photo`, because the image needs the item id; a failed
  upload keeps the task and says so. The bytes live in `todo_item_photos`
  (migration 42), one row per item, and the row shows a 112×80 thumbnail under
  the text. `TodoItem.photoId` is the only field the client needs.
- **Video**: notes, tasks and principles can carry a YouTube video, marked with a
  `red-600` pill (the brand red — the one deliberate exception to the palette).
  The pill toggles the click-to-load embed below it. On a principle card and a
  task card the
  pill sits at the right edge from `sm` up, matching the tags row;
  on mobile it stays left (tasks indent it with the text). On a principle's
  own page the block starts open without autoplay; the pill still toggles it,
  and the iframe stays click-to-load.
- **Dark mode**: Settings → General offers `light`, `dark` and `system`; `system`
  follows the OS live. The choice persists as `theme` in `fermentario.config` and
  becomes the `dark` class on `<html>` before first paint. Use Tailwind's native
  `dark:` variant only. Map surfaces `white` → `stone-900`, the page `white` →
  `stone-950`, borders `stone-200` → `stone-800`, headings `stone-900` →
  `stone-100`, and primary fills `stone-900` → `stone-700` (hover `stone-800` →
  `stone-600`) so controls stay visible on dark panels. Heat cells map
  `amber-200/300/400/500` → `amber-900/800/600/500`; empty cells `stone-200` →
  `stone-700`. Keep `text-white` on primary fills.

## Typography

- Scale: `text-[10px]` (metadata, heatmap labels), `text-[11px]` (chips, hints),
  `text-xs` (12px, buttons), `text-sm` (14px, body secondary), `text-[15px]`
  (note content), `text-2xl` (page headings).
- Inputs never go below `16px` (`text-base`): iOS Safari auto-zooms on focus
  when a field is smaller, and it ignores `maximum-scale`/`user-scalable=no`,
  so the viewport stays zoomable and every `input`, `textarea` and `select`
  that takes text uses `text-base`. Display text keeps the scale above.
- Number entry uses `type="number" step="any"` (spinners hidden globally) for
  the numeric keyboard and letter blocking; parsing still goes through the
  single `parseDecimal` in `src/lib/numbers.ts` (one comma or dot accepted,
  everything else rejected), because browser locales disagree on what a
  comma key produces. Never parse money with a bare `Number(...)` plus a
  comma replace.
- Section headers: `text-xs font-medium uppercase tracking-widest text-stone-400`.
- Day headers in the timeline are the exception: normal case, because they read
  as words ("Today", "Yesterday").
- Single-item content (note, task, principle detail pages) is
  `text-[15px] font-semibold`. Comments stay normal weight so the item reads as
  the page subject, and use `text-xs` (12px) so they sit one step below it.
- Entity detail pages have a `text-2xl` page heading. The type label comes first,
  followed by the short UUID as `text-sm font-normal tabular-nums text-stone-400
  dark:text-stone-500` (for example, **Task #a1b2c3d4**). The full UUID stays in
  the `title` tooltip.
- Month headings in the Done tasks list use the section-header style.

## Currency

- One formatter only: `fmtCurrency(value, currency, decimals = 0)` in
  `src/lib/currency.ts`. Do not use `Intl` with `style: 'currency'` directly:
  `es-UY` renders UYU as `$`, the same glyph as USD.
- Symbols are fixed and precede the number: USD `$`, BRL `R$`, UYU `$U`.
  Unknown currencies use their ISO code (`EUR …`).
- The number uses the currency's locale: `$1,234.56`, `R$ 1.234,56`,
  `$U 9.732,00`. Decimals are explicit: 0 for totals and goals, 2 for
  holdings and trades.
- `$` attaches to the number; `R$` and `$U` take one space.

## Component widths

Pick an existing size instead of inventing a new one:

| Component | Width |
|---|---|
| ConfirmDialog | `max-w-xs` |
| CommentModal | `max-w-sm` (input only: title, textarea, Add) |
| NoteActionsMenu, ConfigModal, RestoreOverlay | `max-w-sm` |
| EditNoteDialog | `max-w-md` |
| NewNoteModal | `max-w-md` |
| CopyFallback | `max-w-lg` |
| ModelsModal | `w-[min(92vw,30rem)]` |
| GlobalSearch | `max-w-xl` |
| QuickNoteModal | `max-w-2xl`, `h-[min(80dvh,44rem)]` |

`EditNoteDialog`, `CommentModal` and the edit-principle dialog have a full-screen
toggle in the header (left of Close when present). Expanded, the panel is
`h-dvh max-w-full rounded-none`; its contents sit in a centered `max-w-2xl`
column and the textarea takes the remaining height. `Escape` collapses the panel
before it closes the dialog. The toggle animates height, max-width, corner
radius and backdrop padding over 200 ms; reduced motion turns the animation off.

`ConfigModal`'s tab pills are a horizontal snap carousel, the same pattern as
the section bar (`no-scrollbar -mx-1 flex min-w-0 flex-1 snap-x gap-2
overflow-x-auto px-1 pb-1`). They scroll sideways; they never wrap. The body has
a fixed height and `overflow: hidden`, so the `ResizeObserver` that publishes
that height must observe the **first child** (the panel content), never the
clipped container: observing the container reports the height it is supposed to
decide, and late content (status chips, test results) gets clipped.

## Onboarding

- `/welcome` is the first-run screen. It uses no app chrome: a centered
  `max-w-2xl` card with `rounded-3xl`, `p-6 sm:p-8`, and the same stone palette
  as Settings. The primary action creates an empty journal; restore is a
  separate section below a divider so it is never the default click.
- An empty journal contains the schema only. Do not seed notes, tasks,
  principles, tags or a recap: the first screen after creation must be the
  user's empty journal, not a demo.
- `/journal-error` reuses the same card layout. It shows the failure and
  offers retry plus restore. Never redirect a broken or missing active journal
  to `/welcome`: showing a create button there could hide the user's data.
- The welcome and error screens are full-page routes. They do not render the
  composer, the section bar or the header controls.
- The home page has no tagline. The header is only the journal controls and
  settings; do not add a marketing line above the timeline. The view pills run
  **Heatmaps**, **Tags**, **Search**; the first two are links, so the notes
  timeline stays on the home page.

## Interaction

- **Destructive actions** (delete note, remove tag, restore database) always go
  through `ConfirmDialog` in `danger` tone.
- **Overlays** are `fixed inset-0 z-50` with a `stone-900/40` backdrop
  (`black/60` in dark mode; the restore overlay is darker) and
  `backdrop-blur-md`, the same blur as the loading state; the backdrop click and
  `Escape` close them, except while a long operation runs.
- **Escape is guaranteed by the root layout, not by focus.** Every dialog keeps
  its `onkeydown` Escape on the dialog root, but a key only reaches that root
  when focus is inside it. `src/routes/+layout.svelte` closes the gap twice: it
  focuses each dialog when it mounts (unless something inside it already has
  focus), and, when Escape arrives with focus outside the topmost dialog, it
  replays a bubbling `keydown` on that dialog. `topDialog()` picks the highest
  `z-index`, then the later element in the DOM, so `FieldHelp` (`z-60`) wins
  over the form it sits in. A dialog that must stay open opts out with
  `data-escape="ignore"` (the restore overlay while it runs). Do not add a
  `window` Escape listener for a new dialog; the root layout covers it. Dialogs with long text (`EditNoteDialog`,
  `CommentModal`, the edit-principle dialog) offer a header toggle that expands
  the panel to the viewport; `Escape` then collapses it first, and the other
  fields and buttons stay fixed while the textarea scrolls.
- **Single note edit** (`/admin/notes/[id]` private, `/notes/[id]` public read-only): Edit replaces the bold note text in the
  same card with a textarea, the optional YouTube URL and a date/time field,
  plus Cancel/Save below. No backdrop and no full-screen toggle. `Escape`
  cancels, `Cmd/Ctrl+Enter` saves. The textarea prefills stored tags as a
  trailing hashtag run, so a text edit does not drop them; deleting a hashtag
  removes that tag. A tag that cannot be written as one hashtag token (a
  multi-word tag from an older note) stays out of the text. The timeline
  `EditNoteDialog` follows the same rule and carries the same date field.
- **Principles** (`PrinciplesTab`): cards show the creation date under the
  text. The position number is a small badge on the card's top edge
  (`absolute -top-2 left-3`, `pointer-events-none`), not a fixed column beside
  the text: the number stays at a glance without narrowing every row. A
  leading `(name)` token groups a principle exactly like To-Do
  subgroups: one collapsible pill per group (`▾ v2 (3)`), in first-appearance
  order; ungrouped principles follow as a plain list with **no** `Ungrouped`
  header. Names
  accept letters and
  digits in any script (accents included), spaces, dots and dashes, up to 31
  characters, normalized to lowercase. The split is view-only — the
  prefix stays in the stored text, so the principle page, tag pages, search
  and RAG keep the full line. The card folds exactly like notes: a small
  chevron beside selectable text (the body is no longer a button, so the
  text is copyable everywhere); `ferm:collapsed-principles` persists the
  fold and a reloaded fold keeps the one-line `max-height` cap. Edit
  opens from the ⋮ menu, not from the text. The single principle page adds a `Mentioned
  in N` section: the notes whose `[[id]]` tokens point at it, newest first,
  each row one plain-text excerpt line, its date, and an `Open` pill linking
  to `/admin/notes/[id]` — never a card wrapping the whole note. The API
  carries it as `GET /api/principles/[id]` → `{ principle, mentionedIn }`. Only ungrouped principles carry the display
  number (list order); grouped rows leave the number slot blank. The comment
  pill floats absolutely in the card's top-right corner, clearing the `⋮`,
  like the notes standard — never inline in the title row. Drag and `↑/↓` reorder only
  within a group; a cross-group drop cancels. The Add button carries the same
  desktop shortcut as the To-Do Add
  button: `⌘⇧A` on Mac, `Ctrl+Shift+A` elsewhere. The hint is hidden on touch,
  and the handler ignores editable targets and open dialogs.
- **Global search** (`GlobalSearch.svelte`) mounts once in the root layout, so
  `Cmd/Ctrl+K` works on every journal route. The home header Search pill (after
  Tags) is the discoverable trigger; it is icon-only on phones. The palette is
  top-anchored (`pt-[max(4rem,12vh)]`, `max-w-xl`), not centered. Results group
  as Notes, To-Do and Principles, up to ten per kind; `library` and `influences`
  are reserved until those sections have data. `↑/↓` select, `Enter` opens,
  `Escape` and the backdrop close. The input placeholder is plain text; the
  `Kbd` chip sits at the right edge of the field. Before a query is typed, the
  palette shows featured mini apps as pre-search options, and from 2 typed
  characters it filters apps by label and description above the note results,
  in the same ↑/↓ and `Enter` order. Typing `#` switches the palette to a
  Tags list from the cached `/api/tag-cloud` response: `#` alone lists every
  tag by use, each further character filters by tag prefix, and `Enter` opens
  `/admin/tags/<tag>`. Tag mode shows no note or mini-app results. Commands have
  a code (`note`) that is their identity and execution key, not just a label.
  Typing `:` at the start of the field consumes the colon, shows a blue `:`
  pill, and switches the palette to `src/lib/commands.ts`: only commands appear,
  an empty query lists all, and code prefix, label and keywords filter with the
  exact code first. A bare **exact** code in normal search adds a Commands group
  above mini apps and results and selects it first, so `Enter` runs it. Bare
  prefix matching stays in `:` mode; otherwise an ordinary word would run a
  command. The same ↑/↓ and `Enter` keys move and run; Backspace on an empty
  query leaves command mode. The first code, `note`, opens `NewNoteModal` from
  any route and posts to `/api/notes`. `/admin/notes` listens for
  `notes:created` and inserts the saved row without a reload; other routes keep
  the note for the next timeline load.
- **Mini apps**: a floating action button at the bottom right opens the mini
  apps modal. It mounts in the root layout, so every page shows it; the EPUB
  reader (`/admin/book/*`) is the only exception. Tools live at `/tools/<id>`,
  outside `/admin`, so a later non-admin viewer can open them. The public
  homepage lists the same tools in a `Tools` collapsible section at the bottom,
  with each app's one-line description. Apps are ordered by usage; the last
  opened app shows a `Latest used` pill and a running app shows a `Running`
  badge. Usage is stored in local storage. An app with a `shortcut` shows its
  `Kbd` chip in the modal and in the search palette; `Mod` renders as ⌘ or Ctrl. **Quick note** is the one app with
  `kind: 'modal'`: it opens `QuickNoteModal` instead of a page, from the picker,
  the search palette, the homepage `Tools` section, or `Cmd/Ctrl+Shift+K`. It is
  a big `max-w-2xl` modal with the same full-screen toggle as `EditNoteDialog`
  (`h-dvh max-w-full rounded-none`, `Escape` collapses first). It has no Save
  button. Every keystroke writes this browser's local storage, so the header says
  `Saved on this device 14:32` or the error. The two cloud buttons are the only
  server paths: **upload** (`PUT`, backs the local text up) and **fetch**
  (`GET`, pulls the server copy on demand). There is still no automatic read on
  open, close or typing. Fetch adopts the copy silently only when the local note
  is empty; a different non-empty local note opens `ConfirmDialog` ("Replace
  this quick note?", danger tone) and changes nothing until the user confirms.
  Typing after a fetch returns the header to the local status. Admin is
  unprotected today, so both buttons are enabled, and the login will enable
  them per session. The header wraps its icon cluster under the title on narrow
  screens, and the body breaks long tokens (`break-words`) instead of widening
  the panel.
  `Edit` and `View` are a segmented toggle; View renders the same markdown as
  notes (bold, italic, bare URLs, `[[id]]` pills), not headings or lists. A
  note with text opens in View; an empty one opens in Edit. In View, `E`
  switches to Edit (no modifier, no key repeat, no focused text field, and no
  other dialog on screen). The
  server holds one backup row in `quick_note`, separate from `notes`, so the
  text never reaches the timeline, tags or publishing. The full-screen choice is remembered in
  `localStorage['fermentario.quickNote.full']`, so it reopens the size it was
  left. **Time tracker**
  (`/tools/time-tracker`) starts one timer
  with an optional comment and stops it later. The start card is a single row:
  title, comment field, `Start`, `Cancel`; no reveal step, and the title text
  hides below `sm` so the row stays one line. Hashtags anywhere in the comment
  become project tags (stored in `time_entry_tags`, first tag is the primary
  project for stats). A tag starts the line or follows whitespace, so
  `#project deep work` and `deep work #project` both work. Entries live in the journal. While a timer runs, a compact
  counter bar stays visible at the top of admin pages and on the public
  homepage, and links to the time tracker. The bar stays one line: status,
  the primary tag plus extra-tag count, a truncated comment preview, and the
  elapsed time. The full comment and all tags live in the button title. On wide
  screens the active timer card is two rows: status and started metadata, then
  timer, comment or edit field, and actions. It stacks below `md`. The time tracker page shows a
  period chart (month/day bars, week/day bars, or year/month bars) with stacked
  segments per project and a period dropdown. Each history row has a delete
  button, and a running timer can be stopped or discarded from the page and
  from the top bar. Both actions confirm through `ConfirmDialog`. A running
  timer has `Edit`: the comment field opens in place, prefilled with the text
  plus its tags as trailing `#tag` tokens, so one field changes both the comment
  and the tags. `Enter` saves, `Escape` cancels. A `Settings2` gear on the start
  row and on the active card opens the chime panel: `Off`, `5m`, `15m`, `30m`,
  `45m`, `1h`, `1h30`. One interval serves every timer (browser local storage key
  `fermentario.time-alerts`). Each mark sounds once (`Once`), repeats for 30
  seconds (`30s`), or repeats until stopped (`Until stopped`); the mode lives in
  `fermentario.time-alert-mode`, and a repeated chime shows a rose stop button on
  the active card. The gear title states the interval, and the active card
  shows `Next chime 14:45`. The idle start row keeps its single line. The panel uses `slide` over
  `motionMs(180)`; the gear turns 90° in 200 ms with
  `motion-reduce:transition-none`. `/admin/tags/<tag>` lists the
  matching time entries in a `Time` section, running first, with a `Running`
  pill instead of a live counter.
- **Toasts** come from `$lib/toast.svelte` and render once from the root layout
  (`fixed inset-x-0 bottom-28 z-30`). Use them for final action results only,
  never for progress or background work. Auto-clear: 4 s error, 8 s success.
  Publishing a note confirms with a success toast (`Note saved.`); a backdated
  note outside the loaded cursor adds the scroll hint. `showToast` defaults to
  error, so success messages must pass the tone explicitly. The third argument,
  `showToast(text, tone, true)`, asks for the attention **ping**: the sound is
  played only by the global `Toasts` mount via `$lib/sound.ts` (WebAudio, no
  files), so no toast caller writes its own audio. The time tracker's interval
  chime is the one other caller, through `playChime()` in the same module.
  Autoplay policy means iOS/Safari
  stays silent until the first user gesture unlocks the `AudioContext`; the
  toast itself always shows.
- **Loading feedback**: a static pill in `app.html` covers hydration no Svelte
  code can see. `NavigationLoader` removes it on mount and takes over: the first
  tracked wait shows at once, later route changes and data waits keep the 120 ms
  anti-flash delay. Both use a glassy full-screen backdrop (`white/25`, or
  `stone-950/25` in dark, plus `backdrop-blur-md`). The backdrop blocks pointer
  input while visible and shows `cursor-wait`; do not let clicks reach the page
  below. Track loads and mutations with
  `loading.track()` from `$lib/loading.svelte`; never track quiet work (tag
  colors, summary refresh, polling, optimistic saves). Keep contextual busy
  states such as the Heatmap button and `RestoreOverlay`; do not add per-route
  spinners.
- **Older engines**: `backdrop-filter` is detected with `@supports` in
  `app.css` (and in the boot-loader block in `app.html`), including the
  `-webkit-` form. Without it, remove the blur and use a more opaque scrim so
  dialog text keeps its contrast. Tailwind already emits an alpha-hex fallback
  before each `color-mix()` background; keep that pattern instead of writing a
  `color-mix()`-only surface.
- **Dictation**: while the microphone is active, the composer button switches
  from `Mic` to a filled `rose-600` stop button with a pulsing ring, and a
  `Listening…` pill with a pulsing dot appears above the bar. Reduced motion
  turns the pulses off. The active state comes from the parent; never assign
  the prop inside the composer.
- **Hover-only controls** must also appear on `focus-visible` so keyboard users
  can reach them.
- **Auto-growing inputs** grow with their content and publish their height so the
  page can reserve space.

## Content rules

- The hour in a timeline row links to the note's single page. Pending notes
  keep a plain hour until the save completes.
- Day headers in the timeline show `Today` / `Yesterday` as English literals and
  older days in the configured language's format (`Intl` output only, no
  hand-written translations).
- The heatmap packs the year backwards, seven per column from 31 December, so
  the newest days sit at the top left and any slack is at the bottom right.
- The heatmap has three tabs. **Notes & tasks** keeps the amber
  note-intensity grid and the Done tasks list. **Investments** has its own
  grid and trade history. **Nostr** shows the two-color heatmap (published
  notes in amber, replies in blue) that also sits at the top of the Nostr
  section. One square cannot carry note, buy and sell intensities at once,
  so the views never share a cell. The tab choice is stored in
  `fermentario.heatmapView`; the selected year is shared.
- Investments colours: buys use an emerald scale, sells a rose scale. Each
  side has four bands from its own busiest day (up to 25%, 50%, 75%, 100%),
  matching the note scale. A day with both sides splits diagonally; each
  half carries its own band, drawn with alpha over the neutral base so it
  reads in both themes. A split legend square explains the case.
- **Done tasks** (under Notes & tasks) lists completed tasks across every group
  and year, latest `done_at` first. It groups them under month headings such as
  **October 2026**, with undated completions under **Date unavailable**. It
  loads 50 at a time with a cursor and an `IntersectionObserver` sentinel near
  the bottom; the list is not filtered by the selected heatmap year.
- **Trade history** (under Investments) lists every buy and sell across all
  holdings, newest first, with the same month grouping and cursor pagination.
  Buys are green, sells red; cash reads Deposit and Withdrawal. Opening
  balances are the starting quantity, not an event, so they never appear.
  Like Done tasks, it covers every year.
- Ticking a task from open to done asks for confirmation; unmarking a done task
  stays immediate. The confirm button is green: completion is a positive
  change, not a destructive one.
- Tag chips are links to `/tags/<tag>`; when a removal handler is present they
  also carry a hover `×` that asks for confirmation.
- Notes get tags only from hashtags the user types in the note, anywhere in
  the text. No AI or background pass creates tags. A tag starts the line or
  follows whitespace and ends at whitespace or the end of the line, so
  `url.com/#anchor`, `foo#bar`, `# Heading` and `## Heading` stay prose. The
  tag token leaves the prose; a line that held only tags disappears, and other
  blank lines stay. Typing `#` opens tag suggestions
  (`TagFinder`): the top tags on a bare `#`, prefix matches with usage counts
  as you type, plus a `Create #fragment` row when nothing matches exactly.
  The menu opens for any `#` the parser would store. No row is selected when
  the menu opens: plain `Enter` still saves (bar) or inserts a newline (editors); `↑/↓` or a
  tap selects, the second `Enter` picks, `Escape` closes. The menu mounts in
  the composer bar, the fullscreen editor, the note edit dialog and the
  `New note` command modal. It floats above the field, except in that modal,
  which renders it in flow below the field so the panel does not clip it.
- **Tags have one admin map and one public map.** `/admin/tags` counts every
  tag in `note_tags`, `todo_item_tags`, `principle_tags` and
  `time_entry_tags`, never `tag_colors` alone; the most-used tags come first
  and ties are alphabetical. `/admin/tags/<tag>` keeps the per-section
  breakdown and adds pills for All, Featured, Notes, Time, To-Do and
  Principles. Both use the shared tag palette and carry exact counts, and the
  pills never change size, so frequency changes order, not visual weight.
- **The public tag map sits at the bottom of the homepage**, after Tools, in
  the same `CollapsibleSection` (`ferm:pub-tags`) as the other sections. It
  lists only tags on published notes (`listPublicTagCounts`), links to
  `/tags/<tag>`, and is server-rendered with the feed. `/tags/<tag>` is the
  public counterpart of `/admin/tags/<tag>`: same heading, color dot and count,
  but published notes only and no admin action, section tabs, to-dos,
  principles or time entries. Its cards are `PublicNoteCard`, the same blog
  card as the index.
