#!/usr/bin/env node
/**
 * Jaring pengaman untuk rombak UI: memotret semua tab + menyimpan teks yang tampil, lalu membandingkan dua hasil.
 *
 *   npm run dev                                   # app harus jalan (default http://localhost:3003)
 *   node scripts/ui-snapshot.mjs capture --out /tmp/ui-before
 *   ... ubah UI ...
 *   node scripts/ui-snapshot.mjs capture --out /tmp/ui-after
 *   node scripts/ui-snapshot.mjs compare /tmp/ui-before /tmp/ui-after          # semua ANGKA harus sama
 *   node scripts/ui-snapshot.mjs compare /tmp/ui-before /tmp/ui-after --strict # seluruh teks harus sama (refaktor murni)
 *
 * Opsi capture: --url http://localhost:3003  --month "Oktober 2026"  --viewports desktop,phone
 * Butuh paket `playwright` (tidak jadi dependency proyek). Browser: env EXE=<path chromium> atau pakai bawaan Playwright.
 * Bulan default Oktober 2026 karena sudah selesai (angkanya stabil) dan datanya bisa dimuat tanpa env Vercel.
 */
import fs from 'node:fs';
import path from 'node:path';

const TABS = [
  ['summary', 'Dashboard Summary'],
  ['productivity', 'Productivity Detail'],
  ['qa', 'QA Agent 360'],
  ['csat-official', 'CSAT Official'],
  ['csat-room', 'CSAT Room (Survey)'],
  ['csat-rca', 'CSAT Root Cause'],
  ['sla', 'SLA / WHU Monitor'],
  ['incentive', 'Simulasi Insentif'],
  ['schedule', 'Jadwal & Kehadiran'],
  ['export', 'Ekspor Slide'],
];

/** Keadaan tambahan: setelah membuka tab, klik tab bernama tertentu lalu potret lagi. (Tampilan TL Insentif terkunci PIN, jadi tidak ikut.) */
const EXTRA = [
  ['qa-defect', 'qa', 'Analisis Defect'],
  ['sla-3m', 'sla', 'SLA 3m'],
  ['csat-room-fair', 'csat-room', 'After Takeout'],
];

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const MONTHS = /(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}/;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

/** Buang bagian yang memang berubah tiap saat (jam sinkron, "baru saja", dst) supaya perbandingan adil. */
const normalize = (text) =>
  text
    .replace(/\b\d{1,2}[.:]\d{2}(?:[.:]\d{2})?\b/g, '<jam>')
    .replace(/(Data per|Diperbarui|Updated)[^\n]*/gi, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

const numbersOf = (text) =>
  (normalize(text).match(/-?\d[\d.,]*/g) || []).map((n) => n.replace(/[.,]+$/, '')).sort();

async function capture() {
  const out = arg('out');
  if (!out) throw new Error('Wajib: --out <folder>');
  const url = arg('url', 'http://localhost:3003');
  const month = arg('month', 'Oktober 2026');
  const vps = arg('viewports', 'desktop,phone').split(',');
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Paket "playwright" tidak ditemukan. Pasang di luar proyek (npm i playwright) atau jalankan dari folder yang memilikinya.');
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.EXE || undefined });
  for (const vp of vps) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1, isMobile: vp === 'phone', hasTouch: vp === 'phone' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await page.goto(url);
    await page.waitForTimeout(6000);
    const filter = page.getByRole('button', { name: 'Tampilkan filter' });
    if (await filter.count()) { await filter.click(); await page.waitForTimeout(400); }
    await page.getByRole('button', { name: MONTHS }).first().click();
    await page.waitForTimeout(500);
    await page.getByText(month, { exact: true }).first().click();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(3000);
      const t = await page.locator('main').innerText().catch(() => '');
      if (/Data OK/.test(t) && !/Memuat data/.test(t)) break;
    }
    await page.waitForTimeout(5000);

    const open = async (label) => {
      // Laci/modal dari tab sebelumnya (mis. detail Insentif di ponsel) menutupi menu: tutup dulu dengan klik di luar kartunya.
      if (await page.locator('main div.fixed.inset-0').count()) { await page.mouse.click(3, 3); await page.waitForTimeout(500); }
      const item = page.getByRole('button', { name: label, exact: true }).first();
      if (vp === 'phone') {
        // Drawer menu: open it only when the item is not on screen (it closes itself after a selection).
        const onScreen = async () => { const b = await item.boundingBox(); return !!b && b.x >= 0 && b.x < VIEWPORTS.phone.width; };
        if (!(await onScreen())) { await page.getByRole('button', { name: 'Toggle menu' }).click(); await page.waitForTimeout(600); }
      }
      await item.click();
    };
    const save = async (id) => {
      const text = await page.locator('main').innerText();
      fs.writeFileSync(path.join(out, `${vp}-${id}.txt`), text);
      await page.screenshot({ path: path.join(out, `${vp}-${id}.png`) });
      console.log(`  ${vp} ${id}`);
    };
    for (const [id, label] of TABS) {
      await open(label);
      await page.waitForTimeout(id === 'export' ? 12000 : 4500);
      await save(id);
      for (const [extraId, parent, click] of EXTRA) {
        if (parent !== id) continue;
        // Hanya tab/tombol bernama persis itu; teks biasa bisa cocok dengan sel tabel dan membuka modal.
        let target = page.getByRole('tab', { name: click, exact: true }).first();
        if (!(await target.count())) target = page.getByRole('button', { name: click, exact: true }).first();
        if (!(await target.count())) { console.log(`  (lewati ${extraId}: "${click}" tidak ada)`); continue; }
        await target.click();
        await page.waitForTimeout(2500);
        await save(extraId);
        await page.keyboard.press('Escape');
      }
    }
    if (errors.length) fs.writeFileSync(path.join(out, `${vp}-errors.txt`), errors.join('\n'));
    console.log(`${vp}: ${errors.length} error halaman`);
    await ctx.close();
  }
  await browser.close();
}

function compare() {
  const [a, b] = process.argv.slice(3).filter((x) => !x.startsWith('--'));
  if (!a || !b) throw new Error('Pemakaian: compare <folderA> <folderB> [--strict]');
  const strict = process.argv.includes('--strict');
  const files = fs.readdirSync(a).filter((f) => f.endsWith('.txt') && !f.endsWith('-errors.txt'));
  let bad = 0;
  for (const f of files) {
    const fb = path.join(b, f);
    if (!fs.existsSync(fb)) { console.log(`HILANG  ${f}`); bad++; continue; }
    const ta = fs.readFileSync(path.join(a, f), 'utf8'), tb = fs.readFileSync(fb, 'utf8');
    if (strict) {
      if (normalize(ta) !== normalize(tb)) { console.log(`BEDA    ${f}`); bad++; } else console.log(`sama    ${f}`);
      continue;
    }
    const na = numbersOf(ta), nb = numbersOf(tb);
    const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
    const ca = count(na), cb = count(nb), diff = [];
    for (const k of new Set([...ca.keys(), ...cb.keys()])) {
      const d = (cb.get(k) || 0) - (ca.get(k) || 0);
      if (d !== 0) diff.push(`${k} (${d > 0 ? '+' : ''}${d})`);
    }
    if (diff.length) { console.log(`BEDA    ${f}: ${diff.slice(0, 12).join(', ')}${diff.length > 12 ? ` … +${diff.length - 12}` : ''}`); bad++; }
    else console.log(`sama    ${f} (${na.length} angka)`);
  }
  console.log(bad ? `\n${bad} berkas berbeda` : '\nSemua angka sama');
  process.exit(bad ? 1 : 0);
}

const cmd = process.argv[2];
if (cmd === 'capture') await capture();
else if (cmd === 'compare') compare();
else { console.log('Pemakaian: node scripts/ui-snapshot.mjs capture --out <folder> | compare <A> <B> [--strict]'); process.exit(1); }
