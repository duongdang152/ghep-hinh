"""Set the service-worker cache name from a hash of the site files, so every change reaches installed tablets."""
import hashlib, os, re
SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
FILES = ["index.html", "style.css", "app.js", "logic.js", "designs.json", "manifest.webmanifest"]
h = hashlib.sha256(b"".join(open(os.path.join(SITE, f), "rb").read() for f in FILES)).hexdigest()[:10]
p = os.path.join(SITE, "sw.js"); s = open(p).read()
s = re.sub(r'const CACHE = "ghep-hinh-[^"]*";', f'const CACHE = "ghep-hinh-{h}";', s)
open(p, "w").write(s); print("cache", h)
