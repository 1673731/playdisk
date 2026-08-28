from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query
import secrets
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from fastapi.responses import PlainTextResponse, HTMLResponse
import re

# HEMOS COMENTADO ESTO PARA QUE NO DE ERROR AL FALTAR EL PAQUETE EN WINDOWS
# from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==========================================
# Credenciales: se leen SIEMPRE de variables de entorno (.env en local,
# o las Environment Variables del hosting en producción). Nunca se escriben
# aquí en claro — si faltan, la app avisa en el arranque en vez de fallar
# en silencio con un `None`.
# ==========================================
mongo_url = os.environ.get("MONGO_URL")
IGDB_CLIENT_ID = os.environ.get("IGDB_CLIENT_ID")
IGDB_CLIENT_SECRET = os.environ.get("IGDB_CLIENT_SECRET")

if not mongo_url:
    raise RuntimeError(
        "Falta MONGO_URL en tu .env (backend/.env). Copia backend/.env.example a "
        "backend/.env y rellénalo con tus credenciales reales."
    )
if not IGDB_CLIENT_ID or not IGDB_CLIENT_SECRET:
    logger.warning(
        "Faltan IGDB_CLIENT_ID / IGDB_CLIENT_SECRET en tu .env. "
        "La búsqueda por IGDB no funcionará hasta que los añadas."
    )

client = AsyncIOMotorClient(mongo_url)
db = client["bixuthings_db_user"]

# ==========================================
# Autenticación básica del backend
# App de un solo usuario: se protege con una API key compartida (no login
# completo). El móvil manda la clave en la cabecera X-API-Key en cada
# petición; sin ella, ninguna ruta de /api responde.
# ==========================================
API_KEY = os.environ.get("API_KEY")
if not API_KEY:
    raise RuntimeError(
        "Falta API_KEY en tu .env (backend/.env). Genera una con:\n"
        "  python -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
        "y ponla como API_KEY=... en backend/.env (y la misma en el frontend)."
    )

async def verify_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    api_key: Optional[str] = Query(None, alias="api_key"),
):
    # Se acepta por cabecera (uso normal desde la app) o por query param
    # (para poder abrir /api/export/html directamente en un navegador).
    provided = x_api_key or api_key
    if not provided or not secrets.compare_digest(provided, API_KEY):
        raise HTTPException(status_code=401, detail="API key inválida o ausente")

app = FastAPI()
api_router = APIRouter(prefix="/api", dependencies=[Depends(verify_api_key)])

igdb_token = None

# ---------- Models ----------
Condition = str

class Platform(BaseModel):
    id: str
    slug: str
    name: str
    icon: str
    color: str

class Game(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    platform: str
    cover_url: Optional[str] = None
    notes: Optional[str] = ""
    rating: Optional[int] = 0
    in_wishlist: bool = False
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    box_condition: Optional[str] = None
    manual_condition: Optional[str] = None
    disc_condition: Optional[str] = None
    price: Optional[float] = None
    is_gift: bool = False
    description: Optional[str] = ""
    barcode: Optional[str] = None
    is_steelbook: bool = False
    version: Optional[str] = None
    rank_order: Optional[int] = None
    # Calculados automáticamente a partir de 'version' (o 'platform' si no
    # hay version guardada), para que Biblioteca/Inicio/Ranking puedan
    # mostrar el mismo icono, color y siglas específicos de consola que ya
    # se ven en el buscador — no se guardan en la base de datos, se
    # recalculan al servir cada juego (ver attach_console_badge()).
    console_icon: Optional[str] = None
    console_color: Optional[str] = None
    console_badge: Optional[str] = None

class GameCreate(BaseModel):
    title: str
    platform: str
    cover_url: Optional[str] = None
    notes: Optional[str] = ""
    rating: Optional[int] = 0
    in_wishlist: bool = False
    box_condition: Optional[str] = None
    manual_condition: Optional[str] = None
    disc_condition: Optional[str] = None
    price: Optional[float] = None
    is_gift: bool = False
    description: Optional[str] = ""
    barcode: Optional[str] = None
    is_steelbook: bool = False
    version: Optional[str] = None

class GameUpdate(BaseModel):
    title: Optional[str] = None
    platform: Optional[str] = None
    cover_url: Optional[str] = None
    notes: Optional[str] = None
    rating: Optional[int] = None
    in_wishlist: Optional[bool] = None
    box_condition: Optional[str] = None
    manual_condition: Optional[str] = None
    disc_condition: Optional[str] = None
    price: Optional[float] = None
    is_gift: Optional[bool] = None
    description: Optional[str] = None
    is_steelbook: Optional[bool] = None
    version: Optional[str] = None
    rank_order: Optional[int] = None

class Settings(BaseModel):
    shake_to_search: bool = True
    is_premium: bool = False
    premium_until: Optional[str] = None
    coins: int = 0
    ai_messages_today: int = 0
    scans_today: int = 0
    usage_date: Optional[str] = None

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    reply: str

class BarcodeRequest(BaseModel):
    barcode: str

class BarcodeLookupResponse(BaseModel):
    found: bool
    game: Optional[dict] = None
    suggestions: List[dict] = []

class BarcodeEntry(BaseModel):
    barcode: str
    title: str
    platform: str
    cover_url: Optional[str] = None
    version: Optional[str] = None
    source: Optional[str] = None  # "seed" | "online_auto" | "user_confirmed"

class BarcodeImportRequest(BaseModel):
    entries: List[BarcodeEntry]
    overwrite: bool = False  # si False, no pisa entradas ya existentes (por si las corregiste a mano)

class BarcodeImportResult(BaseModel):
    inserted: int
    updated: int
    skipped: int
    total: int

class RewardUnlockRequest(BaseModel):
    feature: str
    hours: int = 24

# ---------- Seed ----------
PLATFORMS_SEED = [
    {"id": "playstation", "slug": "playstation", "name": "PlayStation", "icon": "sony-playstation", "color": "#0070D1"},
    {"id": "xbox", "slug": "xbox", "name": "Xbox", "icon": "microsoft-xbox", "color": "#107C10"},
    {"id": "nintendo", "slug": "nintendo", "name": "Nintendo", "icon": "nintendo-switch", "color": "#E60012"},
    {"id": "steam", "slug": "steam", "name": "Steam", "icon": "steam", "color": "#66C0F4"},
    {"id": "sega", "slug": "sega", "name": "Sega", "icon": "controller-classic", "color": "#0055A4"},
    {"id": "atari", "slug": "atari", "name": "Atari", "icon": "gamepad-variant", "color": "#E41E2B"},
    {"id": "pc", "slug": "pc", "name": "PC", "icon": "desktop-classic", "color": "#8B5CF6"},
]

BARCODE_CATALOG = [
    {"barcode": "711719541363", "title": "God of War", "platform": "playstation", "cover_url": "https://image.api.playstation.com/cdn/UP9000/CUSA07408_00/QN2gy5RCwUmw7oQGRoemQKgxYPQK1e4G.png", "version": "PS4 - Estándar"},
    {"barcode": "711719560838", "title": "God of War Ragnarök", "platform": "playstation", "cover_url": "https://image.api.playstation.com/vulcan/ap/rnd/202207/1210/4xJ8XB3bi888QTLZYdl7Oi0s.png", "version": "PS5 - Estándar"},
    {"barcode": "711719377894", "title": "The Last of Us Part II", "platform": "playstation", "cover_url": "https://image.api.playstation.com/vulcan/img/rnd/202206/0720/eEczyEMDd2BLa3dtkGJVE9Id.png", "version": "PS4 - Estándar"},
    {"barcode": "711719523277", "title": "Bloodborne", "platform": "playstation", "cover_url": "https://image.api.playstation.com/cdn/UP9000/CUSA00207_00/9AHYuU72GYzKQxLXjrPz.png", "version": "PS4 - Estándar"},
    {"barcode": "711719811718", "title": "Sly Cooper: Ladrones en el Tiempo", "platform": "playstation", "cover_url": "https://upload.wikimedia.org/wikipedia/en/8/8e/Sly_Cooper_Thieves_in_Time_cover.jpg", "version": "PS Vita - Estándar"},
]

GAMES_SEED = []

@app.on_event("startup")
async def seed_data():
    for p in PLATFORMS_SEED:
        await db.platforms.update_one({"slug": p["slug"]}, {"$set": p}, upsert=True)
    for b in BARCODE_CATALOG:
        await db.barcodes.update_one({"barcode": b["barcode"]}, {"$set": b}, upsert=True)
    
    count = await db.games.count_documents({})
    if count == 0:
        now = datetime.now(timezone.utc)
        for i, g in enumerate(GAMES_SEED):
            game = Game(
                title=g["title"],
                platform=g["platform"],
                cover_url=g.get("cover_url"),
                rating=g.get("rating", 0),
                in_wishlist=g.get("in_wishlist", False),
                added_at=(now - timedelta(days=i)).isoformat(),
                box_condition=g.get("box_condition"),
                manual_condition=g.get("manual_condition"),
                disc_condition=g.get("disc_condition"),
                price=g.get("price"),
                is_gift=g.get("is_gift", False),
            )
            await db.games.insert_one(game.dict())

    existing = await db.settings.find_one({"_id": "user_settings"})
    if not existing:
        await db.settings.insert_one({
            "_id": "user_settings",
            "shake_to_search": True,
            "is_premium": False,
            "premium_until": None,
            "coins": 0,
            "ai_messages_today": 0,
            "scans_today": 0,
            "usage_date": None,
        })

# ---------- Helpers ----------
def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

async def get_settings_doc() -> dict:
    doc = await db.settings.find_one({"_id": "user_settings"})
    if not doc:
        doc = {"_id": "user_settings", "shake_to_search": True, "is_premium": False,
               "premium_until": None, "coins": 0, "ai_messages_today": 0,
               "scans_today": 0, "usage_date": None}
        await db.settings.insert_one(doc)
    return doc

def is_premium_active(doc: dict) -> bool:
    if doc.get("is_premium"):
        return True
    pu = doc.get("premium_until")
    if pu:
        try:
            dt = datetime.fromisoformat(pu)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt > datetime.now(timezone.utc)
        except Exception:
            return False
    return False

async def reset_daily_if_needed(doc: dict) -> dict:
    today = today_str()
    if doc.get("usage_date") != today:
        await db.settings.update_one(
            {"_id": "user_settings"},
            {"$set": {"usage_date": today, "ai_messages_today": 0, "scans_today": 0}}
        )
        doc["usage_date"] = today
        doc["ai_messages_today"] = 0
        doc["scans_today"] = 0
    return doc

FREE_AI_LIMIT = 5
FREE_SCAN_LIMIT = 3

# ---------- IGDB API Helpers ----------
async def get_igdb_token():
    global igdb_token
    if igdb_token: 
        return igdb_token
    
    url = f"https://id.twitch.tv/oauth2/token?client_id={IGDB_CLIENT_ID}&client_secret={IGDB_CLIENT_SECRET}&grant_type=client_credentials"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(url)
            if r.status_code == 200:
                igdb_token = r.json().get("access_token")
                return igdb_token
    except Exception as e:
        logger.warning("Error obteniendo token IGDB: %s", e)
    return None

async def get_igdb_data(title: str):
    token = await get_igdb_token()
    if not token: 
        return None

    url = "https://api.igdb.com/v4/games"
    headers = {
        "Client-ID": IGDB_CLIENT_ID,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    body = f'search "{title}"; fields name, cover.url; limit 1;'
    
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(url, headers=headers, data=body)
            if r.status_code == 200 and len(r.json()) > 0:
                game_data = r.json()[0]
                
                cover_url = None
                if "cover" in game_data and "url" in game_data["cover"]:
                    raw_url = game_data["cover"]["url"]
                    cover_url = "https:" + raw_url.replace("t_thumb", "t_cover_big")
                
                return {
                    "title": game_data.get("name"),
                    "cover_url": cover_url
                }
    except Exception as e:
        logger.warning("Error consultando IGDB: %s", e)
    return None

# Cuando IGDB devuelve varias plataformas para un mismo juego (reediciones,
# remasters, colecciones...), antes cogíamos las 2 primeras del array tal
# cual las devolvía IGDB, sin ningún orden de relevancia. Esto mezclaba
# sistemas históricos oscuros (Famicom Disk System, Satellaview...) con
# otros modernos, y el icono acababa sin relación real con el texto. Ahora
# elegimos UNA sola plataforma, priorizando la más moderna/reconocible.
PLATFORM_DISPLAY_PRIORITY = [
    "nintendo switch 2", "nintendo switch", "playstation 5", "playstation 4",
    "xbox series", "xbox one", "pc (microsoft windows)", "playstation 3",
    "xbox 360", "wii u", "nintendo 3ds", "playstation vita", "wii",
    "playstation 2", "playstation", "psp", "gamecube", "nintendo 64",
    "game boy advance", "game boy color", "game boy", "super nintendo",
    "nes", "sega genesis", "sega saturn", "dreamcast", "atari",
]

def pick_best_platform_name(platform_names: list) -> str:
    """Elige una única plataforma representativa entre todas las que trae
    el juego, según PLATFORM_DISPLAY_PRIORITY. Si ninguna coincide con la
    lista de prioridad, se queda con la primera que haya."""
    if not platform_names:
        return "Desconocido"
    lowered = [p.lower() for p in platform_names]
    for wanted in PLATFORM_DISPLAY_PRIORITY:
        for i, p in enumerate(lowered):
            if wanted in p:
                return platform_names[i]
    return platform_names[0]

# Icono y color específicos por consola concreta (no solo por fabricante),
# para que al buscar salga una tarjeta por cada versión/plataforma con su
# logo correcto, en vez de mezclarlas todas en una. Los iconos disponibles
# en MaterialCommunityIcons son limitados para consolas retro, así que
# usamos el más parecido disponible + un color propio para diferenciarlas
# visualmente aunque compartan icono genérico.
CONSOLE_ICON_RULES = [
    # (patrón en el nombre de la plataforma, icono, color, slug de familia, siglas)
    # Las "siglas" son la forma de dar identidad única a cada consola sin
    # reproducir su logotipo oficial (que es marca registrada de cada
    # fabricante): icono + color + siglas cortas, mostradas como una
    # pequeña etiqueta junto al icono.

    # --- Nintendo ---
    (r"switch\s*2", "nintendo-switch", "#E60012", "nintendo", "SW2"),
    (r"switch", "nintendo-switch", "#E60012", "nintendo", "SWITCH"),
    (r"wii\s*u", "nintendo-wiiu", "#009AC7", "nintendo", "WII U"),
    (r"\bwii\b", "nintendo-wii", "#8B8B8B", "nintendo", "WII"),
    (r"game\s*boy\s*advance", "nintendo-game-boy", "#5A2D91", "nintendo", "GBA"),
    (r"game\s*boy\s*color", "nintendo-game-boy", "#E60012", "nintendo", "GBC"),
    (r"game\s*boy", "nintendo-game-boy", "#8B8B8B", "nintendo", "GB"),
    (r"new\s*nintendo\s*3ds|n3ds", "gamepad-variant", "#D4213D", "nintendo", "N3DS"),
    (r"\b3ds\b", "gamepad-variant", "#D4213D", "nintendo", "3DS"),
    (r"\b2ds\b", "gamepad-variant", "#D4213D", "nintendo", "2DS"),
    (r"nintendo\s*ds|(?<!x)\bds\b", "gamepad-variant", "#8B8B8B", "nintendo", "DS"),
    (r"gamecube", "gamepad-variant", "#6A5ACD", "nintendo", "GC"),
    (r"nintendo\s*64|\bn64\b", "gamepad-variant", "#007A33", "nintendo", "N64"),
    (r"super\s*nintendo|\bsnes\b|super\s*famicom", "gamepad-variant", "#8E44AD", "nintendo", "SNES"),
    (r"famicom\s*disk", "floppy-variant", "#C0392B", "nintendo", "FDS"),
    (r"famicom|\bnes\b", "gamepad-variant", "#C0392B", "nintendo", "NES"),
    (r"satellaview", "gamepad-variant", "#7F8C8D", "nintendo", "BS-X"),
    (r"virtual\s*boy", "gamepad-variant", "#8B0000", "nintendo", "VB"),
    (r"pokemon\s*mini|pok[eé]mon\s*mini", "gamepad-variant", "#FFCB05", "nintendo", "P-MINI"),

    # --- PlayStation ---
    (r"playstation\s*5|\bps5\b", "sony-playstation", "#0070D1", "playstation", "PS5"),
    (r"playstation\s*4|\bps4\b", "sony-playstation", "#0070D1", "playstation", "PS4"),
    (r"playstation\s*3|\bps3\b", "sony-playstation", "#003791", "playstation", "PS3"),
    (r"playstation\s*2|\bps2\b", "sony-playstation", "#003791", "playstation", "PS2"),
    (r"ps\s*vita|psvita", "sony-playstation", "#0070D1", "playstation", "VITA"),
    (r"\bpsp\b", "sony-playstation", "#0070D1", "playstation", "PSP"),
    (r"playstation(?!\s*[2345])", "sony-playstation", "#003791", "playstation", "PS1"),

    # --- Xbox ---
    (r"xbox\s*series\s*x", "microsoft-xbox", "#107C10", "xbox", "SERIES X"),
    (r"xbox\s*series\s*s", "microsoft-xbox", "#107C10", "xbox", "SERIES S"),
    (r"xbox\s*series", "microsoft-xbox", "#107C10", "xbox", "SERIES"),
    (r"xbox\s*one", "microsoft-xbox", "#107C10", "xbox", "ONE"),
    (r"xbox\s*360", "microsoft-xbox", "#107C10", "xbox", "360"),
    (r"\bxbox\b", "microsoft-xbox", "#107C10", "xbox", "XBOX"),

    # --- Sega ---
    (r"dreamcast", "controller-classic", "#FF6600", "sega", "DC"),
    (r"sega\s*saturn|\bsaturn\b", "controller-classic", "#00529B", "sega", "SATURN"),
    (r"mega\s*drive|megadrive|sega\s*genesis|\bgenesis\b", "controller-classic", "#0055A4", "sega", "GENESIS"),
    (r"game\s*gear", "controller-classic", "#0055A4", "sega", "GG"),
    (r"master\s*system", "controller-classic", "#0055A4", "sega", "SMS"),
    (r"sega\s*32x|\b32x\b", "controller-classic", "#0055A4", "sega", "32X"),
    (r"sega\s*cd|mega\s*cd", "controller-classic", "#0055A4", "sega", "MEGA CD"),
    (r"sg-?1000", "controller-classic", "#0055A4", "sega", "SG-1000"),

    # --- Atari ---
    (r"atari\s*2600", "gamepad-variant", "#E41E2B", "atari", "2600"),
    (r"atari\s*5200", "gamepad-variant", "#E41E2B", "atari", "5200"),
    (r"atari\s*7800", "gamepad-variant", "#E41E2B", "atari", "7800"),
    (r"atari\s*jaguar|jaguar", "gamepad-variant", "#E41E2B", "atari", "JAGUAR"),
    (r"atari\s*lynx|lynx", "gamepad-variant", "#E41E2B", "atari", "LYNX"),
    (r"atari\s*st", "desktop-classic", "#E41E2B", "atari", "ATARI ST"),
    (r"atari", "gamepad-variant", "#E41E2B", "atari", "ATARI"),

    # --- PC / Steam ---
    (r"\bsteam\b", "steam", "#66C0F4", "steam", "STEAM"),
    (r"pc\s*\(microsoft windows\)|\bwindows\b|\bpc\b|linux|\bmac\b", "desktop-classic", "#8B5CF6", "pc", "PC"),

    # --- Otras marcas menos comunes pero que existen en IGDB ---
    (r"3do", "gamepad-variant", "#4A90D9", "otros", "3DO"),
    (r"neo\s*geo\s*pocket", "gamepad-variant", "#000000", "otros", "NGP"),
    (r"neo\s*geo", "gamepad-variant", "#000000", "otros", "NEO GEO"),
    (r"turbografx|pc\s*engine", "gamepad-variant", "#F5A623", "otros", "TG-16"),
    (r"wonderswan", "gamepad-variant", "#5A5A5A", "otros", "WSWAN"),
    (r"commodore\s*64|\bc64\b", "desktop-classic", "#5C4C9F", "otros", "C64"),
    (r"amiga", "desktop-classic", "#5C4C9F", "otros", "AMIGA"),
    (r"msx", "desktop-classic", "#B71C1C", "otros", "MSX"),
    (r"colecovision", "gamepad-variant", "#D32F2F", "otros", "COLECO"),
    (r"intellivision", "gamepad-variant", "#8B4513", "otros", "INTV"),
    (r"ouya", "gamepad-variant", "#666666", "otros", "OUYA"),
    (r"android", "cellphone", "#3DDC84", "otros", "ANDROID"),
    (r"\bios\b|iphone|ipad", "cellphone", "#999999", "otros", "IOS"),
]

# Plataformas que, por su propia naturaleza, nunca han tenido formato
# físico (navegador, streaming en la nube, móvil, VR...). Esta app cataloga
# copias físicas, así que las excluimos de los resultados de búsqueda.
DIGITAL_ONLY_PLATFORM_PATTERNS = [
    r"browser", r"web browser", r"google\s*stadia", r"amazon\s*luna",
    r"facebook\s*gameroom", r"oculus", r"meta\s*quest", r"\bvr\b",
    r"playstation\s*vr", r"\bouya\b", r"\bios\b", r"\bandroid\b",
    r"windows\s*phone", r"apple\s*arcade", r"itch\.io", r"\bmobile\b",
    r"blackberry", r"legacy\s*mobile\s*device", r"n-gage", r"java\s*me",
    r"digiblast", r"onlive", r"gakken\s*compact\s*vision",
]

def is_digital_only_platform(platform_name: str) -> bool:
    t = (platform_name or "").lower()
    return any(re.search(p, t) for p in DIGITAL_ONLY_PLATFORM_PATTERNS)

def console_icon_for(platform_name: str):
    """Devuelve (icon, color, family_slug, badge) para una plataforma
    concreta. El 'badge' son las siglas cortas de la consola exacta,
    para darle identidad única sin reproducir el logotipo oficial de la
    marca (que es marca registrada de cada fabricante)."""
    t = (platform_name or "").lower()
    for pattern, icon, color, family, badge in CONSOLE_ICON_RULES:
        if re.search(pattern, t):
            return icon, color, family, badge
    fam = guess_platform_from_text(platform_name) or "playstation"
    fallback_badge = (platform_name or "?").strip()[:8].upper() or "?"
    return "gamepad-variant", "#888888", fam, fallback_badge

def attach_console_badge(doc: dict) -> dict:
    """Rellena console_icon/console_color/console_badge de un documento de
    juego, calculándolos a partir de 'version' (el nombre exacto de consola
    guardado al añadir el juego) o, si no hay version, a partir de
    'platform' (la familia genérica). Se llama justo antes de construir el
    modelo Game en cualquier endpoint que devuelva juegos, para que
    Biblioteca/Inicio/Ranking muestren el mismo icono específico de consola
    que ya se ve en el buscador."""
    source_text = doc.get("version") or doc.get("platform") or ""
    icon, color, _family, badge = console_icon_for(source_text)
    doc["console_icon"] = icon
    doc["console_color"] = color
    doc["console_badge"] = badge
    return doc

# ---------- Barcode & Consoles Cleaner ----------
GAME_KEYWORDS = ["video game", "videojuego", "playstation", "xbox", "nintendo", "switch", "ps4", "ps5", "ps3", "ps2", "psp", "vita", "gameboy", "steam", "sega", "genesis", "megadrive", "wii", "3ds", "atari", "gamecube"]

def guess_platform_from_text(text: str) -> Optional[str]:
    t = (text or "").lower()
    if any(k in t for k in ["playstation", "ps5", "ps4", "ps3", "ps2", "psp", "ps vita"]): return "playstation"
    if any(k in t for k in ["xbox"]): return "xbox"
    if any(k in t for k in ["nintendo", "switch", "wii", "3ds", "gameboy", "game boy", "gamecube"]): return "nintendo"
    if "steam" in t: return "steam"
    if any(k in t for k in ["sega", "genesis", "megadrive", "mega drive", "dreamcast"]): return "sega"
    if "atari" in t: return "atari"
    return None

# Consola concreta (para el campo "version"), ordenada de más específica a
# más genérica para que "nintendo 3ds" no se quede matcheando solo "nintendo".
CONSOLE_VERSION_PATTERNS = [
    (r"nintendo\s*switch\s*2", "Nintendo Switch 2"),
    (r"nintendo\s*switch|switch", "Nintendo Switch"),
    (r"nintendo\s*3ds|3ds", "Nintendo 3DS"),
    (r"nintendo\s*2ds|2ds", "Nintendo 2DS"),
    (r"nintendo\s*ds|(?<!x)\bds\b", "Nintendo DS"),
    (r"wii\s*u", "Wii U"),
    (r"\bwii\b", "Wii"),
    (r"gamecube", "GameCube"),
    (r"nintendo\s*64|\bn64\b", "Nintendo 64"),
    (r"super\s*nintendo|\bsnes\b", "Super Nintendo"),
    (r"\bnes\b", "NES"),
    (r"game\s*boy\s*advance|\bgba\b", "Game Boy Advance"),
    (r"game\s*boy\s*color|\bgbc\b", "Game Boy Color"),
    (r"game\s*boy|gameboy", "Game Boy"),
    (r"playstation\s*5|\bps5\b", "PS5"),
    (r"playstation\s*4|\bps4\b", "PS4"),
    (r"playstation\s*3|\bps3\b", "PS3"),
    (r"ps\s*vita|psvita", "PS Vita"),
    (r"\bpsp\b", "PSP"),
    (r"playstation\s*2|\bps2\b", "PS2"),
    (r"playstation(?!\s*[345])", "PS1"),
    (r"xbox\s*series\s*x", "Xbox Series X"),
    (r"xbox\s*series\s*s", "Xbox Series S"),
    (r"xbox\s*one", "Xbox One"),
    (r"xbox\s*360", "Xbox 360"),
    (r"\bxbox\b", "Xbox"),
    (r"dreamcast", "Dreamcast"),
    (r"sega\s*saturn|\bsaturn\b", "Sega Saturn"),
    (r"mega\s*drive|megadrive", "Mega Drive"),
    (r"sega\s*genesis|\bgenesis\b", "Genesis"),
    (r"game\s*gear", "Game Gear"),
    (r"master\s*system", "Master System"),
]

def guess_console_version_from_text(text: str) -> Optional[str]:
    """Detecta la consola CONCRETA (3DS, Switch, PS4...) a partir de un texto
    libre, para rellenar el campo 'version'. Es más específico que
    guess_platform_from_text, que solo devuelve la familia (nintendo, sony...)."""
    t = (text or "").lower()
    for pattern, label in CONSOLE_VERSION_PATTERNS:
        if re.search(pattern, t):
            return label
    return None

def clean_game_title(title: str) -> str:
    title = title.lower()
    consoles = [
        "playstation 5", "playstation 4", "playstation 3", "playstation 2", "playstation", 
        "ps5", "ps4", "ps3", "ps2", "ps1", "psx", "psp", "ps vita", "psvita",
        "xbox series x", "xbox series s", "xbox series", "xbox one", "xbox 360", "xbox",
        "nintendo switch", "switch", "wii u", "wii", "gamecube", "nintendo 64", "n64", 
        "super nintendo", "snes", "nintendo entertainment system", "nes", "nintendo",
        "nintendo 3ds", "3ds", "nintendo 2ds", "2ds", "nintendo ds", "ds",
        "game boy advance", "gba", "game boy color", "gbc", "game boy", "gameboy",
        "sega saturn", "saturn", "mega drive", "megadrive", "sega genesis", "genesis", 
        "master system", "dreamcast", "game gear", "sega",
        "neo geo", "neogeo", "neo geo pocket",
        "atari 2600", "atari 7800", "atari", 
        "pc", "windows", "mac", "linux"
    ]
    for c in consoles:
        title = re.sub(rf'\b{re.escape(c)}\b', '', title)
    return re.sub(r'\s+', ' ', title).strip()

def barcode_variants(barcode: str) -> List[str]:
    """Genera variantes plausibles del mismo código de barras.
    Muchos 'no encontrados' son en realidad el mismo producto con un
    formato distinto (EAN-13 con/sin el 0 inicial, UPC-A vs EAN-13, etc.)."""
    code = (barcode or "").strip()
    variants = [code]
    if code.isdigit():
        if len(code) == 13 and code.startswith("0") and code[1:] not in variants:
            variants.append(code[1:])  # EAN-13 -> UPC-A (12 dígitos)
        if len(code) == 12:
            padded = "0" + code
            if padded not in variants:
                variants.append(padded)  # UPC-A -> EAN-13 (13 dígitos)
    return variants


async def _upcitemdb_single(barcode: str) -> Optional[dict]:
    url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
    try:
        async with httpx.AsyncClient(timeout=6.0) as ax:
            r = await ax.get(url, headers={"Accept": "application/json"})
        if r.status_code != 200:
            return None
        data = r.json()
        items = data.get("items") or []
        if not items:
            return None

        best = None
        for it in items:
            haystack = " ".join([
                (it.get("title") or ""),
                (it.get("brand") or ""),
                (it.get("category") or ""),
                " ".join(it.get("model", "") if isinstance(it.get("model"), list) else [it.get("model") or ""]),
            ]).lower()
            if any(k in haystack for k in GAME_KEYWORDS):
                best = it
                break

        item = best or items[0]
        base_title = item.get("title") or ""
        cover = None
        imgs = item.get("images") or []
        if imgs:
            cover = imgs[0]
        return {
            "base_title": base_title,
            "category": item.get("category") or "",
            "brand": item.get("brand") or "",
            "cover": cover,
        }
    except Exception as e:
        logger.warning("UPCitemdb lookup failed for %s: %s", barcode, e)
        return None


async def barcode_monster_lookup(barcode: str) -> Optional[dict]:
    """Proveedor de respaldo, gratuito y sin API key. Se usa solo si
    upcitemdb no encuentra nada, para no depender de un único origen."""
    url = f"https://barcode.monster/api/{barcode}"
    try:
        async with httpx.AsyncClient(timeout=6.0) as ax:
            r = await ax.get(url, headers={"Accept": "application/json"})
        if r.status_code != 200:
            return None
        data = r.json()
        base_title = data.get("description") or data.get("title") or ""
        if not base_title:
            return None
        return {"base_title": base_title, "category": "", "brand": "", "cover": None}
    except Exception as e:
        logger.warning("barcode.monster lookup failed for %s: %s", barcode, e)
        return None


async def upcitemdb_lookup(barcode: str) -> Optional[dict]:
    raw = None
    matched_barcode = barcode
    # 1. Probar el código tal cual y sus variantes de formato en upcitemdb
    for variant in barcode_variants(barcode):
        raw = await _upcitemdb_single(variant)
        if raw:
            matched_barcode = variant
            break

    # 2. Si upcitemdb no ha dado nada, probar un segundo proveedor
    if not raw:
        for variant in barcode_variants(barcode):
            raw = await barcode_monster_lookup(variant)
            if raw:
                matched_barcode = variant
                break

    if not raw:
        return None

    base_title = raw["base_title"]
    print(f"\n📌 CÓDIGO ESCANEADO: {barcode} (match: {matched_barcode}) --> TÍTULO DEVUELTO: {base_title}\n")
    haystack = base_title + " " + raw["category"] + " " + raw["brand"]
    platform = guess_platform_from_text(haystack)
    # Consola concreta detectada del texto (ej. "Nintendo 3DS"), en vez de
    # usar directamente raw["brand"], que suele ser solo el fabricante
    # genérico ("Nintendo") y no distingue 3DS de Switch de Wii, etc.
    console_version = guess_console_version_from_text(haystack)

    final_title = base_title
    final_cover = raw["cover"]

    if base_title:
        clean_title = clean_game_title(base_title)
        igdb_info = await get_igdb_data(clean_title)
        if igdb_info:
            final_title = igdb_info["title"] or base_title
            final_cover = igdb_info["cover_url"] or raw["cover"]

    return {
        "barcode": barcode,
        "title": final_title.strip() or f"Juego {barcode}",
        "platform": platform or "playstation",
        "cover_url": final_cover,
        "version": console_version or raw["brand"] or None,
        "source": "upcitemdb + igdb",
    }

# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Mi Colección API"}

@api_router.get("/platforms", response_model=List[Platform])
async def list_platforms():
    docs = await db.platforms.find({}, {"_id": 0}).to_list(100)
    return [Platform(**d) for d in docs]

@api_router.get("/games", response_model=List[Game])
async def list_games(platform: Optional[str] = None, wishlist: Optional[bool] = None, limit: int = 200):
    query = {}
    if platform:
        query["platform"] = platform
    if wishlist is not None:
        query["in_wishlist"] = wishlist
    else:
        query["in_wishlist"] = False
    docs = await db.games.find(query, {"_id": 0}).sort("added_at", -1).to_list(limit)
    return [Game(**attach_console_badge(d)) for d in docs]

@api_router.get("/games/stats")
async def games_stats(platform: Optional[str] = None):
    query = {"in_wishlist": False}
    if platform:
        query["platform"] = platform
    total = await db.games.count_documents(query)
    total_price_pipeline = [
        {"$match": {"in_wishlist": False, "is_gift": False, "price": {"$ne": None, "$gt": 0}}},
    ]
    if platform:
        total_price_pipeline[0]["$match"]["platform"] = platform
    total_price_pipeline.append({"$group": {"_id": None, "sum": {"$sum": "$price"}}})
    agg = await db.games.aggregate(total_price_pipeline).to_list(1)
    total_spent = agg[0]["sum"] if agg else 0
    return {"total": total, "platform": platform, "total_spent": round(total_spent or 0, 2)}

@api_router.get("/games/search")
async def search_games(q: str = "", platform: Optional[str] = None, limit: int = 50):
    if not q:
        return []
    query = {"title": {"$regex": q, "$options": "i"}}
    if platform:
        query["platform"] = platform
    docs = await db.games.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return [Game(**attach_console_badge(d)) for d in docs]

@api_router.get("/games/ranking", response_model=List[Game])
async def get_ranking():
    docs = await db.games.find({"in_wishlist": False, "rating": {"$gt": 0}}, {"_id": 0}).to_list(500)
    # Los juegos con un orden manual (rank_order, fijado al arrastrar en el
    # ranking tipo tierlist) van primero, respetando ese orden. Los que
    # todavía no se han reordenado a mano se añaden al final, ordenados por
    # su nota como siempre.
    with_order = sorted(
        [d for d in docs if d.get("rank_order") is not None],
        key=lambda d: d["rank_order"],
    )
    without_order = sorted(
        [d for d in docs if d.get("rank_order") is None],
        key=lambda d: d.get("rating", 0),
        reverse=True,
    )
    return [Game(**attach_console_badge(d)) for d in (with_order + without_order)]

class RankingReorderRequest(BaseModel):
    ordered_ids: List[str]

@api_router.put("/games/ranking/reorder")
async def reorder_ranking(payload: RankingReorderRequest):
    """Persiste el nuevo orden manual tras arrastrar juegos en el ranking.
    Recibe la lista completa de ids en el orden final deseado y les asigna
    un rank_order secuencial (0, 1, 2...)."""
    for idx, game_id in enumerate(payload.ordered_ids):
        await db.games.update_one({"id": game_id}, {"$set": {"rank_order": idx}})
    return {"ok": True, "count": len(payload.ordered_ids)}

@api_router.get("/games/search-online")
async def search_online(q: str = "", limit: int = 15):
    q = (q or "").strip()
    if len(q) < 2:
        return []

    token = await get_igdb_token()
    if not token: 
        print("\n--- ❌ ERROR: NO HAY TOKEN DE IGDB. REVISA TUS CLAVES ---\n")
        return []

    url = "https://api.igdb.com/v4/games"
    headers = {
        "Client-ID": IGDB_CLIENT_ID,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    # Pedimos parent_game=null (como antes, esto sí es seguro y ya funcionaba)
    # para evitar DLCs con juego padre. El filtro de categoría (para excluir
    # bundles, packs, Game Pass, etc.) lo aplicamos DESPUÉS, en Python, sobre
    # los resultados ya recibidos — filtrarlo dentro de la consulta a IGDB
    # resultó ser demasiado frágil y podía devolver 0 resultados para
    # búsquedas normales.
    body = (
        f'search "{q}"; fields name, cover.url, platforms.name, category; '
        f'where parent_game = null; limit {limit};'
    )
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(url, headers=headers, data=body)
            
            if r.status_code != 200:
                print(f"\n--- ❌ ERROR IGDB (Código {r.status_code}) ---")
                print(f"Cuerpo de la petición: {body}")
                print(f"Respuesta de Twitch: {r.text}")
                print("-------------------------------------------\n")
                return []
            
            games = r.json()
            if len(games) == 0:
                print(f"\n--- ⚠️ IGDB no encontró NADA para la búsqueda: {q} ---\n")

            # Categorías IGDB que dejamos pasar (excluye DLC, expansión,
            # temporada, mod, pack y bundle, que es donde suelen colarse
            # cosas tipo "Xbox Game Pass" o packs de suscripción):
            #   0 = main_game, 8 = remake, 9 = remaster,
            #   10 = expanded_game, 11 = port
            # Si un resultado no trae categoría, lo dejamos pasar (mejor
            # mostrar algo posiblemente de más que perder resultados legítimos
            # por un dato ausente).
            ALLOWED_CATEGORIES = {0, 8, 9, 10, 11}
            EXCLUDED_NAME_KEYWORDS = (
                "game pass", "xbox game pass", "ea play", "ps plus", "playstation plus",
                "season pass", "dlc", "expansion pass", "bundle", "collector's edition upgrade",
            )

            results = []
            for game_data in games:
                category = game_data.get("category")
                if category is not None and category not in ALLOWED_CATEGORIES:
                    continue

                name = (game_data.get("name") or "")
                if any(kw in name.lower() for kw in EXCLUDED_NAME_KEYWORDS):
                    continue

                cover_url = None
                if "cover" in game_data and "url" in game_data["cover"]:
                    cover_url = "https:" + game_data["cover"]["url"].replace("t_thumb", "t_cover_big")
                
                # Una tarjeta de resultado POR CADA plataforma FÍSICA real en
                # la que existe el juego (no una sola mezclando todas), para
                # que el icono y el nombre de consola sean siempre exactos.
                # Excluimos plataformas que por naturaleza son digitales/
                # online (navegador, móvil, streaming en la nube, VR...), ya
                # que esta app cataloga copias físicas que alguien tiene.
                platform_entries = game_data.get("platforms") or []
                all_names = [p.get("name", "") for p in platform_entries if p.get("name")]
                platform_names = [n for n in all_names if not is_digital_only_platform(n)]
                if not platform_names:
                    # El juego solo existe en plataformas digitales/online
                    # (p.ej. un spin-off exclusivo de navegador): lo saltamos
                    # entero, no tiene sentido para un catálogo físico.
                    continue

                seen_family = set()
                for plat_name in platform_names:
                    icon, color, family_slug, badge = console_icon_for(plat_name)
                    # Evitamos duplicar tarjetas si dos nombres de plataforma
                    # distintos caen en la misma familia de icono (p.ej. dos
                    # variantes regionales de la misma consola).
                    dedupe_key = (family_slug, plat_name.lower())
                    if dedupe_key in seen_family:
                        continue
                    seen_family.add(dedupe_key)

                    results.append({
                        "title": game_data.get("name"),
                        "platform": family_slug,
                        "platform_name": plat_name,
                        "console_icon": icon,
                        "console_color": color,
                        "console_badge": badge,
                        "cover_url": cover_url,
                        "description": "Encontrado en IGDB",
                        "source": "igdb",
                    })
            return results[:40]
    except Exception as e:
        logger.warning("Error en IGDB search manual: %s", e)
        return []

@api_router.get("/games/{game_id}", response_model=Game)
async def get_game(game_id: str):
    doc = await db.games.find_one({"id": game_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Game not found")
    return Game(**attach_console_badge(doc))

@api_router.post("/games", response_model=Game)
async def create_game(payload: GameCreate):
    # Comprobar si ya existe en la colección (no en wishlist)
    or_conditions = [
        {"title": payload.title, "platform": payload.platform}
    ]
    if payload.barcode:
        or_conditions.append({"barcode": payload.barcode})

    query = {
        "in_wishlist": False,
        "$or": or_conditions,
    }

    
    existing = await db.games.find_one(query)
    if existing:
        raise HTTPException(status_code=409, detail="Ya tienes este juego en tu colección.")

    game = Game(**attach_console_badge(payload.dict()))
    doc = game.dict()
    await db.games.insert_one(doc)
    
    await db.settings.update_one({"_id": "user_settings"}, {"$inc": {"coins": 50}}, upsert=True)
    return game

@api_router.put("/games/{game_id}", response_model=Game)
async def update_game(game_id: str, payload: GameUpdate):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.games.update_one({"id": game_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Game not found")
    doc = await db.games.find_one({"id": game_id}, {"_id": 0})
    return Game(**attach_console_badge(doc))

@api_router.delete("/games/{game_id}")
async def delete_game(game_id: str):
    result = await db.games.delete_one({"id": game_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"success": True}

@api_router.get("/wishlist", response_model=List[Game])
async def get_wishlist():
    docs = await db.games.find({"in_wishlist": True}, {"_id": 0}).sort("added_at", -1).to_list(200)
    return [Game(**attach_console_badge(d)) for d in docs]

# ---------- Settings ----------
@api_router.get("/settings")
async def get_settings():
    doc = await get_settings_doc()
    doc = await reset_daily_if_needed(doc)
    doc.pop("_id", None)
    doc["premium_active"] = is_premium_active(doc)
    return doc

@api_router.put("/settings", response_model=Settings)
async def update_settings(payload: dict):
    allowed = {k: v for k, v in payload.items() if k in {"shake_to_search", "is_premium", "premium_until", "coins"}}
    if allowed:
        await db.settings.update_one({"_id": "user_settings"}, {"$set": allowed}, upsert=True)
    doc = await get_settings_doc()
    doc.pop("_id", None)
    return Settings(**{k: doc.get(k) for k in Settings.model_fields.keys()})

# ---------- Premium ----------
@api_router.post("/premium/subscribe")
async def premium_subscribe():
    await db.settings.update_one({"_id": "user_settings"}, {"$set": {"is_premium": True, "premium_until": None}}, upsert=True)
    return {"success": True, "message": "¡Bienvenido a Premium! (simulado)"}

@api_router.post("/premium/cancel")
async def premium_cancel():
    await db.settings.update_one({"_id": "user_settings"}, {"$set": {"is_premium": False, "premium_until": None}}, upsert=True)
    return {"success": True}

@api_router.post("/premium/reward-unlock")
async def premium_reward_unlock(payload: RewardUnlockRequest):
    hours = max(1, min(payload.hours, 168))
    until = datetime.now(timezone.utc) + timedelta(hours=hours)
    await db.settings.update_one(
        {"_id": "user_settings"},
        {"$set": {"premium_until": until.isoformat()}},
        upsert=True,
    )
    return {"success": True, "premium_until": until.isoformat(), "hours": hours}

@api_router.get("/barcodes")
async def list_barcodes(q: Optional[str] = None, skip: int = 0, limit: int = 100):
    """Lista tu catálogo local de códigos de barras (paginado). `q` filtra por título."""
    query = {}
    if q:
        query["title"] = {"$regex": re.escape(q), "$options": "i"}
    total = await db.barcodes.count_documents(query)
    items = await db.barcodes.find(query, {"_id": 0}).skip(skip).limit(min(limit, 500)).to_list(500)
    return {"total": total, "items": items}

@api_router.put("/barcodes/{barcode}")
async def update_barcode_entry(barcode: str, payload: BarcodeEntry):
    """Corrige a mano una entrada de tu catálogo (por si la API externa trajo datos erróneos)."""
    if payload.barcode != barcode:
        raise HTTPException(status_code=400, detail="El barcode del payload no coincide con el de la URL")
    data = payload.dict()
    await db.barcodes.update_one({"barcode": barcode}, {"$set": data}, upsert=True)
    return {"success": True, "barcode": await db.barcodes.find_one({"barcode": barcode}, {"_id": 0})}

@api_router.delete("/barcodes/{barcode}")
async def delete_barcode_entry(barcode: str):
    result = await db.barcodes.delete_one({"barcode": barcode})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No existe ese barcode en el catálogo")
    return {"success": True}

@api_router.post("/barcodes/import", response_model=BarcodeImportResult)
async def import_barcodes(payload: BarcodeImportRequest):
    """
    Importación masiva de tu catálogo propio de códigos de barras.
    Pensado para cargar de golpe un CSV/JSON que tú hayas compilado con datos reales
    (tu colección física, un export propio, etc.) para no depender tanto de las APIs externas.

    Por defecto NO pisa entradas que ya existan (overwrite=False), para no perder
    correcciones manuales que hayas hecho. Pon overwrite=True si quieres forzar el update.
    """
    inserted = updated = skipped = 0
    for entry in payload.entries:
        existing = await db.barcodes.find_one({"barcode": entry.barcode}, {"_id": 0})
        if existing and not payload.overwrite:
            skipped += 1
            continue
        await db.barcodes.update_one(
            {"barcode": entry.barcode}, {"$set": entry.dict()}, upsert=True
        )
        if existing:
            updated += 1
        else:
            inserted += 1
    return BarcodeImportResult(
        inserted=inserted, updated=updated, skipped=skipped, total=len(payload.entries)
    )

async def log_scan_result(outcome: str):
    """outcome: 'cache' | 'online' | 'notfound' | 'owned'"""
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.scan_metrics.update_one(
            {"_id": today},
            {"$inc": {f"outcomes.{outcome}": 1, "total": 1}},
            upsert=True,
        )
    except Exception as e:
        logger.warning("No se pudo registrar métrica de escaneo: %s", e)


@api_router.post("/games/lookup-barcode", response_model=BarcodeLookupResponse)
async def lookup_barcode(payload: BarcodeRequest):
    doc = await get_settings_doc()
    doc = await reset_daily_if_needed(doc)
    if not is_premium_active(doc):
        if doc.get("scans_today", 0) >= FREE_SCAN_LIMIT:
            raise HTTPException(status_code=402, detail="Límite gratuito de escaneos alcanzado. Hazte Premium o ve un anuncio.")

    # 1. Comprobar si ya lo tienes en la colección
    owned = await db.games.find_one({"barcode": payload.barcode, "in_wishlist": False})
    if owned:
        await log_scan_result("owned")
        raise HTTPException(status_code=409, detail=owned.get("title", "este juego"))

    # 2. Comprobar si está en caché (catálogo propio, ya confirmado alguna vez)
    match = await db.barcodes.find_one({"barcode": payload.barcode}, {"_id": 0})
    if match:
        await db.settings.update_one({"_id": "user_settings"}, {"$inc": {"scans_today": 1}})
        await log_scan_result("cache")
        return BarcodeLookupResponse(found=True, game=match)

    # 3. Buscar online (UPCitemdb -> barcode.monster -> IGDB)
    # IMPORTANTE: aquí NO se escribe en db.barcodes. El resultado es solo una
    # propuesta; se guarda como definitivo únicamente cuando el usuario lo
    # confirma explícitamente (ver /games/confirm-barcode). Así evitamos que
    # una respuesta equivocada de la API externa contamine el catálogo.
    online = await upcitemdb_lookup(payload.barcode)
    if online:
        await db.settings.update_one({"_id": "user_settings"}, {"$inc": {"scans_today": 1}})
        await log_scan_result("online")
        return BarcodeLookupResponse(found=True, game={**online, "source": "online_auto"})

    # 4. Fallback si no se encuentra
    sug = await db.barcodes.find({}, {"_id": 0}).limit(3).to_list(3)
    await db.settings.update_one({"_id": "user_settings"}, {"$inc": {"scans_today": 1}})
    await log_scan_result("notfound")
    return BarcodeLookupResponse(found=False, suggestions=sug)


@api_router.post("/games/confirm-barcode")
async def confirm_barcode(payload: BarcodeEntry):
    """
    Se llama SOLO cuando el usuario ha confirmado explícitamente ('Sí, es este
    juego') que un código de barras corresponde a un título concreto. A partir
    de aquí queda grabado en el catálogo local como confiable.
    """
    data = payload.dict()
    data["source"] = "user_confirmed"
    await db.barcodes.update_one({"barcode": payload.barcode}, {"$set": data}, upsert=True)
    return {"success": True}


@api_router.post("/barcodes/{barcode}/report")
async def report_barcode(barcode: str):
    """
    Para cuando detectas que un código de barras quedó mal asociado (p.ej. de
    una versión antigua de la app, o de una corrección manual pendiente).
    Simplemente borra la entrada del catálogo para que el próximo escaneo
    de ese código vuelva a preguntar en vez de devolver el dato incorrecto.
    """
    result = await db.barcodes.delete_one({"barcode": barcode})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No existe ese barcode en el catálogo")
    return {"success": True, "message": "Entrada eliminada. El próximo escaneo de este código volverá a buscarse."}


@api_router.get("/games/scan-metrics")
async def scan_metrics(days: int = 7):
    """Devuelve el % de escaneos que acaban en 'no encontrado' en los
    últimos `days` días, para decidir si el escaneo ya es lo bastante
    fiable como para ponerlo detrás de un muro premium."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    docs = await db.scan_metrics.find({"_id": {"$gte": cutoff}}, {"_id": 0}).to_list(days)

    totals = {"cache": 0, "online": 0, "notfound": 0, "owned": 0}
    for d in docs:
        outcomes = d.get("outcomes", {})
        for k in totals:
            totals[k] += outcomes.get(k, 0)

    # 'owned' no cuenta como intento de búsqueda real (el juego ya estaba)
    search_attempts = totals["cache"] + totals["online"] + totals["notfound"]
    notfound_rate = round((totals["notfound"] / search_attempts) * 100, 1) if search_attempts else 0.0
    hit_rate_cache = round((totals["cache"] / search_attempts) * 100, 1) if search_attempts else 0.0

    return {
        "days": days,
        "totals": totals,
        "search_attempts": search_attempts,
        "notfound_rate_pct": notfound_rate,
        "cache_hit_rate_pct": hit_rate_cache,
    }

class SearchOnlineResult(BaseModel):
    title: str
    platform: Optional[str] = None
    cover_url: Optional[str] = None
    description: Optional[str] = None
    source: str = "wikipedia"

# ---------- Stats (premium features) ----------
@api_router.get("/stats/summary")
async def stats_summary():
    docs = await db.games.find({"in_wishlist": False}, {"_id": 0}).to_list(1000)
    total = len(docs)
    total_spent = 0.0
    total_paid = 0
    total_gifts = 0
    by_platform: dict = {}
    by_box: dict = {}
    monthly: dict = {}

    for g in docs:
        pf = g.get("platform")
        by_platform[pf] = by_platform.get(pf, 0) + 1
        if g.get("is_gift"):
            total_gifts += 1
        elif isinstance(g.get("price"), (int, float)) and g["price"] > 0:
            total_spent += float(g["price"])
            total_paid += 1
        b = g.get("box_condition") or "sin"
        by_box[b] = by_box.get(b, 0) + 1
        try:
            dt = datetime.fromisoformat(g.get("added_at"))
            key = dt.strftime("%Y-%m")
            monthly[key] = monthly.get(key, 0) + 1
        except Exception:
            pass

    top_platform = max(by_platform.items(), key=lambda x: x[1])[0] if by_platform else None
    avg = round(total_spent / total_paid, 2) if total_paid else 0

    now = datetime.now(timezone.utc)
    ordered: list = []
    for i in range(5, -1, -1):
        d = (now.replace(day=1) - timedelta(days=30 * i))
        key = d.strftime("%Y-%m")
        ordered.append({"month": key, "count": monthly.get(key, 0)})

    return {
        "total_games": total,
        "total_spent": round(total_spent, 2),
        "average_price": avg,
        "total_gifts": total_gifts,
        "top_platform": top_platform,
        "by_platform": by_platform,
        "by_box_condition": by_box,
        "monthly": ordered,
    }

# ---------- Export (premium features) ----------
def _csv_escape(val) -> str:
    if val is None:
        return ""
    s = str(val)
    if any(c in s for c in [',', '"', '\n', '\r']):
        s = '"' + s.replace('"', '""') + '"'
    return s

@api_router.get("/export/csv", response_class=PlainTextResponse)
async def export_csv():
    docs = await db.games.find({}, {"_id": 0}).sort("added_at", -1).to_list(2000)
    headers = ["title", "platform", "rating", "price", "is_gift", "in_wishlist",
               "box_condition", "manual_condition", "disc_condition",
               "description", "barcode", "added_at"]
    lines = [",".join(headers)]
    for g in docs:
        lines.append(",".join(_csv_escape(g.get(h)) for h in headers))
    return "\n".join(lines)

@api_router.get("/export/html", response_class=HTMLResponse)
async def export_html():
    docs = await db.games.find({"in_wishlist": False}, {"_id": 0}).sort("added_at", -1).to_list(2000)
    wl = await db.games.find({"in_wishlist": True}, {"_id": 0}).sort("added_at", -1).to_list(500)
    by_platform: dict = {}
    total_spent = 0.0
    for g in docs:
        by_platform[g.get("platform")] = by_platform.get(g.get("platform"), 0) + 1
        if not g.get("is_gift") and isinstance(g.get("price"), (int, float)):
            total_spent += float(g["price"])

    def row(g):
        price = ("🎁 Regalo" if g.get("is_gift") else (f"{g.get('price'):.2f}€" if isinstance(g.get("price"), (int, float)) and g.get("price") else "—"))
        rating = ("⭐ " + str(g.get("rating"))) if g.get("rating") else "—"
        conds = " | ".join([
            f"caja: {g.get('box_condition') or '-'}",
            f"manual: {g.get('manual_condition') or '-'}",
            f"disco: {g.get('disc_condition') or '-'}",
        ])
        return f"""<tr>
          <td>{(g.get('title') or '').replace('<','&lt;')}</td>
          <td>{g.get('platform')}</td>
          <td>{rating}</td>
          <td>{price}</td>
          <td>{conds}</td>
        </tr>"""

    html = f"""<!doctype html><html><head><meta charset='utf-8'>
    <title>Mi Colección</title>
    <style>
      body {{ font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #0F172A; }}
      h1 {{ margin: 0 0 4px 0; color: #4338CA; }}
      .sub {{ color: #64748B; margin-bottom: 20px; }}
      .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }}
      .card {{ background:#F1F5F9; border-radius:10px; padding:12px; }}
      .card b {{ font-size:22px; }}
      table {{ width:100%; border-collapse: collapse; font-size:12px; }}
      th, td {{ text-align:left; padding:8px; border-bottom:1px solid #E2E8F0; }}
      th {{ background:#F8FAFC; color:#334155; }}
      h2 {{ color:#4338CA; margin-top: 26px; }}
    </style></head><body>
    <h1>Mi Colección</h1>
    <div class='sub'>Exportado el {datetime.now(timezone.utc).strftime('%d/%m/%Y')}</div>
    <div class='grid'>
      <div class='card'><div>Total juegos</div><b>{len(docs)}</b></div>
      <div class='card'><div>Gasto total</div><b>{total_spent:.2f} €</b></div>
      <div class='card'><div>Wishlist</div><b>{len(wl)}</b></div>
    </div>
    <h2>Mi colección</h2>
    <table><thead><tr><th>Título</th><th>Plataforma</th><th>Nota</th><th>Precio</th><th>Estado</th></tr></thead>
    <tbody>
    {''.join(row(g) for g in docs)}
    </tbody></table>
    <h2>Wishlist ({len(wl)})</h2>
    <table><thead><tr><th>Título</th><th>Plataforma</th></tr></thead><tbody>
    {''.join(f"<tr><td>{(g.get('title') or '').replace('<','&lt;')}</td><td>{g.get('platform')}</td></tr>" for g in wl)}
    </tbody></table>
    </body></html>"""
    return html

# ---------- AI Assistant ----------
@api_router.post("/assistant/chat", response_model=ChatResponse)
async def assistant_chat(payload: ChatRequest):
    # Como hemos desactivado la librería de IA para que no te dé problemas al compilar, 
    # devolvemos un mensaje fijo por ahora.
    return ChatResponse(reply="El asistente de IA está desactivado temporalmente para las pruebas del escáner.")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()