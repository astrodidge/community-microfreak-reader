# Reverse-Engineering Follow-ups

Items to revisit after the current switch-mapping pass is complete.

## 1. Logarithmic scaling for time/frequency knobs

The current `_ranged(min, max, unit)` helper in `src/model/index.js` does
**linear** interpolation from raw 0..32767 to min..max. That's wrong for
parameters the MicroFreak displays on a log scale. Affected controls:

- **Filter cutoff** — 16 Hz .. 26,900 Hz (clearly log: octaves per knob turn)
- **Envelope Attack / Decay** — 0..10 s / 0..25 s (exponential)
- **Cycling Env Rise / Fall / Hold** — 0..10 s
- **Glide** — 0..10 s
- **LFO Rate Free** — 1 .. 32 Hz (log)

Plan when we get to this:

1. Extend the walk tool to capture a **MID** snapshot (50 % knob position) in
   addition to LOW (0 %) and HIGH (100 %). The tool today only does 2-point
   linear fits; a 3-point capture lets us distinguish linear vs log.
2. For each log-scale param, swap `_ranged` for a `_rangedLog(min, max, unit)`
   that maps `t ∈ [0,1]` to `min · (max/min)^t`. Use the MID-point reading
   to verify log vs linear (log → mid reading ≈ √(min·max); linear → mid
   reading ≈ (min+max)/2).
3. Per-parameter override: some may turn out linear after all (e.g. sustain %).

Don't rewrite until the MID data is in — wrong scaling curve is worse than
linear approximation.

## 2. Arp/LFO rate sync mode

When sync is ON, `ARP_SEQ_RATE` and `LFO_RATE` switch from BPM/Hz to
tempo-divided values (1/4, 1/8, 1/16 …). Currently `ARP_SEQ_RATE_FREE` and
`LFO_RATE_FREE` are patched; the SYNC variants (`_SYNC`) still use pre-RE
positions and have their own mapping functions (`_arp_rate_sync`,
`_lfo_rate_sync`) that likely reference outdated byte layouts.

Walk these separately with sync enabled on the device.

## 3. ARP_SEQ_RATE non-full-range knob

At physical max (fully CW) the walk captured raw ≈ `0x3D8C` rather than the
expected `0x7FFF`. Either the knob physically limits, or there's an msb-bit
or second encoding byte we didn't flip. Revisit and verify with the MID
capture.

## 4. filter_amt ancillary bytes

Only `data[32][10]` (with `data[32][8]` bit 1 as sign) is currently used for
the bipolar display. Bytes `data[32][8]` bit 0 and `data[32][9]` carry
additional info (msb-extension and full-range precision) that we currently
ignore. Resolution in the UI is good enough for ±1 %, but if higher precision
is ever needed, decode those too.

## 5. HOLD switch — not preset-stored

Walk at RE-18 showed **zero byte changes** when toggling HOLD on/off and
saving. Likely a performance-only state (like Master Volume) that lives in
live state but isn't written into the preset. Model entry still points at
`[0,0]` (the old TODO), which will always read 0 → "Off". Leave as-is unless
we find evidence it's stored somewhere.

## 6. Default values everywhere in the walk/prescan UI

The walk now supports per-parameter `lowDefault`/`highDefault` (RE-18). Extend
the same idea to **prescan**: let each parameter declare an ordered list of
expected value labels (e.g. for `arp_seq_mod` the list would be `["1","2","3","4"]`),
and prescan pre-fills the next expected one as the default at each step.
Pressing Enter accepts it, typing overrides. Halts when user types `done`.

Also: audit all prompts across rev.js and make sure every one has a sensible
default where reasonable. Current known prompts without defaults:
- prescan value-name prompt
- port-selection confirmation (already has `Y` implicit default, but worth
  being explicit)

## 7. Mod matrix: variable-length serialized encoding — SOLVED in RE-32

**RESOLVED.** RE-27 attempted a generator-based fix assuming a fixed grid.
RE-28 reverted that. RE-29 was a half-fix that only worked for some presets.
The root cause, finally identified in RE-32:

**Preset bytes as stored on disk are still MIDI 7-bit-packed SysEx.** Every
byte is ≤ 0x7F; every 8 packed bytes encode 7 true data bytes, with the first
byte of each group being a flag byte holding the bit-7 values of the next 7
bytes (LSB-first: flag bit 0 → byte 1, bit 1 → byte 2, etc.).

All earlier attempts read the still-packed bytes as if they were data bytes,
which misaligned positions based on how many upstream bytes had bit-7 set.
That's why some presets looked correct (flag bytes mostly zero) and others
looked "shifted left" (flag bytes nonzero moved real data by 1 each).

After unpacking, the mod matrix is a plain fixed-width grid:

- Single `@#Co1` marker anchors the matrix region.
- 7 destinations, each 45 bytes apart: Pitch, Wave, Timbre, Cutoff, Assign1,
  Assign2, Assign3.
- Each destination block: 5-byte marker `@#Co<N>` + 5 × 8-byte source rows.
- Each source row: 5-byte label (`CEG1c`, `CEG2c`, `CLFOc`, `CXprc`, `CKeyc`)
  + 3 trailing bytes `(pad, LSB, MSB)`.
- Cell value: `(MSB << 8) | LSB` as signed 16-bit little-endian, percent =
  `raw / 32768 × 100`.

Implementation: `unpackMidi7bit()` and `decodeModMatrixFW2()` in
`src/model/index.js`. Wired via `State.modMatrixValue()` — used for all FW
versions; the `supported=false` "indecipherable" gate in `ModMatrix.js` has
been removed so all presets render.

User validated: mod-matrix display is correct on FW2 (Xoo0Ooo, Leftovers, etc.)
and on at least one FW1 factory preset (Vanarx) that was previously hidden.
Not exhaustively verified across all 512 presets.

## 8. cyc_env_rise_shape / fall_shape: bipolar or unipolar?

Walked unipolar (0..100 %) because the user reported 0..100 on the device.
If the shape is actually bipolar (exp → linear → log curve), we may need to
re-examine — expected bipolar capture would show two sign bits and/or
symmetric byte patterns, which we didn't see. Low priority; likely correct
as-is.
