import sqlite3
import os
import json

db_path = "/tmp/data.db"
if not os.path.exists(db_path):
    print("Error: /tmp/data.db not found")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- 1. MIGRATIONS ---")
try:
    migrations = cursor.execute("SELECT file, applied FROM _migrations ORDER BY file ASC").fetchall()
    for m in migrations:
        print(f"  {m[0]} (applied: {m[1]})")
except Exception as e:
    print(f"Error reading _migrations: {e}")

print("\n--- 2. CURRENT RECORDS COUNT ---")
for table in ["customers", "rentals", "rental_items", "payments", "rental_folio_counter", "business_settings", "users", "_superusers"]:
    try:
        count = cursor.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} records")
    except Exception as e:
        print(f"  {table}: table error ({e})")

print("\n--- 3. RENTALS TABLE SCHEMA ---")
try:
    schema = cursor.execute("SELECT schema FROM _collections WHERE name = 'rentals'").fetchone()
    if schema:
        fields = json.loads(schema[0]) if isinstance(schema[0], str) else schema[0]
        field_names = [f.get("name") for f in fields]
        print(f"  Fields in rentals collection: {field_names}")
except Exception as e:
    print(f"Error checking rentals schema: {e}")

conn.close()
