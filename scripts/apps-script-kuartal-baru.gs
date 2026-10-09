/**
 * Membuat spreadsheet kuartal baru (Nov 2026 - Jan 2027) dari spreadsheet Agu-Okt,
 * dengan nama tab dan header PERSIS sama, supaya dashboard langsung bisa membacanya.
 *
 * Cara pakai:
 * 1. Buka spreadsheet Agu-Okt 2026 -> Extensions -> Apps Script.
 * 2. Hapus isi file bawaan, tempel seluruh isi file ini, lalu Save.
 * 3. Pilih fungsi buatSpreadsheetKuartalBaru -> Run (izinkan akses saat diminta).
 * 4. Buka View -> Logs, salin URL dan ID spreadsheet baru.
 * 5. Di Vercel, tambahkan env (lalu redeploy):
 *    VITE_SPREADSHEET_IDS_BY_MONTH={"NOV_2026":"<ID>","DEC_2026":"<ID>","JAN_2027":"<ID>"}
 *
 * Aturan per tab:
 *  - CSID      : data (roster agen) dibawa ke bulan baru apa adanya.
 *  - SCHEDULE  : kolom A-E (identitas agen) dibawa, kolom tanggal dibuat ulang & dikosongkan.
 *  - lainnya   : (PRODUCTIVITY, CSAT_SC, SLA, QA) hanya header, data dikosongkan.
 */

const SUMBER = 'OCT_2026';
const BULAN_BARU = [
  { suffix: 'NOV_2026', year: 2026, month: 11 },
  { suffix: 'DEC_2026', year: 2026, month: 12 },
  { suffix: 'JAN_2027', year: 2027, month: 1 },
];
const NAMA_SPREADSHEET_BARU = 'Dashboard KPI NOV 2026 - JAN 2027';
const TAB = ['CSID', 'PRODUCTIVITY', 'CSAT_SC', 'SLA', 'SCHEDULE', 'QA'];
// Dashboard membaca lewat API key, jadi spreadsheet harus bisa dibaca siapa pun yang punya link
// (sama seperti spreadsheet Agu-Okt sekarang). Ubah ke false untuk mengatur sharing manual.
const BAGIKAN_VIEW_LEWAT_LINK = true;

function buatSpreadsheetKuartalBaru() {
  const asal = SpreadsheetApp.getActiveSpreadsheet();
  const salinan = asal.copy(NAMA_SPREADSHEET_BARU);

  const template = {};
  TAB.forEach((prefix) => {
    const sheet = salinan.getSheetByName(prefix + '_' + SUMBER);
    if (!sheet) throw new Error('Tab tidak ditemukan: ' + prefix + '_' + SUMBER);
    template[prefix] = sheet;
  });

  const namaBaru = [];
  BULAN_BARU.forEach((bulan) => {
    TAB.forEach((prefix) => {
      const sheet = template[prefix].copyTo(salinan);
      const nama = prefix + '_' + bulan.suffix;
      sheet.setName(nama);
      namaBaru.push(nama);
      if (prefix === 'SCHEDULE') siapkanSchedule(sheet, bulan);
      else if (prefix !== 'CSID') kosongkanData(sheet);
    });
  });

  // Hapus tab lama (termasuk tab bulan lalu & PILOT) dari salinan.
  salinan.getSheets().forEach((sheet) => {
    if (namaBaru.indexOf(sheet.getName()) === -1) salinan.deleteSheet(sheet);
  });

  if (BAGIKAN_VIEW_LEWAT_LINK) {
    DriveApp.getFileById(salinan.getId())
      .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  Logger.log('Spreadsheet baru: ' + salinan.getUrl());
  Logger.log('ID: ' + salinan.getId());
  Logger.log('Env Vercel: VITE_SPREADSHEET_IDS_BY_MONTH=' + JSON.stringify({
    NOV_2026: salinan.getId(), DEC_2026: salinan.getId(), JAN_2027: salinan.getId(),
  }));
}

/** Sisakan baris header (baris 1), hapus semua data di bawahnya. */
function kosongkanData(sheet) {
  const sisa = sheet.getMaxRows() - 1;
  if (sisa > 0) sheet.deleteRows(2, sisa);
}

/** Pertahankan kolom A-E (identitas), buat ulang header tanggal bulan baru, kosongkan shift. */
function siapkanSchedule(sheet, bulan) {
  const kolomTanggalLama = sheet.getMaxColumns() - 5;
  const contoh = sheet.getRange(1, 6);
  const nilaiContoh = contoh.getValue();
  const formatAngka = contoh.getNumberFormat();
  const jumlahHari = new Date(bulan.year, bulan.month, 0).getDate();

  if (kolomTanggalLama < jumlahHari) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), jumlahHari - kolomTanggalLama);
  }
  const barisTerakhir = Math.max(sheet.getLastRow(), 1);
  const lebar = sheet.getMaxColumns() - 5;
  sheet.getRange(1, 6, barisTerakhir, lebar).clearContent();

  const tanggal = [];
  for (let d = 1; d <= jumlahHari; d++) {
    const tgl = new Date(bulan.year, bulan.month - 1, d);
    // Samakan jenis dengan header lama: tanggal asli bila sebelumnya tanggal, selain itu teks d/M/yyyy.
    tanggal.push(nilaiContoh instanceof Date
      ? tgl
      : Utilities.formatDate(tgl, Session.getScriptTimeZone(), 'd/M/yyyy'));
  }
  const headerBaru = sheet.getRange(1, 6, 1, jumlahHari);
  headerBaru.setValues([tanggal]);
  if (nilaiContoh instanceof Date) headerBaru.setNumberFormat(formatAngka);
  if (!(nilaiContoh instanceof Date)) {
    Logger.log('Catatan: header tanggal ' + sheet.getName() + ' diisi teks d/M/yyyy; cek formatnya sama dengan bulan lalu.');
  }
}
