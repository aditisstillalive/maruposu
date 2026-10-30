# F4 — Inventaris: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bahan baku dengan stok real-time dan harga rata-rata, resep per produk dan per pilihan varian/add-on yang otomatis memotong stok saat bill dibayar, stok masuk, stok opname, waste (tablet & admin), HPP per menu, peringatan stok menipis, dan kartu stok.

**Architecture:** Semua perubahan stok lewat satu fungsi server `postStock(tx, movements)` yang menulis `StockMovement`, memperbarui `Ingredient.stock` dan (untuk stok masuk) `avg_cost` rata-rata tertimbang. Konsumsi resep dihitung oleh fungsi murni `consumption()` di `src/lib/pos/inventory.ts`, dipakai saat `order.pay` (sync F2) dan waste produk. Waste dari tablet adalah mutation baru `waste.record` lewat outbox. Admin memakai route admin biasa.

**Tech Stack:** sama dengan F2/F3.

**Spec:** `docs/PLAN.md` — "Fase F4" + "Keputusan F4"; requirement manager bagian A (master produk & resep, modifier dengan bahan) dan B (bahan baku, stok & opname, waste).

## Global Constraints

- Kuantitas bahan **bilangan bulat dalam satuan pakai** (`g`, `ml`, `pcs`). Satuan beli opsional: `purchase_unit` (teks, mis. "karton") + `purchase_size` (Int, isi dalam satuan pakai).
- Harga rata-rata disimpan `avg_cost_milli` (Int, rupiah × 1000 per satuan pakai) — tanpa float di DB. Nilai = `round(qty × avg_cost_milli / 1000)`.
- Rata-rata tertimbang: `new_avg = round((max(stock,0) × avg + qty_in × unit_cost_in) / (max(stock,0) + qty_in))`; stok negatif tidak ikut menimbang.
- Stok boleh minus. Refund tidak mengembalikan stok. Void open bill tidak memotong stok.
- Semua tabel baru ikut replica sync (pola F2), urutan induk → anak.

## Review Focus

1. **Grup varian diedit setelah resep pilihan dibuat**: resep pada pilihan yang tetap ada tidak boleh hilang; pilihan yang dihapus ikut menghapus resepnya. → test Task 2.
2. **`order.pay` dikirim ulang (duplicate)**: stok tidak terpotong dua kali. → test Task 3.
3. **Stok masuk ketika stok sedang minus**: harga rata-rata = harga stok masuk (stok minus tidak menimbang), stok jadi `minus + masuk`. → test Task 1.
4. **Opname bersamaan dengan penjualan yang tersinkron**: selisih opname dihitung dari stok sistem saat disimpan (server), bukan angka yang tampil di layar. → test Task 3/6.
5. **Produk tanpa resep dijual**: bill tetap lunas, HPP item 0, tidak ada pergerakan stok. → test Task 3.

---

### Task 1: Matematika inventaris (modul murni)

**Files:** Create `src/lib/pos/inventory.ts`, test `src/lib/pos/inventory.test.ts`

**Interfaces (Produces):**
- `type Recipe = { product: Record<string, { ingredient_id: string; qty: number }[]>; option: Record<string, { ingredient_id: string; qty: number }[]> }`
- `consumption(lines: { product_id: string; options: { option_id: string }[]; qty: number }[], recipe: Recipe): Map<string, number>` (ingredient_id → qty, dijumlah)
- `weightedAverage(stock: number, avgMilli: number, qtyIn: number, totalCost: number): number` (milli-rupiah per satuan)
- `costOf(qtyByIngredient: Map<string, number>, avgMilli: Record<string, number>): number` (rupiah, `round`)
- `toBaseQty(amount: number, unit: 'base' | 'purchase', purchaseSize: number | null): number` (bulat; satuan beli × isi)
- `isLow(stock: number, min: number | null): boolean`

- [ ] **Step 1: Failing tests**: konsumsi Es Kopi Susu ×2 (resep produk kopi 18 g, susu 150 ml; pilihan Ice: es 150 g; Extra shot: kopi 9 g) → kopi 54, susu 300, es 300; `weightedAverage(100, 20_000, 100, 3_000)` → `25000`; **stok minus**: `weightedAverage(-50, 20_000, 100, 3_000)` → `30000` (Review Focus 3); `costOf` 54 g × 250 000 milli → 13 500; `toBaseQty(2, 'purchase', 12000)` → 24000; `isLow(5, 10)` true, `isLow(5, null)` false.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS + tsc → **Step 5:** Commit `feat(inventory): consumption and weighted-average math`.

---

### Task 2: Schema inventaris + id pilihan stabil

**Files:** Modify `prisma/schema.prisma`, `src/lib/replica-sync.ts` (+ test), `src/app/api/admin/option-groups/[id]/route.ts`, `src/lib/schemas.ts` (`optionSchema` boleh membawa `id`), `src/app/admin/options/option-group-manager.tsx` (mengirim `id` pilihan yang sudah ada); migration `inventory`

**Interfaces (Produces):**
- `Ingredient` { id cuid, outlet_id, name, unit "g"|"ml"|"pcs", purchase_unit String?, purchase_size Int?, stock Int @default(0), avg_cost_milli Int @default(0), min_stock Int?, is_active, timestamps; @@unique([outlet_id, name]) }
- `RecipeLine` { id cuid, ingredient_id, product_id String?, option_id String?, qty Int; relasi cascade ke Ingredient/Product/Option; @@unique([product_id, option_id, ingredient_id]) }
- `StockMovement` { id cuid, outlet_id, ingredient_id, kind "sale"|"purchase"|"opname"|"waste", qty Int (bertanda), unit_cost_milli Int, balance Int (stok sesudah), ref_type String, ref_id String, note String?, actor String, created_at } (index ingredient_id+created_at)
- `Purchase` { id cuid, outlet_id, supplier String?, note String?, total Int, created_by, created_at } + `PurchaseItem` { id cuid, purchase_id, ingredient_id, qty Int, total_cost Int }
- `StockOpname` { id cuid, outlet_id, note String?, created_by, created_at } + `StockOpnameLine` { id cuid, opname_id, ingredient_id, system_qty Int, counted_qty Int, diff Int }
- `Waste` { id (uuid dari tablet atau cuid admin), outlet_id, source "tablet"|"admin", reason "rusak"|"kadaluarsa"|"salah_buat"|"tumpah"|"lainnya", note String?, actor, cost Int, created_at } + `WasteLine` { id cuid, waste_id, ingredient_id String?, product_id String?, name String, qty Int }
- `OrderItem.cogs Int @default(0)` (HPP baris saat terjual)
- Replica: tabel baru di `SYNCED_TABLES` (ingredient setelah outlet; recipeLine setelah product & option; stockMovement, purchase(+item), stockOpname(+line), waste(+line) setelah ingredient); `SyncTask` `{ ingredients: string[] }`, `{ recipe: string }` (product id atau `option:<id>`), `{ stockDocs: { purchase?; opname?; waste? } }` — mirror dokumen + movement-nya + ingredient yang tersentuh.
- **Option id stabil** (Review Focus 1): PATCH grup meng-upsert pilihan berdasar `id` (pilihan baru tanpa `id` dibuat; yang tidak dikirim dihapus beserta resepnya).

- [ ] **Step 1: Failing tests**: `SYNCED_TABLES` memuat tabel baru dengan urutan induk-anak; DB test `editing a group keeps existing option ids and their recipes` (buat grup 2 pilihan + RecipeLine pada pilihan 1 → PATCH dengan pilihan 1 diganti nama + pilihan 3 baru, pilihan 2 hilang → id pilihan 1 sama, resepnya ada, pilihan 2 & resepnya terhapus).
- [ ] **Step 2:** FAIL → **Step 3:** schema + migrasi (lokal primary & replica) + replica tasks + upsert pilihan → **Step 4:** PASS, `db:sync:replica` lokal OK → **Step 5:** Commit `feat(db): inventory tables; stable option ids`.

---

### Task 3: Server — `postStock`, potong stok saat bayar, waste dari tablet

**Files:** Create `src/lib/pos/stock.ts`, test `src/lib/pos/stock.db.test.ts`; Modify `src/lib/pos/apply.ts`, `src/lib/pos/mutations.ts`, `src/lib/pos/snapshot.ts`, `src/lib/pos/types.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces `postStock(tx, input: { outletId: string; actor: string; refType: string; refId: string; note?: string | null; lines: { ingredient_id: string; qty: number; kind: 'sale' | 'purchase' | 'opname' | 'waste'; total_cost?: number }[] }): Promise<{ cost: number; ingredientIds: string[] }>` — mengunci baris Ingredient (`FOR UPDATE`), menulis movement dengan `balance`, memperbarui stok; `purchase` memperbarui `avg_cost_milli` (rata-rata tertimbang), jenis lain memakai avg saat itu sebagai `unit_cost_milli`; `cost` = Σ nilai keluar (untuk sale/waste).
- Produces `loadRecipe(tx, outletId): Promise<Recipe>`.
- `order.pay` (di `apply.ts`): setelah status `paid`, hitung konsumsi per item, `postStock` kind `sale` (refType `order`), simpan `OrderItem.cogs` per item; queue `{ ingredients }`.
- Mutation baru `waste.record` { waste_id, reason, note|null, employee_id, lines: { ingredient_id?: string; product_id?: string; option_ids?: string[]; qty }[] } → `Waste` + `WasteLine` (nama tersalin) + `postStock` kind `waste` (produk diuraikan lewat resep).
- Snapshot tambah `ingredients: { id; name; unit }[]` (aktif) dan `low_stock: { count: number; names: string[] }`.

- [ ] **Step 1: Failing DB tests**:
  - `paying a bill deducts its recipe and stores the line cost` (stok & avg disiapkan → bayar Es Kopi Susu ×2 Ice + Extra shot → stok berkurang sesuai Task 1, movement `sale` per bahan dengan `balance`, `OrderItem.cogs` = nilai bahan).
  - `a resent pay doesn't deduct twice` (Review Focus 2).
  - `a product without a recipe sells with zero cost` (Review Focus 5).
  - `stock may go negative`.
  - `waste of a product deducts its recipe; waste of an ingredient deducts it` (+ `Waste.cost`); waste produk tanpa resep diterima, `cost 0`, tanpa movement (tablet offline tidak boleh kehilangan catatan).
  - `purchase updates the weighted average` (lewat `postStock` langsung).
  - snapshot memuat `ingredients` aktif dan `low_stock`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm run test:db` + `npm test` + tsc PASS → **Step 5:** Commit `feat(inventory): deduct stock on payment; waste from the tablet`.

---

### Task 4: Admin — Bahan Baku & Stok Masuk

**Files:** Create `src/app/admin/inventory/page.tsx`, `ingredient-manager.tsx`, `src/app/admin/inventory/purchases/page.tsx`, `purchase-form.tsx`, `src/app/api/admin/ingredients/route.ts`, `[id]/route.ts`, `src/app/api/admin/purchases/route.ts`; Modify `src/lib/schemas.ts` (`ingredientSchema`, `purchaseSchema`), `AdminSidebar.tsx` (item "Inventaris" ikon `Warehouse` setelah "Kas Kasir", badge jumlah bahan menipis)

**Interfaces:**
- `ingredientSchema` { name, unit enum, purchase_unit?, purchase_size? (Int ≥ 1, wajib bila purchase_unit diisi), min_stock? (Int ≥ 0), is_active }. Satuan pakai tidak bisa diubah bila sudah ada pergerakan (409).
- `purchaseSchema` { supplier?, note?, lines: [{ ingredient_id, amount (> 0), unit: 'base'|'purchase', total_cost (Int ≥ 0) }] (≥ 1) } → `Purchase` + items + `postStock` kind `purchase`.
- Halaman Inventaris: tabel bahan (nama, stok "1.250 ml (1 karton + 250 ml)", min, harga rata-rata per satuan beli/pakai, nilai stok, badge "Menipis"/"Minus"), total nilai persediaan, tombol tambah/ubah bahan, tautan "Stok Masuk", "Opname", "Waste", dan per bahan "Kartu stok".
- Stok Masuk: form multi-baris (pilih bahan, jumlah + pilih satuan, total harga, harga/satuan otomatis), pemasok, catatan; riwayat stok masuk.

- [ ] **Step 1:** Failing unit tests schema (`purchase_size` wajib dengan `purchase_unit`; `total_cost` bulat ≥ 0; baris minimal satu). Failing E2E `f4.cjs` bagian admin: tambah bahan "Susu UHT" ml, beli per karton 12 000 ml, min 2 000 → stok masuk 2 karton Rp 360.000 → stok 24 000 ml, harga rata-rata Rp 15/ml; stok masuk lagi 1 karton Rp 216.000 → avg Rp 16/ml.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** Commit `feat(admin): ingredients and stock in`.

---

### Task 5: Admin — Resep & HPP

**Files:** Create `src/app/admin/recipes/page.tsx`, `recipe-editor.tsx`, `src/app/api/admin/recipes/route.ts` (PUT); Modify `AdminSidebar.tsx` (item "Resep & HPP" ikon `ChefHat` setelah "Varian & Add-on"), `src/lib/schemas.ts` (`recipeSchema`)

**Interfaces:**
- `recipeSchema` { target: { product_id } | { option_id }, lines: [{ ingredient_id, qty (Int ≥ 1) }] } → mengganti seluruh resep target; audit `recipe.update`; queue `{ recipe }`.
- Halaman: daftar produk per kategori dengan harga jual, HPP dasar (resep produk), margin %; klik → editor baris bahan (pilih bahan, qty dalam satuan pakai, biaya baris live). Bagian kedua: pilihan varian/add-on per grup dengan resep & biaya tambahan. HPP contoh "Es Kopi Susu (Ice, Normal) ≈ Rp X".

- [ ] **Step 1:** Failing unit test `recipeSchema` (qty ≥ 1, satu target). Failing E2E: resep Es Kopi Susu (Kopi 18 g + Susu 150 ml), pilihan Ice (Es batu 150 g) → HPP tampil sesuai harga rata-rata; bayar Es Kopi Susu Ice di tablet → stok Susu turun 150 ml, kartu stok menunjukkan baris "Terjual".
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** Commit `feat(admin): recipes and cost of goods`.

---

### Task 6: Admin — Stok Opname, Waste, Kartu Stok

**Files:** Create `src/app/admin/inventory/opname/page.tsx`, `opname-form.tsx`, `src/app/admin/inventory/waste/page.tsx`, `waste-form.tsx`, `src/app/admin/inventory/[id]/page.tsx` (kartu stok), `src/app/api/admin/opname/route.ts`, `src/app/api/admin/waste/route.ts`; Modify `src/lib/schemas.ts` (`opnameSchema`, `adminWasteSchema`)

**Interfaces:**
- `opnameSchema` { note?, lines: [{ ingredient_id, counted (Int ≥ 0, satuan pakai) }] (≥ 1) }. Server membaca stok saat simpan (di dalam transaksi, setelah lock) → `system_qty`, `diff`, `postStock` kind `opname` untuk baris ber-selisih (Review Focus 4).
- `adminWasteSchema` = bentuk `waste.record` tanpa id/employee → actor = email admin, source `admin`.
- Opname: tabel semua bahan aktif (stok sistem tampil, input hitung fisik dalam satuan beli atau pakai), hanya baris yang diisi yang disimpan, selisih live, ringkasan "N bahan, nilai selisih Rp X"; riwayat opname.
- Waste: form (bahan atau produk, qty, alasan, catatan) + riwayat waste (sumber tablet/admin, nilai).
- Kartu stok: per bahan, pergerakan terbaru di atas (tanggal, jenis: Terjual/Masuk/Opname/Waste, qty bertanda, saldo, referensi), filter 30 hari.

- [ ] **Step 1:** Failing unit tests schema; failing DB test `opname uses the stock at save time` (stok 1 000 → simpan opname counted 900 setelah penjualan memotong 100 → diff 0, tidak ada movement). Failing E2E: opname Susu dengan hitungan fisik 1 000 ml di bawah stok sistem → selisih −1 000 ml, kartu stok baris "Opname"; waste admin bahan Susu 200 ml alasan tumpah → stok turun, nilai waste = 200 × harga rata-rata; waste produk tanpa resep diterima dengan nilai Rp 0.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** Commit `feat(admin): stock opname, waste and stock card`.

---

### Task 7: Tablet — waste & stok menipis

**Files:** Create `src/components/pos/app/WasteDialog.tsx`; Modify `src/lib/pos/client/actions.ts` (`recordWaste`), `PosApp.tsx` (tombol "Waste" di bar atas, badge "N bahan menipis"), test `src/lib/pos/client/waste.test.ts`

**Interfaces:**
- `recordWaste(lines, reason, note, employeeId): Promise<void>` — enqueue `waste.record` (tidak ada dokumen lokal selain daftar waste shift ini di kv untuk ditampilkan).
- `WasteDialog`: tab Produk (pilih produk dari menu; varian default) / Bahan (dari `snapshot.ingredients`); qty; alasan (tombol); catatan; simpan.
- Badge bar atas: `snapshot.low_stock.count > 0` → "N bahan menipis" (title berisi nama-nama).

- [ ] **Step 1:** Failing unit test `recordWaste queues waste.record with the lines`. Failing E2E: tablet catat waste "Es Kopi Susu ×1 tumpah" saat offline → online → server `Waste` source tablet + stok turun sesuai resep; badge menipis muncul setelah stok Susu < min.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** Commit `feat(pos): waste and low-stock badge on the tablet`.

---

### Task 8: Regresi & rilis

- [ ] **Step 1:** `npm test`, `npm run test:db`, tsc, build; E2E f1, f2, f2-offline, sw-deploy, f3, f3-offline, f4; replica identik.
- [ ] **Step 2:** README (inventaris), `docs/PLAN.md` centang F4.
- [ ] **Step 3:** Review akhir branch; push + PR. Migrasi produksi & merge menunggu persetujuan.
