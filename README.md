# Catatan Belanja Shopee Mhia

Aplikasi statis (HTML + JavaScript). **Semua data disimpan di repositori GitHub ini**, tanpa Supabase atau database lain.

| Isi | Lokasi di repo |
|---|---|
| Semua catatan transaksi | `data/transactions.json` |
| Foto / screenshot transaksi | `assets/<nomor>.jpg` |

## Cara kerja

- **Pengunjung (Viewer)** hanya membaca `data/transactions.json` lewat GitHub Pages.
- **Admin** menambah/mengubah/menghapus catatan. Aplikasi menulis langsung ke repo (satu *commit* per perubahan) memakai token GitHub.
- **Upload gambar:** pilih screenshot pesanan Shopee atau bukti transfer. Teks dibaca otomatis di browser (OCR, [Tesseract.js](https://github.com/naptha/tesseract.js)), lalu kolom **nama produk**, **total**, dan **jenis transaksi** terisi sendiri. Selalu periksa kembali sebelum menyimpan, karena OCR bisa salah baca.
  - Pesanan Shopee: nama produk dari baris pertama produk, total dari baris `Total N produk: Rp...`, jenis = Beli Barang. Nama toko masuk ke catatan.
  - Bukti transfer: nominal dari baris `Nominal`, jenis = Tambah Saldo. Pengirim dan Ref ID masuk ke catatan.
  - Kolom yang sudah Anda ketik sendiri tidak akan ditimpa hasil OCR.

## Pemasangan (sekali saja)

1. Unggah semua isi folder ini ke repo GitHub (mis. `Shopee-Mhia`).
2. **Settings → Pages →** *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. Buat token: <https://github.com/settings/personal-access-tokens/new>
   - *Repository access*: **Only select repositories** → pilih repo ini saja
   - *Permissions → Repository permissions → Contents*: **Read and write**
4. Buka aplikasi → tombol **Viewer Mode** (kanan atas) → isi pemilik repo, nama repo, dan token → **Masuk sebagai Admin**. Token tersimpan hanya di browser perangkat itu; cukup sekali per perangkat.

Jika sebelumnya Anda mencatat di browser lama (penyimpanan lokal), saat masuk admin akan muncul tombol **Pindahkan ke GitHub** untuk memindahkan catatan itu.

## Catatan penting

- **Privasi:** GitHub Pages gratis mengharuskan repo *public*, jadi catatan dan foto (termasuk bukti transfer yang memuat nama dan nomor rekening) bisa dilihat siapa pun yang tahu alamatnya. Pertimbangkan menyamarkan data sensitif pada screenshot sebelum diunggah.
- **Jeda tampil:** setelah admin menyimpan, GitHub Pages butuh sekitar 1 menit untuk memperbarui halaman bagi pengunjung lain. Di perangkat admin perubahan langsung terlihat. Tombol muat ulang (ikon panah melingkar) ada di atas daftar.
- **Keamanan:** token jangan dibagikan atau ditulis di file repo. PIN lama (`allen`) dihapus karena PIN di kode publik tidak melindungi apa pun; yang menentukan siapa boleh mengubah data sekarang adalah token. Bila token bocor, cabut di pengaturan GitHub.
- **Nomor transaksi** tetap dan menjadi nama foto (`assets/3.jpg` untuk transaksi No. 3). Foto lama bernama `<nomor>.jpg/.png/.webp` tetap dikenali.
- Pembacaan gambar butuh internet saat pertama kali (memuat pustaka OCR dan data bahasa, setelah itu di-cache browser).
- Bila diakses lewat domain sendiri (bukan `*.github.io`), isi `DEFAULT_REPO` di bagian atas skrip `index.html` atau isi pemilik/nama repo di jendela admin.

## Berkas

```
index.html              tampilan + logika aplikasi
js/github-store.js      baca/tulis data & foto ke GitHub
js/receipt-parser.js    mengubah hasil OCR menjadi nama produk, total, jenis
data/transactions.json  data transaksi
assets/                 foto transaksi
```
