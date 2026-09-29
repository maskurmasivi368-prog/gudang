"""Backend API tests for Gudang PDA warehouse app.

Covers: auth, suppliers, products (last cost), receipts (create/list/approve),
POS inventory sync, and staff management (admin-only).
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://pos-inventory-hub-68.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@gudang.com"
ADMIN_PASS = "admin123"

KNOWN_BARCODE = "8991002101234"  # Indomie Goreng (seeded)
UNKNOWN_BARCODE_PREFIX = "TESTBC"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def staff_creds(admin_headers):
    email = f"TEST_staff_{uuid.uuid4().hex[:6]}@gudang.com"
    password = "staffpass"
    r = requests.post(f"{API}/staff", json={"name": "TEST Staff", "email": email, "password": password}, headers=admin_headers, timeout=15)
    assert r.status_code == 201, f"staff create failed: {r.status_code} {r.text}"
    return {"email": email, "password": password, "id": r.json()["id"]}


@pytest.fixture(scope="session")
def staff_headers(staff_creds):
    r = requests.post(f"{API}/auth/login", json={"email": staff_creds["email"], "password": staff_creds["password"]}, timeout=15)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------- auth ----------------
class TestAuth:
    def test_login_success_returns_token_and_admin_user(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["token_type"] == "bearer"
        assert "access_token" in d and len(d["access_token"]) > 20
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == ADMIN_EMAIL

    def test_login_invalid_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass"}, timeout=15)
        assert r.status_code == 401

    def test_me_without_token_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_token_returns_user(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ---------------- suppliers ----------------
class TestSuppliers:
    def test_list_seeded_suppliers(self, admin_headers):
        r = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        names = [s["name"] for s in r.json()]
        assert "PT Sumber Makmur" in names
        assert "CV Berkah Jaya" in names

    def test_create_supplier_and_idempotent_by_name(self, admin_headers):
        name = f"TEST Supplier {uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{API}/suppliers", json={"name": name, "phone": "0812"}, headers=admin_headers, timeout=15)
        assert r1.status_code == 201
        sid = r1.json()["id"]
        # duplicate should return same id (idempotent)
        r2 = requests.post(f"{API}/suppliers", json={"name": name, "phone": "0899"}, headers=admin_headers, timeout=15)
        assert r2.status_code in (200, 201)
        assert r2.json()["id"] == sid


# ---------------- products ----------------
class TestProducts:
    def test_list_products(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any(p["barcode"] == KNOWN_BARCODE for p in r.json())

    def test_get_by_known_barcode(self, admin_headers):
        r = requests.get(f"{API}/products/barcode/{KNOWN_BARCODE}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["barcode"] == KNOWN_BARCODE

    def test_get_by_unknown_barcode_404(self, admin_headers):
        r = requests.get(f"{API}/products/barcode/NOPE_{uuid.uuid4().hex[:6]}", headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_last_cost_endpoint(self, admin_headers):
        r = requests.get(f"{API}/products/barcode/{KNOWN_BARCODE}/last-cost", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["barcode"] == KNOWN_BARCODE
        assert "last_cost" in d and isinstance(d["last_cost"], (int, float))
        assert "found" in d


# ---------------- receipts + POS sync ----------------
class TestReceiptsFlow:
    @pytest.fixture(scope="class")
    def supplier_id(self, admin_headers):
        r = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15)
        return r.json()[0]["id"]

    @pytest.fixture(scope="class")
    def new_barcode(self):
        return f"{UNKNOWN_BARCODE_PREFIX}{uuid.uuid4().hex[:8].upper()}"

    def test_staff_creates_receipt_with_new_barcode_autocreates_product(self, staff_headers, supplier_id, new_barcode, request):
        payload = {
            "supplier_id": supplier_id,
            "items": [
                {"barcode": KNOWN_BARCODE, "name": "Indomie Goreng", "qty": 3},
                {"barcode": new_barcode, "name": "TEST New Product", "qty": 5},
            ],
        }
        r = requests.post(f"{API}/receipts", json=payload, headers=staff_headers, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "pending_audit"
        assert d["total_qty"] == 8
        # last_cost prefilled for known barcode item
        item_known = next(i for i in d["items"] if i["barcode"] == KNOWN_BARCODE)
        assert "last_cost" in item_known
        request.config.cache.set("receipt_id", d["id"])
        # verify auto-created product exists in POS catalog
        rp = requests.get(f"{API}/products/barcode/{new_barcode}", headers=staff_headers, timeout=15)
        assert rp.status_code == 200
        assert rp.json()["stock"] == 0  # not yet approved

    def test_list_pending_audit_filter(self, admin_headers, request):
        r = requests.get(f"{API}/receipts?status=pending_audit", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        rid = request.config.cache.get("receipt_id", None)
        assert any(x["id"] == rid for x in r.json())

    def test_staff_only_sees_own_receipts(self, staff_headers, admin_headers):
        # admin creates a receipt as themselves
        sup = requests.get(f"{API}/suppliers", headers=admin_headers, timeout=15).json()[0]
        r = requests.post(f"{API}/receipts",
                          json={"supplier_id": sup["id"],
                                "items": [{"barcode": KNOWN_BARCODE, "name": "Indomie", "qty": 1}]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 201
        admin_rid = r.json()["id"]
        # staff should NOT see this admin-created receipt
        rs = requests.get(f"{API}/receipts", headers=staff_headers, timeout=15)
        assert rs.status_code == 200
        assert not any(x["id"] == admin_rid for x in rs.json())

    def test_staff_cannot_approve_receipt(self, staff_headers, request):
        rid = request.config.cache.get("receipt_id", None)
        assert rid
        r = requests.post(f"{API}/receipts/{rid}/approve", json={"items": []}, headers=staff_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_approves_and_syncs_pos(self, admin_headers, request, new_barcode):
        rid = request.config.cache.get("receipt_id", None)
        # capture stock before
        before = requests.get(f"{API}/products/barcode/{KNOWN_BARCODE}", headers=admin_headers, timeout=15).json()["stock"]
        body = {"items": [
            {"barcode": KNOWN_BARCODE, "unit_cost": 2600.0},
            {"barcode": new_barcode, "unit_cost": 1500.0},
        ]}
        r = requests.post(f"{API}/receipts/{rid}/approve", json=body, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "approved"
        expected_total = 2600.0 * 3 + 1500.0 * 5
        assert abs(d["total_cost"] - expected_total) < 0.01

        # verify stock incremented and cost updated
        after = requests.get(f"{API}/products/barcode/{KNOWN_BARCODE}", headers=admin_headers, timeout=15).json()
        assert after["stock"] == before + 3
        assert abs(after["cost"] - 2600.0) < 0.01

        # new product should now have stock=5 & cost=1500
        newp = requests.get(f"{API}/products/barcode/{new_barcode}", headers=admin_headers, timeout=15).json()
        assert newp["stock"] == 5
        assert abs(newp["cost"] - 1500.0) < 0.01

        # last-cost endpoint now reflects approval
        lc = requests.get(f"{API}/products/barcode/{KNOWN_BARCODE}/last-cost", headers=admin_headers, timeout=15).json()
        assert lc["found"] is True
        assert abs(lc["last_cost"] - 2600.0) < 0.01

    def test_pos_inventory_reflects_sync(self, admin_headers, new_barcode):
        r = requests.get(f"{API}/pos/inventory", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "count" in d
        item = next((i for i in d["items"] if i["barcode"] == new_barcode), None)
        assert item is not None
        assert item["stock"] == 5

    def test_double_approve_fails(self, admin_headers, request):
        rid = request.config.cache.get("receipt_id", None)
        r = requests.post(f"{API}/receipts/{rid}/approve", json={"items": []}, headers=admin_headers, timeout=15)
        assert r.status_code == 400


# ---------------- staff management ----------------
class TestStaffMgmt:
    def test_non_admin_cannot_list_staff(self, staff_headers):
        r = requests.get(f"{API}/staff", headers=staff_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_lists_staff(self, admin_headers, staff_creds):
        r = requests.get(f"{API}/staff", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert any(u["id"] == staff_creds["id"] for u in r.json())

    def test_duplicate_staff_email_409(self, admin_headers, staff_creds):
        r = requests.post(f"{API}/staff",
                          json={"name": "dup", "email": staff_creds["email"], "password": "abcd"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 409

    def test_toggle_staff_active(self, admin_headers, staff_creds):
        r = requests.patch(f"{API}/staff/{staff_creds['id']}/toggle", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        deactivated = r.json()
        assert deactivated["active"] is False
        # re-enable so subsequent runs don't break
        r2 = requests.patch(f"{API}/staff/{staff_creds['id']}/toggle", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["active"] is True
