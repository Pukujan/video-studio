import sqlite3, shutil, os, glob

base = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
tmp = os.path.expandvars(r"%LOCALAPPDATA%\Temp\ck")
os.makedirs(tmp, exist_ok=True)

for prof in ["Default", "Profile 1"]:
    for cand in [os.path.join(base, prof, "Network", "Cookies"),
                 os.path.join(base, prof, "Cookies")]:
        if os.path.exists(cand):
            out = os.path.join(tmp, prof.replace(" ", "_") + ".db")
            shutil.copy2(cand, out)
            con = sqlite3.connect(out)
            rows = con.execute(
                "select host_key,name,length(encrypted_value) from cookies where host_key like '%google.com'"
            ).fetchall()
            print(f"== {prof}: {len(rows)} google cookies")
            for h, n, l in rows:
                if any(k in n for k in ("SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure", "NID", "SIDCC")):
                    print(f"   {h:28} {n:28} {l}B")
            con.close()
            break
    else:
        print(f"== {prof}: no cookies db")
