#!/usr/bin/env python3
"""Test the unified formula: idx = round(primary * vcodTag / 32768).

Hypothesis: vcodTag (fmt byte) == number of OSC types the firmware knew when
the preset was saved. Each type encodes as intro_idx * 32768 / vcodTag.
Saturated (primary = 0x7FFF) means the top-numbered type in that firmware.
"""
import json
from pathlib import Path

PATH = Path(__file__).parent.parent / "microfreak-osc-overrides.2026-04-22T07-23-48.json"
DATA = json.loads(PATH.read_text())

# Intro-order names, 1-indexed. Position N = Nth OSC type added to firmware.
INTRO_ORDER = [
    "Basic Waves", "Superwave", "Wavetable", "Harmo", "Karplus Strong",
    "V. Analog", "Waveshaper", "Two Op. FM", "Formant", "Chords",
    "Speech", "Modal", "Noise", "Vocoder", "Bass",
    "SawX", "Harm", "User Wavetable", "Sample", "Scan Grains",
    "Cloud Grains", "Hit Grains",
]

def u16le(b, i): return b[i] | (b[i+1] << 8)

def decode(vcodTag, primary):
    if vcodTag < 1 or vcodTag > 22: return None
    if primary >= 0x7FFF:
        idx = vcodTag  # saturated = last type in this firmware
    else:
        idx = round(primary * vcodTag / 32768)
        if idx < 1: idx = 1
        if idx > vcodTag: idx = vcodTag
    return INTRO_ORDER[idx - 1]

ok = wrong = 0
for rec in DATA.values():
    b = rec["vcodBytes"]
    if b[:9] != [0x23,0x56,0x43,0x4f,0x44,0x54,0x79,0x70,0x65]: continue
    vcodTag = b[10]
    primary = u16le(b, 11)
    user = rec["oscType"].replace("\n", " ")
    got = decode(vcodTag, primary)
    if got == user:
        ok += 1
    else:
        wrong += 1
        print(f"MISS: {rec['presetName']:<20} user={user:<16} got={got:<16}  "
              f"tag=0x{vcodTag:02x}({vcodTag:2d}) primary=0x{primary:04x} "
              f"idx_calc={primary*vcodTag/32768:.3f}")

print(f"\n{ok}/{ok+wrong} correct ({wrong} miss).")
