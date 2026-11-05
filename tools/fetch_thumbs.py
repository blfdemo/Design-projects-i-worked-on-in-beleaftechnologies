"""Download Figma thumbnails for every item in data/data.js into ./thumbs (640x482 JPG).
Just double-click this file (needs Python + `pip install pillow requests`).
It asks for your Figma token (Figma > Settings > Security > Personal access tokens, scope: File content read).
Safe to re-run: existing thumbnails are skipped."""
import json, os, re, sys, time, io
try:
    import requests
    from PIL import Image
except ImportError:
    input("Missing packages. Open a terminal and run:  pip install pillow requests\nThen run this again. Press Enter to close...")
    sys.exit(1)

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # work from the portfolio folder
tok = os.environ.get("FIGMA_TOKEN") or input("Paste your Figma token and press Enter: ").strip()
_t = open("data/data.js", encoding="utf-8").read()
data = json.loads(_t[_t.index("{"):_t.rindex("}") + 1])
os.makedirs("thumbs", exist_ok=True)
done = skipped = 0
for it in data["items"]:
    out = f"thumbs/{it['id']}.jpg"
    if os.path.exists(out): continue
    m = re.search(r"figma\.com/design/([A-Za-z0-9]+)", " ".join(l["url"] for l in it["links"]))
    if not m: continue
    r = requests.get(f"https://api.figma.com/v1/files/{m.group(1)}?depth=1", headers={"X-Figma-Token": tok})
    if r.status_code == 429: print("Rate limited - wait a minute and run again."); break
    if r.status_code != 200 or not r.json().get("thumbnailUrl"):
        print("skip", it["name"], r.status_code); skipped += 1; continue
    img = Image.open(io.BytesIO(requests.get(r.json()["thumbnailUrl"]).content)).convert("RGB")
    s = max(640/img.width, 482/img.height); img = img.resize((round(img.width*s), round(img.height*s)))
    l, t = (img.width-640)//2, (img.height-482)//2
    img.crop((l, t, l+640, t+482)).save(out, quality=85)
    print("ok", it["name"]); done += 1; time.sleep(0.4)
input(f"\nDone: {done} saved, {skipped} skipped. Press Enter to close...")
