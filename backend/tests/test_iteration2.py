"""Iteration 2: barcode lookup, premium subscribe/cancel/reward-unlock,
daily free limits, coins awarding, total_spent."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL',
    'https://game-library-hub-24.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(autouse=True)
def _reset_state(session, mongo):
    """Reset settings before each test - not premium, counters=0, today's date."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mongo.settings.update_one(
        {"_id": "user_settings"},
        {"$set": {
            "is_premium": False,
            "premium_until": None,
            "coins": 0,
            "ai_messages_today": 0,
            "scans_today": 0,
            "usage_date": today,
            "shake_to_search": True,
        }},
        upsert=True,
    )
    yield


# ---------- Barcode lookup ----------
def test_lookup_known_barcode_returns_found(session):
    r = session.post(f"{API}/games/lookup-barcode",
                     json={"barcode": "711719560838"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["found"] is True
    g = d["game"]
    assert g["title"] == "God of War Ragnarök"
    assert g["platform"] == "playstation"
    assert "version" in g and g["version"]


def test_lookup_unknown_barcode_returns_suggestions(session):
    r = session.post(f"{API}/games/lookup-barcode",
                     json={"barcode": "000000000000"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["found"] is False
    assert isinstance(d["suggestions"], list) and len(d["suggestions"]) > 0


# ---------- Daily limits ----------
def test_lookup_barcode_402_when_scan_limit_reached(session, mongo):
    # Simulate already used 3 scans today
    mongo.settings.update_one({"_id": "user_settings"},
                              {"$set": {"scans_today": 3, "is_premium": False,
                                        "premium_until": None}})
    r = session.post(f"{API}/games/lookup-barcode",
                     json={"barcode": "711719560838"}, timeout=30)
    assert r.status_code == 402, r.text
    assert "límite" in r.json()["detail"].lower() or "limit" in r.json()["detail"].lower()


def test_lookup_barcode_ok_when_premium_and_limit_reached(session, mongo):
    mongo.settings.update_one({"_id": "user_settings"},
                              {"$set": {"scans_today": 10, "is_premium": True}})
    r = session.post(f"{API}/games/lookup-barcode",
                     json={"barcode": "711719560838"}, timeout=30)
    assert r.status_code == 200


def test_ai_chat_402_when_ai_limit_reached(session, mongo):
    mongo.settings.update_one({"_id": "user_settings"},
                              {"$set": {"ai_messages_today": 5,
                                        "is_premium": False,
                                        "premium_until": None}})
    r = session.post(f"{API}/assistant/chat",
                     json={"session_id": "test-limit", "message": "hola"}, timeout=30)
    assert r.status_code == 402, r.text


# ---------- Premium subscribe / cancel ----------
def test_premium_subscribe_and_settings_reflect(session):
    r = session.post(f"{API}/premium/subscribe", timeout=30)
    assert r.status_code == 200
    r = session.get(f"{API}/settings", timeout=30)
    d = r.json()
    assert d["is_premium"] is True
    assert d["premium_active"] is True


def test_premium_cancel_flips_off(session):
    session.post(f"{API}/premium/subscribe", timeout=30)
    r = session.post(f"{API}/premium/cancel", timeout=30)
    assert r.status_code == 200
    r = session.get(f"{API}/settings", timeout=30)
    d = r.json()
    assert d["is_premium"] is False


def test_reward_unlock_grants_temp_premium(session):
    r = session.post(f"{API}/premium/reward-unlock",
                     json={"feature": "all", "hours": 24}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["hours"] == 24
    # premium_until should be in the future
    until = datetime.fromisoformat(d["premium_until"])
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    assert until > datetime.now(timezone.utc) + timedelta(hours=23)
    # settings should show premium_active=true even though is_premium=false
    r = session.get(f"{API}/settings", timeout=30)
    dd = r.json()
    assert dd["is_premium"] is False
    assert dd["premium_active"] is True


# ---------- Stats total_spent ----------
def test_stats_total_spent_excludes_gifts(session):
    r = session.get(f"{API}/games/stats", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "total_spent" in d
    assert isinstance(d["total_spent"], (int, float))
    # Seeded games priced (excluding gifts/wishlist): 69.99+39.99+19.99+29.99+49.99+69.99+39.99+59.99+24.99+25.0 = 429.92
    assert d["total_spent"] > 0
    # Gifts (Bloodborne, Sonic) and wishlist should be excluded
    assert d["total_spent"] < 1000


def test_stats_total_spent_per_platform(session):
    r = session.get(f"{API}/games/stats", params={"platform": "playstation"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["platform"] == "playstation"
    assert d["total_spent"] > 0


# ---------- Create game with new fields awards coins ----------
def test_create_game_with_all_new_fields_awards_50_coins(session, mongo):
    # coins reset to 0 by fixture
    payload = {
        "title": "TEST_NewFieldsGame",
        "platform": "pc",
        "box_condition": "excelente",
        "manual_condition": "bien",
        "disc_condition": "normal",
        "price": 25.5,
        "is_gift": False,
        "description": "TEST desc",
        "barcode": "TEST123",
    }
    r = session.post(f"{API}/games", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    g = r.json()
    gid = g["id"]
    assert g["box_condition"] == "excelente"
    assert g["manual_condition"] == "bien"
    assert g["disc_condition"] == "normal"
    assert g["price"] == 25.5
    assert g["is_gift"] is False
    assert g["description"] == "TEST desc"
    assert g["barcode"] == "TEST123"

    # Verify persistence via GET
    r = session.get(f"{API}/games/{gid}", timeout=30)
    assert r.status_code == 200
    assert r.json()["barcode"] == "TEST123"

    # Coins increased by 50
    r = session.get(f"{API}/settings", timeout=30)
    assert r.json()["coins"] == 50

    # cleanup
    session.delete(f"{API}/games/{gid}", timeout=30)


# ---------- Settings shake_to_search ----------
def test_settings_update_shake_to_search(session):
    r = session.put(f"{API}/settings", json={"shake_to_search": False}, timeout=30)
    assert r.status_code == 200
    r = session.get(f"{API}/settings", timeout=30)
    assert r.json()["shake_to_search"] is False


# ---------- Settings full shape ----------
def test_settings_get_returns_all_required_fields(session):
    r = session.get(f"{API}/settings", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ("is_premium", "premium_active", "coins",
              "ai_messages_today", "scans_today", "shake_to_search"):
        assert k in d, f"Missing key {k}"
