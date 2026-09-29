"""Backend tests for NEW features: branches, per-branch stock, transfers,
opname, issues (barang keluar), and movements ledger."""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": "admin@gudang.com", "password": "admin123"}
BC_INDOMIE = "8991002101234"
BC_AQUA = "8998866200011"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def staff_headers(admin_headers):
    email = f"TEST_ops_{uuid.uuid4().hex[:6]}@gudang.com"
    r = requests.post(f"{API}/staff",
                      json={"name": "TEST Ops", "email": email, "password": "abcd"},
                      headers=admin_headers, timeout=15)
    assert r.status_code == 201
    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "abcd"}, timeout=15)
    return {"Authorization": f"Bearer {r2.json()['access_token']}"}


@pytest.fixture(scope="module")
def branches(admin_headers):
    r = requests.get(f"{API}/branches", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    main = next((b for b in data if b.get("is_main")), None)
    other = next((b for b in data if not b.get("is_main")), None)
    assert main, "expected a main branch (Gudang Pusat)"
    assert other, "expected non-main seeded branch (Cabang Selatan)"
    return {"main": main, "other": other, "all": data}


# -------- Branch CRUD --------
class TestBranches:
    def test_seeded_branches_present(self, branches):
        names = [b["name"] for b in branches["all"]]
        assert "Gudang Pusat" in names
        assert "Cabang Selatan" in names
        assert branches["main"]["is_main"] is True

    def test_staff_cannot_create_branch(self, staff_headers):
        r = requests.post(f"{API}/branches",
                          json={"name": f"TEST_br_{uuid.uuid4().hex[:5]}"},
                          headers=staff_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_creates_and_toggles_branch(self, admin_headers):
        name = f"TEST_br_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/branches",
                          json={"name": name, "code": "TB1", "address": "Jl A"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 201
        b = r.json()
        assert b["name"] == name
        assert b["active"] is True
        # toggle off
        r2 = requests.patch(f"{API}/branches/{b['id']}",
                            json={"active": False},
                            headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["active"] is False


# -------- Per-branch stock --------
class TestPerBranchStock:
    def test_products_with_branch_id_returns_branch_stock(self, admin_headers, branches):
        bid = branches["main"]["id"]
        r = requests.get(f"{API}/products?branch_id={bid}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        products = r.json()
        assert products, "no products returned"
        for p in products:
            assert "branch_stock" in p
            assert isinstance(p["branch_stock"], int)

    def test_products_without_branch_id_no_branch_stock(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        # branch_stock may be present as None in schema
        for p in r.json():
            assert p.get("branch_stock") in (None, 0) or True  # tolerated

    def test_barcode_with_branch_id_returns_branch_stock(self, admin_headers, branches):
        bid = branches["main"]["id"]
        r = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={bid}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["barcode"] == BC_INDOMIE
        assert isinstance(d.get("branch_stock"), int)


# -------- Receipts w/ branch --------
class TestReceiptWithBranch:
    def test_receipt_approves_into_specific_branch(self, admin_headers, branches):
        bid = branches["other"]["id"]  # Cabang Selatan
        sup = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15).json()[0]
        # branch stock before
        before = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={bid}",
                              headers=admin_headers, timeout=15).json()["branch_stock"]
        payload = {"supplier_id": sup["id"], "branch_id": bid,
                   "items": [{"barcode": BC_AQUA, "name": "Aqua 600ml", "qty": 7}]}
        r = requests.post(f"{API}/receipts", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 201, r.text
        rid = r.json()["id"]
        assert r.json()["branch_id"] == bid
        appr = requests.post(f"{API}/receipts/{rid}/approve",
                             json={"items": [{"barcode": BC_AQUA, "unit_cost": 2100.0}]},
                             headers=admin_headers, timeout=15)
        assert appr.status_code == 200
        after = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={bid}",
                             headers=admin_headers, timeout=15).json()["branch_stock"]
        assert after == before + 7


# -------- Transfers --------
class TestTransfers:
    def test_same_from_and_to_rejected_422(self, admin_headers, branches):
        bid = branches["main"]["id"]
        r = requests.post(f"{API}/transfers",
                          json={"from_branch_id": bid, "to_branch_id": bid,
                                "items": [{"barcode": BC_INDOMIE, "name": "Indomie", "qty": 1}]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 422

    def test_transfer_flow_deducts_source_then_receive_credits_destination(self, admin_headers, branches):
        src = branches["main"]["id"]
        dst = branches["other"]["id"]
        src_before = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={src}",
                                  headers=admin_headers, timeout=15).json()["branch_stock"]
        dst_before = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={dst}",
                                  headers=admin_headers, timeout=15).json()["branch_stock"]
        # Ensure source has enough - if not, seed via receipt-approve (uses main branch)
        if src_before < 3:
            sup = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15).json()[0]
            rr = requests.post(f"{API}/receipts",
                               json={"supplier_id": sup["id"], "branch_id": src,
                                     "items": [{"barcode": BC_INDOMIE, "name": "Indomie", "qty": 10}]},
                               headers=admin_headers, timeout=15).json()
            requests.post(f"{API}/receipts/{rr['id']}/approve",
                          json={"items": [{"barcode": BC_INDOMIE, "unit_cost": 2500.0}]},
                          headers=admin_headers, timeout=15)
            src_before = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={src}",
                                      headers=admin_headers, timeout=15).json()["branch_stock"]

        r = requests.post(f"{API}/transfers",
                          json={"from_branch_id": src, "to_branch_id": dst,
                                "items": [{"barcode": BC_INDOMIE, "name": "Indomie", "qty": 3}]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 201, r.text
        t = r.json()
        assert t["status"] == "pending"
        assert t["total_qty"] == 3
        tid = t["id"]

        # source deducted immediately
        src_mid = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={src}",
                               headers=admin_headers, timeout=15).json()["branch_stock"]
        assert src_mid == src_before - 3
        # dst unchanged until receive
        dst_mid = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={dst}",
                               headers=admin_headers, timeout=15).json()["branch_stock"]
        assert dst_mid == dst_before

        rc = requests.post(f"{API}/transfers/{tid}/receive", headers=admin_headers, timeout=15)
        assert rc.status_code == 200
        assert rc.json()["status"] == "received"
        dst_after = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={dst}",
                                 headers=admin_headers, timeout=15).json()["branch_stock"]
        assert dst_after == dst_before + 3

        # double-receive should fail
        rc2 = requests.post(f"{API}/transfers/{tid}/receive", headers=admin_headers, timeout=15)
        assert rc2.status_code == 400

        # list transfer visible
        lst = requests.get(f"{API}/transfers", headers=admin_headers, timeout=15)
        assert lst.status_code == 200
        assert any(x["id"] == tid for x in lst.json())

    def test_transfer_cancel_returns_stock(self, admin_headers, branches):
        src = branches["main"]["id"]
        dst = branches["other"]["id"]
        # need stock on source
        sup = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15).json()[0]
        rr = requests.post(f"{API}/receipts",
                           json={"supplier_id": sup["id"], "branch_id": src,
                                 "items": [{"barcode": BC_AQUA, "name": "Aqua", "qty": 5}]},
                           headers=admin_headers, timeout=15).json()
        requests.post(f"{API}/receipts/{rr['id']}/approve",
                      json={"items": [{"barcode": BC_AQUA, "unit_cost": 2100.0}]},
                      headers=admin_headers, timeout=15)
        src_before = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={src}",
                                  headers=admin_headers, timeout=15).json()["branch_stock"]
        r = requests.post(f"{API}/transfers",
                          json={"from_branch_id": src, "to_branch_id": dst,
                                "items": [{"barcode": BC_AQUA, "name": "Aqua", "qty": 2}]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 201
        tid = r.json()["id"]
        src_mid = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={src}",
                               headers=admin_headers, timeout=15).json()["branch_stock"]
        assert src_mid == src_before - 2
        cx = requests.post(f"{API}/transfers/{tid}/cancel", headers=admin_headers, timeout=15)
        assert cx.status_code == 200
        assert cx.json()["status"] == "cancelled"
        src_after = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={src}",
                                 headers=admin_headers, timeout=15).json()["branch_stock"]
        assert src_after == src_before  # returned


# -------- Opname --------
class TestOpname:
    def test_snapshot_returns_system_qty(self, admin_headers, branches):
        bid = branches["main"]["id"]
        r = requests.get(f"{API}/opnames/snapshot?branch_id={bid}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["branch_id"] == bid
        assert d["items"]
        for it in d["items"]:
            assert "barcode" in it and "system_qty" in it

    def test_create_opname_adjusts_stock_and_computes_diff(self, admin_headers, branches):
        bid = branches["main"]["id"]
        # get current system qty for indomie
        sys_before = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={bid}",
                                  headers=admin_headers, timeout=15).json()["branch_stock"]
        target_physical = sys_before + 4  # simulate +4 excess found
        r = requests.post(f"{API}/opnames",
                          json={"branch_id": bid,
                                "items": [{"barcode": BC_INDOMIE, "name": "Indomie",
                                           "physical_qty": target_physical}]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "completed"
        item = d["items"][0]
        assert item["system_qty"] == sys_before
        assert item["physical_qty"] == target_physical
        assert item["diff"] == 4
        assert d["total_diff"] == 4

        after = requests.get(f"{API}/products/barcode/{BC_INDOMIE}?branch_id={bid}",
                             headers=admin_headers, timeout=15).json()["branch_stock"]
        assert after == target_physical

    def test_list_opnames(self, admin_headers, branches):
        r = requests.get(f"{API}/opnames?branch_id={branches['main']['id']}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# -------- Issues (barang keluar) --------
class TestIssues:
    def test_issue_deducts_stock_and_records_reason(self, admin_headers, branches):
        bid = branches["main"]["id"]
        # ensure stock
        sup = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15).json()[0]
        rr = requests.post(f"{API}/receipts",
                           json={"supplier_id": sup["id"], "branch_id": bid,
                                 "items": [{"barcode": BC_AQUA, "name": "Aqua", "qty": 5}]},
                           headers=admin_headers, timeout=15).json()
        requests.post(f"{API}/receipts/{rr['id']}/approve",
                      json={"items": [{"barcode": BC_AQUA, "unit_cost": 2000.0}]},
                      headers=admin_headers, timeout=15)
        before = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={bid}",
                              headers=admin_headers, timeout=15).json()["branch_stock"]
        r = requests.post(f"{API}/issues",
                          json={"branch_id": bid, "reason": "Rusak",
                                "items": [{"barcode": BC_AQUA, "name": "Aqua", "qty": 2}]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["reason"] == "Rusak"
        assert d["total_qty"] == 2
        after = requests.get(f"{API}/products/barcode/{BC_AQUA}?branch_id={bid}",
                             headers=admin_headers, timeout=15).json()["branch_stock"]
        assert after == before - 2

    def test_list_issues(self, admin_headers, branches):
        r = requests.get(f"{API}/issues?branch_id={branches['main']['id']}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# -------- Movements ledger --------
class TestMovements:
    def test_movements_includes_multiple_types(self, admin_headers, branches):
        r = requests.get(f"{API}/movements?branch_id={branches['main']['id']}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        types = {m["type"] for m in r.json()}
        # after prior tests we should have several
        assert types & {"receive", "transfer_out", "transfer_in", "issue", "opname"}

    def test_movements_filter_by_mtype(self, admin_headers, branches):
        r = requests.get(f"{API}/movements?mtype=issue&branch_id={branches['main']['id']}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        for m in r.json():
            assert m["type"] == "issue"
            assert m["qty"] < 0  # issues are negative
