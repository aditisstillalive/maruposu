# maruposu — POS Maraca Books & Coffee

## Context
Maraca Books & Coffee (Bogor, cabang Jl. Jalak Harupat 9A — satu pemilik dengan Toko Iboek) butuh POS internal sendiri: kasir di tablet + back-office (menu, resep/BOM, inventaris, promo, pajak, laporan & BI). Infrastruktur, arsitektur, tech stack dan look & feel disalin dari `workspace/tokatalog` supaya satu ekosistem dan mudah dirawat. Repo: `github.com/aditisstillalive/maruposu` (kosong, sudah di-clone ke `workspace/maruposu`, branch `main`).

## Keputusan yang sudah dikonfirmasi
| Topik | Keputusan |
|---|---|
| Perangkat | Tablet landscape, touch-first |
| Masuk POS | Welcome page "Maraca Books & Coffee" → master PIN 6 digit (bcrypt di DB, hanya super admin `aditisstillalive@gmail.com` yang bisa ganti) → pilih kartu karyawan (tanpa PIN staf) → POS. Struk: `Kasir: <nama>` |
| Sesi PIN | Berlaku sampai akhir hari bisnis (04:00 WIB) + tombol Kunci; ganti PIN → semua perangkat terkunci |
| Cabang | Satu cabang dulu; skema punya `outlet_id` supaya nanti bisa multi-outlet |
| Pembayaran | Satu metode per bill: Tunai (hitung kembalian), EDC, QRIS — konfirmasi manual + no. referensi opsional |
| Open bill | Bayar di awal atau akhir; bill bisa dibuka kasir A dan ditutup kasir B |
| Laci/shift | Satu laci bersama per shift; tiap transaksi mencatat kasir. Tutup kasir **diblokir** selama ada open bill |
| Void/refund | Kasir boleh langsung, alasan wajib, tercatat di audit log + laporan void/refund |
| Pajak | Bisa diatur admin (nama PB1/PPN, %, termasuk/belum). Default **PB1 10% sudah termasuk harga** |
| Stok | Dipotong otomatis dari resep saat terjual; boleh minus + peringatan stok menipis |
| Resep | Resep dasar per produk + bahan per opsi varian/add-on |
| Admin | Role `super_admin` + `admin` (seperti tokatalog) |
| Cetak | Struk 58/80mm & tiket barista via print dialog browser |
| Brand | Look & feel tokatalog, aksen diganti warna logo Maraca (**butuh file logo dari user**) |
| Cloud | Project baru: Neon (primary + replica) + Vercel + bucket R2 khusus maruposu |
| Offline | **Wajib bisa offline** untuk POS kasir; back-office online-only |
| Tahapan | Rilis bertahap F1–F5, tiap fase bisa dipakai & dites |

## Arsitektur (salin dari tokatalog)
- Next.js 15.5 App Router, React 18, TypeScript, Tailwind 4, shadcn `base-nova` (Base UI), lucide, Raleway, zod + react-hook-form, recharts, date-fns, vitest.
- Prisma 5 + Neon Postgres — **primary + replica, logika sama dengan tokatalog** (`db-router.readDb` untuk bacaan POS yang boleh basi, `replica-sync.queueSync` setelah setiap penulisan, cron harian + tombol Sinkronkan). *Diubah 2026-10-30 atas permintaan user; rencana awal primary saja.*
- Cloudflare R2 presigned upload untuk foto produk & karyawan.
- next-auth credentials + bcrypt untuk admin; rate limit; security headers/CSP; Vercel hosting (+ cron bila perlu).
- Uang disimpan integer IDR; semua laporan WIB.

File tokatalog yang disalin/diadaptasi (path relatif `workspace/tokatalog`):
- Config: `package.json` (deps), `next.config.ts` (security headers/CSP, R2 remotePatterns), `components.json`, `postcss.config.mjs`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `vercel.json` (cron replica-sync + ignoreCommand).
- Desain: `src/app/globals.css` (token; ganti `--brand*` ke warna Maraca), `src/app/layout.tsx` (Raleway), `src/components/ui/*` (alert, badge, button, card, checkbox, dialog, dropdown-menu, input, label, radio-group, select, separator, switch, table, tabs, textarea, toast).
- Lib: `src/lib/prisma.ts` (tanpa replica), `auth.ts`, `admin-auth.ts` (`requireAdmin`, `requireSuperAdmin`, `assertAdmin`, `requireAdminApi`), `middleware.ts`, `rate-limit.ts` (`rateLimit`, `clientIp`), `r2.ts`, `upload-client.ts`, `image-url.ts`, `safe-redirect.ts`, `utils.ts`, `datetime-local.ts`, helper WIB dari `reports.ts` (`todayWIB`, `wibRange`, `addDays`, `isValidDate`).
- Admin shell: `src/components/admin/AdminSidebar.tsx`, `src/app/admin/layout.tsx`, `src/app/auth/signin/page.tsx`, `src/app/api/upload/r2/route.ts`, pola `admin/users` (kelola admin oleh super admin).
- Testing lokal: pola `scripts/security/run-local.sh` (Postgres docker throwaway, port sendiri — jangan pakai `$PORT`).

## Tambahan baru
1. **Device session**: setelah master PIN benar → cookie httpOnly bertanda tangan HMAC berisi `device_id`, `pin_version`, `exp=04:00 WIB`. Rate limit + lockout setelah 5x salah.
2. **Offline-first POS**: PWA (manifest + service worker cache app shell `/pos` & `/_next/static`), IndexedDB (Dexie) untuk snapshot menu/karyawan/promo/setting, shift aktif, order, dan **outbox**. Unlock offline memakai verifier PBKDF2 lokal dari login online terakhir.
3. **Sync engine**: setiap aksi POS = mutation ber-UUID (open shift, upsert order, pay, void/refund, kas masuk/keluar, close shift) → `POST /api/pos/sync` idempotent (tabel `PosMutation` unik per id), diproses berurutan; server menghitung ulang total & memotong stok saat order paid; selisih/kuota promo terlampaui ditandai, tidak ditolak. Pull berkala `GET /api/pos/snapshot` untuk menu & open bill dari perangkat lain. Nomor order: `<kode perangkat>-<YYMMDD>-<seq>`.
4. **Audit log** untuk void/refund, kas masuk/keluar, ganti PIN, ubah harga/pajak/promo.
5. Indikator status di bar atas POS: kasir aktif, shift, online/offline, jumlah mutation belum tersinkron.

## Model data (Prisma, ringkas)
`Outlet`, `Setting` (singleton per outlet: nama kafe, `master_pin_hash`, `pin_version`, pajak nama/rate_bp/inclusive, footer struk), `AdminUser`, `Employee` (nama, foto, aktif, urutan), `Category`, `Product` (harga, foto, deskripsi, aktif, habis), `OptionGroup` (variant|addon, required, min/max) + `Option` (price_delta) + `ProductOptionGroup`, `Ingredient` (satuan, stok decimal, ambang menipis), `RecipeLine` (product_id **atau** option_id, ingredient, qty), `StockMovement` (sale|opname|waste|purchase|adjust, ref), `StockOpname` + lines, `Waste`, `Promo` (percent|amount, scope bill/product/category, min belanja, periode, kode kupon opsional, kuota), `Shift` (modal awal, expected, counted, variance, open/close by employee), `CashMovement` (paid_in|paid_out, nominal, keterangan, employee), `Order` (client uuid, nomor, shift, status open|paid|void|refunded, nama/meja, dine-in/takeaway, created_by/paid_by employee, subtotal, diskon, pajak, total, promo, metode, uang diterima, kembalian, ref, alasan void) + `OrderItem` + `OrderItemOption` (snapshot nama/harga), `PosMutation`, `AuditLog`.

Rumus: kas teoritis = modal awal + Σ(tunai diterima − kembalian) + kas masuk − kas keluar; selisih = hitung fisik − teoritis. Pajak inclusive = total × rate / (100 + rate).

## Fase
**F1 — Fondasi** ✅
- Scaffold proyek dengan config/desain/lib di atas; token brand Maraca; README & `.env.example`.
- Prisma schema + migrasi awal: Outlet, Setting, AdminUser, Employee, Category, Product, OptionGroup/Option, AuditLog.
- Seed super admin `aditisstillalive@gmail.com` (password via env saat seed) + master PIN awal.
- Halaman: `/` welcome + PIN pad 6 digit; `/staff` grid kartu karyawan; `/pos` placeholder dengan bar kasir; `/admin` (sidebar ala tokatalog): Menu (kategori, produk, varian/add-on, foto R2), Karyawan, Pengaturan (pajak, struk), Keamanan → Ganti Master PIN (super admin), Users (super admin).
- Deploy ke project Vercel baru.

**F2 — Kasir + offline** ✅ (2026-10-30, `docs/superpowers/plans/2026-10-30-f2-kasir-offline.md`): PWA + Dexie + sync engine; Buka Kasir (modal awal); layar POS 3 kolom (rail kategori | grid tile produk | panel bill), popup varian/add-on/catatan, open bill (tab daftar), promo/kupon (CRUD admin + apply), pembayaran tunai (tombol Uang Pas/50rb/100rb) / EDC / QRIS, struk & tiket barista print, Kas Masuk/Keluar, void/refund dengan alasan.

**F3 — Tutup kasir** ✅ (2026-10-30, `docs/superpowers/plans/2026-10-30-f3-tutup-kasir.md`): cek open bill → blind count (angka teoritis disembunyikan) → selisih → laporan penutupan cetak/tampil; admin: Laporan Kas Kasir & arsip Tutup Kasir.

**F4 — Inventaris** : bahan baku & satuan, resep per produk/opsi, potong stok otomatis di sync, stok real-time + menipis, stok opname, waste (rusak/kadaluarsa/salah buat/tumpah).

**F5 — Laporan & BI** : dashboard (pendapatan, transaksi, efektivitas promo); detail transaksi; penjualan periode (harian/bulanan/custom); jenis pembayaran; void & refund; ranking produk & kategori; promo & kupon; pajak; per kasir; peak hours & jam/hari puncak per produk (heatmap); export CSV & print.

Tiap fase: rencana implementasi sendiri → implement (TDD) → review → deploy.

## Prasyarat dari user sebelum F1 dieksekusi
- `DATABASE_URL` Neon project baru, kredensial R2 bucket baru (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`), project Vercel baru (scope `kotaksabun`).
- File logo Maraca (untuk warna aksen & ikon).
- Daftar karyawan awal (opsional, bisa diinput di admin).

## Verifikasi
- `npm test` (vitest): hash/verify master PIN & device token (expiry 04:00 WIB, pin_version), kalkulasi pajak inclusive/exclusive, promo, kas teoritis & selisih, idempotensi sync.
- Lokal: Postgres docker throwaway (pola `run-local.sh`), port sendiri; shell punya `NODE_ENV=production` → `npm ci --include=dev`.
- E2E Playwright: PIN salah/benar → pilih karyawan → POS; admin login → ganti master PIN → perangkat lama terkunci; (F2+) transaksi saat `context.setOffline(true)` lalu online → data tersinkron sekali (tidak dobel).
- `npx tsc --noEmit` + `next build` sebelum deploy; cek preview/prod di Vercel.

## Keputusan F2 (2026-10-30)
| Topik | Keputusan |
|---|---|
| Perangkat | 1 tablet kasir. Open bill tetap di server (bisa dilihat admin), tapi tidak ada skenario dua tablet offline bersamaan |
| Struk | Thermal **58 mm**, via print dialog browser; tiket barista terpisah (tanpa harga) |
| Info order | Dine-in/Takeaway, nama customer, nomor meja, catatan per item |
| Promo | Satu promo per bill. Jenis: % atau nominal; cakupan bill / produk / kategori; batas maks. diskon; min. belanja; periode tanggal, hari & jam (happy hour); kode kupon + kuota. Tidak ada diskon manual kasir |
| Bayar di awal | Bill yang sudah dibayar tidak bisa ditambah item; tambahan = bill baru |
| Void | Untuk open bill (belum dibayar), alasan wajib, kasir langsung |
| Refund | Untuk bill lunas, **bisa per item**, alasan wajib; metode refund dipilih kasir: **tunai dari laci** (mengurangi saldo kas) atau **non-tunai** (EDC/QRIS, diproses di mesin/bank) |
| Offline | Tablet yang sudah dibuka tetap jalan saat internet putus; buka kunci pagi hari tanpa internet memakai verifier PIN lokal dari login online terakhir; semua transaksi masuk outbox dan disinkronkan idempotent |

## Keputusan F3 (2026-10-30)
| Topik | Keputusan |
|---|---|
| Shift | Bisa beberapa shift per hari: tutup kasir → shift berikutnya buka kasir lagi dengan modal baru |
| Blind count | Input **per pecahan** (100rb, 50rb, 20rb, 10rb, 5rb, 2rb, 1rb) + total koin; total dihitung otomatis; saldo seharusnya tidak pernah tampil sebelum hitungan dikunci |
| Hitungan | **Sekali final**: setelah "Selesai hitung" angka terkunci (juga bila app ditutup/dibuka lagi) |
| Selisih | Setelah dikunci kasir hanya melihat **selisih** (Pas / Lebih / Kurang); **catatan wajib** bila selisih ≠ 0 |
| Saldo seharusnya | Modal awal + penjualan tunai + kas masuk − kas keluar − refund tunai (dihitung server; tablet menghitung yang sama untuk ditampilkan) |
| Open bill | Tutup kasir diblokir selama ada open bill di shift itu |
| Laporan | Dicetak 58 mm di tablet + arsip di admin (Kas Kasir: riwayat shift, modal, kas masuk/keluar, selisih). **WhatsApp ditunda** |
| Tutup dari admin | Boleh, dengan hitungan per pecahan + alasan wajib; open bill yang tersisa otomatis dibatalkan dengan alasan itu; tercatat di audit log |
| Offline | Tutup kasir bisa offline (masuk outbox seperti transaksi lain) |

## Keputusan F4 (2026-10-30)
| Topik | Keputusan |
|---|---|
| Satuan | Tiap bahan punya **satuan pakai** (g / ml / pcs, bilangan bulat) dan opsional **satuan beli** + isi (mis. karton = 12.000 ml) untuk input stok masuk & opname |
| Stok masuk | Menu **Stok Masuk** di admin: bahan, jumlah (satuan beli/pakai), total harga, pemasok & catatan opsional → stok bertambah |
| HPP | Harga beli **rata-rata tertimbang** per satuan pakai; HPP tiap menu = Σ resep × harga rata-rata; HPP per item tersimpan saat terjual (untuk laba kotor di F5) |
| Resep | Resep dasar per produk + bahan per **pilihan** varian/add-on (berlaku di semua produk yang memakai pilihan itu). Id pilihan dipertahankan saat grup diedit |
| Potong stok | Saat bill **dibayar** (diterapkan server dari sync); stok boleh minus (keputusan awal) |
| Void / refund | Void open bill tidak memotong stok (belum dibayar). Refund **tidak** mengembalikan stok; yang dibuang dicatat sebagai waste |
| Opname | Di admin, **sebagian atau semua bahan**: isi stok fisik → tampil selisih vs sistem → simpan sebagai penyesuaian (siapa & kapan) |
| Waste | Dicatat dari **tablet (juga offline) dan admin**: per bahan, atau per produk (bahan resepnya ikut terpotong); alasan rusak / kadaluarsa / salah buat / tumpah / lainnya |
| Stok menipis | Batas minimum per bahan; tampil di **admin** (badge + daftar) dan **tablet** (info "N bahan menipis" di bar atas). Produk tidak otomatis "Habis" |
| Riwayat | Kartu stok per bahan: setiap pergerakan (terjual, masuk, opname, waste) dengan saldo |
