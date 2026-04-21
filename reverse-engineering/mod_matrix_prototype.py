#!/usr/bin/env python3
"""
Mod-matrix decoder prototype (RE-30 candidate).

Strategy:
 1. Scan preset bytes for @#Co<N> destination markers (with tolerance for
    null bytes inserted by overlaid amount/flag encoding).
 2. For each destination that IS present, apply RE-29's per-source stride
    arithmetic anchored at the REAL Co marker position (not hardcoded
    absolute positions).

Destinations whose marker is absent are reported as all zeros.

The per-destination Env-row anchor offsets were derived empirically from
slot 5 "Xoo0Ooo" (preset 6), where RE-29 is known-correct.

Usage:
    python3 mod_matrix_prototype.py <save_file.json> <preset_num_1based>
"""
import json
import sys

# Destination enum (1-based): matches the @#CoN marker number
DEST_NAMES = {
    1: "Pitch",
    2: "Wave",
    3: "Timbre",
    4: "Cutoff",
    5: "Assign1",
    6: "Assign2",
    7: "Assign3",
}

SRC_NAMES = ["CycEnv", "Env", "LFO", "Press", "Key/Arp"]

# Offsets derived from slot 5 (Xoo0Ooo, preset 6):
#   env_lsb_off = RE-29 Env-row LSB absolute  - Co marker position
#   env_flag_off = RE-29 Env-row flag absolute - Co marker position
#   env_bit      = msb bit position for Env row (from RE-29 anchors)
# Co3/Co5/Co7 marker positions inferred from data scan (959, 1062, 1165).
DEST_ENV_OFFSETS = {
    1: (21, 15, 5),   # PITCH
    2: (22, 20, 1),   # OSC_WAVE
    3: (22, 17, 4),   # OSC_TIMBRE
    4: (22, 21, 0),   # FILTER_CUTOFF
    5: (22, 18, 3),   # ASSIGN1
    6: (21, 14, 6),   # ASSIGN2
    7: (22, 19, 2),   # ASSIGN3
}


def find_co_markers(flat):
    """Return {dest_num: start_position} for present Co markers."""
    markers = {}
    i = 0
    while i < len(flat) - 6:
        if flat[i:i+4] == [0x40, 0x23, 0x43, 0x6F]:  # @#Co
            # Digit may be at i+4, or after 1-2 null bytes (overlaid)
            j = i + 4
            while j < i + 7 and j < len(flat) and flat[j] == 0:
                j += 1
            if j < len(flat) and 0x31 <= flat[j] <= 0x37:
                dest = flat[j] - 0x30
                if dest not in markers:  # first occurrence wins
                    markers[dest] = i
        i += 1
    return markers


def decode_cell(flat, pos, lsb_off, flag_off, msb_bit, split):
    """Decode one (source, dest) cell. Returns percentage (-100..+100)."""
    lsb_p = pos + lsb_off
    flag_p = pos + flag_off
    if split:
        msb_p = pos + lsb_off + 2
        sign_byte_p = pos + lsb_off + 1
        sign = (flat[sign_byte_p] & 0x01) != 0
        msb_flag = (flat[flag_p] & 0x40) != 0
    else:
        msb_p = pos + lsb_off + 1
        sign = (flat[flag_p] & (1 << (msb_bit + 1))) != 0
        msb_flag = (flat[flag_p] & (1 << msb_bit)) != 0
    lsb = flat[lsb_p]
    msb = flat[msb_p]
    n = (msb << 8) + lsb + (0x80 if msb_flag else 0)
    if sign:
        raw = -(((~n) & 0x7FFF) + 1)
    else:
        raw = n
    return raw * 1000 / 32768 / 10


def decode_mod_matrix(data):
    """Return {dest_num: {src_idx: pct}} for present destinations."""
    flat = [b for block in data for b in block]
    markers = find_co_markers(flat)
    result = {}
    for dest, pos in markers.items():
        if dest not in DEST_ENV_OFFSETS:
            continue
        env_lsb_off, env_flag_off, env_bit = DEST_ENV_OFFSETS[dest]
        # Per-source bits (Env=s=1 uses env_bit; others shifted by (s-1))
        bits = [((env_bit + s - 1) % 7 + 7) % 7 for s in range(5)]
        splits = [b == 6 for b in bits]
        lsb_offs = [0] * 5
        flag_offs = [0] * 5
        lsb_offs[1] = env_lsb_off
        flag_offs[1] = env_flag_off
        lsb_offs[0] = env_lsb_off - (10 if splits[0] else 9)
        flag_offs[0] = env_flag_off - (16 if splits[0] else 8)
        for s in range(2, 5):
            lsb_offs[s] = lsb_offs[s - 1] + (10 if splits[s - 1] else 9)
            flag_offs[s] = flag_offs[s - 1] + (16 if splits[s - 1] else 8)
        src_amounts = {}
        for s in range(5):
            try:
                src_amounts[s] = decode_cell(
                    flat, pos, lsb_offs[s], flag_offs[s],
                    bits[s], splits[s]
                )
            except IndexError:
                src_amounts[s] = None
        result[dest] = src_amounts
    return result, markers


def format_matrix(result, markers):
    """Format as a 5-row x 7-col table like the UI."""
    out = []
    header = f"{'':<10}" + ''.join(f"{DEST_NAMES[d]:>10}" for d in range(1, 8))
    out.append(header)
    marker_row = f"{'marker@':<10}" + ''.join(
        f"{markers.get(d, '-'):>10}" for d in range(1, 8)
    )
    out.append(marker_row)
    out.append("-" * len(header))
    for s in range(5):
        row = [f"{SRC_NAMES[s]:<10}"]
        for d in range(1, 8):
            cell = result.get(d, {}).get(s)
            if cell is None:
                row.append(f"{'-':>10}")
            elif abs(cell) < 0.5:
                row.append(f"{'0':>10}")
            else:
                row.append(f"{cell:>10.1f}")
        out.append(''.join(row))
    return '\n'.join(out)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    save_file = sys.argv[1]
    preset_num = int(sys.argv[2])

    with open(save_file) as f:
        presets = json.load(f)
    p = presets[preset_num - 1]
    print(f"=== Preset {preset_num}: {p.get('name')!r} "
          f"fw={p.get('fw')} cat={p.get('cat')} "
          f"d[0][12]={p['data'][0][12]:#04x} ===")
    result, markers = decode_mod_matrix(p['data'])
    print(format_matrix(result, markers))


if __name__ == "__main__":
    main()
