#!/usr/bin/env python3
"""Pattern analysis against the expanded 65-entry tagging set.
Focuses on:
  (a) validating the current primary-16 lookup,
  (b) finding a disambiguator for the saturated+0x16 group,
  (c) looking for a universal bit/byte that encodes the OSC type."""
import json, collections, sys
from collections import defaultdict
from pathlib import Path

PATH = Path(__file__).parent.parent / "microfreak-osc-overrides.2026-04-22T07-23-48.json"
DATA = json.loads(PATH.read_text())

def u16le(b, i): return b[i] | (b[i+1] << 8)

CURRENT_LOOKUP = {
    0x0aab: "Basic Waves", 0x152a: "Superwave", 0x1555: "Superwave",
    0x31c7: "Waveshaper", 0x356a: "Karplus Strong", 0x38e3: "Two Op. FM",
    0x4000: "V. Analog", 0x4081: "V. Analog", 0x4aaa: "Waveshaper",
    0x52d2: "Speech", 0x5555: "Two Op. FM", 0x70f0: "Bass",
    0x7878: "SawX", 0x78e3: "Harm",
}
SAT_LOOKUP = {0x0d: "Noise", 0x0e: "Vocoder", 0x11: "Harm", 0x12: "User Wavetable"}

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
        "p1Tag": b[21] if len(b) > 21 else None,
        "p1":    u16le(b, 22) if len(b) > 23 else None,
        "p2Tag": b[32] if len(b) > 32 else None,
        "p2":    u16le(b, 33) if len(b) > 34 else None,
        "p3Tag": b[43] if len(b) > 43 else None,
        "p3":    u16le(b, 44) if len(b) > 45 else None,
        "bytes": b,
    })

print(f"Total tagged: {len(rows)}\n")

# 1) How does the CURRENT lookup perform?
print("=== Current lookup table vs. 65 tagged presets ===")
ok = na = wrong = 0
new_primary_types = collections.Counter()
for r in rows:
    p, t = r["primary"], r["osc"]
    if p in CURRENT_LOOKUP:
        if CURRENT_LOOKUP[p] == t: ok += 1
        else:
            wrong += 1
            print(f"  WRONG primary=0x{p:04x}: lookup={CURRENT_LOOKUP[p]}  user={t}  ({r['name']})")
    elif p == 0x7FFF:
        g = SAT_LOOKUP.get(r["vcodTag"])
        if g == t: ok += 1
        elif g is None: na += 1; new_primary_types[(p, r["vcodTag"], t)] += 1
        else:
            wrong += 1
            print(f"  WRONG sat+tag=0x{r['vcodTag']:02x}: lookup={g}  user={t}  ({r['name']})")
    else:
        na += 1
        new_primary_types[(p, r["vcodTag"], t)] += 1
print(f"\n{ok}/{len(rows)} correct, {na} n.a. (not in table), {wrong} wrong")
print()

# 2) New (primary, vcodTag, type) combos not yet in the lookup:
print("=== NEW combos (not in existing lookup) ===")
for (p, tag, t), n in sorted(new_primary_types.items()):
    print(f"  p=0x{p:04x}  tag=0x{tag:02x}  {t:<16}  (x{n})")
print()

# 3) For saturated+0x16 (Cloud/Hit/Scan/Sample group), look at discriminating bytes.
sat16 = [r for r in rows if r["primary"] == 0x7FFF and r["vcodTag"] == 0x16]
print(f"=== Saturated + vcodTag=0x16: {len(sat16)} presets ===")
for r in sat16:
    p1 = f"p1=0x{r['p1']:04x}" if r['p1'] is not None else "p1=?"
    p2 = f"p2=0x{r['p2']:04x}" if r['p2'] is not None else "p2=?"
    p3 = f"p3=0x{r['p3']:04x}" if r['p3'] is not None else "p3=?"
    print(f"  {r['osc']:<16} {r['name']:<24} {p1} {p2} {p3}  p1Tag=0x{r['p1Tag']:02x}")
print()

# 4) For ALL saturated presets (any vcodTag), per byte position scan for discriminators.
sat = [r for r in rows if r["primary"] == 0x7FFF]
print(f"=== Saturated ({len(sat)} total): per-position purity scan ===")
if sat:
    L = min(len(r["bytes"]) for r in sat)
    scored = []
    for pos in range(L):
        buckets = defaultdict(set)
        vals_per_type = defaultdict(set)
        for r in sat:
            b = r["bytes"][pos]
            buckets[b].add(r["osc"])
            vals_per_type[r["osc"]].add(b)
        pure = sum(1 for ts in buckets.values() if len(ts) == 1)
        total = len(buckets)
        if total >= 3 and pure/total >= 0.8:
            scored.append((pure/total, total, pos, dict(buckets)))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    print("Top 15 positions (purity >= 0.8, >= 3 distinct values):")
    for pur, total, pos, buckets in scored[:15]:
        summary = {v: sorted(ts) for v, ts in sorted(buckets.items())}
        print(f"  pos {pos:3d}  purity={pur:.2f}  distinct={total}")
        for v, types in sorted(summary.items())[:6]:
            print(f"     0x{v:02x}={v:3d}: {types}")
print()

# 5) Focused: within sat+0x16, find a byte that separates Cloud/Hit/Scan/Sample.
print(f"=== Within sat+0x16 ({len(sat16)}), find per-position discriminator ===")
if sat16:
    L = min(len(r["bytes"]) for r in sat16)
    scored = []
    for pos in range(L):
        buckets = defaultdict(set)
        for r in sat16:
            buckets[r["bytes"][pos]].add(r["osc"])
        pure = sum(1 for ts in buckets.values() if len(ts) == 1)
        total = len(buckets)
        if total >= 2:
            scored.append((pure/total, total, pos, dict(buckets)))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    print("Top 15:")
    for pur, total, pos, buckets in scored[:15]:
        summary = {v: sorted(ts) for v, ts in sorted(buckets.items())}
        print(f"  pos {pos:3d}  purity={pur:.2f}  distinct={total}: {summary}")
print()

# 6) Global: across ALL presets, is there a single-byte universal classifier?
print(f"=== ALL {len(rows)} presets: per-position single-byte classifier quality ===")
L = min(len(r["bytes"]) for r in rows)
scored = []
for pos in range(L):
    buckets = defaultdict(set)
    for r in rows:
        buckets[r["bytes"][pos]].add(r["osc"])
    pure = sum(1 for ts in buckets.values() if len(ts) == 1)
    total = len(buckets)
    if total >= 5 and pure/total >= 0.7:
        scored.append((pure/total, total, pos, dict(buckets)))
scored.sort(key=lambda x: (-x[0], -x[1]))
print("Top 15 (purity >= 0.7, >= 5 distinct values):")
for pur, total, pos, buckets in scored[:15]:
    print(f"  pos {pos:3d}  purity={pur:.2f}  distinct={total}")

# 7) Look for the 1.5× ratio: is there a bit somewhere that flips the scale?
print()
print("=== 1.5x duplicate types: compare bytes between the two primaries ===")
# Waveshaper at 0x31c7 vs 0x4aaa, Two Op.FM at 0x38e3 vs 0x5555.
for type_name in ["Waveshaper", "Two Op. FM"]:
    rs = [r for r in rows if r["osc"] == type_name and r["primary"] != 0x7FFF]
    by_primary = defaultdict(list)
    for r in rs:
        by_primary[r["primary"]].append(r)
    if len(by_primary) >= 2:
        primaries = sorted(by_primary)
        print(f"  {type_name}: primaries = {[hex(p) for p in primaries]}")
        for pos in range(min(len(r["bytes"]) for r in rs)):
            vals_by_primary = {p: set(r["bytes"][pos] for r in by_primary[p]) for p in primaries}
            # If one primary has a distinct byte vs the other, flag it
            v_lo = vals_by_primary[primaries[0]]
            v_hi = vals_by_primary[primaries[1]]
            if v_lo.isdisjoint(v_hi) and len(v_lo) == 1 and len(v_hi) == 1:
                print(f"    pos {pos:3d}: {primaries[0]:#06x}={next(iter(v_lo)):3d}  {primaries[1]:#06x}={next(iter(v_hi)):3d}")
