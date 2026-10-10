import sqlite3
import os
import subprocess

db_path = "/tmp/data.db"
if not os.path.exists(db_path):
    print("Error: /tmp/data.db not found")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- CLEANING DATABASE ---")

# Delete test transactional and customer data
cursor.execute("DELETE FROM payments")
print(f"Deleted payments: {cursor.rowcount}")

cursor.execute("DELETE FROM rental_items")
print(f"Deleted rental_items: {cursor.rowcount}")

cursor.execute("DELETE FROM rentals")
print(f"Deleted rentals: {cursor.rowcount}")

cursor.execute("DELETE FROM customers")
print(f"Deleted customers: {cursor.rowcount}")

# Reset folio counter to 0
cursor.execute("UPDATE rental_folio_counter SET value = 0")
print(f"Reset rental_folio_counter: {cursor.rowcount}")

conn.commit()

print("\n--- POST-CLEAN COUNTS ---")
for table in ["customers", "rentals", "rental_items", "payments", "rental_folio_counter", "business_settings", "users", "_superusers"]:
    try:
        count = cursor.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} records")
    except Exception as e:
        print(f"  {table}: table error ({e})")

counter_val = cursor.execute("SELECT value FROM rental_folio_counter LIMIT 1").fetchone()
if counter_val:
    print(f"Current rental_folio_counter value: {counter_val[0]}")

conn.close()
print("\nDatabase cleaned successfully!")
