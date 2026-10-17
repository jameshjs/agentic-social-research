# Downloads the persona pool from NVIDIA Nemotron-Personas-USA (CC BY 4.0) via the Hugging Face rows API; stdlib only.
# Usage: python scripts/fetch_personas.py   -> data/personas/pool_2000.jsonl (skipped if it already exists)
import json, random, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "personas" / "pool_2000.jsonl"
API = "https://datasets-server.huggingface.co/rows"
TOTAL, PAGE, PAGES, SEED = 1_000_000, 100, 20, 7
DEGREE = {"bachelors", "graduate"}

def fetch_page(offset, tries=5):
    q = urllib.parse.urlencode({"dataset": "nvidia/Nemotron-Personas-USA", "config": "default",
                                "split": "train", "offset": offset, "length": PAGE})
    for i in range(tries):
        try:
            with urllib.request.urlopen(f"{API}?{q}", timeout=60) as r:
                return [x["row"] for x in json.load(r)["rows"]]
        except urllib.error.HTTPError as e:  # the HF viewer returns 502s while it warms a shard
            if i == tries - 1:
                raise
            print(f"offset {offset}: HTTP {e.code}, retrying")
            time.sleep(5 * (i + 1))

def main():
    if OUT.exists():
        print(f"{OUT} already exists")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # shortcut: 20 random pages of 100 adjacent rows, not 2,000 independent draws; download the parquet for a real study
    offsets = random.Random(SEED).sample(range(0, TOTAL - PAGE, PAGE), PAGES)
    pool = [r for off in offsets for r in fetch_page(off)]
    OUT.write_text("".join(json.dumps(r) + "\n" for r in pool))
    print(f"{OUT}: {len(pool)} personas (make_groups.py keeps adults only; the dataset includes children)")

if __name__ == "__main__":
    main()
