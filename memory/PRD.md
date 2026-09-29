# Gudang PDA Scanner — PRD

## Original Problem Statement (verbatim, Indonesian)
"BUATKA APLIKASI GUDANG UNTUK MESIN SCAINER PDA. YANG PERLU DI INPUT NAMA SUPLAR, JIKA BELUM ADA KASIH OPSI TAMBAHKAN, KOLOM BARCODE LALU SCAN BISA BER KALI KALI SCAN QTT BERTAMBAH DAN OPSI ISI MENUAL, DAN UNTUK AUDIT ADMIN SEBELUM DI KIRIM KE PEM BELIAN BISA TARIK DATA PEMBELIAN SEBELUMNYA UNTUK HARGA. HARUS BISA TER HUBUNG DENGAN POS SAYA"

## User Choices
- POS: uses the POS built within this system (shared product catalog / inventory).
- Auth: email & password; admin manages staff accounts.
- Scan: device camera + manual barcode input field (for PDA laser scanners).
- Theme: dark industrial, high contrast, large touch targets.

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT auth (PyJWT + passlib bcrypt). Routes under /api.
- Frontend: Expo Router (React Native), @tanstack/react-query, dark theme in src/theme.ts,
  fonts Barlow Condensed (numbers) + IBM Plex Sans (UI), MaterialDesignIcons.
- Collections: users, suppliers, products (shared POS catalog), receipts, purchase_history.

## User Personas
- Staf Gudang: scans/receives goods, submits receipts to audit.
- Admin: audits receipts, sets/edits unit cost (pulls last purchase price), approves →
  syncs stock + cost to POS; manages staff accounts.

## Core Requirements (static)
1. Select supplier; add new supplier inline if not exists.
2. Barcode field: repeated scan increments qty; manual barcode entry; manual qty edit + steppers.
3. Unknown barcode → prompt to name & auto-create product in POS catalog.
4. Admin audit before purchasing: pull previous purchase price per item, editable.
5. Approve → increment POS stock, update last cost, record purchase history.
6. POS connection: shared products catalog + GET /api/pos/inventory.

## Implemented (2026-06)
- JWT auth, admin seeding, role-based access (admin/staff). [2026-06]
- Suppliers list/create (idempotent). [2026-06]
- Products catalog, barcode lookup, last-cost endpoint. [2026-06]
- Receive/Scan, Audit + pricing/approve → POS sync, Inventory, Staff CRUD. [2026-06]

## Implemented — Complete Warehouse Suite (2026-06, session 2)
- Multi-branch (cabang): branches CRUD, per-branch stock via stock_levels ledger. [2026-06]
- Transfer antar cabang (Kirim→Terima): create deducts source, receive credits destination, cancel returns stock. [2026-06]
- Stok Opname: scan physical count, system computes variance, auto-adjusts branch stock, saves report. [2026-06]
- Barang Keluar (issue) with reason; deducts branch stock. [2026-06]
- Laporan pergerakan stok (movement ledger) with type filter. [2026-06]
- Menu hub tab (operations grid + staff + logout). Branch chip on Receive & Stok. [2026-06]
- PDA-friendly barcode input: soft keyboard hidden by default (showSoftInputOnFocus=false) + manual-typing toggle. [2026-06]
- 38/38 backend tests pass; all frontend flows verified. [2026-06]

## Implemented — Integrasi POS MASIVI (2026-09, session 4)
- Frontend diintegrasikan penuh ke POS MASIVI (https://sm3.masivi.id/api/v1) sebagai SATU-SATUNYA sumber data, mengikuti kontrak /app/memory/POS-GUDANG-API.md + openapi.json. [2026-09]
- Backend MongoDB lokal DIPENSIUNKAN sebagai sumber data — server.py kini hanya pass-through /api/pos-proxy untuk preview web (native memanggil POS langsung, tanpa CORS). [2026-09]
- Auth POS: login email/password akun POS (role warehouse/admin + store_id wajib), Bearer + X-Store-Id, token di SecureStore, 401 → logout otomatis. [2026-09]
- Penerimaan: buat draf → scan (matched_unit/pieces dari konversi POS) → Simpan = PUT SELURUH items + revision server; barcode tak dikenal → scan-notes (bukan produk baru). [2026-09]
- Transfer: draf (reservasi) → dispatch (stok keluar sekali) → penerima check (parsial, catatan wajib jika selisih) → post (stok masuk); arah Keluar/Masuk. [2026-09]
- Jurnal offline FIFO per user/store dengan request_id stabil; 409 → stop & muat ulang; timeout ≠ gagal simpan. [2026-09]
- Fitur lokal lama (audit harga lokal, opname, barang keluar, cabang lokal, laporan lokal) DIHAPUS dari aplikasi — audit/harga/finance tetap di admin POS. [2026-09]
- 8/8 tes proxy + verifikasi kontrak lolos; login sukses butuh akun POS asli (UAT oleh user). [2026-09]

## Backlog / Remaining
- P0: UAT dengan akun POS asli di PDA fisik (iData3Pro / SEUIC Q9): login, scan PCS & BAL isi 12, draf penerimaan, transfer lengkap.
- P1: notifikasi transfer masuk (badge) dari /branch-transfers/notifications.
- P1: jika POS menyediakan endpoint opname/barang keluar nanti, tambahkan kembali fitur tersebut via POS.
- P2: apk build & pengujian perangkat (per kontrak: APK mandiri, bukan preview web).
