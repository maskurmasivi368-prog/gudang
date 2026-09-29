# Jawaban integrasi untuk Emergent

POS kami buatan sendiri dan sudah mempunyai REST API. Integrasi ini memakai API; ketersediaan webhook untuk alur Gudang belum dikonfirmasi, jadi jangan bergantung pada webhook.

**Server utama:** `https://sm3.masivi.id/api/v1`.

Terlampir kontrak `POS-GUDANG-API.md`, `POS-GUDANG-API.openapi.json`, dan contoh `POS-GUDANG-API-examples.json`. Ini kontrak hasil pembacaan backend yang berjalan, bukan API MongoDB bawaan aplikasi Gudang. Seluruh contoh adalah fiktif; tidak ada kredensial aktif.

## Arah data yang diinginkan

1. **POS → aplikasi Gudang:** login/identitas akun, cabang yang diizinkan, produk, barcode, konversi kemasan, supplier, daftar transaksi, status, nilai modal dan hasil server. POS menjadi sumber utama.
2. **Aplikasi Gudang → POS:** membuat/mengubah draf penerimaan, mencatat barcode tak dikenal, membuat/mengubah draf transfer, mengirim barang, memeriksa QTY penerima dan posting penerimaan transfer melalui endpoint khusus.
3. **POS → aplikasi Gudang setelah simpan:** aplikasi memakai dokumen/revision/status/total yang dikembalikan server. Ambil daftar/detail kembali untuk pembaruan; polling GET dapat ditambahkan secara terkendali, tanpa mengasumsikan webhook sudah tersedia.

Jangan membuat mekanisme sinkronisasi yang menimpa `stock` produk. Stok dihitung/dimutasi server melalui workflow transaksi. Cache dan journal di perangkat bukan sumber stok kedua.

## Aturan yang wajib dipertahankan

- Akun terikat cabang. Ambil `user.store_id` dari login/auth-me, gunakan Bearer token dan `X-Store-Id`. Cabang SM3 dan SM6 tidak boleh tertukar. Header pengirim tidak diganti menjadi ID tujuan saat membuat transfer.
- Penerimaan gudang hanya **draf → audit admin → Pembelian → posting Pembelian**. Create/save draf dan audit penerimaan tidak langsung menambah stok.
- Transfer: **draf mereservasi → dispatch mengurangi stok fisik pengirim → penerima cek → posting menambah stok penerima**. Scan saja tidak boleh langsung posting penerimaan.
- QTY dan satuan mengikuti barcode terdaftar. Empat scan BAL isi12 berarti4BAL/48PCS. Stok minus diperbolehkan sesuai aturan server.
- Harga, master produk/kemasan, audit Pembelian dan pencatatan utang/piutang/Akun Kas tetap admin melalui POS. Jangan gunakan harga jual untuk nilai transfer.
- Selisih penerimaan sebagian dicatat. Jangan otomatis mengembalikan barang yang belum diterima ke stok pengirim; selesaikan lewat workflow revisi/pengembalian yang sudah ada.
- Barcode belum dikenal menjadi catatan admin, bukan produk baru atau stok baru.
- PUT draf mengirim seluruh daftar items, bukan satu baris tambahan. Bedakan `quantity` pada penerimaan dengan `qty` pada transfer.
- Simpan antrean lokal per user/cabang/dokumen. Gunakan revision dan identitas request sesuai kontrak. Retry harus method/path/body yang sama; timeout tidak berarti server gagal menyimpan. Jangan overwrite konflik409.
- Jangan mengganti scanner native/keyboard yang sudah berhasil pada iData3Pro dan SEUIC Q9. Uji fokus, Enter, scan cepat dan mode QTY di perangkat fisik.

## Konfigurasi dan penyerahan

Kode integrasi yang disiapkan saat ini mengarah langsung ke server POS dan menambahkan `/api/v1`. Mengisi `EXPO_PUBLIC_BACKEND_URL` saja tidak mengubah kode ini. Jika memakai environment tersebut, ubah adapter agar membaca origin tanpa suffix dan menambahkan `/api/v1` tepat sekali, serta sesuaikan auth/model/workflow; jangan sekadar mengganti alamat backend demo.

Tidak perlu deploy backend MongoDB Gudang ke Render sebagai sumber data terpisah. Jangan meminta token/password lewat chat atau menyimpannya dalam source/config publik. Login aplikasi dilakukan masing-masing petugas dengan akun POS.

Hasil akhir yang diminta: **APK Android mandiri yang tersambung ke POS**, bukan hanya tautan web atau preview Expo Go. Build dari source integrasi terbaru, uji alur dengan data sementara/staging, lalu uji scanner pada PDA. Jangan mencoba mutasi stok pada produksi tanpa persetujuan khusus.
