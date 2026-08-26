"""Iteration 3 backend tests: game detail (PUT/DELETE), stats summary, exports, and barcode lookup (local, online, invalid)."""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://game-library-hub-24.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def ensure_free_state():
    # Reset settings so scan limits don't block barcode tests
    mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mongo[os.environ.get("DB_NAME", "test_database")]
    db.settings.update_one(
        {"_id": "user_settings"},
        {"$set": {"is_premium": False, "premium_until": None, "scans_today": 0, "ai_messages_today": 0}},
        upsert=True,
    )
    yield
    mongo.close()


# ---------- Stats summary ----------
def test_stats_summary_shape(session):
    r = session.get(f"{API}/stats/summary")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["total_games", "total_spent", "average_price", "total_gifts",
              "top_platform", "by_platform", "by_box_condition", "monthly"]:
        assert k in d, f"missing {k}"
    assert isinstance(d["monthly"], list)
    assert len(d["monthly"]) == 6, "expected exactly 6 months"
    for m in d["monthly"]:
        assert "month" in m and "count" in m
    assert d["total_games"] >= 12  # seed = 12 owned games (3 more are wishlist)
    assert d["top_platform"] in d["by_platform"]


# ---------- Exports ----------
def test_export_csv(session):
    r = session.get(f"{API}/export/csv")
    assert r.status_code == 200
    assert "text/plain" in r.headers.get("content-type", "")
    text = r.text
    lines = text.strip().split("\n")
    assert lines[0].startswith("title,platform,rating,price,is_gift,in_wishlist")
    # Should have at least 1 data row per owned+wishlist game (>= 15 with seed)
    assert len(lines) >= 13  # header + 12 owned minimum


def test_export_html(session):
    r = session.get(f"{API}/export/html")
    assert r.status_code == 200
    html = r.text
    assert "Mi Colección" in html
    assert "<table" in html
    assert "Wishlist" in html


# ---------- Barcode lookup ----------
def test_lookup_barcode_local(session):
    r = session.post(f"{API}/games/lookup-barcode", json={"barcode": "711719560838"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["found"] is True
    assert d["game"]["title"] == "God of War Ragnarök"
    # Local catalog should NOT set source='upcitemdb'
    assert d["game"].get("source") != "upcitemdb"


def test_lookup_barcode_online_fallback(session):
    # Unknown to local catalog → should attempt UPCitemdb
    r = session.post(f"{API}/games/lookup-barcode", json={"barcode": "045496596224"})
    assert r.status_code == 200, r.text
    d = r.json()
    # Accept either: found=true (source=upcitemdb) OR found=false with suggestions (rate-limited)
    if d["found"]:
        assert d["game"].get("source") == "upcitemdb"
    else:
        assert isinstance(d.get("suggestions"), list)


def test_lookup_barcode_invalid(session):
    r = session.post(f"{API}/games/lookup-barcode", json={"barcode": "000000000001"})
    assert r.status_code == 200, r.text
    d = r.json()
    # Should be found=false with suggestions (invalid EAN unlikely on UPCitemdb)
    # But if UPCitemdb happens to return something, we accept that too, just verify structure
    if not d["found"]:
        assert isinstance(d["suggestions"], list)


# ---------- Game CRUD (PUT/DELETE) ----------
def test_update_and_delete_game(session):
    # Create a temp game
    payload = {"title": "TEST_iter3_game", "platform": "steam", "price": 10.0}
    r = session.post(f"{API}/games", json=payload)
    assert r.status_code == 200, r.text
    game = r.json()
    gid = game["id"]
    try:
        # PUT rating and box_condition
        r = session.put(f"{API}/games/{gid}", json={"rating": 7, "box_condition": "bien"})
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["rating"] == 7
        assert upd["box_condition"] == "bien"
        # GET verify persistence
        r = session.get(f"{API}/games/{gid}")
        assert r.status_code == 200
        assert r.json()["rating"] == 7
    finally:
        # DELETE
        r = session.delete(f"{API}/games/{gid}")
        assert r.status_code == 200
        # subsequent GET → 404
        r = session.get(f"{API}/games/{gid}")
        assert r.status_code == 404
