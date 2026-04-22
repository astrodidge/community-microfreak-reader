#!/usr/bin/env python3
"""Follow-up: check if vcodTag (byte 10) alone is a clean type classifier
for ALL tagged presets, not just saturated ones. Also look at primary16-to-type
mapping in non-saturated cases."""
import json, collections
from collections import defaultdict
from pathlib import Path

PATH = Path(__file__).parent.parent / "microfreak-osc-overrides.2026-04-22T06-53-30.json"
DATA = json.loads(PATH.read_text())

def u16le(b, i): return b[i] | (b[i+1] << 8)

rows = []
for key, rec in DATA.items():
    b = rec["vcodBytes"]
    if b[:9] != [0x23, 0x56, 0x43, 0x4f, 0x44, 0x54, 0x79, 0x70, 0x65]:
        continue
    rows.append({
        "name": rec["presetName"],
        "osc": rec["oscType"].replace("\n", " "),
        "vcodTag": b[10],
        "primary": u16le(b, 11),
        "bytes": b,
    })

# 1) Is vcodTag alone a type classifier across ALL presets?
print("=== vcodTag (byte 10) → user-tagged OSC type, ALL presets ===")
by_tag = defaultdict(list)
for r in rows:
    by_tag[r["vcodTag"]].append(r["osc"])
for tag in sorted(by_tag):
    c = collections.Counter(by_tag[tag])
    print(f"  tag=0x{tag:02x} ({tag:3d}): {dict(c)}")
print()

# 2) For a given primary value, what type(s) does the user pick?
print("=== primary16 → OSC type, ALL tagged presets ===")
by_prim = defaultdict(list)
for r in rows:
    by_prim[r["primary"]].append((r["osc"], r["name"]))
for prim in sorted(by_prim):
    entries = by_prim[prim]
    types = collections.Counter(e[0] for e in entries)
    if len(types) == 1 and len(entries) >= 1:
        t = list(types)[0]
        sample = [e[1] for e in entries]
        print(f"  p=0x{prim:04x} ({prim:5d}, {prim/32768:.3f}x)  {t:<16}  ({len(entries)}x: {sample[:3]})")
    else:
        print(f"  p=0x{prim:04x} ({prim:5d}, {prim/32768:.3f}x)  MIXED: {dict(types)} names: {[e[1] for e in entries]}")
print()

# 3) Stepsize hypothesis: does primary / (32768/24) give integer indices?
print("=== primary16 / (32768/24) — does the ratio land near integers? ===")
print(f"(32768/24 = {32768/24:.2f})")
for r in sorted(rows, key=lambda x: x["primary"]):
    if r["primary"] == 0x7FFF: continue
    idx = r["primary"] / (32768/24)
    print(f"  p=0x{r['primary']:04x}  idx≈{idx:6.3f}  user={r['osc']:<15} {r['name']}")
print()

# 4) Try many step sizes and see which one gives the cleanest integer grid.
print("=== scan step sizes: what step makes primary values cluster at integers? ===")
ps = sorted({r["primary"] for r in rows if r["primary"] != 0x7FFF})
best = []
for N in range(8, 40):
    step = 32768 / N
    residuals = [abs((p/step) - round(p/step)) for p in ps]
    avg = sum(residuals) / len(residuals)
    best.append((avg, N))
best.sort()
print("Top 10 step sizes (lower avg residual = better fit):")
for avg, N in best[:10]:
    step = 32768/N
    print(f"  N={N:2d}  step={step:7.2f}  avg_residual={avg:.4f}  (tested on {len(ps)} distinct primaries)")
print()

# 5) For the best N, show what integer each primary lands on and its type.
bestN = best[0][1]
step = 32768 / bestN
print(f"=== primary → round(p/step) with step=32768/{bestN}={step:.2f} ===")
per_idx = defaultdict(list)
for r in rows:
    if r["primary"] == 0x7FFF: continue
    idx = round(r["primary"] / step)
    per_idx[idx].append(r["osc"])
for idx in sorted(per_idx):
    c = collections.Counter(per_idx[idx])
    print(f"  idx={idx:2d}  (p≈0x{int(idx*step):04x}): {dict(c)}")
