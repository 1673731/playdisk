"""
Iteration 4 backend tests: covers new /api/games/search-online endpoint (Wikipedia)
and regression on /api/games/lookup-barcode + /api/games/{id}.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://game-library-hub-24.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- search-online (new endpoint) ----------
class TestSearchOnline:
    def _search(self, api, q, retry=1):
        for _ in range(retry + 1):
            r = api.get(f"{BASE_URL}/api/games/search-online", params={"q": q}, timeout=20)
            if r.status_code == 200 and isinstance(r.json(), list) and (q == "" or len(r.json()) > 0):
                return r
        return r

    def test_search_nioh_non_empty(self, api):
        r = self._search(api, "nioh")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, f"expected results, got {data}"
        first = data[0]
        for k in ["title", "platform", "cover_url", "description", "source"]:
            assert k in first, f"missing key {k}"
        assert first["source"] == "wikipedia"

    def test_search_nioh_3(self, api):
        r = self._search(api, "Nioh 3")
        assert r.status_code == 200
        data = r.json()
        titles = [d["title"] for d in data]
        assert any("Nioh 3" in t for t in titles), f"expected 'Nioh 3' in {titles}"

    def test_empty_query_returns_empty(self, api):
        r = api.get(f"{BASE_URL}/api/games/search-online", params={"q": ""}, timeout=15)
        assert r.status_code == 200
        assert r.json() == []

    def test_single_char_query_returns_empty(self, api):
        r = api.get(f"{BASE_URL}/api/games/search-online", params={"q": "a"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == []

    def test_platform_detection_nioh(self, api):
        r = self._search(api, "Nioh")
        data = r.json()
        # At least one item should be detected as playstation (since Nioh is PS franchise)
        platforms = [d.get("platform") for d in data]
        assert "playstation" in platforms, f"expected 'playstation' in {platforms}"

    def test_filters_out_film_album_book(self, api):
        # Query something that returns mixed results; verify no film/album/book descriptions
        r = self._search(api, "Interstellar")
        data = r.json()
        for d in data:
            desc = (d.get("description") or "").lower()
            for bad in ["film", "album", "novel", "book", "manga", "anime", "song", "band"]:
                assert bad not in desc, f"item not filtered: {d}"


# ---------- lookup-barcode regression ----------
class TestBarcodeLookup:
    def test_known_barcode(self, api):
        r = api.post(f"{BASE_URL}/api/games/lookup-barcode",
                     json={"barcode": "711719560838"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["found"] is True
        assert data["game"]["title"].lower().startswith("god of war")

    def test_unknown_barcode(self, api):
        r = api.post(f"{BASE_URL}/api/games/lookup-barcode",
                     json={"barcode": "000000000001"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["found"] is False
        assert isinstance(data.get("suggestions"), list)


# ---------- games/{id} regression: ensure search-online route did not shadow it ----------
class TestGetGameById:
    def test_get_game_by_id(self, api):
        # Get a game from list
        r = api.get(f"{BASE_URL}/api/games", timeout=15)
        assert r.status_code == 200
        games = r.json()
        assert len(games) > 0
        gid = games[0]["id"]
        r2 = api.get(f"{BASE_URL}/api/games/{gid}", timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == gid

    def test_get_game_stats_still_works(self, api):
        r = api.get(f"{BASE_URL}/api/games/stats", timeout=15)
        assert r.status_code == 200
        assert "total" in r.json()

    def test_get_ranking_still_works(self, api):
        r = api.get(f"{BASE_URL}/api/games/ranking", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_nonexistent_game_returns_404(self, api):
        r = api.get(f"{BASE_URL}/api/games/nonexistent-id-xyz", timeout=15)
        assert r.status_code == 404
