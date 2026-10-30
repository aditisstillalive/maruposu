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
2. `/staff`: pilih karyawan yang melayani (tercetak sebagai `Kasir: <nama>`).
3. `/pos`: layar kasir (F2).
4. `/admin`: back-office (menu, varian & add-on, karyawan, pengaturan pajak). Super admin juga mengelola master PIN dan akun admin.

## Development lokal
```bash
npm ci --include=dev          # shell ini punya NODE_ENV=production
cp .env.example .env          # isi secret; DATABASE_URL dari langkah berikut
npm run db:local              # Postgres docker di :55433, mencetak DATABASE_URL
# replica lokal (opsional): docker exec maruposu-dev psql -U postgres -c 'CREATE DATABASE maruposu_replica'
npx prisma migrate dev
npm run db:seed -- --demo     # outlet, master PIN, super admin (+ data contoh)
npx next dev -p 3200          # jangan pakai $PORT (dipakai service lain)
npm test
```

`npm run db:seed` aman dijalankan ulang: tidak pernah menimpa PIN atau admin yang sudah ada. `SEED_MASTER_PIN` menolak PIN yang mudah ditebak (mis. 123456).

## Production
- Migrasi tidak dijalankan saat build. Sebelum deploy perubahan schema: migrasi **replica dulu** (`npm run db:migrate:replica`), lalu primary (`npx prisma migrate deploy`).
- Setelah seed pertama: `npm run db:sync:replica` untuk menyalin semua data ke replica.
- Nilai di file env yang mengandung `&` (URL Neon) wajib diberi tanda kutip, kalau tidak `source` file itu akan memotong URL.
- Env yang wajib ada di Vercel: lihat `.env.example` (kecuali `SEED_*`).
