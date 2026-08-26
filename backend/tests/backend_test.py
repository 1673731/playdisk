"""Backend API tests for Mi Colección"""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://game-library-hub-24.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Platforms ----------
def test_list_platforms(session):
    r = session.get(f"{API}/platforms", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 7
    slugs = {p["slug"] for p in data}
    assert {"playstation", "xbox", "nintendo", "steam", "sega", "atari", "pc"}.issubset(slugs)


# ---------- Games / Stats ----------
def test_list_games(session):
    r = session.get(f"{API}/games", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 12  # non-wishlist seeded
    for g in data:
        assert g["in_wishlist"] is False
        assert "id" in g and "title" in g


def test_games_stats_total(session):
    r = session.get(f"{API}/games/stats", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 12


def test_games_stats_filtered(session):
    r = session.get(f"{API}/games/stats", params={"platform": "playstation"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["platform"] == "playstation"
    assert d["total"] == 4  # 4 non-wishlist ps titles


def test_search_god(session):
    r = session.get(f"{API}/games/search", params={"q": "god"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    titles = [g["title"] for g in data]
    assert any("God of War" in t for t in titles)


def test_ranking_sorted_desc(session):
    r = session.get(f"{API}/games/ranking", timeout=30)
    assert r.status_code == 200
    data = r.json()
    ratings = [g["rating"] for g in data]
    assert ratings == sorted(ratings, reverse=True)
    assert all(r0 > 0 for r0 in ratings)


def test_wishlist_3(session):
    r = session.get(f"{API}/wishlist", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    for g in data:
        assert g["in_wishlist"] is True


# ---------- CRUD ----------
def test_crud_game(session):
    # Create
    payload = {"title": "TEST_Game_XYZ", "platform": "pc", "rating": 7}
    r = session.post(f"{API}/games", json=payload, timeout=30)
    assert r.status_code == 200
    game = r.json()
    gid = game["id"]
    assert game["title"] == "TEST_Game_XYZ"

    # Verify via GET
    r = session.get(f"{API}/games/{gid}", timeout=30)
    assert r.status_code == 200
    assert r.json()["title"] == "TEST_Game_XYZ"

    # Update - move to wishlist then back
    r = session.put(f"{API}/games/{gid}", json={"in_wishlist": True}, timeout=30)
    assert r.status_code == 200
    assert r.json()["in_wishlist"] is True

    r = session.put(f"{API}/games/{gid}", json={"in_wishlist": False, "rating": 9}, timeout=30)
    assert r.status_code == 200
    updated = r.json()
    assert updated["in_wishlist"] is False and updated["rating"] == 9

    # Delete
    r = session.delete(f"{API}/games/{gid}", timeout=30)
    assert r.status_code == 200

    r = session.get(f"{API}/games/{gid}", timeout=30)
    assert r.status_code == 404


# ---------- Settings ----------
def test_settings_get_and_update(session):
    r = session.get(f"{API}/settings", timeout=30)
    assert r.status_code == 200
    original = r.json()["shake_to_search"]

    new_val = not original
    r = session.put(f"{API}/settings", json={"shake_to_search": new_val}, timeout=30)
    assert r.status_code == 200
    assert r.json()["shake_to_search"] == new_val

    # Verify persisted
    r = session.get(f"{API}/settings", timeout=30)
    assert r.json()["shake_to_search"] == new_val

    # Restore
    session.put(f"{API}/settings", json={"shake_to_search": original}, timeout=30)


# ---------- AI Assistant ----------
def test_assistant_chat(session):
    payload = {"session_id": "test-session-1", "message": "Hola, ¿qué juego me recomiendas hoy?"}
    r = session.post(f"{API}/assistant/chat", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reply" in data and isinstance(data["reply"], str) and len(data["reply"]) > 0
