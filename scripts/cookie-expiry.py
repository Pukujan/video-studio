import sqlite3, os, datetime, sys

base = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
for prof in ["Default", "Profile 1"]:
    for cand in [os.path.join(base, prof, "Network", "Cookies"), os.path.join(base, prof, "Cookies")]:
        if os.path.exists(cand):
            con = sqlite3.connect(f"file:{cand}?mode=ro&immutable=1", uri=True)
            print(f"== {prof}")
            q = """select name, host_key, expires_utc, is_secure, is_httponly
                   from cookies where host_key='.google.com'
                   and name in ('SID','HSID','SSID','APISID','SAPISID','__Secure-1PSID','__Secure-3PSID')
                   order by name"""
            for name, host, exp, sec, http in con.execute(q):
                # Chrome epoch: microseconds since 1601-01-01
                if exp == 0:
                    when = "session"
                else:
                    try:
                        dt = datetime.datetime(1601, 1, 1) + datetime.timedelta(microseconds=exp)
                        when = dt.strftime("%Y-%m-%d")
                    except Exception:
                        when = str(exp)
                print(f"   {name:22} expires {when}")
            con.close()
            break
