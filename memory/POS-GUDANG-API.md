# Spesifikasi integrasi MASIVI POS — Gudang PDA

Versi kontrak: 29 September 2026. Untuk pengembang aplikasi Gudang/Emergent.

Dokumen ini berasal dari implementasi POS lokal, bukan rancangan API baru. Tidak memerlukan backend MongoDB/Render kedua. Tidak ada password, token aktif, atau kredensial database dalam paket ini. Seluruh ID/barcode/contoh akun adalah fiktif; ganti dari hasil API, bukan menyalin ke produksi.

## 1. Berkas dan sumber kebenaran

- `POS-GUDANG-API.openapi.json`: OpenAPI 3.1, 23 path/28 operasi yang relevan untuk Gudang. Request body dan query diambil dari `server.app.openapi()`. Header cabang, keterangan peran, contoh, dan ringkasan respons ditambahkan dari pembacaan implementasi.
- `POS-GUDANG-API-examples.json`: contoh JSON permintaan dan respons.
- `POS-GUDANG-API.md`: aturan alur, stok, retry, dan batas integrasi yang tidak cukup dijelaskan oleh schema.

Endpoint backend kebanyakan belum memiliki `response_model` formal. Schema respons dalam paket merupakan ringkasan manual, bukan validasi runtime server; properti tambahan diperbolehkan. Respons contoh dapat berupa subset. Jangan membuang field yang belum dikenal atau menganggap field historis selalu ada.

Sumber implementasi: `backend/server.py`, `backend/warehouse.py`, `backend/branch_transfers.py`, `backend/pda_scan_notes.py`. Prefix yang direkomendasikan adalah `/api/v1`, bukan alias lama `/api`. Paket ini bukan seluruh API POS; API kasir, pembelian, dan Akun Kas tidak untuk diimplementasikan ulang di PDA.

## 2. Alamat server dan konfigurasi

```text
Origin server: https://sm3.masivi.id
Base API:      https://sm3.masivi.id/api/v1
Health:        GET https://sm3.masivi.id/api/v1/health
```

Respons health normal:

```json
{"status":"ok","database":"mariadb","api_version":"1"}
```

Health memeriksa database, tetapi tidak membuktikan login, izin cabang, scanner fisik, atau transaksi sudah benar. Jangan mengharapkan tulisan `Gudang PDA API`; itu milik backend bawaan aplikasi yang tidak dipakai pada integrasi ini.

Kode integrasi yang tersedia sekarang (`frontend/src/pos.ts` pada proyek Expo) memakai origin SM3 tetap untuk Android dan menambahkan `/api/v1`. `EXPO_PUBLIC_BACKEND_URL` belum dibaca oleh kode itu. Bila pengembang Emergent memilih konfigurasi environment, adapter HTTP harus DIUBAH agar membaca origin dan menambahkan `/api/v1` tepat sekali. Mengisi environment saja tidak cukup. Jangan tetap menggunakan adapter asli yang hanya menambahkan `/api` beserta model data backend demo.

Contoh konfigurasi yang boleh diimplementasikan pengembang, bukan klaim sudah aktif:

```text
EXPO_PUBLIC_BACKEND_URL=https://sm3.masivi.id
URL request = origin + /api/v1 + path
```

Alamat publik boleh ada dalam konfigurasi aplikasi; password akun, token pengguna, JWT signing secret, dan akses database TIDAK boleh dibundel. Untuk preview WEB dari domain Emergent/Render, origin tersebut harus diizinkan CORS secara spesifik oleh operator. Jangan mengubah CORS menjadi wildcard. Android native dan web mempunyai perilaku input dan jaringan berbeda.

## 3. Login dan identitas cabang

`POST /auth/login`, tanpa Bearer token dan tanpa header cabang lama:

```json
{"email":"petugas@example.com","password":"GANTI_DENGAN_PASSWORD_AKUN_SENDIRI"}
```

Respons 200 memuat `access_token`, `token_type: "bearer"`, dan `user`:

```json
{
  "access_token":"EXAMPLE_TOKEN_NOT_VALID",
  "token_type":"bearer",
  "user":{
    "id":"333333333333333333333333",
    "email":"petugas@example.com",
    "name":"Petugas SM3 Contoh",
    "role":"warehouse",
    "active":true,
    "store_id":"111111111111111111111111",
    "cashier_duty":"payment"
  }
}
```

`cashier_duty` adalah field umum akun POS, bukan penentu izin Gudang. Kebijakan aplikasi PDA: hanya `warehouse` atau `admin` yang aktif dan mempunyai `store_id`. Admin pemilik tanpa cabang tidak dipakai sebagai akun operasional PDA.

Setelah login, request operasional memakai:

```http
Authorization: Bearer <access_token_dari_login>
X-Store-Id: <user.store_id_yang_diverifikasi>
Content-Type: application/json
```

- `GET /auth/me` mengembalikan objek user yang sama, tanpa pembungkus `user`. Saat memulihkan sesi, panggil dengan token dahulu dan TANPA header cabang yang tertinggal dari akun sebelumnya. Setelah identitas diverifikasi, pakai `user.store_id` untuk request berikutnya.
- Token akses saat ini berlaku 12 jam; jika 401, minta login ulang. Tidak ada endpoint refresh token dalam kontrak ini.
- `GET /stores` mengembalikan ARRAY cabang yang boleh dilihat akun. Akun yang terikat cabang hanya melihat cabangnya; jangan mengambil tujuan transfer dari endpoint ini.
- `GET /branch-transfers/options` memberikan `stores` untuk pilihan tujuan transfer. Saring cabang sendiri. Header tetap cabang PENGIRIM, `to_store` di body adalah TUJUAN.
- Domain menentukan tenant; akun/header menentukan cabang dalam tenant. Untuk deployment ini, SM3 dan SM6 memakai API SM3 dan akun cabangnya masing-masing. Jangan mengganti host/header berdasarkan pilihan bebas pengguna.
- Header yang bertentangan dengan cabang akun ditolak 403. Dokumen cabang lain dapat menghasilkan 404. Jangan mencoba fallback ke cabang lain untuk mengatasi error.
- Pisahkan cache, antrean, dan draf lokal menurut origin + user ID + store ID + jenis dokumen. Batalkan/abaikan respons dari akun lama saat logout/berganti akun. Jangan memindahkan antrean lama ke akun baru.
- Master produk/supplier tersedia dalam tenant sesuai API; stok dan transaksi terikat cabang. Jangan membuat salinan database produk sendiri sebagai sumber utama.

## 4. Ringkasan endpoint

Semua path berikut relatif terhadap base API. Respons sukses menggunakan **200**, termasuk POST create, bukan harus 201.

| Metode | Path | Hasil/aturan |
|---|---|---|
| GET | `/health` | Kesehatan API/database, tanpa login |
| POST | `/auth/login` | Token dan user |
| GET | `/auth/me` | User terverifikasi |
| GET | `/stores` | Array cabang akun |
| GET | `/warehouse/suppliers` | Array `{id,name}`, maksimal 2.000 supplier tenant |
| GET | `/warehouse/products?q=...` | Pencarian manual `{items,has_more}`, maksimal 20 hasil |
| GET | `/warehouse/product?barcode=...` | Satu produk exact beserta konversi |
| GET | `/warehouse/batches` | Array draf/riwayat penerimaan, terbaru dahulu |
| POST | `/warehouse/batches` | Buat draf kosong, belum ada stok masuk |
| GET | `/warehouse/batches/{batch_id}` | Detail draf/riwayat |
| PUT | `/warehouse/batches/{batch_id}` | Ganti SELURUH items draf, bukan append |
| POST | `/warehouse/batches/{batch_id}/post` | **Admin** audit → draf Pembelian, belum tambah stok |
| POST | `/warehouse/batches/{batch_id}/cancel` | **Admin** batalkan draf |
| POST | `/warehouse/scan-notes` | Catatan barcode tak dikenal, bukan produk/stok |
| GET | `/warehouse/scan-notes` | `{items,total}` catatan barcode |
| POST | `/warehouse/scan-notes/{note_id}/review` | **Admin** menyelesaikan catatan |
| GET | `/branch-transfers/options` | Cabang tujuan dan kemampuan akun |
| GET | `/branch-transfers/products?q=...` | Array produk, field `exact`, konversi dan stok tersedia |
| GET | `/branch-transfers` | `{items,total}` transaksi transfer; item produk tidak disertakan |
| POST | `/branch-transfers` | Draf dengan minimal satu barang; reservasi stok |
| GET | `/branch-transfers/{doc_id}` | Detail, barang, total modal, history |
| PUT | `/branch-transfers/{doc_id}` | Pengirim mengganti seluruh items draf |
| POST | `/branch-transfers/{doc_id}/dispatch` | Pengirim: kurangi stok fisik dan kirim |
| POST | `/branch-transfers/{doc_id}/check` | Penerima: simpan pemeriksaan, belum tambah stok |
| POST | `/branch-transfers/{doc_id}/post` | Penerima: posting hasil pemeriksaan, tambah stok |
| POST | `/branch-transfers/{doc_id}/cancel` | Pengirim: batalkan draf, lepaskan reservasi |
| GET | `/branch-transfers/notifications` | `{items,count}`; maksimal 50 items, count dapat lebih besar |
| POST | `/branch-transfers/{doc_id}/seen` | Tandai sudah dilihat, tanpa body; tidak mengubah stok |

Pada PDA petugas, jangan tampilkan operasi audit harga/pembatalan penerimaan/review catatan admin. Operasi di luar paket, seperti revisi kiriman setelah dispatch, pengembalian, persetujuan nilai dan pencatatan finance, tetap melalui admin POS yang sudah ada.

## 5. Barcode, satuan, QTY dan scanner

`GET /warehouse/product?barcode=CONTOH-BAL-12` mengembalikan satu OBJEK, bukan array. Contoh field pokok:

```json
{
  "id":"555555555555555555555555",
  "name":"KOPI CONTOH",
  "barcode":"CONTOH-BAL-12",
  "base_unit":"PCS",
  "units":[{"name":"PCS","pieces":1},{"name":"BAL","pieces":12}],
  "matched_unit":"BAL",
  "matched_pieces":12,
  "matched_variant":null,
  "variants":[],
  "stock":100
}
```

- Barcode adalah string: jangan hilangkan nol di depan. Trim terminator scanner, encode query URL, jangan mengubah case/nama satuan.
- `pieces` = isi satu kemasan dalam satuan dasar. Scan BAL isi12 empat kali → **quantity4 BAL**, bukan quantity48 BAL. Jumlah dasar = 4×12 = 48 PCS.
- Jangan mengasumsikan BAL/DUS/SLOP selalu punya isi tertentu. Gunakan konversi dari server; kemasan penerimaan tidak harus satuan jual.
- Untuk transfer, `/branch-transfers/products?q=...` mengembalikan ARRAY. Untuk hardware scan pilih hanya bila tepat satu hasil `exact:true`; `matched_unit` dicocokkan ke `units` untuk mengambil `pieces`. Hasil pencarian nama tidak boleh otomatis dianggap barcode cocok.
- Barcode transfer tidak ditemukan ditandai array tanpa hasil exact, bukan selalu HTTP404. Lookup penerimaan barcode tak dikenal menghasilkan404; duplikat dapat409.
- Pencarian manual penerimaan menggunakan `/warehouse/products?q=...`, lalu `/warehouse/product?product_id=<id>` untuk detail. Jika `matched_unit` kosong karena pencarian nama, minta pilih satuan yang sah.
- Variant yang diperlukan harus dipilih/diambil dari `matched_variant`. Satu product ID hanya boleh satu baris dalam dokumen. Jangan diam-diam menggabungkan kemasan/varian berbeda atau menulis baris duplikat.
- Lookup penerimaan dapat menerima `supplier_id` dan `supplier_name` untuk referensi harga supplier. `supplier_price` bisa null; harga final/audit tetap admin. Jangan memakai harga jual sebagai harga modal.
- Stok nol/minus bukan alasan aplikasi menolak transfer. Server saat ini mengizinkan kekurangan stok; jangan menambahkan validasi frontend yang melarangnya.

Input scanner adalah urusan perangkat, bukan endpoint. Barcode harus masuk ke TextInput, kemudian Enter/tombol tambah meneruskan ke lookup. Bedakan diagnostik: kolom kosong (input/fokus/perangkat), angka ada tetapi tidak submit, lookup ditolak, atau simpan gagal. Deploy backend tidak otomatis memperbaiki scanner.

Pertahankan scanner native dan pengaturan keyboard yang sudah berhasil di Expo Go. Mode kontinu menambah +1 kemasan per scan. Mode manual meminta QTY. Mode penerimaan transfer memilih barang untuk diperiksa, bukan otomatis menaikkan QTY diterima. Pengujian browser/fill+Enter tidak menggantikan pengujian scanner fisik iData/SEUIC.

## 6. Penerimaan gudang → admin → Pembelian

1. Login, ambil supplier, pilih supplier terdaftar.
2. POST `/warehouse/batches` memakai UUID request baru; respons awal `state:draft`, `revision:0`, `items:[]`.
3. Scan/cari barang, tentukan konversi dan QTY.
4. PUT `/warehouse/batches/{id}` memakai revision terakhir dan SELURUH daftar items. Respons menjadi dokumen kanonis berikutnya.
5. Petugas selesai menyimpan draf. **Tidak ada mutasi stok dari create/save draf.**
6. Admin memeriksa/mengisi harga, lalu POST `/warehouse/batches/{id}/post` dengan `{revision,reviewed:true}`. Hasil `purchase_pending` dan `purchase_draft_id`; masih belum menambah stok.
7. Admin menyelesaikan posting Pembelian di POS. Itu jalur stok masuk pembelian; jangan diulang oleh PDA.

Contoh create:

```json
{"request_id":"00000000-0000-4000-8000-000000000001","supplier_id":"444444444444444444444444","supplier_name":"Supplier Contoh","reference":"SJ-CONTOH-001","note":"Penerimaan PDA"}
```

Contoh PUT pertama:

```json
{
  "request_id":"00000000-0000-4000-8000-000000000002",
  "revision":0,
  "reference":"SJ-CONTOH-001",
  "note":"Penerimaan PDA",
  "items":[{"product_id":"555555555555555555555555","quantity":4,"unit":"BAL","pieces":12,"condition":"SESUAI","variant":null}]
}
```

Setiap scan berikutnya memperbarui angka total pada daftar lengkap. Jangan hanya mengirim satu barang baru: barang lain yang tidak disertakan akan hilang dari draf.

Ketentuan: maksimal500baris, QTY bilangan bulat1–1.000.000; jumlah dasar per produk terdaftar maksimal1.000.000. Kondisi valid `SESUAI`, `KURANG`, `RUSAK`, `LEBIH`, `DITOLAK`. Petugas tidak menentukan harga; server memakai referensi supplier terakhir bila ada, selain itu null. Harga dikirim petugas bukan dasar untuk mengubah aturan admin. Endpoint mendukung beberapa field barang sementara untuk workflow POS lain, tetapi barcode tidak dikenal pada PDA masuk **scan-notes**, bukan dibuat menjadi produk/baris stok otomatis.

Status riwayat dapat `draft`, `purchase_pending`, `purchased`, `cancelled`; jangan mengedit dokumen yang sudah bukan draft. Untuk daftar: `offset>=0`, `limit1–200` default100, `from_date`/`to_date` format YYYY-MM-DD. Salah satu batas tanggal boleh kosong. Hari dihitung WIB, batas akhir mencakup satu hari penuh. Hasil berupa array tanpa `total`.

## 7. Transfer cabang — contoh dua BAL, baru satu tiba

### Pengirim

POST `/branch-transfers`:

```json
{
  "request_id":"00000000-0000-4000-8000-000000000003",
  "revision":0,
  "to_store":"222222222222222222222222",
  "note":"Kirim dua BAL",
  "items":[{"product_id":"555555555555555555555555","qty":2,"unit":"BAL","pieces":12}]
}
```

Respons awal revision1. Draf langsung **mereservasi24PCS**, sehingga stok tersedia berkurang; belum mengurangi stok fisik. Perubahan draft PUT mengirim daftar lengkap, UUID baru dan revision terakhir, bukan delta. Minimal1/maksimal500baris. Cabang tujuan tidak boleh cabang sendiri.

Contoh urutan paket JSON pendamping: create revision0 → edit revision1 → dispatch revision2 → check revision3 → post revision4. Jika tidak ada edit di antaranya, angka revision berbeda. **Selalu ambil revision dari respons, jangan hardcode angka contoh.**

POST `/branch-transfers/{id}/dispatch`:

```json
{"revision":2,"confirmed":true,"note":"Barang berangkat"}
```

Server mengurangi24PCS stok fisik pengirim, melepaskan reservasi24PCS dan mengubah state menjadi `shipped`. Modal/unit dihitung server dan diperbarui saat dispatch. Mengulang request identik tidak mengurangi stok lagi. Setelah dikirim tidak boleh PUT biasa; revisi/pengembalian mengikuti mekanisme persetujuan di POS admin.

### Penerima

Login akun cabang TUJUAN sendiri. Header sekarang `user.store_id` penerima, bukan meminjam token pengirim. Ambil daftar `GET /branch-transfers?direction=incoming`, lalu GET detail berdasarkan nomor/id transaksi.

POST `/branch-transfers/{id}/check`:

```json
{"revision":3,"confirmed":true,"note":"Satu BAL belum tiba","items":[{"product_id":"555555555555555555555555","qty":1,"checked":true}]}
```

- Harus mengirim tepat semua product ID kiriman, tanpa duplikat, dan semuanya `checked:true`.
- QTY adalah kemasan yang diterima **pada pemeriksaan ini**, bukan jumlah kumulatif. Nol diperbolehkan per barang, tetapi minimal satu barang harus diterima positif.
- Maksimum setiap baris `sent_qty - received_qty`. Jangan melebihi sisa kiriman.
- Jika ada selisih, `note` tidak boleh kosong.
- Hasil `receipt_draft`, `pending_receipt` tersimpan; **stok penerima belum bertambah**.

Setelah konfirmasi petugas, POST `/branch-transfers/{id}/post`:

```json
{"revision":4,"confirmed":true,"note":"Posting hasil cek"}
```

Body posting tidak mengirim ulang items; server memakai `pending_receipt` hasil cek. Respons contoh `partial_received`, revision5; stok penerima bertambah12PCS, bukan24. `received_qty` menjadi1BAL. Penerimaan berikutnya cek sisa kemudian post lagi. Jika seluruh kiriman sudah diterima, status `received`.

Barang kurang saat penerimaan sebagian **tidak otomatis kembali menjadi stok pengirim**. Itu tetap selisih/kiriman belum diterima sampai diselesaikan melalui penerimaan berikutnya atau workflow revisi/pengembalian POS. Jangan menambah stok pengirim sendiri.

### Nilai modal dan histori

Dengan modal100/PCS, modal1BAL=1.200; dua dikirim, satu diterima:

```json
{"sent_value":2400,"received_value":1200,"difference_value":1200,"final_value":1200,"recorded_value":0,"unrecorded_value":1200}
```

Angka ini berada di `totals`, dengan field tambahan `draft_value` dan `original_sent_value`. Tampilkan nilai dari respons server; jangan memakai harga jual. `final_value` adalah nilai yang SUDAH diterima, bukan nilai seluruh kiriman yang diharapkan. `recorded_value` berasal batch finance; jangan menyimpulkan uang kas langsung berubah. Pencatatan utang/piutang dan sinkronisasi Akun Kas tetap oleh admin POS.

Daftar tampil per transaksi (`request_no`, tanggal, pengirim/penerima, status, item_count, totals); klik nomor untuk detail `items`/`history`. GET daftar tidak menyertakan `items`, `history`, `pending_receipt`, `pending_revision`, `pending_return`, `receipts`, `financial_batches`.

Filter daftar: `direction=outgoing|incoming` defaultoutgoing; `q` nomor transaksi; `status` state; `offset>=0`, `limit1–100` default50; `start` DAN `end` YYYY-MM-DD harus diisi bersama bila memakai tanggal. Hari WIB, terbaru dahulu. Respons `{items,total}`. Notifikasi GET tidak mengubah stok. POST `/seen` hanya menandai revision telah dilihat; persoalan yang belum selesai tetap bisa muncul.

## 8. Barcode belum terdaftar

POST `/warehouse/scan-notes`:

```json
{
  "request_id":"00000000-0000-4000-8000-000000000005",
  "context_id":"00000000-0000-4000-8000-000000000006",
  "kind":"warehouse",
  "barcode":"CONTOH-BELUM-ADA",
  "document_id":"666666666666666666666666",
  "target_store":null
}
```

`kind` bernilai `warehouse` atau `transfer`. `context_id` dibuat sekali untuk sesi draf dan dipertahankan saat reload. `request_id` baru untuk SETIAP scan fisik, sama saat retry scan itu. `document_id` boleh null untuk draf transfer lokal yang belum punya dokumen; `target_store` boleh diisi cabang tujuan transfer sah.

Respons memuat `id`, `barcode`, `scan_count`, `revision`, `state`, waktu/petugas/reference. Scan kode sama dalam context sama bertambah hitungannya; retry request identik tidak menambah hitungan. **scan_count bukan QTY PCS/BAL** dan tidak boleh otomatis menjadi stok.

GET `/warehouse/scan-notes?kind=warehouse&state=pending&offset=0&limit=30`. `kind` wajib; state `pending|reviewed|all` defaultpending; limit1–100. Admin memakai POST `/{note_id}/review` dengan `{revision,note}`; catatan minimal3karakter. Jika ada scan baru revision berbeda, server409, muat ulang.

## 9. Pencegahan duplikasi dan konflik

Ini wajib di aplikasi, bukan sekadar menambahkan tombol Simpan:

1. Tulis scan/entry dan identitas user/store/dokumen ke penyimpanan lokal SEBELUM mengakui scan diterima.
2. Proses antrean berurutan (FIFO), maksimal satu request mutasi berjalan per dokumen. Jangan membuat dua PUT berdasarkan revision yang sama.
3. Simpan method, path dan body persis sebelum HTTP. UUID digunakan sekali per tindakan logis, bukan dibuat ulang setiap retry.
4. Terima respons, simpan dokumen kanonis baru dan hapus job antrean secara atomik/sebagai satu journal durable. Baru lanjut scan berikutnya.
5. Timeout/koneksi terputus/5xx bukan bukti bahwa server belum menyimpan. Tahan input baru; ulangi request yang SAMA, bukan tambah QTY lagi.
6. Saat409, hentikan antrean, tampilkan alasan dan minta pemeriksaan/muat ulang detail. Jangan mengganti revision otomatis lalu mengirim payload lama yang menimpa hasil orang lain.
7. Jika penyimpanan lokal gagal, jangan kirim mutasi baru atau menampilkan status tersimpan. Jangan hapus journal untuk menghilangkan error.

| Operasi | Identitas pengulangan di server |
|---|---|
| Create batch | request_id + payload + pembuat |
| Save batch | request_id + seluruh payload termasuk revision + pengguna; server menyimpan100penanda terakhir per dokumen |
| Create transfer | request_id UUID + fingerprint payload + cabang pengirim |
| Edit transfer | aksi save + revision asal + fingerprint seluruh payload (termasuk request_id) |
| dispatch/check/post/cancel transfer | nama aksi + revision asal + fingerprint payload; Action tidak memakai request_id |
| Scan note | cabang + pengguna + request_id + fingerprint payload |

Respons retry dapat berupa keadaan dokumen TERKINI, bukan snapshot saat request pertama. Terima state/revision terbaru itu dan jangan menghitung ulang increment dari respons. Jangan menjanjikan retry arbitrer selamanya untuk save batch karena batas100penanda. Untuk pending lama setelah banyak perubahan, admin perlu rekonsiliasi.

Stock posting hanya server. Jangan menambah/mengurangi stok via API produk setelah menggunakan endpoint transfer/pembelian. Mode offline penuh/katalog lokal/login offline tidak dijamin oleh kontrak ini; journal lokal berfungsi untuk pemulihan dan retry, bukan bukti sinkronisasi berhasil.

## 10. Kesalahan yang harus ditampilkan

Kesalahan bisnis umumnya `{"detail":"pesan"}`. Kesalahan validasi FastAPI422 dapat berupa `detail` array berisi `loc`, `msg`, `type`; jangan selalu menganggap detail string. Proxy/rate limit dapat mengembalikan non-JSON, maka parser HTTP harus menanganinya tanpa layar putih.

| Status | Tindakan klien |
|---|---|
| 400/422 | Tampilkan validasi; jangan retry buta |
| 401 | Login ulang; simpan journal akun asal dan jangan pindahkan ke akun lain |
| 403 | Tolak akses; periksa akun/cabang, jangan bypass header |
| 404 | Periksa path/scope; hanya 404 lookup produk yang diarahkan ke catatan unknown |
| 409 | Konflik status/revision/konversi/idempotensi; hentikan dan rekonsiliasi |
| 429 | Tunda dengan backoff, patuhi Retry-After jika ada; pertahankan identitas request |
| Timeout/5xx/non-JSON | Hasil simpan belum pasti; pertahankan paket untuk pemeriksaan/retry aman |

## 11. Kriteria uji sebelum dipakai operasional

- Login SM3 dan SM6, logout/switch/reload: cache, draf, token dan header tidak tertukar; percobaan header cabang lain403.
- Scan barcode PCS empat kali menjadi4PCS; BAL isi12 empat kali menjadi4BAL/48PCS; nol di depan terpelihara; kemasan/varian ambigu tidak digabung diam-diam.
- Draf penerimaan tidak menambah stok; admin audit membuat draf pembelian; hanya posting pembelian menambah stok.
- PUT selalu daftar lengkap; dua produk tidak saling menghapus. Retry setelah server commit tetapi respons hilang tidak menambah QTY lagi.
- Transfer draft mereservasi; dispatch mengurangi stok fisik sekali; check tidak menambah stok; post menambah sesuai hasil cek saja.
- Selisih satu dari dua BAL menghasilkan final1.200/difference1.200 bila modal1.200/BAL; finance tetap admin.
- Barcode tak dikenal menghasilkan catatan, bukan produk baru; retry tidak menggandakan scan_count.
- Konflik perangkat lain tidak di-overwrite; penyimpanan lokal gagal menghentikan pengiriman.
- Uji PDA fisik iData3Pro dan SEUIC Q9: keyboard tersembunyi, fokus, Enter scanner, scan cepat4×, mode manual, reload dan rotasi/layar kecil. Hasil browser tidak menggantikan tes ini.
- Uji mutasi memakai database sementara/staging, bukan stok/transaksi produksi. Jangan mengirim contoh dari paket ini ke toko nyata untuk coba-coba.

Pada integrasi lokal sebelumnya, 11 tes inti/session dan27pemeriksaan browser/API/MariaDB sementara lulus. Itu bukti untuk versi integrasi tersebut, bukan sertifikasi APK atau scanner fisik. APK baru tetap harus dibuild dan diuji pada perangkat.

## 12. Instruksi singkat untuk Emergent

> Hubungkan frontend Gudang native yang sudah berhasil scan ke API MASIVI sesuai paket ini. Pertahankan TextInput/scanner/keyboard yang sudah diuji. Jangan deploy backend MongoDB demo sebagai sumber stok baru. Ganti adapter API, model respons, auth/store scope, journal/retry dan workflow sesuai OpenAPI + Markdown; mengganti BACKEND_URL saja tidak cukup. Petugas hanya input penerimaan/transfer dan cek/post penerimaan transfer. Harga/audit pembelian/pengaturan/finance tetap admin POS. Jangan menambah izin, membuat akun dummy produksi, mengubah stok langsung, atau mengubah aturan minus. Serahkan hasil uji dan APK instalasi; versi web bukan pengganti pengujian native.
