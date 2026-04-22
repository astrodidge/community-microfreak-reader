#!/usr/bin/env python3
"""Analyse user-tagged OSC-type overrides to look for patterns that the
current decoder misses.

Structure of each vcodBytes entry (from the JS side):
    [0..8]   '#VCODType' marker
    [9]      'c' (0x63)
    [10]     tag byte (suspected encoding/version nibble)
    [11..12] primary LSB, MSB (little-endian 16-bit)
    [13..19] 'FParam1'
    [20]     'c' (0x63)
    [21]     FParam1 tag byte
    [22..23] FParam1 LSB, MSB
    [24..30] 'FParam2'
    [31]     'c'
    [32]     FParam2 tag byte
    [33..34] FParam2 LSB, MSB
    [35..41] 'FParam3'
    [42]     'c'
    [43]     FParam3 tag byte
    [44..45] FParam3 LSB, MSB
    (more follows: BendRng, then next section @#VCFDType, etc.)
"""
import json, collections, sys
from pathlib import Path

PATH = Path(__file__).parent.parent / "microfreak-osc-overrides.2026-04-22T06-53-30.json"

DATA = json.loads(PATH.read_text())

def u16le(b, i):
    return b[i] | (b[i+1] << 8)

rows = []
for key, rec in DATA.items():
    b = rec["vcodBytes"]
    # Sanity: check marker.
    if b[:9] != [0x23, 0x56, 0x43, 0x4f, 0x44, 0x54, 0x79, 0x70, 0x65]:
        print(f"skip (bad marker): {rec['presetName']}")
        continue
    row = {
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
    }
    rows.append(row)

print(f"Total tagged presets: {len(rows)}\n")

# 1) How many are primary-saturated vs not?
sat = [r for r in rows if r["primary"] == 0x7FFF]
nonsat = [r for r in rows if r["primary"] != 0x7FFF]
print(f"Primary saturated (0x7FFF): {len(sat)}")
print(f"Primary non-saturated:     {len(nonsat)}")
print()

# 2) For non-saturated, does the linear formula index=primary*22/32768+1 pick
#    the right type? (This is what the current decoder does.)
# OSC_TYPE_TABLE from JS: intro order, with byte centers. Let me use the
# reconstructed 22-entry intro-order names.
INTRO_ORDER = [
    "Basic Waves","Superwave","Wavetable","Harmo","Karplus Strong",
    "V. Analog","Waveshaper","Two Op. FM","Formant","Chords","Speech",
    "Modal","Noise","Vocoder","Bass","SawX","Harm","User Wavetable",
    "Sample","Scan Grains","Cloud Grains","Hit Grains",
]
BYTE_CENTERS = [5,11,17,23,29,34,40,46,52,58,64,69,75,81,87,93,98,104,110,116,122,127]

def decode_via_byte14(byte_val):
    best, bd = None, 99
    for c, n in zip(BYTE_CENTERS, INTRO_ORDER):
        d = abs(byte_val - c)
        if d < bd: bd, best = d, n
    return best

# byte_14 in unpacked stream = the '#VCODType' primary MSB = bytes[12].
print("=== Non-saturated: does byte[12] (MSB) nearest-match give the right type? ===")
ok = 0
wrong = []
for r in nonsat:
    b14 = r["bytes"][12]
    guess = decode_via_byte14(b14)
    if guess == r["osc"]:
        ok += 1
    else:
        wrong.append((r["name"], r["osc"], guess, b14, r["primary"]))
print(f"Correct: {ok}/{len(nonsat)}")
print("Wrong cases (name / user-tag / decoder-guess / byte14 / primary16):")
for w in wrong:
    print(f"  {w[0]:<20} user={w[1]:<15} guess={w[2]:<15} b14={w[3]:3d} p16=0x{w[4]:04x}")
print()

# 3) For saturated presets, list FParam tag bytes and the user type.
print("=== Saturated: distribution of FParam tag bytes per OSC type ===")
from collections import defaultdict
grouped = defaultdict(list)
for r in sat:
    grouped[r["osc"]].append(r)
for osc in sorted(grouped):
    rs = grouped[osc]
    p1tags = collections.Counter(r["p1Tag"] for r in rs)
    p2tags = collections.Counter(r["p2Tag"] for r in rs)
    p3tags = collections.Counter(r["p3Tag"] for r in rs)
    vctags = collections.Counter(r["vcodTag"] for r in rs)
    print(f"  {osc:<16} ({len(rs):2d}x) vcodTag={dict(vctags)}  p1Tag={dict(p1tags)}  p2Tag={dict(p2tags)}  p3Tag={dict(p3tags)}")
print()

# 4) Look for any byte position in vcodBytes that cleanly separates by oscType for saturated presets.
print("=== Saturated: per-byte-position, is there a position where bytes cluster by type? ===")
if sat:
    L = min(len(r["bytes"]) for r in sat)
    best_positions = []
    for pos in range(L):
        # For each osc type at this position, gather byte set.
        per_type_bytes = defaultdict(set)
        for r in sat:
            per_type_bytes[r["osc"]].add(r["bytes"][pos])
        # "Purity": does each byte value appear for only one type?
        byte_to_types = defaultdict(set)
        for t, bset in per_type_bytes.items():
            for b in bset:
                byte_to_types[b].add(t)
        pure = sum(1 for ts in byte_to_types.values() if len(ts) == 1)
        total = len(byte_to_types)
        # Also: how many distinct values at this position?
        n_distinct = len(byte_to_types)
        if total and n_distinct > 1:
            best_positions.append((pure/total, n_distinct, pos))
    best_positions.sort(reverse=True)
    print("Top 15 positions by purity (pure=frac of byte values that belong to a single type):")
    for pur, nd, pos in best_positions[:15]:
        # describe what's there
        vals = collections.Counter()
        for r in sat:
            vals[r["bytes"][pos]] += 1
        print(f"  pos {pos:3d}  purity={pur:.2f}  distinct={nd}  top vals={dict(vals.most_common(5))}")
print()

# 5) Pair-of-positions signal: can any (posA, posB) distinguish types perfectly?
print("=== Saturated: try pairs of positions for higher purity ===")
# Expensive; scan a limited range.
if sat and len(sat) >= 3:
    L = min(len(r["bytes"]) for r in sat)
    # Focus on positions with some variability
    interesting = [pos for pos in range(L) if len({r["bytes"][pos] for r in sat}) > 1]
    best_pairs = []
    for i, a in enumerate(interesting):
        for b in interesting[i+1:]:
            kv = defaultdict(set)
            for r in sat:
                kv[(r["bytes"][a], r["bytes"][b])].add(r["osc"])
            pure = sum(1 for ts in kv.values() if len(ts) == 1)
            total = len(kv)
            if total > 0 and pure/total >= 0.9 and total >= 5:
                best_pairs.append((pure/total, total, a, b))
    best_pairs.sort(reverse=True)
    print(f"Top 10 pairs (purity, n_distinct_combos, posA, posB):")
    for pur, n, a, b in best_pairs[:10]:
        print(f"  ({a:3d},{b:3d})  purity={pur:.2f}  combos={n}")
print()

# 6) For each saturated OSC type, show the full VCOD section (truncated to 46 bytes) in hex to eyeball.
print("=== Saturated rows (one per preset), bytes[10..45] in hex ===")
for r in sat[:60]:
    hexs = " ".join(f"{x:02x}" for x in r["bytes"][10:46])
    print(f"  {r['osc']:<16} {r['name']:<20} {hexs}")
