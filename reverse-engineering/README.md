# `rev.js` — MicroFreak Reverse-Engineering Tool

A Node.js CLI that talks to a MicroFreak over MIDI via `@julusian/midi` and
uses the same sysex protocol as the main app (`src/utils/midi.js`). It
captures raw preset dumps and diff-tables byte positions as the user tweaks
parameters on the device — the primary mechanism for discovering where each
parameter lives in the preset format.

All output goes to files in this folder — never to `src/`. Findings are
promoted manually into `src/model/index.js` after they're understood.

## Setup

```bash
cd reverse-engineering
yarn install       # once — installs @julusian/midi
```

Connect the MicroFreak via USB before running any command that talks to it
(`snap`, `walk`, `prescan`). `list-ports` works without a device.

## Commands

All commands use **device display numbering** for preset numbers — i.e. 1..512
as shown on the MicroFreak screen (not 0-indexed internally).

### `list-ports`
```bash
node rev.js list-ports
```
Lists available MIDI input/output ports. Useful for troubleshooting port
auto-detection (the tool normally matches on the substring `microfreak`).

### `snap <label> [preset#]`
```bash
node rev.js snap my_label           # captures the preset currently loaded on MF
node rev.js snap my_label 450       # captures preset 450 (switches on device)
```
Captures one full 146-block preset dump and writes
`snapshots/<label>.json`. Filename-safe label characters only (`[a-zA-Z0-9_-]`).

### `diff <A> <B>`
```bash
node rev.js diff before_a2_p85 a2_p85
```
Byte-by-byte diff between two snapshots. Prints `data[block][byte]: low → high`
lines for every byte that differs. This is the workhorse for identifying
which byte(s) a single parameter lives at.

### `walk [--preset N] [--redo] [--only id1,id2]`
```bash
node rev.js walk --preset 450
```
Interactive sweep through `parameters.json`. For each parameter:
1. Prompts "set LOW" → user zeroes/minimum the param on MF, saves, Enter.
2. Tool captures snapshot `<param>_low.json`.
3. Prompts "set HIGH" → user max-es the param on MF, saves, Enter.
4. Tool captures `<param>_high.json`.
5. Diffs the two and records the changed byte positions in `findings.json`.

Flags:
- `--preset N` : start on preset N (default 1). Tool loads that preset on the
  device at session start.
- `--redo` : re-walk parameters that already have entries in `findings.json`.
- `--only id1,id2` : limit the walk to specific parameter ids (see
  `parameters.json`).

### `prescan --preset N --param <id>`
```bash
node rev.js prescan --preset 450 --param osc_type
```
Different from `walk`: instead of LOW/HIGH, the user manually steps through
*every discrete value* of a parameter. Designed for enum-like params such as
`osc_type` (22 values), `lfo_shape` (6), `cycling_env_mode` (3), etc.

Flow:
1. User sets the parameter to value 1 on MF, saves, types a label ("Basic
   Waves"), Enter.
2. Tool captures, stores as `snapshots/prescan_<param>__<label>.json`.
3. Repeat for each value. Type `done` when finished.
4. Tool cross-tables every byte position across the sequence of snapshots,
   keeping positions whose value varied. Saves under
   `findings.findings.<param>_prescan` in `findings.json`.

Resumes automatically: on re-run, any existing `prescan_<param>__*.json`
files are loaded and the user continues from there.

## Output files

- `snapshots/<label>.json` — full raw preset dumps (146 × 32 bytes + name/cat
  metadata). These are `[T1-RAW]` per `golden-rules.md` — the gold standard.
- `findings.json` — aggregated results keyed by parameter id:
  - `<param>` : from `walk` (low/high byte diffs)
  - `<param>_prescan` : from `prescan` (cross-tabulated distinct-value
    positions)
- `parameters.json` — the walk's parameter catalogue (id + instruction
  shown to user). Edit to add new params.

## Typical workflow

When the app is misreading a parameter:

1. **Hypothesize** whether it's a positional or mapping issue.
2. **Capture** empirical data: `walk` for range (knob) params, `prescan`
   for enum (switch/type) params.
3. **Classify** findings per `golden-rules.md` — raw captures are `[T1-RAW]`,
   the prescan's position-diff table is `[T2-PROCESSED]`.
4. **Cross-check** against an independent read (e.g. a different fmt preset,
   a marker-anchored decode) before trusting.
5. **Promote** the verified byte positions into `src/model/index.js` —
   either as hardcoded coordinates or, preferably, as marker-anchored reads
   (see `src/model/index.js` `readSectionParam` and followups.md).

## Preset format caveats

See `../CLAUDE.md` for the full set of gotchas, especially:
- Preset bytes on the wire are **MIDI 7-bit-packed**. Every byte ≤ 0x7F.
  Every 8 packed bytes encode 7 true 8-bit bytes; the first is a flag
  byte holding bit-7 values of the following 7. Unpack before reading
  fixed-offset positions, OR anchor on ASCII markers (see §Status of earlier
  items in `followups.md`).
- `data[0][12]` is a format marker. Seven values seen in the wild:
  0x0c (FW1), 0x0d, 0x0e, 0x11 (factory FW2), 0x12, 0x16 (user FW2),
  0x7f. Different fmts have different byte layouts for the same
  parameter — a walk on one fmt does not generalise to others.
  `prescan` on a **user slot** (fmt 0x16) gives the most-commonly-useful
  positions; compare with walks on fmt 0x11 factory presets to spot
  layout-dependencies.

## Relation to the main app

The tool **never modifies** the main app. Data flows one-way: tool → manual
review → `src/model/index.js` update. The tool uses the same sysex protocol
constants (message framing, block count, etc.) so its dumps are exactly
what the app sees over MIDI.
