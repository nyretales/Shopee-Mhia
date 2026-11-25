# Catatan Belanja Shopee Mhia

Aplikasi statis (HTML + JavaScript). **Semua data disimpan di repositori GitHub ini**, tanpa Supabase atau database lain.

| Isi | Lokasi di repo |
|---|---|
| Semua catatan transaksi | `data/transactions.json` |
| Foto / screenshot transaksi | `assets/<nomor>.jpg` |

## Cara kerja

- **Pengunjung** hanya melihat data (tidak ada tombol admin sama sekali).
- **Masuk admin:** tap **3 kali berturut-turut** di pojok kanan atas halaman (area kosong di header), lalu isi password. Setelah masuk muncul tanda kecil "Admin" dan tombol **Catat Baru**, edit, dan hapus. Tap tanda "Admin" itu untuk keluar.
- **Upload gambar:** pilih screenshot pesanan Shopee atau bukti transfer. Teks dibaca otomatis di browser (OCR, [Tesseract.js](https://github.com/naptha/tesseract.js)), lalu kolom **nama produk**, **total**, dan **jenis transaksi** terisi sendiri. Periksa kembali sebelum menyimpan, karena OCR bisa salah baca. Kolom yang sudah Anda ketik tidak ditimpa.
  - Pesanan Shopee: nama produk dari baris pertama produk, total dari baris `Total N produk: Rp...`, jenis = Beli Barang. Nama toko masuk ke catatan.
  - Bukti transfer: nominal dari baris `Nominal`, jenis = Tambah Saldo. Pengirim dan Ref ID masuk ke catatan.
- **Penyimpanan:** setiap perubahan menjadi satu *commit* di repo GitHub (`data/transactions.json` dan `assets/<nomor>.jpg`).

## Pemasangan (sekali saja)

Unggah semua isi folder ini ke repo GitHub (mis. `Shopee-Mhia`), lalu pilih salah satu:

### A. Vercel (login pakai password)
1. Di Vercel: **Add New → Project** → impor repo. *Framework Preset* = **Other**, kosongkan Build Command dan Output Directory.
2. Buat token GitHub: <https://github.com/settings/personal-access-tokens/new> → *Only select repositories* (repo ini) → *Contents*: **Read and write**.
3. Di Vercel: **Settings → Environment Variables**, tambahkan lalu **Redeploy**:

   | Nama | Isi |
   |---|---|
   | `ADMIN_PASSWORD` | password admin pilihan Anda |
   | `GITHUB_TOKEN` | token dari langkah 2 |
   | `GITHUB_OWNER` | username GitHub pemilik repo |
   | `GITHUB_REPO` | nama repo |

4. Buka situs, tap 3x pojok kanan atas, isi `ADMIN_PASSWORD`.

### B. GitHub Pages (tanpa server)
1. **Settings → Pages →** *Deploy from a branch* → `main`, folder `/ (root)`. Repo harus public (paket gratis).
2. Buat token GitHub seperti langkah A2.
3. Buka situs, tap 3x pojok kanan atas, isi kolom password dengan **token** itu. Pemilik dan nama repo dikenali otomatis dari alamat `username.github.io/nama-repo`. Token diingat di browser perangkat itu.

Aplikasi memilih jalurnya sendiri: ia mencoba fungsi server (Vercel) lebih dulu, dan bila tidak ada, memakai isian sebagai token GitHub.

Jika sebelumnya Anda mencatat di browser lama (penyimpanan lokal), saat masuk admin muncul tombol **Pindahkan ke GitHub**.

## Catatan penting

- **Privasi:** siapa pun yang tahu alamat situs bisa membuka `data/transactions.json` dan foto (bukti transfer memuat nama dan nomor rekening). GitHub Pages gratis juga mengharuskan repo public.
- **Jeda tampil:** setelah admin menyimpan, Vercel/GitHub Pages butuh sekitar setengah sampai satu menit untuk memperbarui situs bagi pengunjung lain. Di perangkat admin perubahan langsung terlihat. Tombol muat ulang (ikon panah melingkar) ada di atas daftar. Transaksi dengan foto menghasilkan dua *commit*, jadi dua deploy.
- **Keamanan (prototipe):** pintu admin yang tersembunyi hanya menyembunyikan, bukan mengunci; kode bisa dilihat siapa pun. Di Vercel, password dicek di server dan token tidak sampai ke browser. Di GitHub Pages, token tersimpan di browser admin. Jangan menulis token di dalam file repo, karena GitHub akan mencabutnya otomatis. Untuk versi sungguhan, siapkan autentikasi yang layak.
- **Nomor transaksi** tetap dan menjadi nama foto (`assets/3.jpg` untuk transaksi No. 3). Foto lama bernama `<nomor>.jpg/.png/.webp` tetap dikenali.
- Pembacaan gambar butuh internet saat pertama kali (memuat pustaka OCR dan data bahasa, setelah itu di-cache browser).
- Membuka `index.html` langsung dari komputer (tanpa server web) hanya bisa untuk melihat, bukan untuk admin.

## Berkas

```
index.html              tampilan + logika aplikasi
api/github.js           fungsi server Vercel: cek password, teruskan ke GitHub
js/github-store.js      baca/tulis data & foto lewat fungsi server
js/receipt-parser.js    mengubah hasil OCR menjadi nama produk, total, jenis
data/transactions.json  data transaksi
assets/                 foto transaksi
```
