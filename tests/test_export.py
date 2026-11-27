import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
sys.path.insert(0, APP)

def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

class ExportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import export_designs
        import tempfile
        cls.tmp = tempfile.mkdtemp()
        cls.data = export_designs.export(os.path.join(cls.tmp, "all.json"))
        cls.designs = [d for b in cls.data["books"] for g in b["groups"] for d in g["designs"]]

    def test_tabs_are_themes(self):
        self.assertEqual([b["title"] for b in self.data["books"]],
            ["Con vật", "Chim", "Dưới nước", "Côn trùng", "Khủng long", "Cây cỏ", "Xe cộ", "Đồ vật", "Hoa văn", "Chữ cái", "Chữ số"])

    def test_every_picture_once(self):
        self.assertEqual(len(self.designs), 234)

    def test_new_pictures_join_their_theme(self):
        tab = {d["label"]: b["title"] for b in self.data["books"] for g in b["groups"] for d in g["designs"]}
        self.assertEqual(tab["Cá mập"], "Dưới nước"); self.assertEqual(tab["Gà trống"], "Chim")
        self.assertEqual(tab["Sư tử"], "Con vật"); self.assertEqual(tab["Hoa sen"], "Cây cỏ")
        self.assertEqual(tab["Xe tăng hạng nặng"], "Xe cộ"); self.assertEqual(tab["Máy bay chở khách"], "Xe cộ")

    def test_easiest_first_in_each_tab(self):
        for b in self.data["books"]:
            if b["title"] in ("Chữ cái", "Chữ số"): continue     # keep A..Z and 1..9 in order
            n = [len(d["pieces"]) for g in b["groups"] for d in g["designs"]]
            self.assertEqual(n, sorted(n), b["title"])

    def test_ids_unique(self):
        ids = [d["id"] for d in self.designs]
        self.assertEqual(len(ids), len(set(ids)))

    def test_bbox_origin(self):
        for d in self.designs:
            xs = [p[0] for pc in d["pieces"] for p in pc["pts"]]; ys = [p[1] for pc in d["pieces"] for p in pc["pts"]]
            self.assertAlmostEqual(min(xs), 0, places=3, msg=d["id"]); self.assertAlmostEqual(min(ys), 0, places=3, msg=d["id"])
            self.assertAlmostEqual(max(xs), d["w"], places=3); self.assertAlmostEqual(max(ys), d["h"], places=3)

    def test_quarter_expanded(self):
        q = [pc for d in self.designs for pc in d["pieces"] if pc["t"] == "quarter"]
        self.assertTrue(q); self.assertTrue(all(len(pc["pts"]) > 10 for pc in q))

    def test_centroid_inside(self):
        for d in self.designs:
            for pc in d["pieces"]:
                self.assertTrue(inside(pc["c"], pc["pts"]), (d["id"], pc["t"]))

class ServiceWorkerTest(unittest.TestCase):
    def test_cache_name_matches_files(self):
        import hashlib, re
        site = os.path.join(APP, "site")
        files = ["index.html", "style.css", "app.js", "logic.js", "designs.json", "manifest.webmanifest"]
        h = hashlib.sha256(b"".join(open(os.path.join(site, f), "rb").read() for f in files)).hexdigest()[:10]
        sw = open(os.path.join(site, "sw.js")).read()
        self.assertIn(f'"ghep-hinh-{h}"', sw, "run python3 stamp_sw.py after changing the site")

    def test_install_bypasses_http_cache(self):
        sw = open(os.path.join(APP, "site", "sw.js")).read()
        self.assertIn('cache: "reload"', sw)

if __name__ == "__main__":
    unittest.main()
