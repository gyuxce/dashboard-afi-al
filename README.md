# Live Chat KPI Dashboard

Dashboard React/Vite (client-only, tanpa backend) untuk memantau KPI live chat: productivity, CSAT (official + survey), SLA/WHU, QA, attendance, schedule, Simulasi Insentif, dan Pilot CSAT (program coaching agent CSAT rendah).

## Prerequisites

- Node.js 18+
- npm

## Run Locally

```bash
npm install
npm run dev
```

Default dev server berjalan di `http://localhost:3000`.

## Scripts

```bash
npm run dev          # dev server
npm run lint         # type-check saja (tsc --noEmit) — tidak ada ESLint
npm run build        # tsc --noEmit && vite build
npm run preview      # preview hasil build
npm test             # jalankan semua unit test (vitest)
npm run test:watch   # vitest watch mode
```

## Data Source

Aplikasi bisa dipakai dengan upload CSV manual melalui File Center tanpa konfigurasi environment apa pun.

Untuk mode Google Sheets, salin `.env.example` ke `.env.local` dan isi:

```env
VITE_SHEETS_API_KEY=your_google_sheets_api_key
VITE_SPREADSHEET_ID=your_spreadsheet_id
# Optional: spreadsheet terpisah untuk periode Agustus-Oktober 2026
VITE_SPREADSHEET_ID_AUG_OCT_2026=your_aug_oct_2026_spreadsheet_id
# Optional: roster Pilot CSAT (tab: Batch | CS ID | Tanggal Mulai | Tanggal Selesai | Catatan Coaching)
# Default: pakai VITE_SPREADSHEET_ID_AUG_OCT_2026 + tab "PILOT"
VITE_SPREADSHEET_ID_PILOT=
VITE_SHEET_PILOT=PILOT
```

Nama tab default yang dibaca (periode Mei 2026 / legacy):

- `CSID`
- `Productivity CSAT WHU`
- `CSAT SC`
- `SLA`
- `Schedule`
- `QA`

Jika nama tab berbeda, override dengan env berikut (hanya berlaku untuk tab Mei 2026):

```env
VITE_SHEET_CSID=CSID
VITE_SHEET_PRODUCTIVITY=Productivity CSAT WHU
VITE_SHEET_CSAT_SC=CSAT SC
VITE_SHEET_SLA=SLA
VITE_SHEET_SCHEDULE=Schedule
VITE_SHEET_QA=QA
```

Mulai Juni 2026, File Center bisa memilih bulan dan membaca tab dengan format `CSID_JUN_2026`, `PRODUCTIVITY_JUN_2026`, `CSAT_SC_JUN_2026`, `SLA_JUN_2026`, `SCHEDULE_JUN_2026`, `QA_JUN_2026` — ganti suffix bulan untuk bulan berikutnya (mis. `JUL_2026`, `AUG_2026`). Pilihan bulan di File Center dibuat otomatis sampai beberapa tahun ke depan, jadi tidak perlu ubah kode hanya untuk menambah tahun baru.

Untuk periode Agustus–Oktober 2026, aplikasi membaca `AUG_2026`, `SEP_2026`, dan `OCT_2026` dari spreadsheet terpisah. Jika `VITE_SPREADSHEET_ID_AUG_OCT_2026` tidak diisi, aplikasi memakai spreadsheet ID bawaan untuk periode tersebut.

## Dokumentasi lanjutan

- [`CLAUDE.md`](./CLAUDE.md) — arsitektur data flow, aturan bisnis KPI, dan konvensi kode untuk kontributor/agent.
- `BUSINESS_RULES.md` — spesifikasi kanonis setiap perhitungan KPI (rujukan utama untuk sengketa payroll/ranking).
