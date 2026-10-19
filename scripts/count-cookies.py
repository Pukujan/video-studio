import sqlite3, os, sys
db = sys.argv[1]
con = sqlite3.connect(db)
n = con.execute("select count(*) from cookies where host_key like '%google.com'").fetchone()[0]
print("google cookies:", n)
for h, name in con.execute("select host_key,name from cookies where host_key like '%google.com' and name in ('SID','HSID','SSID','APISID','SAPISID')"):
    print(f"   {h:20} {name}")
