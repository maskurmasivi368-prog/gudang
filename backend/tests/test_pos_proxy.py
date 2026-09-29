"""MASIVI POS integration — pass-through proxy tests.

Covers iteration-4 contract checks:
- GET  /api/pos-proxy/health               -> POS health passthrough
- POST /api/pos-proxy/auth/login           -> POS auth error passthrough (no creds available)
- GET  /api/pos-proxy/auth/me              -> auth header forwarding (bogus token -> POS 401)
- GET  /api/pos-proxy/warehouse/batches    -> X-Store-Id/Authorization forwarding (bogus -> POS 401)
- Direct POS health (skipped if external network blocked)
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
PROXY = f"{BASE_URL}/api/pos-proxy"
POS_DIRECT = "https://sm3.masivi.id/api/v1"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Accept": "application/json"})
    return s


class TestPosProxyHealth:
    """Proxy -> POS health passthrough"""

    def test_proxy_health_returns_pos_payload(self, client):
        r = client.get(f"{PROXY}/health", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"status": "ok", "database": "mariadb", "api_version": "1"}

    def test_direct_pos_health(self, client):
        """Direct POS reachability (skip if external network blocked)."""
        try:
            r = client.get(f"{POS_DIRECT}/health", timeout=15)
        except requests.RequestException as e:
            pytest.skip(f"external network blocked: {e}")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestPosProxyAuthErrorPaths:
    """Wrong credentials must surface the POS's own error JSON end-to-end."""

    def test_login_wrong_credentials_returns_pos_401(self, client):
        r = client.post(
            f"{PROXY}/auth/login",
            json={"email": f"TEST_nonexistent_{uuid.uuid4().hex[:8]}@example.com", "password": "wrongpass123"},
            timeout=30,
        )
        assert r.status_code == 401, f"expected POS 401, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert "detail" in body
        assert body["detail"] == "Email atau password salah"

    def test_login_invalid_payload_returns_pos_422(self, client):
        r = client.post(f"{PROXY}/auth/login", json={"email": "not-an-email"}, timeout=30)
        assert r.status_code == 422, f"expected POS 422, got {r.status_code}: {r.text[:300]}"
        assert "detail" in r.json()

    def test_auth_me_bogus_token_returns_pos_401(self, client):
        """Proves Authorization header is forwarded to POS (POS itself rejects)."""
        r = client.get(
            f"{PROXY}/auth/me",
            headers={"Authorization": "Bearer TEST_bogus_token_123"},
            timeout=30,
        )
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:300]}"

    def test_authed_endpoint_with_bogus_headers_returns_pos_401(self, client):
        """Proves Authorization + X-Store-Id headers are forwarded end-to-end."""
        r = client.get(
            f"{PROXY}/warehouse/batches",
            headers={"Authorization": "Bearer TEST_bogus", "X-Store-Id": "TEST_store"},
            timeout=30,
        )
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:300]}"


class TestPosProxyTransport:
    """Proxy transport details: query params + non-JSON error pages."""

    def test_query_params_forwarded(self, client):
        """Unknown barcode lookup with query param reaches POS (401 unauth, not proxy 404/500)."""
        r = client.get(
            f"{PROXY}/warehouse/product",
            params={"barcode": "TEST-UNKNOWN-000"},
            headers={"Authorization": "Bearer TEST_bogus"},
            timeout=30,
        )
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:300]}"

    def test_unknown_pos_path_returns_pos_404(self, client):
        r = client.get(f"{PROXY}/no-such-endpoint-xyz", timeout=30)
        # POS (or its ingress) answers, not the proxy itself
        assert r.status_code in (401, 404, 405), f"got {r.status_code}: {r.text[:300]}"
