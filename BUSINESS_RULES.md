# Aturan Bisnis — Live Chat KPI Dashboard

Dokumen ini adalah referensi resli untuk semua aturan perhitungan KPI.
Jika ada dispute payroll/ranking, dokumen ini yang jadi acuan.

---

## 1. Shift-22 (Overnight Attribution)

Chat dengan timestamp **sebelum 07:00** diatribusikan ke **hari kalender sebelumnya**, HANYA jika jadwal agent di hari sebelumnya adalah shift **22** (22:00).

- Berlaku untuk: **Productivity, CSAT SC, SLA**
- TIDAK berlaku untuk: **QA** (QA pakai Checking Date, bukan jadwal)
- Tujuan: agent shift malam yang chat lewat tengah malam tidak double-count di hari berikutnya

## 2. CSAT Takeout

3 kategori berikut dikecualikan dari skor **"Fair / After Takeout"**:

1. Tidak bisa transaksi namun memiliki limit
2. Pengajuan limit kredit ditolak
3. Pertanyaan belum bisa diidentifikasi

- **Full**: semua rating valid (1, 2, 4, 5) dihitung
- **Fair**: rating dengan kategori takeout di atas dikecualikan

## 3. Man-Days

| Status | Man-Day? | Attendance Duty? |
|---|---|---|
| Numeric shift code (08:00, 09:00, dll) | Ya | Ya |
| S (sakit) | Ya | Ya |
| OFF | Tidak | Tidak |
| C (cuti) | Tidak | Tidak |
| PULLOUT | Tidak | Ya (duty, bukan man-day) |

Dedupe per **calendar day** (normDate), bukan raw header string.

## 4. QA — Checking Date

QA di-bucket berdasarkan **Checking Date** (kolom N di sheet QA), bukan:
- Tanggal Case (kolom I)
- Jadwal agent (schedule)

QC bisa cek kapan saja. Agent OFF / DS / shift 22 **tidak menyembunyikan atau memindahkan** QA.
Sel kosong = tidak ada QC row di hari itu (wajar, bukan bug).

## 5. Dedupe Tiket

CSAT, QA, SLA: tiket di-dedupe per **agent + calendar day + ticket**, bukan global ticket.

- Tiket sama di dua agent → keduanya hitung
- Re-audit di hari berbeda → tetap hitung
- Tiket sama di hari yang sama → hanya sekali

## 6. Insentif

### Periode
- **KPI**: bulan kalender sebelumnya (relative ke filter end date)
- **Roster** (TL/agent/BPO): bulan filter saat ini + CSID tab bulan File Center

### Tier Agent
| Tier | Skor | Insentif |
|---|---|---|
| T1 | ≥ 96 | Rp 2.000.000 |
| T2 | ≥ 88 | Rp 1.250.000 |
| T3 | ≥ 80 | Rp 750.000 |
| - | < 80 | Rp 0 |

### Tier Team Leader
| Tier | Skor | Insentif |
|---|---|---|
| T1 | ≥ 90 | Rp 2.000.000 |
| T2 | ≥ 85 | Rp 1.250.000 |
| T3 | ≥ 80 | Rp 750.000 |

### QC Points
| QA % | Points |
|---|---|
| ≥ 98 | 55 |
| ≥ 95 | 48.4 |
| ≥ 90 | 38.5 |
| ≥ 85 | 24.75 |
| ≥ 80 | 11 |
| < 80 | 0 |

### Lainnya
- TL gross salary: Rp 4.328.000
- Best leader bonus: pool Rp 500.000 dibagi ke TL yang eligible
- Composite score = productivity (max 20pts) + CSAT + QC points + attendance
- CSAT untuk insentif = **QA CSAT/DSAT tagging** (bukan survey)

## 7. Leaderboard

- Composite scoring: productivity + CSAT + QC + attendance
- CSAT = **QA CSAT/DSAT tagging** dari QA history (bukan CSAT SC survey)
- Agent inactive: di-hardcode, exclude diam-diam (lihat `INACTIVE_AGENT_RULES` di kode)
- Training & Quiz: hardcoded 100% (bukan data asli)
- Agent dengan composite score null (missing QA/productivity/CSAT) tidak muncul

## 8. BPO Scope

| BPO | Keterangan |
|---|---|
| TIN | Vendor TIN saja |
| TCID | Vendor TCID saja |
| TCID X TIN | Roster gabungan |

Separator `x`, `×`, `&`, `/` dinormalisasi ke `X`.

## 9. CSAT — Definisi per Tab

| Tab | CSAT pakai | Sumber |
|---|---|---|
| Dashboard Summary | Official CSAT (star count) + SC Survey | Productivity sheet + CSAT SC |
| Leaderboard | QA CSAT/DSAT tagging | QA history |
| Insentif | QA CSAT/DSAT tagging (sama dengan Leaderboard) | QA history |

**Catatan**: CSAT di Summary bisa beda dengan Leaderboard karena sumbernya beda. Ini disengaja, bukan bug.

## 10. Parse Tanggal

| Format | Contoh | Hasil |
|---|---|---|
| DD-MMM-YYYY (ID/EN) | `13-Agu-2026` | `2026-08-13` |
| DD/MM/YYYY | `13/8/2026` | `2026-08-13` |
| Ambiguous (both ≤ 12) | `5/6/2026` | `2026-06-05` (DD/MM, day first) |
| ISO | `2026-08-13` | `2026-08-13` |

Bulan: `Agu` = Agustus, `Okt` = Oktober, `Des` = Desember, `Mei` = Mei (ID abbrev).

## 11. Data Source

- **Google Sheets**: tab bulanan `CSID_AUG_2026`, `PRODUCTIVITY_AUG_2026`, dll.
- **CSV upload**: 6 file (CSID, Productivity, CSAT SC, SLA, Schedule, QA)
- **History**: 4 bulan (bulan aktif + 3 sebelumnya) untuk comparison dan insentif
- **Cache**: IndexedDB, auto-sync setiap buka halaman, retry otomatis 3x kalau gagal
