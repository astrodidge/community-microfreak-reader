#!/usr/bin/env python3
"""Find where the sample index is encoded in the preset bytes.

We have 16 user-tagged presets with known sampleIdx (1..52) and ~1024 bytes
of unpacked stream per preset. Scan for:
  (a) a byte position whose value ≈ sampleIdx (direct or scaled)
  (b) a 16-bit LE value that = round(idx × 32768 / N) for some N
  (c) ASCII markers we haven't seen before
  (d) per-position per-preset correlation with sampleIdx
"""
import json, collections
from collections import defaultdict
from pathlib import Path

PATH = Path(__file__).parent.parent / "microfreak-osc-overrides.2026-04-22T09-29-15.json"
DATA = json.loads(PATH.read_text())

tagged = []
for key, rec in DATA.items():
    if rec.get("sampleIdx") is None: continue
    if not rec.get("extendedBytes"): continue
    tagged.append({
        "name": rec["presetName"],
        "idx": rec["sampleIdx"],
        "sample": rec["sample"],
        "bytes": rec["extendedBytes"],
    })

print(f"Tagged samples: {len(tagged)}\n")
for r in sorted(tagged, key=lambda x: x["idx"]):
    print(f"  {r['idx']:3d} {r['sample']:<18} {r['name']}")
print()

L = min(len(r["bytes"]) for r in tagged)
print(f"Common byte window: {L}\n")

# (a) Per-byte-position, check if byte == idx
print("=== (a) Positions where byte == sampleIdx exactly, for all presets ===")
for pos in range(L):
    if all(r["bytes"][pos] == r["idx"] for r in tagged):
        print(f"  pos {pos:4d}: ALL MATCH (byte exactly == sampleIdx)")
    elif all(r["bytes"][pos] == r["idx"] - 1 for r in tagged):
        print(f"  pos {pos:4d}: ALL MATCH (byte exactly == sampleIdx - 1, 0-indexed)")
print()

# (b) Per-position, Spearman-like rank correlation between byte value and idx
print("=== (b) Byte positions with strong monotonic correlation to sampleIdx ===")
idxs = [r["idx"] for r in tagged]
scored = []
for pos in range(L):
    vals = [r["bytes"][pos] for r in tagged]
    if len(set(vals)) < 3: continue
    # Simple correlation: sort by idx, check if byte is monotonic
    pairs = sorted(zip(idxs, vals))
    sorted_vals = [v for _, v in pairs]
    # Count how many adjacent pairs are in non-decreasing order
    nondec = sum(1 for i in range(1, len(sorted_vals)) if sorted_vals[i] >= sorted_vals[i-1])
    nonincr = sum(1 for i in range(1, len(sorted_vals)) if sorted_vals[i] <= sorted_vals[i-1])
    mono = max(nondec, nonincr) / (len(sorted_vals) - 1)
    if mono >= 0.8:
        scored.append((mono, pos, vals))
scored.sort(key=lambda x: -x[0])
for mono, pos, vals in scored[:15]:
    pairs = sorted(zip(idxs, vals))
    shown = [(i, v) for i, v in pairs]
    print(f"  pos {pos:4d}  mono={mono:.2f}  pairs (idx,byte): {shown}")
print()

# (b2) 16-bit LE values: for each position, compute u16 and check correlation.
print("=== (b2) 16-bit LE positions where u16 ≈ idx × K for some K ===")
for pos in range(L - 1):
    u16s = [r["bytes"][pos] | (r["bytes"][pos+1] << 8) for r in tagged]
    # Skip constant / mostly-zero positions
    if len(set(u16s)) < 3: continue
    # Compute idx × K for each known relation
    # K_candidate = u16 / idx (for non-zero idx)
    ks = [u / i for u, i in zip(u16s, idxs) if i]
    if not ks: continue
    kmin, kmax = min(ks), max(ks)
    if kmin == 0: continue
    # Tight range = consistent scaling
    rel_range = (kmax - kmin) / ((kmax + kmin) / 2) if (kmin+kmax) else 9999
    if rel_range < 0.02 and kmax > 1:
        print(f"  pos {pos:4d}  u16/idx ratio: min={kmin:.2f} max={kmax:.2f} (step ≈ {sum(ks)/len(ks):.2f})")
        # Show a few examples
        for r in sorted(tagged, key=lambda x: x["idx"])[:5]:
            u = r["bytes"][pos] | (r["bytes"][pos+1] << 8)
            print(f"    idx={r['idx']:3d}  u16=0x{u:04x}={u:5d}  u16/idx={u/r['idx']:.2f}  ({r['name']})")
print()

# (c) ASCII markers not seen in earlier RE
print("=== (c) ASCII-ish byte sequences in the captured window ===")
MARKERS_SEEN = [b"@#LFOEShape", b"@#VCFDType", b"@#EG1DMode", b"@#EG2DMode",
                b"@#ArpFEnable", b"@#KbdEGlide", b"@#GenGParafon", b"#VCODType",
                b"@#Co1", b"FParam1", b"FParam2", b"FParam3"]
# Find all ASCII stretches (runs of printable chars ≥ 5) and report unique ones.
all_runs = collections.Counter()
for r in tagged:
    b = r["bytes"]
    i = 0
    while i < len(b):
        # Start of printable run?
        if 0x20 <= b[i] <= 0x7e:
            j = i
            while j < len(b) and 0x20 <= b[j] <= 0x7e:
                j += 1
            if j - i >= 5:
                all_runs[bytes(b[i:j])] += 1
            i = j
        else:
            i += 1
print(f"Unique ASCII runs ≥ 5 chars seen across the 16 presets:")
for s, n in all_runs.most_common(40):
    try:
        txt = s.decode("ascii")
    except:
        txt = repr(s)
    if any(m in s for m in MARKERS_SEEN): continue  # already-known
    print(f"  ×{n:2d}  {txt!r}")
print()

# (d) For each position, show the sorted (idx, byte) list if it varies a lot.
print("=== (d) Positions with wide byte variation — manual review ===")
# Filter: >= 6 distinct values across 16 presets
for pos in range(L):
    vals = [r["bytes"][pos] for r in tagged]
    if len(set(vals)) >= 6:
        pairs = sorted(zip(idxs, vals))
        print(f"  pos {pos:4d}  distinct={len(set(vals))}  (idx,byte): {pairs}")
