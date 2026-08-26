"""
Importa un CSV de códigos de barras a tu catálogo local (colección `barcodes` en Mongo).

USO:
    python import_barcodes.py mi_catalogo.csv
    python import_barcodes.py mi_catalogo.csv --overwrite

El CSV debe tener estas columnas (cabecera exacta):
    barcode,title,platform,cover_url,version

Donde:
    barcode    -> código de barras tal cual lo escanea el lector (obligatorio)
    title      -> título del juego (obligatorio)
    platform   -> uno de: playstation, xbox, nintendo, steam, sega, atari, pc (obligatorio)
    cover_url  -> URL de la portada (opcional, puede ir vacío)
    version    -> ej. "PS5 - Estándar" (opcional, puede ir vacío)

Por defecto NO sobreescribe entradas que ya existan en tu catálogo (para no
perder correcciones manuales que hayas hecho). Usa --overwrite si quieres forzarlo.
"""
import sys
import csv
import argparse
import os
from pathlib import Path

from pymongo import MongoClient
from dotenv import load_dotenv

# Carga backend/.env (este script vive en backend/scripts/, el .env está un nivel arriba)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = "bixuthings_db_user"

REQUIRED_COLUMNS = {"barcode", "title", "platform"}
VALID_PLATFORMS = {"playstation", "xbox", "nintendo", "steam", "sega", "atari", "pc"}


def main():
    if not MONGO_URL:
        print("❌ Falta MONGO_URL. Asegúrate de tener backend/.env con MONGO_URL=... relleno.")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Importa un CSV de barcodes al catálogo local.")
    parser.add_argument("csv_path", type=str, help="Ruta al fichero CSV")
    parser.add_argument("--overwrite", action="store_true", help="Sobreescribe entradas ya existentes")
    args = parser.parse_args()

    path = Path(args.csv_path)
    if not path.exists():
        print(f"❌ No existe el fichero: {path}")
        sys.exit(1)

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not REQUIRED_COLUMNS.issubset(set(reader.fieldnames or [])):
            print(f"❌ El CSV debe tener al menos las columnas: {', '.join(REQUIRED_COLUMNS)}")
            print(f"   Columnas encontradas: {reader.fieldnames}")
            sys.exit(1)
        rows = list(reader)

    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    inserted = updated = skipped = errors = 0

    for i, row in enumerate(rows, start=2):  # start=2 porque la fila 1 es la cabecera
        barcode = (row.get("barcode") or "").strip()
        title = (row.get("title") or "").strip()
        platform = (row.get("platform") or "").strip().lower()

        if not barcode or not title:
            print(f"⚠️  Fila {i}: falta barcode o title, se salta.")
            errors += 1
            continue

        if platform not in VALID_PLATFORMS:
            print(f"⚠️  Fila {i}: plataforma '{platform}' no reconocida "
                  f"(válidas: {', '.join(sorted(VALID_PLATFORMS))}), se salta.")
            errors += 1
            continue

        entry = {
            "barcode": barcode,
            "title": title,
            "platform": platform,
            "cover_url": (row.get("cover_url") or "").strip() or None,
            "version": (row.get("version") or "").strip() or None,
        }

        existing = db.barcodes.find_one({"barcode": barcode})
        if existing and not args.overwrite:
            skipped += 1
            continue

        db.barcodes.update_one({"barcode": barcode}, {"$set": entry}, upsert=True)
        if existing:
            updated += 1
        else:
            inserted += 1

    print("\n--- Resumen de importación ---")
    print(f"Filas leídas:   {len(rows)}")
    print(f"Insertadas:     {inserted}")
    print(f"Actualizadas:   {updated}")
    print(f"Omitidas (ya existían, sin --overwrite): {skipped}")
    print(f"Con errores:    {errors}")
    print(f"Catálogo total ahora: {db.barcodes.count_documents({})} entradas")


if __name__ == "__main__":
    main()
