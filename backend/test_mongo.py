"""
Prueba de conexión aislada a MongoDB Atlas, sin FastAPI ni dotenv de por medio.
Pega tu MONGO_URL completa (con la contraseña real) directamente en la variable
de abajo, ejecútalo, y luego BORRA el archivo (no lo dejes con la contraseña
escrita).

Uso:
    python test_mongo.py
"""
from pymongo import MongoClient
from pymongo.errors import OperationFailure

# 👇 Pega aquí tu MONGO_URL completa, tal cual la tienes en backend/.env
MONGO_URL = "mongodb+srv://bixuthings_db_user:XM5WljoMvg7QmmTa@cluster0.tegbltf.mongodb.net/?appName=Cluster0"

print("Probando conexión...")
try:
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    print("✅ Conexión OK. La autenticación funciona.")
    print("Bases de datos visibles:", client.list_database_names())
except OperationFailure as e:
    print("❌ Falló la autenticación:", e)
    print("→ Repasa usuario/contraseña en Atlas → Database Access.")
except Exception as e:
    print("❌ Otro error (puede ser de red/whitelist):", e)