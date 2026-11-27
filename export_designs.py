"""Export every design (booklet p*.py and new n*.py) to site/designs.json for the web app.
Grouping and labels come from gen_groups so the app matches the printed booklets."""
import importlib, io, contextlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # ~/Downloads/ghep-hinh
sys.path.insert(0, ROOT)
# Prototype: only these pictures are shipped (easiest first). Set to None to ship all 234.
PROTOTYPE = ["p04_con_vat_2-8", "p06_trai_cay_1-7", "p18_con_vat_4-3", "p14_phep_thuat-1", "p06_trai_cay_1-8"]
BOOKS = [("ban-dau", "Tập ban đầu", "designs/p*.py"), ("moi", "Tập mới", "designs/n*.py")]

def _centroid(pts):
    a = cx = cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        k = x1 * y2 - x2 * y1
        a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
    a /= 2
    return [cx / (6 * a), cy / (6 * a)]

def _grouped(pattern):
    """Run gen_groups for one design set; returns (GROUPS, by, items)."""
    cwd = os.getcwd(); argv = sys.argv
    os.chdir(ROOT); os.environ["DESIGNS"] = pattern; sys.argv = [argv[0], os.devnull]
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            g = importlib.reload(importlib.import_module("gen_groups"))
    finally:
        os.chdir(cwd); sys.argv = argv
    return g

def export(out_path, only=None):
    import pb
    books = []
    for bid, title, pattern in BOOKS:
        g = _grouped(pattern)
        seen = {}
        for pid, d in g.items:                     # stable id: <page id>-<index in page>
            seen[pid] = seen.get(pid, -1) + 1
            d["_id"] = f"{pid}-{seen[pid]}"
        groups = []
        for key, gtitle, _ in g.GROUPS:
            out = []
            for d in g.by[key]:
                polys = [(t, pb.outline(t, p)) for t, p in d["pieces"]]
                x0 = min(x for _, q in polys for x, _ in q); y0 = min(y for _, q in polys for _, y in q)
                pieces = []
                for t, q in polys:
                    pts = [[round(x - x0, 4), round(y - y0, 4)] for x, y in q]
                    pieces.append({"t": t, "pts": pts, "c": [round(v, 4) for v in _centroid(pts)]})
                w = max(p[0] for pc in pieces for p in pc["pts"]); h = max(p[1] for pc in pieces for p in pc["pts"])
                out.append({"id": d["_id"], "label": d["label"], "w": w, "h": h, "pieces": pieces})
            groups.append({"title": gtitle, "designs": out})
        books.append({"id": bid, "title": title, "groups": groups})
    if only:
        flat = {d["id"]: d for b in books for g in b["groups"] for d in g["designs"]}
        books = [{"id": "de", "title": "Hình dễ", "groups": [{"title": "5 hình dễ", "designs": [flat[i] for i in only]}]}]
    data = {"books": books}
    with open(out_path, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return data

if __name__ == "__main__":
    export(os.path.join(os.path.dirname(os.path.abspath(__file__)), "site", "designs.json"), only=PROTOTYPE)
