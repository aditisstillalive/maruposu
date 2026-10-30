# F2 — Kasir Offline: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layar kasir di tablet yang tetap bisa dipakai saat internet putus: buka kasir (modal awal), buat order dengan varian/add-on, open bill, promo/kupon, bayar tunai/EDC/QRIS, cetak struk & tiket barista 58 mm, kas masuk/keluar, void open bill, refund per item.

**Architecture:** Hitungan uang (harga, promo, pajak, alokasi diskon, refund) ada di modul murni `src/lib/pos/` yang dipakai bersama oleh tablet dan server. Tablet menyimpan semua di IndexedDB (Dexie) dan menulis setiap aksi ke **outbox**; mesin sync mengirim outbox ke `POST /api/pos/sync` yang idempotent per id mutation, lalu menarik `GET /api/pos/snapshot`. Service worker menyimpan app shell agar `/` dan `/pos` terbuka tanpa internet. Setiap penulisan server diikuti `queueSync` ke replica (pola tokatalog).

**Tech Stack:** Next.js 15 App Router, React 18, Prisma 5 + Postgres (primary + replica), Dexie 4 + dexie-react-hooks, fake-indexeddb (test), vitest, Playwright (E2E, di luar repo seperti F1).

**Spec:** `docs/PLAN.md` (keputusan utama + bagian "Keputusan F2"), requirement asli kasir di riwayat chat (modul Operasional Kasir A–G).

## Global Constraints

- Uang selalu integer rupiah (`Int`); persen disimpan basis point (`1000` = 10%). Pembulatan hanya `Math.round`, di satu tempat per hitungan.
- Pajak dari `Setting` (`tax_name`, `tax_rate_bp`, `tax_inclusive`); default PB1 10% sudah termasuk harga.
- Semua waktu disimpan UTC; tampilan & aturan hari/jam promo memakai WIB (UTC+7). Hari bisnis berakhir 04:00 WIB (`businessDayEnd` di `src/lib/device-session.ts`).
- Satu tablet; satu shift terbuka per outlet. Satu promo per bill. Tidak ada diskon manual.
- Bill lunas tidak bisa diubah; void hanya untuk open bill; refund hanya untuk bill lunas, per item, alasan wajib, metode `cash` atau `cashless`.
- Teks UI Bahasa Indonesia; gaya visual sama dengan F1 (monokrom, Raleway, kartu `rounded-2xl border bg-white`, tombol minimal tinggi 44 px untuk sentuh).
- Setiap tabel baru yang disinkronkan masuk `TABLES` di `src/lib/replica-sync.ts`; `PosMutation` hanya di primary.
- Shell lokal punya `NODE_ENV=production` → `npm ci --include=dev`; port app lokal 3200, bukan `$PORT`.

## Review Focus

1. **Mutation dikirim dua kali** (respons sync hilang di jalan, tablet kirim ulang): server harus menjawab `duplicate` dan tidak membuat order/kas ganda. → test di Task 4.
2. **Tablet offline lama lalu online dengan sesi kedaluwarsa (lewat 04:00)**: outbox tidak boleh hilang; sync berhenti dengan status `locked`, kasir diminta PIN, lalu sync lanjut. → test di Task 5.
3. **Promo berubah/kuota habis di server saat tablet offline**: pembayaran tetap diterima dengan angka yang benar-benar ditagih tablet, server menandai `sync_note`, tidak menolak. → test di Task 4.
4. **Refund sisa terakhir dari item yang sudah sebagian di-refund**: total refund tepat sama dengan yang dibayar untuk baris itu (tidak selisih Rp1 karena pembulatan). → test di Task 1.
5. **Uang tunai kurang dari total / input nominal kosong**: tombol Bayar nonaktif; server juga menolak `cash_received < total`. → test di Task 1 (`validatePayment`) dan Task 4.

---

## File Structure

```
src/lib/pos/
  types.ts            tipe bersama (menu, cart, promo, totals, dokumen order, mutation)
  pricing.ts          unitPrice, lineTotal, computeTotals, validatePayment
  promo.ts            promoActiveAt, promoDiscount
  allocate.ts         allocate (largest remainder)
  refund.ts           refundLineAmount, refundTax
  codes.ts            businessDateWIB, orderCode
  mutations.ts        zod schema per jenis mutation (server)
  apply.ts            applyMutations (server, Prisma)
  snapshot.ts         buildSnapshot (server)
  client/db.ts        Dexie schema
  client/actions.ts   aksi lokal + enqueue (satu transaksi Dexie)
  client/sync.ts      syncOnce, startSyncLoop
  client/offline-pin.ts  verifier PIN lokal (PBKDF2)
src/app/api/pos/sync/route.ts, src/app/api/pos/snapshot/route.ts
src/app/admin/promos/*, src/app/api/admin/promos/*
src/app/pos/page.tsx  (server: requireDevice → <PosApp/>)
src/components/pos/app/*   PosApp dan view-nya
src/components/pos/print/* Receipt, BaristaTicket, printNode
public/sw.js, public/manifest.webmanifest
```

`/staff` dan `/api/device/cashier` (F1) dihapus: pemilihan kasir pindah ke dalam PosApp (harus jalan offline).

---

### Task 1: Hitungan uang (modul murni)

**Files:**
- Create: `src/lib/pos/types.ts`, `src/lib/pos/pricing.ts`, `src/lib/pos/promo.ts`, `src/lib/pos/allocate.ts`, `src/lib/pos/refund.ts`, `src/lib/pos/codes.ts`
- Test: `src/lib/pos/pricing.test.ts`, `src/lib/pos/promo.test.ts`, `src/lib/pos/refund.test.ts`, `src/lib/pos/codes.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  type LineOption = { option_id: string; group_name: string; name: string; price_delta: number };
  type CartLine = { id: string; product_id: string; category_id: string; name: string; base_price: number; options: LineOption[]; qty: number; note: string | null };
  type TaxRule = { name: string; rate_bp: number; inclusive: boolean };
  type PromoRule = { id: string; name: string; code: string | null; kind: 'percent' | 'amount'; value: number; max_discount: number | null; scope: 'bill' | 'product' | 'category'; product_ids: string[]; category_ids: string[]; min_spend: number; starts_at: string | null; ends_at: string | null; days: number[]; time_start: string | null; time_end: string | null; quota: number | null; used_count: number; is_active: boolean };
  type MenuOption = { id: string; name: string; price_delta: number; is_default: boolean };
  type MenuGroup = { id: string; name: string; kind: 'variant' | 'addon'; required: boolean; min_select: number; max_select: number; options: MenuOption[] };
  type MenuProduct = { id: string; category_id: string; name: string; price: number; photo_url: string | null; is_sold_out: boolean; groups: MenuGroup[] };
  type LineMoney = { discount: number; paid: number };
  type Totals = { subtotal: number; discount: number; tax: number; total: number; lines: Record<string, LineMoney> };
  ```
- Produces functions:
  - `unitPrice(line: Pick<CartLine,'base_price'|'options'>): number`; `lineTotal(line): number`
  - `promoActiveAt(p: PromoRule, now: Date): boolean`
  - `promoDiscount(p: PromoRule, lines: CartLine[]): number`
  - `allocate(amount: number, weights: Record<string, number>): Record<string, number>`
  - `computeTotals(lines: CartLine[], promo: PromoRule | null, tax: TaxRule): Totals`
  - `validatePayment(method: 'cash'|'edc'|'qris', total: number, cashReceived: number | null): string | null` (pesan error atau null)
  - `refundLineAmount(line: { qty: number; paid: number }, refundQty: number, already: { qty: number; amount: number }): number`
  - `refundTax(amount: number, tax: TaxRule): number`
  - `businessDateWIB(now: Date): string` (`YYYY-MM-DD`), `orderCode(businessDate: string, deviceTag: string, seq: number): string`

Aturan yang dipinned spec:
- Promo `bill`: diskon dari subtotal. Promo `product`/`category`: dari jumlah baris yang cocok; `amount` = `value × qty` baris cocok. `percent` = `round(dasar × value / 10000)`. Lalu dibatasi `max_discount` (jika ada) dan dasar. `min_spend` dibanding subtotal; tidak terpenuhi → 0.
- `promoActiveAt`: `is_active`, `starts_at ≤ now < ends_at` (null = tanpa batas), hari WIB ada di `days` (kosong = semua hari, 0 = Minggu), jam WIB `time_start ≤ HH:mm < time_end` (null = sepanjang hari), `quota` null atau `used_count < quota`.
- Pajak: `net = subtotal − discount`. Inclusive: `total = net`, `tax = round(net × bp / (10000 + bp))`. Exclusive: `tax = round(net × bp / 10000)`, `total = net + tax`.
- `lines[id].discount` = alokasi diskon ke baris cocok (bill: semua baris) proporsional `lineTotal`; `lines[id].paid` = alokasi `total` ke semua baris proporsional `lineTotal − discount`. Keduanya `allocate` largest-remainder sehingga jumlahnya tepat.
- `refundLineAmount`: `round(paid × refundQty / qty)`, kecuali bila `already.qty + refundQty === qty` → `paid − already.amount`.
- `refundTax(amount)` = `round(amount × bp / (10000 + bp))` (berlaku untuk inclusive maupun exclusive karena `paid` sudah termasuk pajak).
- `businessDateWIB`: tanggal WIB dari `now − 4 jam`. `orderCode('2026-10-30','A7',14)` → `'261030-A7-014'`.

- [ ] **Step 1: Write failing tests**

```ts
// pricing.test.ts
const tax10incl = { name: 'PB1', rate_bp: 1000, inclusive: true };
const tax10excl = { ...tax10incl, inclusive: false };
const kopi = line({ id: 'a', base_price: 22000, options: [opt('Extra shot', 6000)], qty: 2 }); // 56000
const croissant = line({ id: 'b', category_id: 'makanan', base_price: 20000, qty: 1 });

it('prices a line with options', () => expect(lineTotal(kopi)).toBe(56000));
it('inclusive tax is carved out of the total', () => {
  const t = computeTotals([kopi, croissant], null, tax10incl);
  expect(t).toMatchObject({ subtotal: 76000, discount: 0, total: 76000, tax: 6909 });
});
it('exclusive tax is added on top', () =>
  expect(computeTotals([croissant], null, tax10excl)).toMatchObject({ total: 22000, tax: 2000 }));
it('line paid amounts sum exactly to the total', () => {
  const t = computeTotals([kopi, croissant, line({ id: 'c', base_price: 18333, qty: 3 })], billPercent(10), tax10excl);
  expect(Object.values(t.lines).reduce((s, l) => s + l.paid, 0)).toBe(t.total);
});
it('validatePayment', () => {
  expect(validatePayment('cash', 76000, 50000)).toBe('Uang diterima kurang dari total');
  expect(validatePayment('cash', 76000, null)).toBe('Isi uang diterima');
  expect(validatePayment('cash', 76000, 100000)).toBeNull();
  expect(validatePayment('qris', 76000, null)).toBeNull();
});

// promo.test.ts
it('10% bill promo capped by max_discount', () => expect(promoDiscount({ ...billPercent(10), max_discount: 5000 }, [kopi, croissant])).toBe(5000));
it('category amount promo applies per unit', () => expect(promoDiscount(categoryAmount('makanan', 5000), [kopi, croissant])).toBe(5000));
it('min_spend not met gives no discount', () => expect(promoDiscount({ ...billPercent(10), min_spend: 100000 }, [kopi])).toBe(0));
it('happy hour 14:00–16:00 WIB on weekdays', () => {
  const p = { ...billPercent(20), days: [1, 2, 3, 4, 5], time_start: '14:00', time_end: '16:00' };
  expect(promoActiveAt(p, new Date('2026-10-30T07:30:00Z'))).toBe(true);   // Fri 14:30 WIB
  expect(promoActiveAt(p, new Date('2026-10-30T09:00:00Z'))).toBe(false);  // Fri 16:00 WIB
  expect(promoActiveAt(p, new Date('2026-11-01T07:30:00Z'))).toBe(false);  // Sun
});
it('used-up quota is inactive', () => expect(promoActiveAt({ ...billPercent(10), quota: 5, used_count: 5 }, new Date())).toBe(false));

// refund.test.ts
it('partial refunds never drift from what was paid', () => {
  const l = { qty: 3, paid: 50000 };
  const first = refundLineAmount(l, 1, { qty: 0, amount: 0 });          // 16667
  const second = refundLineAmount(l, 1, { qty: 1, amount: first });     // 16667
  const last = refundLineAmount(l, 1, { qty: 2, amount: first + second });
  expect(first + second + last).toBe(50000);
});
it('refund tax portion', () => expect(refundTax(22000, { name: 'PB1', rate_bp: 1000, inclusive: true })).toBe(2000));

// codes.test.ts
it('business date rolls at 04:00 WIB', () => {
  expect(businessDateWIB(new Date('2026-10-30T20:59:00Z'))).toBe('2026-10-30'); // 03:59 WIB 31 Okt
  expect(businessDateWIB(new Date('2026-10-30T21:00:00Z'))).toBe('2026-10-31');
});
it('order code', () => expect(orderCode('2026-10-30', 'A7', 14)).toBe('261030-A7-014'));
```
(`line`, `opt`, `billPercent(pct)`, `categoryAmount(cat, value)` adalah helper fixture kecil di file test.)

- [ ] **Step 2:** `npx vitest run src/lib/pos` → FAIL (modul belum ada).
- [ ] **Step 3:** Implementasi fungsi-fungsi di atas.
- [ ] **Step 4:** `npx vitest run src/lib/pos` → PASS; `npx tsc --noEmit` bersih.
- [ ] **Step 5:** Commit `feat(pos): pricing, promo, tax and refund math`.

---

### Task 2: Schema transaksi + replica

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/replica-sync.ts`
- Create: migration `prisma/migrations/<ts>_pos_transactions/` via `npx prisma migrate dev --name pos_transactions`
- Test: `src/lib/replica-sync.test.ts` (tambah kasus)

**Interfaces:**
- Produces models (kolom snake_case, id client-generated UUID untuk Shift/CashMovement/Order/OrderItem/Refund/RefundItem/PosMutation):
  - `Promo` { id cuid, outlet_id, name, code String? (uppercase, `@@unique([outlet_id, code])`), kind, value Int, max_discount Int?, scope, product_ids String[], category_ids String[], min_spend Int @default(0), starts_at DateTime?, ends_at DateTime?, days Int[], time_start String?, time_end String?, quota Int?, used_count Int @default(0), is_active Boolean @default(true), timestamps }
  - `Shift` { id, outlet_id, device_id, business_date String, opening_float Int, opened_by (Employee), opened_at, status "open"|"closed" }
  - `CashMovement` { id, shift_id, kind "paid_in"|"paid_out"|"refund_out", amount Int, note String, employee_id, refund_id String?, created_at }
  - `Order` { id, outlet_id, shift_id, code String @unique, number Int, business_date String, status "open"|"paid"|"void"|"refunded", order_type "dine_in"|"takeaway", customer_name String?, table_no String?, created_by, paid_by String?, subtotal, discount, tax, total Int @default(0), promo_id String?, promo_name String?, payment_method String?, cash_received Int?, change Int?, payment_ref String?, paid_at DateTime?, void_reason String?, voided_by String?, voided_at DateTime?, sync_note String?, created_at, updated_at }
  - `OrderItem` { id, order_id, product_id String?, category_id String?, name, base_price Int, unit_price Int, qty Int, note String?, discount Int @default(0), paid Int @default(0), refunded_qty Int @default(0), refunded_amount Int @default(0), sort_order Int }
  - `OrderItemOption` { id cuid, order_item_id, option_id String?, group_name, name, price_delta Int }
  - `Refund` { id, order_id, shift_id, method "cash"|"cashless", amount Int, tax Int, reason String, employee_id, created_at } + `RefundItem` { id, refund_id, order_item_id, qty Int, amount Int }
  - `PosMutation` { id String @id, device_id, type, status "applied"|"rejected", error String?, created_at } — **primary only**
- Produces `SyncTask` tambahan: `{ promo: string } | { shift: string } | { orders: string[] }` (orders = order + items + options + refunds + refund items).

- [ ] **Step 1: Failing test** di `replica-sync.test.ts`: `TABLES` (ganti nama & ekspor sebagai `SYNCED_TABLES`) memuat `promo, shift, cashMovement, order, orderItem, orderItemOption, refund, refundItem` dan tidak memuat `posMutation`; tiap tabel anak muncul setelah induknya.
- [ ] **Step 2:** Jalankan → FAIL.
- [ ] **Step 3:** Tambah model + migrasi; tambah tabel & `load()` untuk tiga task baru di `replica-sync.ts` (pola `mirror` yang ada). Migrasi juga diterapkan ke DB replica lokal (`npm run db:migrate:replica`).
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(db): POS transaction tables and their replica sync`.

---

### Task 3: Admin Promo & Kupon

**Files:**
- Modify: `src/lib/schemas.ts`, `src/lib/schemas.test.ts`, `src/components/admin/AdminSidebar.tsx` (item "Promo", ikon `TicketPercent`, setelah "Varian & Add-on")
- Create: `src/app/api/admin/promos/route.ts` (POST), `src/app/api/admin/promos/[id]/route.ts` (PATCH, DELETE), `src/app/admin/promos/page.tsx`, `src/app/admin/promos/promo-manager.tsx`

**Interfaces:**
- Produces `promoSchema` (zod) → objek siap `prisma.promo.create` minus `outlet_id`. Input `value` untuk `percent` dalam persen (mis. `10`), disimpan bp (`1000`); `code` di-trim + uppercase, kosong → null; `time_start/time_end` format `HH:mm`, keduanya isi atau keduanya kosong; `ends_at > starts_at` bila keduanya ada; `scope: product` butuh ≥1 `product_ids`, `category` butuh ≥1 `category_ids`; `percent` 1–100.
- Setiap POST/PATCH/DELETE: audit `promo.create|update|delete` + `queueSync({ promo: id }, { auditLog })`. Kode duplikat → 409 `Kode kupon sudah dipakai`.

- [ ] **Step 1: Failing tests** `promoSchema`: `{kind:'percent', value:10}` → `value 1000`; code `' maraca10 '` → `'MARACA10'`; `percent 150` ditolak; `scope:'product', product_ids:[]` ditolak; `time_start` tanpa `time_end` ditolak.
- [ ] **Step 2:** FAIL → **Step 3:** implementasi schema, route, halaman (daftar kartu promo: nama, aturan ringkas "10% · min Rp50.000 · Sen–Jum 14:00–16:00", status aktif/berakhir/kuota habis, pemakaian `used_count/quota`; dialog form dengan pemilih produk/kategori bercentang, sama gaya `menu-manager.tsx`).
- [ ] **Step 4:** test + tsc PASS; cek manual lewat build lokal: buat promo bill 10% dan kupon `MARACA10` kuota 5.
- [ ] **Step 5:** Commit `feat(admin): promos and coupons`.

---

### Task 4: Server sync — mutation, apply, snapshot

**Files:**
- Create: `src/lib/pos/mutations.ts`, `src/lib/pos/apply.ts`, `src/lib/pos/snapshot.ts`, `src/app/api/pos/sync/route.ts`, `src/app/api/pos/snapshot/route.ts`
- Create test: `src/lib/pos/apply.db.test.ts`; Modify: `vitest.config.ts` (project `db` untuk `*.db.test.ts`, terpisah dari unit), `package.json` script `"test:db": "vitest run --project db"`, `scripts/local-db.sh` (buat DB `maruposu_test`)

**Interfaces:**
- Consumes: Task 1 (`computeTotals`, `refundLineAmount`, `refundTax`, `validatePayment`, `promoActiveAt`), Task 2 models, `readDevice()` dari `src/lib/device.ts`, `queueSync`, `audit`.
- Produces `Mutation` (discriminated union, zod di `mutations.ts`), semua punya `{ id: uuid, created_at: ISO }`:
  - `shift.open` { shift_id, opening_float, employee_id, business_date }
  - `order.save` { order: OrderDoc } — `OrderDoc` = header order + `items: (CartLine & { sort_order })[]`; hanya untuk status open
  - `order.pay` { order_id, promo_id|null, method: 'cash'|'edc'|'qris', cash_received|null, payment_ref|null, employee_id, client_totals: { subtotal, discount, tax, total } }
  - `order.void` { order_id, reason, employee_id }
  - `order.refund` { refund_id, order_id, method: 'cash'|'cashless', reason, employee_id, items: { order_item_id, qty }[] }
  - `cash.move` { movement_id, shift_id, kind: 'paid_in'|'paid_out', amount, note, employee_id }
- Produces `applyMutations(deviceId: string, input: unknown[]): Promise<{ results: { id: string; status: 'applied'|'duplicate'|'rejected'; error?: string }[] }>` — berurutan, satu transaksi per mutation; `PosMutation` ditulis di transaksi yang sama (id sudah ada → `duplicate`, tidak ada efek). Mutation tidak valid / melanggar aturan → `rejected` + disimpan dengan `error` (tidak diulang tablet).
- Produces (ditambahkan ke `src/lib/pos/types.ts`): `OrderDoc` (kolom `Order` + `items: (CartLine & { sort_order; discount; paid; refunded_qty; refunded_amount })[]` + `refunds`), `ShiftDoc` (kolom `Shift`), `Mutation`, `Snapshot`.
- Produces `buildSnapshot(deviceId: string): Promise<Snapshot>` dengan `Snapshot = { device_tag: string; setting: { cafe_name, address, tax: TaxRule, receipt_footer }, employees, categories, products: MenuProduct[], promos: PromoRule[], shift: ShiftDoc | null, orders: OrderDoc[] }`; `device_tag` = 2 karakter heksa uppercase pertama dari SHA-256 `deviceId` (cookie `maru_device_id` httpOnly, jadi tablet mendapatkannya dari snapshot dan menyimpannya di `kv.device_tag`) — menu/karyawan/promo lewat `readDb`, shift & order (shift terbuka + semua order di shift itu) dari primary.
- Route: `POST /api/pos/sync` body `{ mutations: unknown[] }` (maks 100) → 401 jika `readDevice()` null; `GET /api/pos/snapshot` sama. Middleware matcher sudah mencakup `/api/pos/:path*`.

Aturan apply (dari spec):
- `shift.open`: tolak bila ada shift `open` lain di outlet.
- `order.save`: shift harus `open`; order belum ada atau masih `open`; ganti semua item (`unit_price` = `unitPrice`).
- `order.pay`: order `open`; promo dievaluasi `promoActiveAt(promo, created_at)`; tolak bila `validatePayment` gagal; hitung `computeTotals`; **simpan `client_totals`** (uang yang benar-benar ditagih), isi `sync_note` bila beda dari hitungan server atau kuota terlampaui; `used_count += 1`; isi `discount`/`paid` per item dari hitungan server bila sama, dari alokasi `client_totals` bila beda.
- `order.void`: hanya status `open`; alasan wajib; audit `order.void`.
- `order.refund`: order `paid`; qty ≤ sisa; amount via `refundLineAmount`; `Refund.shift_id` = shift terbuka saat ini; method `cash` → tambah `CashMovement` `refund_out`; semua qty habis → status `refunded`; audit `order.refund`.
- `cash.move`: shift `open`; audit `cash.paid_in|cash.paid_out`.
- Setelah batch: `queueSync` untuk shift/order yang tersentuh + audit log.

- [ ] **Step 1: Failing DB tests** (`apply.db.test.ts`, DB `maruposu_test` di-reset tiap file):
  - `applies a full open-bill flow`: shift.open → order.save → order.pay (cash 100000, total 76000) → order tersimpan `paid`, `change 24000`.
  - `same mutation twice is a duplicate with no second effect` (Review Focus 1): kirim `cash.move` sama dua kali → hasil `applied`, `duplicate`; `CashMovement` count 1.
  - `pay keeps the tablet's totals when the promo changed offline` (Review Focus 3): promo dinonaktifkan sebelum `order.pay` → `applied`, `total` = `client_totals.total`, `sync_note` terisi, tidak `rejected`.
  - `rejects cash below total` (Review Focus 5) → `rejected`, order tetap `open`.
  - `refunds per item and moves drawer cash`: refund 1 dari 2 kopi tunai → `Refund.amount` = `refundLineAmount`, `CashMovement refund_out` sama nilainya; refund sisa → status `refunded`.
  - `void only open bills`: void order `paid` → `rejected`.
  - `second open shift is rejected`.
- [ ] **Step 2:** `npm run db:local && npm run test:db` → FAIL.
- [ ] **Step 3:** Implementasi `mutations.ts`, `apply.ts`, `snapshot.ts`, kedua route.
- [ ] **Step 4:** `npm run test:db` + `npx vitest run` + `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(pos): idempotent sync endpoint and snapshot`.

---

### Task 5: Mesin offline di tablet (Dexie + outbox + sync)

**Files:**
- Modify: `package.json` (deps `dexie@^4.4.0`, `dexie-react-hooks@^4.4.0`; dev `fake-indexeddb@^6.2.0`)
- Create: `src/lib/pos/client/db.ts`, `src/lib/pos/client/actions.ts`, `src/lib/pos/client/sync.ts`
- Test: `src/lib/pos/client/sync.test.ts` (pakai `fake-indexeddb/auto`)

**Interfaces:**
- Consumes: tipe `Mutation`, `OrderDoc`, `Snapshot` (Task 4), `businessDateWIB`, `orderCode` (Task 1).
- Produces `db` (Dexie `maruposu-pos`): tabel `orders` (key `id`, index `status, shift_id`), `outbox` (`++seq`, unique `id`), `kv` (key `key`: `snapshot`, `shift`, `cashier`, `device_tag`, `seq:<business_date>`, `rejected`, `sync_state`).
- Produces actions (masing-masing = satu `db.transaction('rw', …)` yang menulis dokumen lokal **dan** outbox): `openShift(openingFloat, employeeId)`, `newOrder(meta): OrderDoc` (kode via `orderCode`, seq per hari bisnis di `kv`), `saveOrder(order)`, `payOrder(orderId, payment, promo, totals)`, `voidOrder(orderId, reason, employeeId)`, `refundOrder(orderId, items, method, reason, employeeId)`, `addCashMove(kind, amount, note, employeeId)`, `setCashier(employee)`.
- Produces `syncOnce(fetchImpl = fetch): Promise<SyncState>` dengan `SyncState = { status: 'idle'|'offline'|'locked'|'error'; pending: number; rejected: number; last_synced_at: string|null }`: kirim outbox urut `seq` (batch 50) → hapus entri `applied/duplicate/rejected` (rejected disalin ke `kv.rejected`); 401 → `locked` (outbox tetap); error jaringan → `offline`; outbox kosong → tarik snapshot dan ganti order lokal yang **tidak** punya entri outbox. `startSyncLoop(): () => void` menjalankan `syncOnce` tiap 15 detik dan saat event `online`.
- Hook `usePosState()` (dexie-react-hooks `useLiveQuery`) untuk UI: `{ snapshot, shift, cashier, orders, sync }`.

- [ ] **Step 1: Failing tests** (`sync.test.ts`, fetch palsu):
  - `queues a mutation with every local write`: `addCashMove` → `outbox` 1 entri tipe `cash.move`.
  - `keeps the outbox when the device session expired` (Review Focus 2): fetch 401 → status `locked`, outbox tetap 1; fetch berikutnya 200 `applied` → outbox 0, status `idle`.
  - `network failure leaves everything queued`: fetch reject → `offline`, outbox tetap.
  - `snapshot never overwrites an order with pending changes`: order lokal edit belum terkirim + snapshot berisi versi lama → versi lokal tetap.
  - `rejected mutations are dropped from the outbox and counted`.
- [ ] **Step 2:** FAIL → **Step 3:** implementasi → **Step 4:** PASS + tsc.
- [ ] **Step 5:** Commit `feat(pos): offline store, outbox and sync loop`.

---

### Task 6: PWA + buka kunci offline

**Files:**
- Create: `public/sw.js`, `public/manifest.webmanifest`, `src/components/pos/RegisterSW.tsx`, `src/lib/pos/client/offline-pin.ts`, test `src/lib/pos/client/offline-pin.test.ts`
- Modify: `src/app/layout.tsx` (link manifest, apple-mobile-web-app meta), `src/app/page.tsx` + `src/components/pos/PinPad.tsx`, `next.config.ts` (header `Service-Worker-Allowed`/no-cache untuk `/sw.js`)

**Interfaces:**
- Produces `saveOfflineVerifier(pin: string, pinVersion: number, exp: number): Promise<void>` dan `checkOfflinePin(pin: string, now?: Date): Promise<boolean>` (PBKDF2-SHA256 100 000 iterasi, salt acak 16 byte, disimpan di `kv.offline_pin`; tidak berlaku setelah `exp`), `offlineSessionValid(now?: Date): Promise<boolean>`.
- `sw.js`: precache `/`, `/pos`, `/maraca-logo.png`, `/maraca-wordmark.png`, `/manifest.webmanifest`; `/_next/static/*` dan gambar produk cache-first; navigasi network-first dengan fallback cache; `/api/*` tidak pernah di-cache. Nama cache memuat versi build agar deploy baru membuang cache lama.
- PinPad: unlock online sukses → `saveOfflineVerifier` lalu `window.location.assign('/pos')` (bukan router, agar shell dari SW bisa dipakai). Gagal jaringan → `checkOfflinePin`; benar → sesi offline sampai 04:00 → `/pos`; salah → "PIN salah".
- Manifest: name "Maraca POS", `display: standalone`, `orientation: landscape`, `start_url: /pos`, ikon dari `src/app/icon.png`.

- [ ] **Step 1: Failing tests** `offline-pin.test.ts`: PIN benar → true; salah → false; lewat `exp` → false; verifier tidak berisi PIN mentah.
- [ ] **Step 2:** FAIL → **Step 3:** implementasi → **Step 4:** PASS + `next build`.
- [ ] **Step 5:** Commit `feat(pos): installable PWA shell and offline unlock`.

---

### Task 7: Kerangka PosApp — kasir, buka kasir, status

**Files:**
- Modify: `src/app/pos/page.tsx` (server: `requireDevice()` saat online, render `<PosApp />`), `src/middleware.ts` (hapus `/staff`, `/api/device/cashier` dari matcher), `src/app/page.tsx` (redirect `/pos`)
- Delete: `src/app/staff/page.tsx`, `src/components/pos/EmployeeGrid.tsx` (diganti), `src/app/api/device/cashier/route.ts`, `CASHIER_COOKIE`/`readCashier` di `src/lib/device.ts`
- Create: `src/components/pos/app/PosApp.tsx`, `TopBar.tsx`, `CashierPicker.tsx`, `OpenShiftView.tsx`, `NumPad.tsx`

**Interfaces:**
- Consumes: `usePosState`, `setCashier`, `openShift`, `startSyncLoop` (Task 5), `offlineSessionValid` (Task 6).
- Alur PosApp: belum ada snapshot → layar "Menyiapkan data…" (butuh online sekali); belum ada kasir → `CashierPicker` (kartu karyawan dari snapshot, sama seperti F1); belum ada shift `open` → `OpenShiftView` (NumPad modal awal, tombol "Buka Kasir"); selain itu → layar kasir (Task 8).
- `TopBar`: wordmark; shift "Shift dibuka 08:12 oleh Rani"; indikator `Online`/`Offline`/`Perlu PIN`/`N belum tersinkron`; tombol kasir (ganti); menu: Kas Masuk/Keluar, Riwayat, Kunci. Status `locked` → banner "Sesi berakhir, masukkan PIN untuk sinkronisasi" dengan tautan ke `/`.
- `NumPad` props `{ value: number|null; onChange(v: number|null): void; quick?: number[] }`.

- [ ] **Step 1:** Perbarui E2E F1 (`f1.cjs`, scratchpad) ke alur baru: PIN → kartu kasir di `/pos` → layar Buka Kasir. Jalankan → FAIL.
- [ ] **Step 2:** Implementasi.
- [ ] **Step 3:** `next build` + E2E → PASS; screenshot tablet landscape 1180×820.
- [ ] **Step 4:** Commit `feat(pos): app shell, cashier picker and opening float`.

---

### Task 8: Layar order — menu, opsi, bill, open bill

**Files:**
- Create: `src/components/pos/app/OrderScreen.tsx`, `CategoryRail.tsx`, `ProductGrid.tsx`, `OptionsDialog.tsx`, `BillPanel.tsx`, `OrderMetaForm.tsx`, `OpenBillsList.tsx`

**Interfaces:**
- Consumes: `newOrder`, `saveOrder`, `voidOrder` (Task 5), `unitPrice`, `computeTotals` (Task 1).
- Layout 3 kolom: rail kategori (lebar 160) | grid tile produk (foto/inisial, nama, harga; "Habis" non-aktif) | panel bill (lebar 380).
- Tap produk tanpa grup → langsung +1 (baris sama + opsi sama + catatan kosong digabung). Dengan grup → `OptionsDialog`: varian radio (default terpilih, wajib), add-on checkbox (≤ `max_select`), catatan, qty, harga live; "Tambah" nonaktif sampai grup wajib terisi.
- `BillPanel`: tab "Bill" | "Open bill (n)"; `OrderMetaForm` (Dine-in/Takeaway, nama, meja); baris dengan opsi & catatan, tombol −/+, tap baris = edit lewat `OptionsDialog`; ringkasan subtotal/diskon/pajak/total; tombol "Simpan bill" (→ `saveOrder`, status open) dan "Bayar" (Task 9). Open bill lama: tap → lanjutkan; tombol "Batalkan bill" → dialog alasan wajib → `voidOrder`.

- [ ] **Step 1:** E2E: tambah Es Kopi Susu (Ice, Less, + Extra shot) ×2 + Croissant, isi nama "Budi" meja "5", Simpan bill → muncul di "Open bill (1)"; buka lagi, tambah Americano, simpan; batalkan bill lain dengan alasan. Jalankan → FAIL.
- [ ] **Step 2:** Implementasi.
- [ ] **Step 3:** E2E PASS + screenshot.
- [ ] **Step 4:** Commit `feat(pos): order screen with options and open bills`.

---

### Task 9: Promo & pembayaran

**Files:**
- Create: `src/components/pos/app/PromoDialog.tsx`, `src/components/pos/app/PaymentDialog.tsx`

**Interfaces:**
- Consumes: `promoActiveAt`, `promoDiscount`, `computeTotals`, `validatePayment` (Task 1), `payOrder` (Task 5).
- `PromoDialog`: daftar promo aktif tanpa kode (dengan nilai diskon untuk bill ini; yang tidak memenuhi syarat tampil abu dengan alasan "Min. belanja Rp50.000"), input kode kupon (cocokkan `code` uppercase dari snapshot; tidak ada → "Kode tidak ditemukan atau tidak berlaku"). Satu promo per bill; bisa dilepas.
- `PaymentDialog`: tab Tunai / EDC / QRIS. Tunai: `NumPad` + tombol cepat `Uang pas`, lalu pecahan berikut di atas total dari [10 000, 20 000, 50 000, 100 000] (maks 4), tampil kembalian besar; EDC/QRIS: input no. referensi opsional, teks "Pastikan pembayaran berhasil di mesin/aplikasi". Tombol "Bayar" nonaktif selama `validatePayment` ≠ null. Sukses → `payOrder` → layar "Lunas" dengan kembalian, tombol Cetak struk / Cetak tiket (Task 10) / Order baru.
- Bayar di awal = Bayar langsung tanpa Simpan bill (order dibuat & dibayar sekaligus).

- [ ] **Step 1:** E2E: open bill "Budi" + kupon `MARACA10` → total turun 10%; bayar tunai 100 000 → kembalian sesuai; bill baru bayar QRIS langsung. Jalankan → FAIL.
- [ ] **Step 2:** Implementasi → **Step 3:** E2E PASS → **Step 4:** Commit `feat(pos): promos and cash/EDC/QRIS payment`.

---

### Task 10: Struk & tiket barista 58 mm

**Files:**
- Create: `src/components/pos/print/Receipt.tsx`, `BaristaTicket.tsx`, `printNode.ts`; Modify: `src/app/globals.css` (blok `@media print`)

**Interfaces:**
- Produces `printNode(node: React.ReactNode): void` — render ke `#print-root` lalu `window.print()`; CSS: `@page { size: 58mm auto; margin: 0 }`, lebar isi 48 mm, font monospace 11 px, sembunyikan app saat print.
- `Receipt` { order: OrderDoc; refunds?; setting; cashierName }: wordmark, nama kafe, alamat, tanggal-jam WIB, kode order, `Kasir: <nama>`, Dine-in/Takeaway + meja + nama, item (opsi & catatan di baris bawah, `qty × harga`), subtotal, diskon (nama promo), `PB1 10% (termasuk)` atau baris pajak exclusive, TOTAL, metode, uang diterima & kembalian (tunai), footer struk.
- `BaristaTicket` { order }: nomor order besar (seq 3 digit), jenis & meja & nama, item + opsi + catatan tebal, tanpa harga.

- [ ] **Step 1:** Unit test render (`react-dom/server` `renderToStaticMarkup`) `Receipt` memuat `Kasir: Rani`, `PB1 10% (termasuk)`, `Kembali Rp 24.000`; `BaristaTicket` tidak memuat `Rp`. → FAIL.
- [ ] **Step 2:** Implementasi → **Step 3:** PASS; Playwright `page.pdf({ width: '58mm' })` dari struk contoh, cek visual → **Step 4:** Commit `feat(pos): 58mm receipt and barista ticket`.

---

### Task 11: Kas masuk/keluar, riwayat, refund per item

**Files:**
- Create: `src/components/pos/app/CashMoveDialog.tsx`, `HistorySheet.tsx`, `RefundDialog.tsx`

**Interfaces:**
- Consumes: `addCashMove`, `refundOrder` (Task 5), `refundLineAmount` (Task 1), `printNode`/`Receipt` (Task 10).
- `CashMoveDialog`: pilih Kas Masuk / Kas Keluar, nominal (`NumPad`), keterangan wajib (contoh placeholder "Beli galon", "Tambahan modal dari Bu Risya").
- `HistorySheet`: order shift ini (terbaru di atas) dengan status Lunas/Open/Batal/Refund; aksi: cetak ulang struk, Refund (untuk Lunas).
- `RefundDialog`: per item stepper 0..sisa, total refund live via `refundLineAmount`, metode Tunai dari laci / Non-tunai, alasan wajib.

- [ ] **Step 1:** E2E: kas keluar Rp 20.000 "Beli galon"; refund 1 dari 2 Es Kopi Susu tunai; cek di DB lokal setelah sync: `CashMovement` paid_out & refund_out benar, order tetap `paid`; refund sisa → `refunded`. → FAIL.
- [ ] **Step 2:** Implementasi → **Step 3:** PASS → **Step 4:** Commit `feat(pos): cash in/out, history and per-item refunds`.

---

### Task 12: Uji offline end-to-end & rilis

**Files:** E2E di scratchpad (bukan repo); Modify: `README.md` (bagian POS offline & cara reset tablet), `docs/PLAN.md` (centang F2)

- [ ] **Step 1:** Skenario Playwright `context.setOffline(true)` di tengah shift: buat & bayar 3 order, kas keluar, refund → indikator "N belum tersinkron"; `setOffline(false)` → dalam 20 detik pending 0; DB lokal: tiap order tepat sekali, total sama dengan yang tampil di tablet; replica identik (`dbdiff.sh`).
- [ ] **Step 2:** Skenario pagi offline: sesi lewat 04:00 (cookie dihapus) + offline → PIN lokal membuka `/pos`, transaksi masuk outbox; online → status "Perlu PIN"; PIN → sync tuntas.
- [ ] **Step 3:** Regresi: `npx vitest run`, `npm run test:db`, `npx tsc --noEmit`, `next build`, E2E F1 (yang sudah diperbarui).
- [ ] **Step 4:** Migrasi produksi: replica dulu (`npm run db:migrate:replica`), lalu primary (`npx prisma migrate deploy`) memakai `.env.neon`.
- [ ] **Step 5:** Commit + push `main` (deploy otomatis); smoke test produksi tanpa membuat transaksi (PIN → kasir → layar Buka Kasir tampil; `/api/pos/sync` tanpa sesi → 401).
