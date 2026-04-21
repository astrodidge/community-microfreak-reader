# Golden Rules: Information Reliability Classification

A framework for reasoning clearly about what we know vs. what we assume when
reverse-engineering the MicroFreak preset format. Always classify findings,
facts, hypotheses, etc. with one of the tags below.

> **Why:** Without this discipline, Claude in particular tends to conflate
> empirical findings with its own hypotheses and get entangled in its own
> logic. This document is the anchor that forces separation.

---

## The Six Classes

### `[T1-RAW]` — Raw empirical data, electronically acquired

- **Reliability: 99.9 %** (communication errors still possible)
- Gold standard.
- Examples: sysex bytes straight off the MIDI wire; unmodified JSON save file.

### `[T2-PROCESSED]` — Electronically acquired, but processed

- **Reliability: ~99 %**
- Less reliable than T1 because processing can introduce bugs.
- **Rule:** Whenever possible, store the raw data alongside the processed
  result so discrepancies can be audited.
- Example: prescan's analysis table (shows byte diffs after decoding).

### `[T3-USER]` — Data provided by or acquired via the user (human)

- **Reliability: 95-99 % at best**
- Examples: values the user types during a walk; readings from a MicroFreak
  display relayed by the user; photos of LEDs.
- **Rule:** Always challenge T3 data when ambiguities or mismatches appear.
  Humans mis-type, mis-read displays, misremember knob positions.

### `[T4-PROG]` — Data derived from a program (Claude's or user's code)

- **Reliability: at best 99 % — AFTER explicit test + user confirmation**
- Before confirmation: ~50-80 % (depends on how obvious the logic is).
- **Rule:** Always double-check. Treat as hypothesis until validated against T1/T2
  data from an independent path.
- Examples: rev.js prescan's "candidate hints"; the generator in RE-27 that
  computed byte positions from 7 anchors.

### `[T5-USER-HYP]` — Hypothesis proposed by the user

- **Reliability: 50-90 %**
- User experience/intuition often right but not infallible.
- **Rule:** Gather empirical data (T1/T2) to confirm or dismiss before acting.

### `[T6-CLAUDE-HYP]` — Hypothesis proposed by Claude

- **Reliability: 10-40 %** — often wrong.
- **Rule:** Absolutely must be checked and confirmed before relying on it.
  Explicitly design a T1 or T2 test whose outcome would falsify the hypothesis.

---

## Usage in docs, code comments, commit messages

Prefix statements with the tag so the reader immediately knows how much to
trust them. Examples:

> `[T1-RAW]` On preset 448 baseline (all knobs zero), the snapshot file
> `prescan_env_row__timbre.json` shows `data[30][22] = 0x40`, and the
> baseline snapshot (label "0") shows `data[30][22] = 0x00`.

> `[T6-CLAUDE-HYP]` Therefore `data[30][22]` is the Env→Timbre amount byte
> for every preset. (**Unverified across real presets — must check.**)

> `[T3-USER]` Photo of preset 28 "Aphexian Kick" appears to show the Env LED
> on the Timbre row as dim/off. (**Ambiguous — verify at device.**)

> `[T4-PROG]` rev.js's decoder on preset 28 reports `Env→Timbre = +100%`
> (from `data[30][22] = 127`). (**Only as reliable as the hypothesis behind
> the decoder — T6.**)

---

## Reliability combines conservatively

When multiple classes interact, the weakest link dominates.

- A T4 reading built on a T6 hypothesis has at best T6 reliability.
- A T1 fact about a baseline preset does NOT generalise to a T1 fact about
  all presets without an explicit generalisation step (which is itself T6
  until tested).

---

## Before inventing a new encoding, check standard-encoding-under-constraint first

When an encoding looks exotic ("asymmetric sign+magnitude", "two-byte value
where the second byte does something weird"), ask first whether it's a
**standard encoding (int16 two's complement, IEEE754 float, UTF-8, …)
physically adapted to the constraints of the communication channel** — e.g.:

- MIDI: 7-bit data bytes, bit 7 reserved.
- SysEx-over-USB / SLIP: framing bytes escape and split payload bytes.
- SNMP / ASN.1 BER: variable-length tagged encoding.
- Text protocols over binary data: base64, hex, etc.

The "exotic" part is usually just bits scattered across bytes because a full
native word doesn't fit the transport. Decode accordingly: extract the
standard-encoding representation first, then the meaning follows from the
standard.

**Heuristic:** if a formula like `-(((~n) & 0x7FFF) + 1)` appears in decode
code, that's almost certainly standard two's complement with some bits
physically relocated — not a novel encoding.

## When asserting a "fact", ask three questions

1. **Where did I get this from?** (assign the class)
2. **What's the reliability?** (cap at the weakest step in the derivation)
3. **What's the cheapest T1/T2 test that would falsify it?**

If answer to (3) is "none, I can't think of one", treat the fact as T6 and
don't build on it.

---

## Trap: "empirical" data that rode in on user interaction is T3, not T1

Prescan/walk tool outputs feel like T1 because the bytes were received
electronically. **They're not.** Every snapshot depends on the user setting
the right knob/switch on the device, saving, and typing the correct label
in the tool. Each step is T3 (human action, 95-99 % reliable).

The raw bytes themselves in the JSON snapshot file are T1 — but the
**interpretation** of what the user meant by those bytes (i.e., "this
corresponds to Env→Timbre = +50") is a chain whose weakest link is T3.

Concrete session failures that prove this:

- `env_attack_cal` prescan — the user was actually turning the Cyc-Env Rise
  knob while typing attack values. The tool faithfully recorded bytes that
  were unrelated to Env Attack.
- `arp_rate` walk — bytes captured with `sync=ON` on device but labeled in
  code as if from `sync=OFF`. Mis-attribution only discovered later.
- `HOLD` walk — user typed "On/Off" values but the byte didn't change
  (performance-only state, not preset-stored).

**Rule:** when promoting a prescan/walk result to a generalization ("byte X
is parameter Y"), the correct class is `[T3-USER]` for the single preset
walked, NOT `[T1-RAW]`. Extrapolating to other presets is an additional
`[T6-CLAUDE-HYP]` step.

## Recording findings

When adding entries to `findings.json`, future prescan/walk tools should
include a `class` field (`T1`, `T2`, `T3`, ...). For now, entries reflect
"T1 on the preset that was walked — T6 when extrapolated to other presets".
