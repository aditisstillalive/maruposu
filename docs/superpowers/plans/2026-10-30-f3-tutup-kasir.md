# F3 — Tutup Kasir: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kasir menutup shift di tablet dengan hitung buta per pecahan, melihat selisih, mengisi catatan bila perlu, dan mencetak laporan penutupan 58 mm. Admin melihat arsip Kas Kasir per shift dan bisa menutup shift yang tertinggal.

**Architecture:** Ringkasan shift (penjualan per metode, kas masuk/keluar, refund, saldo seharusnya) dihitung oleh satu fungsi murni `shiftSummary` di `src/lib/pos/shift.ts` yang dipakai tablet (untuk selisih & laporan, juga offline) dan server (angka resmi). Penutupan adalah mutation baru `shift.close` lewat outbox F2. Admin menutup lewat route admin biasa memakai fungsi yang sama.

**Tech Stack:** sama dengan F2 (Next.js 15, Prisma 5 primary + replica, Dexie, vitest, Playwright di luar repo).

**Spec:** `docs/PLAN.md` — bagian "Fase F3" dan "Keputusan F3"; requirement asli modul 1.F (Tutup Kasir & Rekonsiliasi) dan laporan D (Laporan Kas Kasir, Laporan Tutup Kasir).

## Global Constraints

- Semua konstanta F2 berlaku (uang integer rupiah, WIB, satu tablet, Bahasa Indonesia, gaya visual F1/F2).
- Pecahan uang kertas: `[100000, 50000, 20000, 10000, 5000, 2000, 1000]` + `coins` (total rupiah koin).
- Saldo seharusnya = `opening_float + Σ total order tunai (paid/refunded) di shift + paid_in − paid_out − refund_out`.
- Saldo seharusnya tidak pernah tampil di tablet sebelum hitungan dikunci; setelah dikunci kasir hanya melihat selisih. Laporan cetak (setelah tutup) memuat semuanya.
- Hitungan sekali final; catatan wajib bila selisih ≠ 0 (ditegakkan tablet **dan** server).
- Tutup kasir diblokir selama ada order `open` di shift itu (tablet dan server). Penutupan dari admin membatalkan open bill tersisa dengan alasan admin.

## Review Focus

1. **Tablet dan server menghitung saldo seharusnya berbeda** (mis. kas keluar yang ditolak server): server menyimpan angkanya sendiri sebagai resmi, menyimpan `client_expected`, dan mengisi `sync_note`; tidak menolak penutupan. → test Task 3.
2. **Kasir menutup app setelah hitungan dikunci lalu membukanya lagi** (mencoba hitung ulang): hitungan terkunci tetap tampil, tidak bisa diubah. → test Task 4.
3. **Admin menutup shift saat tablet masih offline dengan transaksi tertunda**: transaksi yang datang kemudian ditolak "Shift sudah ditutup" dan masuk daftar ditolak di tablet (tidak hilang diam-diam); halaman admin memperingatkan sebelum menutup. → test Task 3 + teks Task 6.
4. **Shift baru di hari yang sama**: nomor order lanjut (tidak mulai dari 1 lagi) dan kode order memakai tanggal hari bisnis shift baru. → test Task 4.
5. **Refund tunai di shift baru untuk order shift lama**: uangnya keluar dari laci shift baru dan dihitung di saldo shift baru, bukan shift lama. → test Task 1.

---

## File Structure

```
src/lib/pos/shift.ts            DENOMINATIONS, countedTotal, shiftSummary, varianceLabel
src/lib/pos/shift.test.ts
prisma/schema.prisma            Shift: kolom penutupan
src/lib/pos/mutations.ts        + shift.close
src/lib/pos/apply.ts            + shift.close; closeShiftTx (dipakai admin)
src/lib/pos/client/actions.ts   + lockCount, closeShift
src/components/pos/app/CloseShiftView.tsx, DenominationInput.tsx
src/components/pos/print/ShiftReport.tsx
src/app/admin/shifts/page.tsx, [id]/page.tsx, close-form.tsx
src/app/api/admin/shifts/[id]/close/route.ts
```

---

### Task 1: Ringkasan shift & pecahan (modul murni)

**Files:** Create `src/lib/pos/shift.ts`, test `src/lib/pos/shift.test.ts`

**Interfaces:**
- Produces:
  - `DENOMINATIONS: readonly number[]` (nilai di atas)
  - `type Denominations = { notes: Record<string, number>; coins: number }` (kunci = nilai pecahan sebagai string, isi = jumlah lembar)
  - `countedTotal(d: Denominations): number`
  - `type ShiftSummary = { opening_float; transactions; cash_sales; edc_sales; qris_sales; gross_sales; discounts; tax; voids; refunds_cash; refunds_cashless; paid_in; paid_out; expected_cash }` (semua number)
  - `shiftSummary(shift: Pick<ShiftDoc,'id'|'opening_float'>, orders: OrderDoc[], moves: CashMoveDoc[], refundsHere: RefundDoc[]): ShiftSummary` — `orders` = order dengan `shift_id === shift.id` (penjualan); `moves` = kas shift ini (termasuk `refund_out`); `refundsHere` = refund yang **dibuat di shift ini** (bisa untuk order shift lama). `refunds_cash`/`refunds_cashless` dari `refundsHere`; `expected_cash` memakai `moves`.
  - `varianceLabel(variance: number): string` → `'Pas'`, `'Lebih Rp 5.000'`, `'Kurang Rp 2.000'`
- `RefundDoc` mendapat `shift_id`. Server: `refundsHere` = `Refund where shift_id`. Tablet: refund pada order lokal yang `shift_id`-nya shift ini (tablet hanya bisa me-refund order shift berjalan dari Riwayat, jadi ini lengkap).

- [ ] **Step 1: Failing tests**
  - `countedTotal({ notes: { '100000': 2, '5000': 3 }, coins: 1500 })` → `216500`.
  - `expected cash`: modal 200 000; order tunai lunas 76 000 dan 20 000; QRIS 20 000; void 1; paid_in 50 000; paid_out 20 000; refund_out 25 200 → `expected_cash 300800`, `cash_sales 96000`, `qris_sales 20000`, `transactions 3`, `voids 1`.
  - `refunded orders still count their cash sale; the refund is a separate cash-out`.
  - `a cash refund in this shift for an older order comes out of this drawer` (Review Focus 5): orders kosong, moves `refund_out 20000` → `expected_cash = opening − 20000`, `refunds_cash 20000`.
  - `varianceLabel(0)` `'Pas'`, `varianceLabel(5000)` `'Lebih Rp 5.000'`, `varianceLabel(-2000)` `'Kurang Rp 2.000'`.
- [ ] **Step 2:** FAIL → **Step 3:** implement (tambah `shift_id` ke `RefundDoc` + `toOrderDoc` + `refundOrder`) → **Step 4:** PASS + tsc → **Step 5:** Commit `feat(pos): shift summary and denomination math`.

---

### Task 2: Schema penutupan shift

**Files:** Modify `prisma/schema.prisma`; migration `shift_close` (`npx prisma migrate dev --name shift_close`, lalu `npm run db:migrate:replica` lokal)

**Interfaces:**
- Produces kolom `Shift`: `closed_at DateTime?`, `closed_by String?`, `closed_via String?` (`"tablet"|"admin"`), `denominations Json?`, `counted_cash Int?`, `expected_cash Int?`, `client_expected Int?`, `variance Int?`, `close_note String?`, `sync_note String?`, `summary Json?` (ShiftSummary saat ditutup). Replica: task `{ shift }` yang sudah ada menyalin semua kolom; `summary`/`denominations` masuk `JSON_COLUMNS` di `replica-sync.ts`.

- [ ] **Step 1:** Failing test di `replica-sync.test.ts`: `forWrite('shift', { id, summary: null, denominations: null })` → keduanya `Prisma.DbNull`.
- [ ] **Step 2:** FAIL → **Step 3:** schema + migrasi + `JSON_COLUMNS.shift = ['summary','denominations']` → **Step 4:** PASS, `npm run db:sync:replica` lokal sukses → **Step 5:** Commit `feat(db): shift closing columns`.

---

### Task 3: Server — `shift.close` dan penutupan oleh admin

**Files:** Modify `src/lib/pos/mutations.ts`, `src/lib/pos/apply.ts`, `src/lib/pos/snapshot.ts`; test `src/lib/pos/apply.db.test.ts`

**Interfaces:**
- Consumes: `shiftSummary`, `countedTotal`, `Denominations` (Task 1).
- Produces mutation `shift.close` { shift_id, denominations: Denominations, counted_cash, note: string|null, employee_id, client_expected } (+ `id`, `created_at`).
- Produces `closeShiftTx(tx, ctx: { outletId; tax }, input: { shiftId; denominations; note: string|null; closedBy: string; via: 'tablet'|'admin'; at: Date; clientExpected?: number; voidOpenWithReason?: string }): Promise<{ expected: number; variance: number }>` — dipakai `apply` dan route admin. Aturan:
  - shift harus `open`;
  - `counted_cash` = `countedTotal(denominations)` (mutation: tolak bila tidak sama);
  - ada order `open` → tolak `Masih ada N open bill`, kecuali `voidOpenWithReason` (admin) → order itu di-void dengan alasan `Ditutup admin: <alasan>`;
  - hitung `shiftSummary` dari DB; `variance = counted − expected`; `variance ≠ 0` dan note kosong → tolak `Catatan wajib karena ada selisih`;
  - simpan semua kolom Task 2; `sync_note` bila `clientExpected` ada dan ≠ expected;
  - audit `shift.close` (actor `employee:<id>` atau email admin).
- Snapshot tidak berubah (hanya shift `open`); setelah tutup tablet menerima `shift: null`.

- [ ] **Step 1: Failing DB tests**
  - `closes a shift with the server's expected cash`: shift modal 200 000 + order tunai 76 000 + paid_out 20 000; tutup dengan hitungan 256 000 → `status closed`, `expected 256000`, `variance 0`, `summary.cash_sales 76000`.
  - `requires a note when the count is off` → `rejected 'Catatan wajib karena ada selisih'`; dengan note → `applied`, `variance −1000`.
  - `blocks closing while a bill is open`.
  - `keeps the server's figure when the tablet's expected differs` (Review Focus 1): `client_expected` 300 000 vs server 256 000 → `applied`, `client_expected 300000`, `sync_note` terisi.
  - `rejects a count that doesn't add up` (`counted_cash` ≠ total pecahan).
  - `mutations for a closed shift are rejected` (Review Focus 3): setelah tutup, `cash.move` ke shift itu → `rejected 'Shift sudah ditutup'`.
  - `admin close voids leftover open bills` via `closeShiftTx(..., { via: 'admin', voidOpenWithReason: 'Tablet rusak' })` → order `void`, `void_reason 'Ditutup admin: Tablet rusak'`, shift `closed_via 'admin'`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm run test:db` + `npm test` + tsc PASS → **Step 5:** Commit `feat(pos): close shift on the server`.

---

### Task 4: Tablet — kunci hitungan & tutup kasir

**Files:** Modify `src/lib/pos/client/actions.ts`, `src/lib/pos/client/db.ts` (KV `count_lock`, `last_close`); test `src/lib/pos/client/close.test.ts`

**Interfaces:**
- Consumes: `shiftSummary`, `countedTotal`, `varianceLabel` (Task 1).
- Produces:
  - `lockCount(denominations: Denominations, employeeId: string): Promise<{ counted: number; expected: number; variance: number }>` — tolak bila ada open bill di shift; simpan `kv.count_lock = { shift_id, denominations, counted, expected, variance, at, employee_id }`; bila sudah ada lock untuk shift ini, kembalikan lock lama (angka baru diabaikan).
  - `getCountLock(): Promise<CountLock | null>` (hanya untuk shift saat ini).
  - `closeShift(note: string | null, employeeId: string): Promise<ClosedShift>` — butuh lock; catatan wajib bila `variance ≠ 0`; set `kv.shift` ke status `closed`, simpan `kv.last_close = { shift, summary, counted, expected, variance, note, denominations, closed_by, closed_at }`, hapus `count_lock`, enqueue `shift.close`.
  - Setelah `closeShift`, `openShift` boleh lagi (shift berstatus `closed`).

- [ ] **Step 1: Failing tests** (`fake-indexeddb`):
  - `locking twice keeps the first count` (Review Focus 2): `lockCount(A)` lalu `lockCount(B)` → hasil kedua = A.
  - `cannot lock while a bill is open`.
  - `closing needs a note when the count is off`.
  - `closing queues shift.close with the locked count and frees the tablet for a new shift`: outbox berisi `shift.close` dengan `denominations` A; `openShift` setelahnya sukses.
  - `a second shift the same business day continues the order numbers` (Review Focus 4): order shift-1 bernomor 1–2 → order pertama shift-2 bernomor 3.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS + tsc → **Step 5:** Commit `feat(pos): lock the cash count and close the shift on the tablet`.

---

### Task 5: Layar Tutup Kasir & laporan 58 mm

**Files:** Create `src/components/pos/app/CloseShiftView.tsx`, `DenominationInput.tsx`, `src/components/pos/print/ShiftReport.tsx` (+ kasus di `print.test.tsx`); Modify `PosApp.tsx`, `TopBar` actions (tombol "Tutup Kasir")

**Interfaces:**
- Consumes: Task 4 actions, `printNode`.
- `DenominationInput` props `{ value: Denominations; onChange; disabled? }`: baris per pecahan (label `Rp 100.000`, stepper −/+ dan input angka `aria-label="Jumlah lembar Rp 100.000"`, subtotal), input `Koin (total Rp)`, total besar `data-testid="counted-total"`.
- Alur `CloseShiftView`: (a) ada open bill → daftar open bill + teks "Selesaikan atau batalkan open bill dulu"; (b) hitung → tombol "Selesai hitung" (konfirmasi "Hitungan tidak bisa diubah lagi") → `lockCount`; (c) layar selisih: teks besar `varianceLabel` (`data-testid="variance"`), textarea Catatan (wajib bila ≠ 0), tombol "Tutup Kasir" → `closeShift`; (d) layar selesai: ringkasan + "Cetak laporan" + "Buka shift baru".
- `ShiftReport` { closed: ClosedShift; setting; employees }: nama kafe, tanggal shift, dibuka (jam, oleh) / ditutup (jam, oleh), modal awal, penjualan tunai/EDC/QRIS, jumlah transaksi, void, refund tunai/non-tunai, kas masuk, kas keluar, **saldo seharusnya**, rincian pecahan, uang dihitung, selisih, catatan.
- `PosApp`: `kv.last_close` ada & belum dilihat → layar (d) sebelum `OpenShiftView`.

- [ ] **Step 1:** Failing unit test `ShiftReport` memuat `Saldo seharusnya`, `Selisih`, `Kurang Rp 1.000`, baris `100.000 x 2`. Failing E2E (scratchpad `f3.cjs`): buka shift 200 000 → jual tunai 20 000 → kas keluar 5 000 → Tutup Kasir → isi pecahan 100 000 ×2, 10 000 ×1, 5 000 ×1 = 215 000 → "Selesai hitung" → `variance` "Pas" → Tutup → server `closed`, `variance 0` → cetak laporan (print dipanggil) → "Buka shift baru" tampil. Skenario kedua: hitungan 214 000 → "Kurang Rp 1.000", tombol tutup nonaktif sampai catatan diisi; reload setelah dikunci → angka tetap 214 000 (Review Focus 2).
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS + screenshot + PDF 58 mm → **Step 5:** Commit `feat(pos): close-shift screen and 58mm shift report`.

---

### Task 6: Admin — Kas Kasir & tutup dari admin

**Files:** Create `src/app/admin/shifts/page.tsx`, `src/app/admin/shifts/[id]/page.tsx`, `src/app/admin/shifts/[id]/close-form.tsx`, `src/app/api/admin/shifts/[id]/close/route.ts`; Modify `AdminSidebar.tsx` (item "Kas Kasir", ikon `Wallet`, setelah "Promo"), `src/lib/schemas.ts` (`adminCloseSchema`)

**Interfaces:**
- Consumes: `closeShiftTx` (Task 3), `shiftSummary`, `DenominationInput` (Task 5, dipakai ulang), `queueSync({ shift }, { orders }, { auditLog })`.
- `/admin/shifts`: tabel per shift terbaru di atas (tanggal bisnis, dibuka jam/oleh, ditutup jam/oleh/via, modal, saldo seharusnya, dihitung, selisih berwarna, badge "Terbuka"), filter rentang tanggal (default 7 hari terakhir).
- `/admin/shifts/[id]`: ringkasan (`summary` tersimpan; shift terbuka → `shiftSummary` live), rincian pecahan, daftar kas masuk/keluar/refund tunai, daftar transaksi singkat, catatan & `sync_note`; tombol "Cetak" (pakai `ShiftReport`).
- Shift terbuka: form "Tutup dari admin" — peringatan "Pastikan tablet sudah tersinkron; transaksi yang belum terkirim akan ditolak", `DenominationInput`, alasan wajib → `POST /api/admin/shifts/[id]/close` (`adminCloseSchema` = `{ denominations, reason }`).

- [ ] **Step 1:** Failing tests: `adminCloseSchema` (alasan wajib; jumlah lembar bilangan bulat ≥ 0). Failing E2E bagian admin di `f3.cjs`: daftar menampilkan shift yang ditutup tablet dengan selisih "Pas"; buka shift baru di tablet + 1 open bill → admin tutup dengan alasan "Tablet rusak" → shift `closed_via admin`, open bill `void`; tablet setelah sync kembali ke layar Buka Kasir.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** Commit `feat(admin): cash drawer history and closing from the back office`.

---

### Task 7: Regresi & rilis

- [ ] **Step 1:** `npm test`, `npm run test:db`, `npx tsc --noEmit`, `next build`; E2E `f1.cjs`, `f2.cjs`, `f2-offline.cjs` (+ tutup kasir saat offline: kunci & tutup offline → online → server `closed`), `sw-deploy.cjs`, `f3.cjs`; replica identik (`dbdiff.sh`).
- [ ] **Step 2:** README (tutup kasir, admin Kas Kasir), `docs/PLAN.md` centang F3.
- [ ] **Step 3:** Review akhir seluruh branch; push branch + PR. Migrasi produksi & merge menunggu persetujuan.
