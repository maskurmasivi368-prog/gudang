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

## Backlog / Remaining
- P1: Receipt reject/edit-before-approve; transfer edit before send.
- P1: CSV/API export of approved purchases & movements for external POS.
- P2: Low-stock alerts screen; supplier price history chart; opname full-snapshot (auto-zero uncounted).
- P2: race-safe approve; pointerEvents style migration (RN Web warning).

## Next Tasks
- Optional external POS webhook/CSV sync beyond the built-in shared catalog.
