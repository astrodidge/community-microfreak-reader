#!/usr/bin/env node
// MicroFreak reverse-engineering CLI.
// Uses the same sysex protocol as src/utils/midi.js, but driven from Node.

const midi = require('@julusian/midi');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SNAPSHOTS_DIR   = path.join(__dirname, 'snapshots');
const FINDINGS_FILE   = path.join(__dirname, 'findings.json');
const PARAMETERS_FILE = path.join(__dirname, 'parameters.json');

const WAIT_BETWEEN_MESSAGES      = 15;
const MESSAGES_TO_READ_FOR_PRESET = 146;  // was 40 — try full preset dump to expose matrix bytes
const RESPONSE_TIMEOUT           = 1500;
const DEVICE_MATCH               = /microfreak/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex   = (n)  => n.toString(16).padStart(2, '0').toUpperCase();
const ask   = (rl, q) => new Promise((r) => rl.question(q, r));

function bitCount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

// --- MIDI port discovery ---

function listPorts() {
  const inp = new midi.Input();
  const out = new midi.Output();
  const inputs  = [];
  const outputs = [];
  for (let i = 0; i < inp.getPortCount(); i++) inputs.push({ index: i, name: inp.getPortName(i) });
  for (let i = 0; i < out.getPortCount(); i++) outputs.push({ index: i, name: out.getPortName(i) });
  inp.closePort();
  out.closePort();
  return { inputs, outputs };
}

function autoPick(ports) { return ports.find((p) => DEVICE_MATCH.test(p.name)) || null; }

async function pickPorts(rl) {
  const { inputs, outputs } = listPorts();

  console.log('\nMIDI input ports:');
  inputs.forEach((p) => console.log(`  [${p.index}] ${p.name}`));
  console.log('\nMIDI output ports:');
  outputs.forEach((p) => console.log(`  [${p.index}] ${p.name}`));

  let inputPort  = autoPick(inputs);
  let outputPort = autoPick(outputs);

  if (inputPort && outputPort) {
    console.log(`\nAuto-picked INPUT:  [${inputPort.index}] ${inputPort.name}`);
    console.log(`Auto-picked OUTPUT: [${outputPort.index}] ${outputPort.name}`);
    const ans = await ask(rl, 'Use these? [Y/n, or type two indices "2 3"]: ');
    const s = ans.trim();
    if (s.toLowerCase() === 'n') {
      inputPort = outputPort = null;
    } else if (/^\d+\s+\d+$/.test(s)) {
      const [i, o] = s.split(/\s+/).map((x) => parseInt(x, 10));
      inputPort  = inputs[i];
      outputPort = outputs[o];
    }
  }

  if (!inputPort) {
    const a = await ask(rl, 'Input port index: ');
    inputPort = inputs[parseInt(a.trim(), 10)];
  }
  if (!outputPort) {
    const a = await ask(rl, 'Output port index: ');
    outputPort = outputs[parseInt(a.trim(), 10)];
  }

  if (!inputPort || !outputPort) throw new Error('Invalid port selection.');
  return { inputPort, outputPort };
}

// --- MIDI bus wrapper ---

class MidiBus {
  constructor(inputIdx, outputIdx) {
    this.input  = new midi.Input();
    this.output = new midi.Output();
    this.input.openPort(inputIdx);
    this.output.openPort(outputIdx);
    this.input.ignoreTypes(false, true, true); // enable sysex, ignore timing + activeSensing
    this.listeners = [];
    this.input.on('message', (_dt, msg) => {
      this.listeners.forEach((fn) => { try { fn(msg); } catch (e) { /* ignore */ } });
    });
  }

  addListener(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  // Sends sysex. Pass the payload WITHOUT F0/F7 — they are added here.
  sendSysex(payload) {
    this.output.sendMessage([0xF0, ...payload, 0xF7]);
  }

  close() {
    try { this.input.closePort(); } catch (_) {}
    try { this.output.closePort(); } catch (_) {}
  }
}

function waitForSysex(bus, predicate, timeoutMs = RESPONSE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const remove = bus.addListener((msg) => {
      if (msg[0] !== 0xF0) return;
      if (predicate(msg)) {
        clearTimeout(timer);
        remove();
        resolve(msg);
      }
    });
    const timer = setTimeout(() => {
      remove();
      reject(new Error('Timeout waiting for sysex response'));
    }, timeoutMs);
  });
}

// --- Preset read (mirrors src/utils/midi.js readPreset) ---

async function readPreset(bus, presetNumber) {
  const bank   = Math.floor(presetNumber / 128);
  const preset = presetNumber % 128;

  // 1) Name request
  const namePromise = waitForSysex(bus, (msg) => msg[8] === 0x52);
  bus.sendSysex([0x00, 0x20, 0x6B, 0x07, 0x01, 0x00, 0x01, 0x19, bank, preset, 0x00]);
  const nameMsg = await namePromise;
  const nameBody = Array.from(nameMsg.slice(9, nameMsg.length - 1));
  const nameStr  = String.fromCharCode(...nameBody.slice(0, 13).filter((b) => b >= 0x20 && b < 0x7F)).trim() || '<unknown>';
  const cat      = nameMsg[19];
  await sleep(WAIT_BETWEEN_MESSAGES);

  // 2) Preset request (initiation)
  bus.sendSysex([0x00, 0x20, 0x6B, 0x07, 0x01, 0x01, 0x01, 0x19, bank, preset, 0x01]);
  await sleep(WAIT_BETWEEN_MESSAGES);

  // 3) 40× data requests
  const data = [];
  for (let i = 0; i < MESSAGES_TO_READ_FOR_PRESET; i++) {
    const dp = waitForSysex(bus, (msg) => (msg[8] === 0x16 || msg[8] === 0x17) && msg.length === 42);
    bus.sendSysex([0x00, 0x20, 0x6B, 0x07, 0x01, i, 0x01, 0x18, 0x00]);
    const msg = await dp;
    data.push(Array.from(msg.slice(9, msg.length - 1))); // 32 bytes
    await sleep(WAIT_BETWEEN_MESSAGES);
  }

  return { presetNumber, name: nameStr, cat, data, readAt: new Date().toISOString() };
}

// --- Diff ---

function diffSnapshots(a, b) {
  const changes = [];
  for (let blk = 0; blk < a.data.length; blk++) {
    for (let byt = 0; byt < a.data[blk].length; byt++) {
      const av = a.data[blk][byt];
      const bv = b.data[blk][byt];
      if (av !== bv) {
        changes.push({ block: blk, byte: byt, before: av, after: bv, xor: av ^ bv, bitsChanged: bitCount(av ^ bv) });
      }
    }
  }
  return changes;
}

function annotate(c) {
  const xorBits = c.xor.toString(2).padStart(8, '0');
  const notes = [];
  if ((c.before === 0x00 && c.after === 0x7F) || (c.before === 0x7F && c.after === 0x00)) notes.push('0↔127, full 7-bit span');
  if (c.bitsChanged === 1) notes.push(`1 bit flipped (pos ${Math.log2(c.xor) | 0})`);
  const delta = c.after - c.before;
  notes.push(`Δ=${delta >= 0 ? '+' : ''}${delta}`);
  return `  data[${c.block}][${c.byte}]: 0x${hex(c.before)} → 0x${hex(c.after)}  (xor=${xorBits})  [${notes.join(', ')}]`;
}

// --- Findings ---

function loadFindings() {
  if (!fs.existsSync(FINDINGS_FILE)) return { findings: {} };
  try { return JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf8')); }
  catch (e) { console.warn('findings.json unreadable, starting fresh:', e.message); return { findings: {} }; }
}

function saveFindings(f) { fs.writeFileSync(FINDINGS_FILE, JSON.stringify(f, null, 2)); }

// --- Commands ---

async function cmdListPorts() {
  const { inputs, outputs } = listPorts();
  console.log('Inputs:');
  inputs.forEach((p) => console.log(`  [${p.index}] ${p.name}`));
  console.log('Outputs:');
  outputs.forEach((p) => console.log(`  [${p.index}] ${p.name}`));
}

async function cmdSnap(label, displayPreset) {
  const presetNumber = displayPreset - 1; // convert 1-based (device display) to 0-based (sysex)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const { inputPort, outputPort } = await pickPorts(rl);
  rl.close();
  const bus = new MidiBus(inputPort.index, outputPort.index);
  try {
    console.log(`\nReading preset #${displayPreset} (internal index ${presetNumber})...`);
    const snap = await readPreset(bus, presetNumber);
    snap.displayPreset = displayPreset;
    console.log(`Read "${snap.name}" (cat=${snap.cat}), 40 blocks.`);
    const file = path.join(SNAPSHOTS_DIR, `${label}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    console.log(`Saved -> ${file}`);
  } finally {
    bus.close();
  }
}

async function cmdDiff(aLabel, bLabel) {
  const a = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, `${aLabel}.json`), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, `${bLabel}.json`), 'utf8'));
  const changes = diffSnapshots(a, b);
  if (!changes.length) { console.log('No byte differences.'); return; }
  console.log(`\n${changes.length} byte(s) changed:`);
  changes.forEach((c) => console.log(annotate(c)));
}

async function cmdWalk(displayPreset, opts) {
  const presetNumber = displayPreset - 1; // convert 1-based (device display) to 0-based (sysex)
  const params   = JSON.parse(fs.readFileSync(PARAMETERS_FILE, 'utf8')).parameters;
  const findings = loadFindings();
  findings.findings = findings.findings || {};

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const { inputPort, outputPort } = await pickPorts(rl);
  const bus = new MidiBus(inputPort.index, outputPort.index);

  try {
    console.log(`\nVerifying connection by reading preset #${displayPreset} (internal index ${presetNumber})...`);
    const baseline = await readPreset(bus, presetNumber);
    baseline.displayPreset = displayPreset;
    console.log(`Baseline preset: "${baseline.name}" (cat=${baseline.cat})`);
    fs.writeFileSync(path.join(SNAPSHOTS_DIR, `_baseline_preset${displayPreset}.json`), JSON.stringify(baseline, null, 2));

    const mapped = Object.keys(findings.findings);
    console.log(`\n${params.length} parameters listed, ${mapped.length} already mapped.`);
    if (opts.redo) console.log('(--redo: re-mapping already-mapped parameters.)');
    if (opts.only) console.log(`(--only: limited to ${opts.only.join(', ')})`);
    console.log('Tip: type "q" at any prompt to quit and save what you have.\n');

    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (opts.only && !opts.only.includes(p.id)) continue;
      if (!opts.redo && findings.findings[p.id]) {
        console.log(`[${i + 1}/${params.length}] ${p.name}  -- already mapped, skipping`);
        continue;
      }

      console.log('\n' + '='.repeat(72));
      console.log(`[${i + 1}/${params.length}] ${p.name}   (id: ${p.id})`);
      console.log('='.repeat(72));
      console.log(`Action: ${p.instruction}`);

      const lowDef  = p.lowDefault  || '';
      const highDef = p.highDefault || '';
      const lowHint  = lowDef  ? ` (default "${lowDef}")`  : '';
      const highHint = highDef ? ` (default "${highDef}")` : '';

      let done = false;
      while (!done) {
        console.log('\n  Step 1: set the control to a LOW / starting position, then SAVE the preset on the device.');
        let a1 = await ask(rl, `         Value shown on device${lowHint}  [s]=skip  [q]=quit > `);
        const a1t = a1.trim();
        if (a1t.toLowerCase() === 'q') { console.log('Quitting.'); return; }
        if (a1t.toLowerCase() === 's') break;
        const lowValue = a1t === '' ? lowDef : a1t;

        console.log('  Reading LOW snapshot...');
        const snapA = await readPreset(bus, presetNumber);

        console.log('\n  Step 2: set the SAME control to a HIGH / different position, then SAVE the preset.');
        let a2 = await ask(rl, `         Value shown on device${highHint}  [s]=skip  [q]=quit > `);
        const a2t = a2.trim();
        if (a2t.toLowerCase() === 'q') { console.log('Quitting.'); return; }
        if (a2t.toLowerCase() === 's') break;
        const highValue = a2t === '' ? highDef : a2t;

        console.log('  Reading HIGH snapshot...');
        const snapB = await readPreset(bus, presetNumber);

        const changes = diffSnapshots(snapA, snapB);
        if (!changes.length) {
          console.log('  \u26A0 No byte differences. Did the preset actually save? Also check you tweaked the right control.');
        } else {
          console.log(`\n  ${changes.length} byte(s) changed:`);
          changes.forEach((c) => console.log(annotate(c)));
          if (lowValue || highValue) {
            console.log(`  Device-displayed values:  LOW="${lowValue || '-'}"   HIGH="${highValue || '-'}"`);
          }
        }

        let d = await ask(rl, '\n  [a]ccept  [r]etry  [s]kip  [q]uit > ');
        d = d.trim().toLowerCase();
        if (d === 'q') { console.log('Quitting.'); return; }
        if (d === 's') break;
        if (d === 'a' || d === '') {
          findings.findings[p.id] = {
            name: p.name,
            instruction: p.instruction,
            positions: changes.map((c) => ({ block: c.block, byte: c.byte, low: c.before, high: c.after, xor: c.xor, bitsChanged: c.bitsChanged })),
            mappedAt: new Date().toISOString(),
            displayPreset,
            presetIndex: presetNumber,
            presetName: snapA.name,
            lowValue,
            highValue
          };
          saveFindings(findings);
          fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${p.id}_low.json`),  JSON.stringify(snapA, null, 2));
          fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${p.id}_high.json`), JSON.stringify(snapB, null, 2));
          console.log(`  Saved finding for "${p.id}".`);
          done = true;
        }
        // r or anything else: retry loop
      }
    }

    console.log('\nWalk complete.');
    console.log(`Findings -> ${FINDINGS_FILE}`);
  } finally {
    bus.close();
    rl.close();
  }
}

// --- Prescan: sweep one parameter across many values, cross-table byte changes ---

function isMonotonic(arr) {
  if (arr.length < 2) return false;
  let asc = true, desc = true;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <  arr[i - 1]) asc  = false;
    if (arr[i] >  arr[i - 1]) desc = false;
  }
  return asc || desc;
}

async function cmdPrescan(displayPreset, paramId) {
  const presetNumber = displayPreset - 1;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const { inputPort, outputPort } = await pickPorts(rl);
  const bus = new MidiBus(inputPort.index, outputPort.index);

  const snapshots = []; // { label, snap }

  // Resume: load any existing prescan files for this param.
  const escaped = paramId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fileRe  = new RegExp(`^prescan_${escaped}__(.+)\\.json$`);
  for (const f of fs.readdirSync(SNAPSHOTS_DIR)) {
    const m = f.match(fileRe);
    if (!m) continue;
    try {
      const snap  = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf8'));
      const label = snap.prescanLabel || m[1];
      snapshots.push({ label, snap });
    } catch (e) { /* ignore malformed */ }
  }

  try {
    console.log(`\nPrescan for parameter '${paramId}' on preset #${displayPreset} (internal index ${presetNumber}).`);
    console.log('For each value you want to capture:');
    console.log('  1. Set the parameter to the value on the device.');
    console.log('  2. Zero any unrelated controls that could cause overlapping byte changes.');
    console.log('  3. SAVE the preset on the device.');
    console.log(`  4. Type the current value NAME here (whatever the MicroFreak screen shows for '${paramId}') and hit Enter.`);
    console.log('     (typing the name triggers the read. Re-typing an existing label OVERWRITES it.)');
    console.log('Type "done" (or "q") to finish and analyze.\n');

    if (snapshots.length) {
      console.log(`Resumed: ${snapshots.length} existing snapshot(s) loaded for '${paramId}':`);
      snapshots.forEach((s, i) => console.log(`  [${i + 1}] ${s.label}   (preset name: "${s.snap.name}")`));
      console.log('(Re-type any of these labels to re-capture. Type "done" when the set is complete.)\n');
    }

    // Sanity: read current state so user can confirm preset connection is live.
    console.log('Reading current state of the preset as a connection check...');
    const initial = await readPreset(bus, presetNumber);
    console.log(`  Current preset name on device: "${initial.name}" (cat=${initial.cat})\n`);

    while (true) {
      const label = (await ask(rl, 'Value name (or "done"/"q"): ')).trim();
      if (!label) continue;
      if (label.toLowerCase() === 'done' || label.toLowerCase() === 'q') break;

      console.log(`  Reading snapshot for "${label}"...`);
      try {
        const snap = await readPreset(bus, presetNumber);
        snap.displayPreset = displayPreset;
        snap.prescanLabel  = label;
        const safe = label.replace(/[^a-zA-Z0-9_-]+/g, '_');
        const file = path.join(SNAPSHOTS_DIR, `prescan_${paramId}__${safe}.json`);
        fs.writeFileSync(file, JSON.stringify(snap, null, 2));
        const existingIdx = snapshots.findIndex((s) => s.label === label);
        if (existingIdx >= 0) {
          snapshots[existingIdx] = { label, snap };
          console.log(`  Overwrote "${label}".   (${snapshots.length} snapshots total)\n`);
        } else {
          snapshots.push({ label, snap });
          console.log(`  Saved: ${path.basename(file)}   (${snapshots.length} snapshots total)\n`);
        }
      } catch (e) {
        console.log(`  Read failed: ${e.message}\n`);
      }
    }

    if (snapshots.length < 2) {
      console.log('\nNeed at least 2 snapshots to analyze. Done.');
      return;
    }

    const dataLen       = snapshots[0].snap.data.length;
    const bytesPerBlock = snapshots[0].snap.data[0].length;
    const interesting   = [];
    for (let blk = 0; blk < dataLen; blk++) {
      for (let byt = 0; byt < bytesPerBlock; byt++) {
        const values   = snapshots.map((s) => s.snap.data[blk][byt]);
        const distinct = new Set(values);
        if (distinct.size === 1) continue;
        interesting.push({ block: blk, byte: byt, values, distinctCount: distinct.size });
      }
    }

    console.log('\n=== Prescan analysis ===');
    console.log(`parameter:   ${paramId}`);
    console.log(`snapshots:   ${snapshots.length}  (${snapshots.map((s) => s.label).join(', ')})`);
    console.log(`positions with any change: ${interesting.length}\n`);

    if (interesting.length) {
      const colWidth = Math.max(8, ...snapshots.map((s) => s.label.length));
      const labelRow = 'blk byt | ' + snapshots.map((s) => s.label.padEnd(colWidth)).join(' | ');
      console.log(labelRow);
      console.log('-'.repeat(labelRow.length));
      interesting.forEach((p) => {
        const vals = p.values.map((v) => ('0x' + hex(v)).padEnd(colWidth)).join(' | ');
        console.log(`${String(p.block).padStart(3)} ${String(p.byte).padStart(3)} | ${vals}`);
      });

      console.log('\nCandidate hints:');
      interesting.forEach((p) => {
        const notes = [];
        if (p.distinctCount === snapshots.length) notes.push('unique-per-step');
        if (isMonotonic(p.values))                notes.push('monotonic');
        if (p.distinctCount === 2)                notes.push('binary');
        const deltas = p.values.slice(1).map((v, i) => v - p.values[i]);
        const constStep = deltas.every((d) => d === deltas[0]);
        if (constStep && deltas[0] !== 0)         notes.push(`constant step Δ=${deltas[0]}`);
        console.log(`  data[${p.block}][${p.byte}]: ${notes.length ? '[' + notes.join(', ') + ']' : '(varies)'}`);
      });
    }

    const findings = loadFindings();
    findings.findings = findings.findings || {};
    findings.findings[`${paramId}_prescan`] = {
      paramId,
      mappedAt: new Date().toISOString(),
      displayPreset,
      sweep: snapshots.map((s) => ({ label: s.label, presetName: s.snap.name })),
      positions: interesting
    };
    saveFindings(findings);
    console.log(`\nFindings saved under key "${paramId}_prescan" in ${FINDINGS_FILE}`);
  } finally {
    bus.close();
    rl.close();
  }
}

// --- Main ---

function parseWalkOpts(args) {
  const opts = { redo: false, only: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--redo') opts.redo = true;
    else if (args[i] === '--only') opts.only = (args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return opts;
}

async function main() {
  const [,, cmd, ...args] = process.argv;
  try {
    switch (cmd) {
      case 'list-ports':
        await cmdListPorts();
        break;
      case 'snap': {
        const label  = args[0];
        const preset = parseInt(args[1] || '1', 10); // 1-based, matches device display
        if (!label) { console.error('Usage: node rev.js snap <label> [displayPresetNumber]'); process.exit(1); }
        if (preset < 1 || preset > 512) { console.error('Preset must be 1..512 (device display numbering).'); process.exit(1); }
        await cmdSnap(label, preset);
        break;
      }
      case 'diff': {
        const [a, b] = args;
        if (!a || !b) { console.error('Usage: node rev.js diff <labelA> <labelB>'); process.exit(1); }
        await cmdDiff(a, b);
        break;
      }
      case 'walk': {
        const presetIdx = args.indexOf('--preset');
        const preset = presetIdx >= 0 ? parseInt(args[presetIdx + 1], 10) : 1; // 1-based, matches device display
        if (preset < 1 || preset > 512) { console.error('--preset must be 1..512 (device display numbering).'); process.exit(1); }
        const opts = parseWalkOpts(args);
        await cmdWalk(preset, opts);
        break;
      }
      case 'prescan': {
        const presetIdx = args.indexOf('--preset');
        const preset    = presetIdx >= 0 ? parseInt(args[presetIdx + 1], 10) : 1;
        const paramIdx  = args.indexOf('--param');
        const paramId   = paramIdx >= 0 ? args[paramIdx + 1] : null;
        if (!paramId) { console.error('Usage: node rev.js prescan --preset N --param <id>'); process.exit(1); }
        if (preset < 1 || preset > 512) { console.error('--preset must be 1..512 (device display numbering).'); process.exit(1); }
        await cmdPrescan(preset, paramId);
        break;
      }
      default:
        console.log('MicroFreak reverse-engineering tool');
        console.log('(Preset numbers use the DEVICE DISPLAY numbering: 1..512, same as the MicroFreak screen.)\n');
        console.log('  node rev.js list-ports                  list MIDI ports');
        console.log('  node rev.js snap <label> [preset#]      capture one preset snapshot -> snapshots/<label>.json');
        console.log('  node rev.js diff <A> <B>                byte-diff two snapshots');
        console.log('  node rev.js walk [--preset N] [--redo] [--only id1,id2]');
        console.log('                                          interactive walk through parameters.json');
        console.log('  node rev.js prescan --preset N --param <id>');
        console.log('                                          sweep one parameter across many values, cross-table byte changes');
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
