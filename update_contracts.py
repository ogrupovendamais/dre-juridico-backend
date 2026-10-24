import sqlite3

conn = sqlite3.connect('pilot.db')
cur = conn.cursor()

cur.execute("""
    UPDATE contracts 
    SET origin = 'marketing' 
    WHERE label LIKE '%Alpha%' 
       OR label LIKE '%Tech%' 
       OR label LIKE '%mega%'
""")
conn.commit()
print("Updated rows:", cur.rowcount)

rows = cur.execute("SELECT id, label, fee_type, origin FROM contracts WHERE office_id='73fb1ebaa3e43c6911479e7a'").fetchall()
for r in rows:
    print(r)

conn.close()
