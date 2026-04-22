# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Community fork of MicroFreak Reader — a React/Electron app for reading and displaying presets from an Arturia MicroFreak synthesizer via WebMIDI. Read-only: reads saved presets and sends Program Change messages. Supports 512 presets (4 banks of 128). Reverse-engineered sysex protocol — no official documentation exists.

## Gotchas specific to this project

- **Preset bytes on disk/wire are MIDI 7-bit-packed SysEx.** Every byte is
  ≤ 0x7F. Every 8 packed bytes encode 7 true 8-bit data bytes: the first
  byte of each 8-byte group is a flag byte whose bits 0-6 hold the bit-7
  values of the following 7 data bytes (LSB-first mapping — flag bit 0 →
  byte 1's bit 7, bit 1 → byte 2, etc.). **Unpack before reading positional
  data** — hardcoded offsets drift by 1 byte per upstream flag bit that's
  set. `unpackMidi7bit()` in `src/model/index.js` does this. As of RE-32
  the mod-matrix decoder uses the unpacked stream (`decodeModMatrixFW2()`;
  name is historical, used for all fw). The old `multibytesValue()` helper
  is still used by CONTROL/SWITCH readers which happen to work because the
  relevant bytes land where upstream flag bits are usually zero — but this
  is fragile; prefer unpacked reads when adding new parameters.
- **Mod matrix layout (after unpacking):** single `@#Co1` marker anchors
  the region; 7 destinations 45 bytes apart (Pitch, Wave, Timbre, Cutoff,
  Assign1-3); each destination = marker + 5 × 8-byte source rows; each row
  = 5-byte source label (`CEG1c`, `CEG2c`, `CLFOc`, `CXprc`, `CKeyc`) + 3
  trailing bytes `(pad, LSB, MSB)`; cell value = signed 16-bit little-endian
  → percent of 32768. See `reverse-engineering/followups.md` §7 for history.
- **Presets have 146 data blocks of 32 bytes each** (≈ 4.6 KB total), but
  the legacy code only reads the first 40 blocks (`MESSAGES_TO_READ_FOR_PRESET`
  in `src/utils/midi.js`). Mod-matrix amounts live in blocks beyond 40 —
  reading only 40 blocks will miss them.
- **Factory vs user preset format differs substantially.** Saving a factory
  preset to a user slot re-serialises it (blocks differ byte-for-byte).
  `data[0][12]` is a format marker — seven values seen in the wild:
    - `0x0C` (12): FW1 (legacy)
    - `0x0D`, `0x0E`, `0x11`, `0x12`, `0x7F`: intermediate factory fmts
    - `0x16` (22): user, modern firmware (what MF writes on save)
  The React code's `fwVersion()` lumps everything non-0x0C together as FW2.
  Since RE-32..RE-45 the model reads are fully **marker-anchored** (search
  for ASCII markers like `@#LFOEShape`, `@#VCFDType`, `#VCODType`, etc. in
  the unpacked stream) — this makes reads robust across all fmts.
- **OSC Type: firmware-count formula (RE-46).** `data[0][12]` (the fmt
  byte, also `unpacked[vcod_marker+10]`) equals the **number of OSC
  types the firmware knew at save time**: 12 → 13 → 14 → 17 → 18 → 22
  across firmware revisions. The primary 16-bit value at `#VCODType`
  encodes the intro-order index scaled into that firmware's range:

      idx = round(primary × vcodTag / 32768)    [or vcodTag if saturated]
      type = INTRO_ORDER[idx - 1]

  Saturated primary (0x7FFF) means "the last type in this firmware".
  100 % match across 65 user-tagged + 40 spot-checked presets. See
  `src/model/index.js` `oscTypeName()`.
- **Sample sub-type (RE-47).** The 4 sample-using OSC types (Sample /
  Scan Grains / Cloud Grains / Hit Grains) store the selected sample in
  sub-marker `FSmpIdx` inside `#VCODType`, same `<marker>c<tag><LSB><MSB>`
  layout as `FParam1/2/3`. The 16-bit LE value is always
  `(idx - 1) × 258` — MSB alone = idx-1. `decodeSampleIdx()` in
  `src/model/index.js`. Factory sample names in `src/model/samples.js`.
- **Tagging UI & override store.** `src/components/Control.js` renders a
  dropdown in the OSC section letting the user tag the correct OSC type
  and (for sample-using types) the correct sample. Overrides persist to
  localStorage keyed by a hash of the `#VCODType` bytes; user overrides
  always beat the decoded value. An "OSC tagging on/off" toggle in the
  header disables the override-lookup path entirely for perf. Export
  button dumps the full JSON (bytes + labels) for pattern analysis —
  this pipeline is what cracked RE-46 and RE-47.

## How the Build Tooling Works

- **Node.js** — JavaScript runtime that lets you run JavaScript outside a browser (on your Mac, a server, etc.)
- **npm** (Node Package Manager) — manages JavaScript libraries (dependencies). `npm install` reads `package.json` and downloads everything the project needs into `node_modules/`.
- **react-scripts** — the build tooling from Create React App. Bundles JavaScript/CSS, starts a local dev web server, and hot-reloads on file changes.

The chain: `npm start` → looks up the `"start"` script in `package.json` → runs `react-scripts start` → bundles code + starts dev server at localhost:3000 → you open Chrome.

`npm run build` creates static HTML/JS/CSS files in `build/` that can be hosted anywhere or wrapped in an Electron desktop app.

Requires Node.js >= 18 (managed via nvm: `source ~/.nvm/nvm.sh && nvm use 18`).

### Current Stack vs Modern Alternative

| | **Current stack** | **Vue + Vite + TypeScript** |
|---|---|---|
| **UI framework** | React 16 (class components, decorators) | Vue 3 (Composition API, single-file components) |
| **State management** | MobX (observable/observer pattern) | Pinia (built-in, similar reactive concept) |
| **Build tool** | react-scripts/Webpack (slow, legacy) | Vite (very fast, modern ESM-based) |
| **Language** | JavaScript (no type checking) | TypeScript (catches bugs at compile time) |
| **Dev server start** | ~10s | <1s (Vite uses native ES modules) |
| **Hot reload** | Full page refresh sometimes | Near-instant, preserves state |
| **Learning curve** | JSX mixes HTML in JS | Templates feel closer to plain HTML |
| **Boilerplate** | More verbose (class components, decorators, manual wiring) | Less — `<script setup>` is very concise |

A rewrite to Vue+Vite+TS would be significant — the core logic (MIDI sysex protocol, model definitions, value decoding) carries over, but all components and state management would need rewriting. Worth it for active development, not just for bug fixes.

## Commands

```bash
npm install            # Install dependencies (run once, or after changing package.json)
npm start              # Dev server (localhost:3000) — open in Chrome for WebMIDI support
npm run build          # Production build → outputs to build/
npm test               # Tests (react-scripts test)
npm run electron-dev   # React dev server + Electron concurrently
npm run dist           # Build + package desktop app (macOS/Windows/Linux)
```

## Architecture

**Stack:** React 16 + MobX 5 (observable state) + WebMIDI 2.5.1 + Electron 36

### State (`src/state/State.js`)

Single MobX store exported as singleton `state`. Key properties:
- `presets[512]` — each slot: `{name, data[][], fw, supported, cat}` or null
- `preset_number` (0-511 internally, displayed 1-512), `preset_number_comm` (preset being read via MIDI)
- `midi.ports` — connected MIDI port state

Key methods: `importData()` (parse sysex), `controlValue()`/`switchValue()`/`modMatrixValue()` (read parameter values from preset data), `setPresetNumber()`, `checkPreset()` (validate format).

### MIDI Protocol (`src/utils/midi.js`)

Preset reading is a multi-step sysex exchange:
1. `sendNameRequest()` — sysex with bank (`floor(n/128)`) and preset (`n%128`) to get name
2. `sendPresetRequest()` — initiates data transfer
3. `sendPresetRequestData()` — called 40 times in loop, 15ms between messages
4. `State.importData()` — stores incoming 32-byte blocks into `presets[n].data[]`

The `data[][]` is a 2D array: `data[block_index][byte_index]`. All control definitions reference positions via these coordinates.

Program Change: bank select CC0 = `floor(n/128)`, program = `n%128`.

### Model (`src/model/index.js`)

~1000+ lines defining all synth parameters. Each control maps to byte positions:
```javascript
CONTROL[fw][control_id] = { name, LSB: [block, byte], MSB: [block, byte], msb: [block, byte, mask], mapping }
SWITCH[fw][switch_id] = { name, values: [{value, name}], LSB, MSB, msb }
MOD_MATRIX[fw][source][destination] = { LSB, MSB, msb, sign }
```

Two firmware variants: `FW1=0`, `FW2=1`. Detected via `data[0][12] === 0x0C` (FW1) vs other (FW2).

### Value Decoding

`multibytesValue()` combines MSB (7-bit) + LSB (7-bit) + additional msb bit from a third byte, with optional sign bit. Raw 16-bit value displayed as percentage: `raw * 1000 / 32768 / 10`.

### Components (`src/components/`)

- **Midi.js** — WebMIDI init, port detection, sysex listener. Requires Chrome/Opera/Edge.
- **PresetSelector.js** — read controls: single preset, ranges (1-128, 129-256, 257-384, 385-512), read all
- **PresetsGrid.js** — clickable grid of all 512 presets
- **Control.js / Knob.js / Switch.js** — display individual synth parameters using model definitions
- **ModMatrix.js** — modulation matrix display (5 sources × destinations)
- **App.js** — main layout with sections: Oscillator, Filter, LFO, Envelope, Cycling Env, ARP/SEQ, Keyboard

### File Save/Load

Save exports `state.presets` array as JSON. Load reads JSON back into `state.presets` + calls `checkAllPresets()`. Pre-loaded preset packs in `public/data/*.json` (25 Arturia collections, each 256 presets). File utility in `src/utils/files.js`.

### Two App Modes

- Default (`/`) — full parameter display UI via `App.js`
- List view (`?list=1`) — lightweight preset browser via `List.js` with preset pack dropdown

### Themes

Three CSS themes (light/dark/darkest) via custom properties in `src/themes.css`, applied via `data-theme` attribute.

### Preset Sharing

Presets compressed with lz-string into URL parameter (`?data=`). Constructor in `State.js` decompresses on load.
