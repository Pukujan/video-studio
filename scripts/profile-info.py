import json, os

base = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
ls = json.load(open(os.path.join(base, "Local State"), encoding="utf-8"))
cache = ls.get("profile", {}).get("info_cache", {})
for name, info in cache.items():
    print(f"== {name}")
    print("   name      :", info.get("name"))
    print("   user_name :", info.get("user_name"))
    print("   gaia_id   :", info.get("gaia_id"))
    print("   signed_in :", info.get("is_using_default_avatar"), info.get("is_ephemeral"))
print("--- os_crypt keys ---")
oc = ls.get("os_crypt", {})
for k in oc:
    print("  ", k, "(set)" if oc[k] else "(empty)")
