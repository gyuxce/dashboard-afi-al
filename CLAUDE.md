# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Live Chat KPI Dashboard** — a client-only React/Vite SPA that ingests six data sources (CSID, Productivity/CSAT/WHU, CSAT SC, SLA, Schedule, QA), plus an optional 7th (`PILOT` — Pilot CSAT roster), and renders per-agent KPI tabs: productivity, CSAT (official + survey), SLA/WHU, QA, attendance, schedule, an incentive simulator, and Pilot CSAT. There is **no backend** — all processing runs in the browser. Leaderboard's tab is currently hidden (redirects to Summary) since the dashboard went live 1 Sep 2026 and Simulasi Insentif took over as the primary agent-facing view, now scored on the live/current period instead of the previous calendar month.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:3000 (host 0.0.0.0)
npm run lint         # type-check only — this is `tsc --noEmit`; there is NO ESLint
npm run build        # tsc --noEmit && vite build
npm test             # vitest run (all suites in src/lib/__tests__/)
npm run test:watch   # vitest watch
npx vitest run src/lib/__tests__/incentiveScoring.test.ts   # one file
npx vitest run -t "shift 22"                                # one test by name
node scripts/verify-mandays.mjs   # standalone man-days regression check (no test runner)
```

`npm run lint` / `tsc` is the only static gate. `tsconfig.json` has no `noUnusedLocals`, so unused imports compile — keep them clean manually.

## Data flow (read this before touching KPI code)

```
CSV upload OR Google Sheets ──▶ Zustand store (src/store.ts) ──▶ IndexedDB cache (idb)
                                       │  raw string[][] per sheet + filters
                                       ▼
                        useProcessedKpis  ── runs processKPIs() in a Web Worker
                        (src/hooks/)         (src/workers/kpi.worker.ts), main-thread fallback
                                       │  AgentKPI[] for active period + up to 3 history periods
                                       │  + a wide "pilot" period (Pilot CSAT's baseline+batch window)
                                       ▼
                        useFilteredKpis  ── applies BPO/TL/agent scope + roster + per-tab shaping
                        (src/hooks/)
                                       │  kpiData, previousKpiData[1..3], incentiveKpiData, pilotKpiData
                                       ▼
                        App.tsx  ── switches lazy-loaded tab components on `activeTab`
```

- **`processKPIs()`** (`src/lib/dataProcessor.ts`) is the core. It orchestrates domain processors in `src/lib/processors/{schedule,productivity,csatSc,sla,qa}.ts` then `finalize.ts`, all sharing one mutable `ProcessorContext` (`processors/context.ts`) that carries dedupe sets, running-sum accumulators, and the schedule/shift-22 lookup maps. Processors mutate `AgentKPI` objects in place.
- **`AgentKPI`** (defined in `dataProcessor.ts`) is the row shape every tab consumes: aggregate metrics plus `dailyHistory` (per-day series keyed by normalized date) and `qaHistory` / `csatHistory` entry arrays.
- **The Worker is stateful**: raw sheet data is shipped once via a `setData` message (`kpiProtocol.ts`); filter changes send only a `process` message. If the worker fails to construct, errors, or times out, `useProcessedKpis` falls back to `computeOnMainThread`.
- **Store** (`useStore`, single file `src/store.ts`): raw sheet arrays, date range, `selectedBpo`/`selectedTL`/`selectedGlobalAgent`, comparison toggles, `selectedSheetMonth`, source-freshness dates. `hydrateFromStorage()` on boot, `fetchFromSheets()` for Sheets mode, `setFile()` for CSV upload; both persist to IndexedDB.

## Business rules

**`BUSINESS_RULES.md` is the canonical spec** for every KPI calculation and the tie-breaker for payroll/ranking disputes. Consult it before editing any processor or scoring module. Highlights that bite:

- **Shift-22**: chats timestamped before 07:00 are attributed to the previous calendar day *only if* that day's schedule is shift `22`. Applies to Productivity, CSAT SC, SLA — **never QA** (QA buckets by the sheet's Checking Date, not schedule).
- **Man-days**: numeric shift codes and `S` count; `OFF`/`C` don't; `PULLOUT` is attendance duty but not a man-day. Dedupe per normalized calendar day.
- **CSAT "Fair / After Takeout"** excludes three hardcoded categories (`CSAT_TAKEOUT_CATEGORIES`); "Full" keeps all valid ratings.
- **Ticket dedupe** is per `agent + calendar day + ticket`, not global.
- **CSAT means different things per tab**: Summary uses Official CSAT (star counts) + SC survey; Leaderboard and Incentive use QA CSAT/DSAT tagging from `qaHistory`; Pilot CSAT deliberately uses CSAT SC survey data only (`dailyHistory.csatScFull` / `csatHistory`), never QA tagging. Divergent numbers are intentional.
- Inactive agents are hardcoded in `INACTIVE_AGENT_RULES` (`src/lib/inactiveAgents.ts`) and silently excluded — but only where `isInactiveAgent()` is actually called (Leaderboard, Simulasi Insentif). It is **not** applied to Pilot CSAT's `pilotKpiData`, so a pilot participant's data still shows even if they'd be filtered out elsewhere.

## Scoring modules (pure, unit-tested)

- `src/lib/kpiScoring.ts` — `calculateCompositeScore` (QA 50 / Prod 20 / CSAT 20 / Training+Quiz fixed 10) → Leaderboard.
- `src/lib/incentiveScoring.ts` — `buildIncentiveRow`, agent/TL tier curves, QC-points step function, `bestLeaderBonusPerTeamLeader` (Rp500k pool split across all TLs) → Simulasi Insentif.

Keep these free of React/DOM imports so `src/lib/__tests__/` can exercise them directly.

## Dates

Sheet date columns are messy human strings (`13-Agu-2026`, `13/8/2026`, ISO, with/without trailing clock time). Always normalize with `normalizeDateStr` (`src/lib/dates.ts`) and align day-keyed series with `indexByDate` / `getByCalendarDate` / `uniqueCalendarDates` from `src/lib/utils.ts`. `uniqueCalendarDates` returns **newest-first** — reverse it for left-to-right sparklines/day-strips. Ambiguous `d/m/yyyy` is parsed day-first; Indonesian month abbreviations (`Agu`, `Okt`, `Des`, `Mei`) are recognized.

## Theming & colour discipline

Tailwind v4. Colour tokens are `rgb(var(--token))` triples defined in `src/index.css`: `:root` (light) → `.dark` overrides → `@theme` block mapping to `--color-*`. Use semantic classes only (`text-text-primary`, `bg-card`, `bg-surface-muted`, `border-border`, `text-danger`, `text-warning`, `text-success`), never raw hex.

`getKpiStatus` / `getKpiColor` (`src/lib/utils.ts`) colour a value **only when it misses target**: `miss` → red + a `▼` cue (`<KpiCue>` / `<KpiValue>` in `src/components/ui/KpiCue.tsx`), `watch` (within ~5% below) → amber, on-target → neutral text. `KPI_TARGETS` in `utils.ts` is the single source of target values.

## Shared UI conventions

Tab components live in `src/components/{dashboard,csat,sla,qa,team}/` and are lazy-loaded in `App.tsx`. Large tables use `VirtualizedTbody` + `useVirtualRows`. Recent tabs follow a **sparkline-first rank-list** pattern: `No · Name/CS ID · BPO·TL · <Sparkline> · avg <KpiValue> · vs-target <KpiCue> · chevron`, with a click-to-expand day-strip row (or a right-side detail drawer on `lg`, slide-in on mobile — see `Leaderboard.tsx` / `IncentiveSimulation.tsx`). Reuse `SegmentedControl`, `SortableHeader`, `EmptyState`, `IncompleteDataNotice`.

## Google Sheets specifics

- Requires `.env.local` with `VITE_SHEETS_API_KEY` + `VITE_SPREADSHEET_ID` (`.env.example` documents the full set). `.env.example` is deliberately **not** gitignored (`!.env.example`) — keep it placeholder-only; real keys stay in `.env.local`.
- Monthly tabs follow the `CSID_AUG_2026` / `PRODUCTIVITY_AUG_2026` / … convention (`getSheetConfigForMonth` in `src/lib/sheetsApi.ts`); month options are generated years ahead, so no code change to add a year.
- Aug/Sep/Oct 2026 read from a **separate hardcoded spreadsheet ID** (override with `VITE_SPREADSHEET_ID_AUG_OCT_2026`).
- Only the legacy May 2026 tab uses the `VITE_SHEET_*` name overrides.
- History = active month + 3 prior months, fetched for comparison (Simulasi Insentif reuses the active-month `kpiData` — no separate history fetch of its own).
- Pilot CSAT reads an optional `PILOT` tab (`VITE_SPREADSHEET_ID_PILOT` + `VITE_SHEET_PILOT`, default: the Aug–Oct 2026 archive spreadsheet + tab name `PILOT`) via `fetchPilotRows`, processed over its own wide "pilot" period (batch start − 14 days through batch end) — see `src/lib/pilot.ts`. Columns (resolved by header name): `Batch | CS ID | Tanggal Mulai | Tanggal Selesai | Catatan Coaching | Baseline`. `Baseline` is optional — a manual % override (`62`, `62%`, `0.62`); blank falls back to the auto 2-week-before-start computation.
