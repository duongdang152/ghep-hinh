"""Export every design (booklet p*.py and new n*.py) to site/designs.json for the web app.
Each app tab is one theme mixing booklet and new pictures, easiest (fewest pieces) first."""
import importlib, io, contextlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # ~/Downloads/ghep-hinh
sys.path.insert(0, ROOT)
# App tabs, in order. Booklet groups (gen_groups keys) and new-design groups map onto them.
THEMES = [("con-vat", "Con vật"), ("chim", "Chim"), ("duoi-nuoc", "Dưới nước"), ("con-trung", "Côn trùng"),
          ("khung-long", "Khủng long"), ("cay-co", "Cây cỏ"), ("xe-co", "Xe cộ"), ("do-vat", "Đồ vật"),
          ("hoa-van", "Hoa văn"), ("chu-cai", "Chữ cái"), ("chu-so", "Chữ số")]
GROUP_THEME = {"Con vật": "Con vật", "Chim": "Chim", "Dưới nước": "Dưới nước", "Côn trùng": "Côn trùng",
               "Khủng long": "Khủng long", "Hoa lá, trái cây": "Cây cỏ", "Xe cộ": "Xe cộ", "Đồ vật": "Đồ vật",
               "Hoa văn": "Hoa văn", "Chữ cái": "Chữ cái", "Chữ số": "Chữ số",
               "Mẫu mới: con vật": "Con vật", "Mẫu mới: cây cỏ": "Cây cỏ", "Mẫu mới: máy bay": "Xe cộ", "Mẫu mới: xe tăng": "Xe cộ"}
# new animals that belong with the birds or the water animals rather than the land animals
NEW_ANIMAL_THEME = {"Gà trống": "Chim", "Đại bàng": "Chim", "Chim sẻ": "Chim",
                    "Cá chép": "Dưới nước", "Cá mập": "Dưới nước", "Bạch tuộc": "Dưới nước", "Cá sấu": "Dưới nước", "Con ếch": "Dưới nước"}
KEEP_ORDER = {"Chữ cái", "Chữ số"}               # A..Z and 1..9 stay in order
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

def export(out_path):
    import pb
    themes = {t: [] for _, t in THEMES}
    for bid, title, pattern in BOOKS:
        g = _grouped(pattern)
        seen = {}
        for pid, d in g.items:                     # stable id: <page id>-<index in page>
            seen[pid] = seen.get(pid, -1) + 1
            d["_id"] = f"{pid}-{seen[pid]}"
        for key, gtitle, _ in g.GROUPS:
            for d in g.by[key]:
                polys = [(t, pb.outline(t, p)) for t, p in d["pieces"]]
                x0 = min(x for _, q in polys for x, _ in q); y0 = min(y for _, q in polys for _, y in q)
                pieces = []
                for t, q in polys:
                    pts = [[round(x - x0, 4), round(y - y0, 4)] for x, y in q]
                    pieces.append({"t": t, "pts": pts, "c": [round(v, 4) for v in _centroid(pts)]})
                w = max(p[0] for pc in pieces for p in pc["pts"]); h = max(p[1] for pc in pieces for p in pc["pts"])
                theme = NEW_ANIMAL_THEME.get(d["vi"], GROUP_THEME[key]) if key == "Mẫu mới: con vật" else GROUP_THEME[key]
                themes[theme].append({"id": d["_id"], "label": d["label"], "w": w, "h": h, "pieces": pieces})
    books = []
    for tid, t in THEMES:
        ds = themes[t] if t in KEEP_ORDER else sorted(themes[t], key=lambda d: len(d["pieces"]))   # stable: ties keep booklet order
        books.append({"id": tid, "title": t, "groups": [{"title": "", "designs": ds}]})
    data = {"books": books}
    with open(out_path, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return data

if __name__ == "__main__":
    export(os.path.join(os.path.dirname(os.path.abspath(__file__)), "site", "designs.json"), )
