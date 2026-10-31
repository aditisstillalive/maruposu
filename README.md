# maruposu

POS internal Maraca Books & Coffee: kasir di tablet + back-office. Rencana lengkap dan keputusan desain ada di [docs/PLAN.md](docs/PLAN.md).

Stack (sama dengan tokatalog): Next.js 15 App Router, React 18, Tailwind 4 + shadcn (`base-nova`), Prisma 5 + Postgres (Neon, primary + replica), Cloudflare R2, next-auth, Vercel.

## Dua database (pola tokatalog)
- **Primary** (`DATABASE_URL`): semua penulisan, admin, login, dan cek sesi perangkat.
- **Replica** (`DATABASE_URL_REPLICA`, opsional): ikut melayani bacaan POS yang boleh sedikit basi (daftar karyawan, nanti menu) lewat `readDb()` di `src/lib/db-router.ts`, bergantian dengan primary. DB yang kena kuota Neon atau tidak terjangkau dilewati.
- Setiap penulisan memanggil `queueSync()` (`src/lib/replica-sync.ts`) untuk menyalin perubahan ke replica setelah response terkirim. Kalau gagal, replica ditandai *dirty* dan berhenti melayani bacaan sampai full sync berhasil: cron harian `/api/cron/replica-sync` (butuh `CRON_SECRET`), tombol **Sinkronkan** di Admin → Pengaturan, atau catch-up otomatis saat halaman admin dibuka.
- Tabel baru yang perlu ikut tersinkron: tambahkan ke `TABLES` dan `SyncTask` di `replica-sync.ts`, lalu panggil `queueSync` setelah penulisannya.

## Alur
1. `/`: welcome + master PIN 6 digit. Perangkat terbuka sampai 04:00 WIB, atau sampai master PIN diganti.
2. `/pos`: aplikasi kasir. Pilih karyawan yang melayani (tercetak sebagai `Kasir: <nama>`), buka kasir dengan modal awal, lalu order, open bill, promo, bayar (tunai/EDC/QRIS), cetak struk & tiket barista 58 mm, kas masuk/keluar, riwayat, refund per item, dan **Tutup Kasir** (hitung buta per pecahan → selisih → catatan bila ada selisih → laporan 58 mm; bisa beberapa shift sehari).
4. `/admin`: back-office — mendarat di **Dashboard**, lalu **Laporan**, menu, varian & add-on, **Resep & HPP**, promo & kupon, **Kas Kasir** (riwayat shift & tutup dari admin), **Inventaris** (bahan, stok masuk, opname, waste, kartu stok), karyawan, pengaturan pajak). Super admin juga mengelola master PIN dan akun admin.

## Inventaris
- Semua perubahan stok lewat `postStock()` (`src/lib/pos/stock.ts`): satu `StockMovement` per bahan dengan saldo sesudahnya. Kuantitas bilangan bulat dalam satuan pakai (g/ml/pcs); harga rata-rata tertimbang disimpan `avg_cost_milli` (rupiah × 1000 per satuan).
- Stok terpotong saat bill **dibayar** (resep produk + resep pilihan); HPP baris tersimpan di `OrderItem.cogs`. Refund tidak mengembalikan stok; void open bill tidak memotong stok.
- Opname membaca stok sistem saat disimpan; waste bisa dari tablet (offline) atau admin.

## Laporan

- `/admin/dashboard`: pendapatan bersih, transaksi, rata-rata per transaksi, laba kotor, efektivitas promo (dibanding periode sebelumnya), grafik harian, metode bayar, produk terlaris, bahan menipis.
- `/admin/reports`: ringkasan & per hari, detail transaksi (filter status/metode/kasir), pembayaran, void & refund, produk/kategori (HPP & margin), promo, pajak, kasir, jam ramai (heatmap, bisa per produk). Tiap laporan punya **Unduh CSV** (`;`, UTF-8 BOM — langsung terbuka di Excel).
- Periode = hari bisnis (berakhir 04:00 WIB); refund dihitung di hari refund dibuat. Definisi angka: `docs/PLAN.md` → "Keputusan F5". Laporan dibaca dari replica.

## POS offline
- Semua aksi kasir ditulis dulu ke IndexedDB di tablet (`src/lib/pos/client/`) dan masuk **outbox**; `POST /api/pos/sync` menerapkannya sekali per id (kiriman ulang = `duplicate`), lalu tablet menarik `GET /api/pos/snapshot`.
- Hitungan uang (`src/lib/pos/pricing.ts`, `promo.ts`, `refund.ts`) dipakai bersama tablet dan server. Kalau promo berubah saat tablet offline, server menyimpan angka yang ditagih tablet dan menandai `Order.sync_note`.
- Service worker (`public/sw.js`) menyimpan halaman `/pos` dan aset build, jadi app tetap terbuka tanpa internet. Buka kunci tanpa internet memakai PIN terakhir yang dipakai online di tablet itu (berlaku sampai 04:00 WIB).
- Badge di bar atas: `Tersinkron`, `N belum tersinkron`, `Offline`, `Perlu PIN` (sesi server habis; masukkan PIN dan sync lanjut), `N ditolak server`.
- Reset tablet (mis. ganti perangkat): pastikan badge `Tersinkron`, lalu hapus data situs di browser. Transaksi yang belum tersinkron ikut terhapus.

## Kuota gratis (Vercel Hobby, Neon Free)

- **Deploy:** hanya `main` yang dideploy (`git.deploymentEnabled` di `vercel.json`); push branch lain tidak membuat deployment (batas Hobby 100/hari).
- **Polling tablet:** `/api/pos/snapshot?v=<versi>` menjawab `unchanged` **tanpa query DB** selama belum ada write (versi di `src/lib/data-cache.ts`, berganti di setiap `queueSync()` dan paling lambat tiap jam/ganti hari bisnis). Interval: 15 dtk saat kasir aktif, 60 dtk setelah 10 menit sepi, 5 menit saat layar tersembunyi (`src/lib/pos/client/poll.ts`). Compute Neon bisa suspend saat kafe sepi/tutup.
- **Cache tampilan admin:** dashboard, ringkasan laporan dan badge bahan menipis memakai `cachedRead()` (maks 5 menit, dibuang di setiap write lewat `queueSync()`), dibaca dari primary agar tidak menyimpan lag replica. **Jangan pernah meng-cache data yang menentukan transaksi** (harga, stok, PIN, sesi device, apa pun yang dibaca `apply`/`sync`).
- **Write baru** wajib memanggil `queueSync()` (atau `revalidateData()`), kalau tidak cache dan versi POS tidak berganti.
- **Mengukur query:** `env -u NODE_ENV PRISMA_LOG_QUERIES=1 npx next dev -p 3201` mencetak satu baris `prisma:query[primary|replica]` per query.

## Development lokal
```bash
npm ci --include=dev          # shell ini punya NODE_ENV=production
cp .env.example .env          # isi secret; DATABASE_URL dari langkah berikut
npm run db:local              # Postgres docker di :55433, mencetak DATABASE_URL
# replica lokal (opsional): docker exec maruposu-dev psql -U postgres -c 'CREATE DATABASE maruposu_replica'
npx prisma migrate dev
npm run db:seed -- --demo     # outlet, master PIN, super admin (+ data contoh)
npx next dev -p 3200          # jangan pakai $PORT (dipakai service lain)
npm test                      # unit
npm run test:db               # butuh `npm run db:local` (DB maruposu_test)
```

`npm run db:seed` aman dijalankan ulang: tidak pernah menimpa PIN atau admin yang sudah ada. `SEED_MASTER_PIN` menolak PIN yang mudah ditebak (mis. 123456).

## Production
- Migrasi tidak dijalankan saat build. Sebelum deploy perubahan schema: migrasi **replica dulu** (`npm run db:migrate:replica`), lalu primary (`npx prisma migrate deploy`).
- Setelah seed pertama: `npm run db:sync:replica` untuk menyalin semua data ke replica.
- Nilai di file env yang mengandung `&` (URL Neon) wajib diberi tanda kutip, kalau tidak `source` file itu akan memotong URL.
- Env yang wajib ada di Vercel: lihat `.env.example` (kecuali `SEED_*`).
