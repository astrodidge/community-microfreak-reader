// Minimal Standard MIDI File (SMF) writer — format 0, single track.
// Avoids pulling in a 3rd-party library; the format is small enough that
// inline implementation is clearer than an opaque dep.
//
// Reference: https://www.midi.org/specifications-old/item/standard-midi-files-smf

const TICKS_PER_QUARTER = 480;
const TICKS_PER_16TH = TICKS_PER_QUARTER / 4;   // 120

// Variable-length quantity (used for delta-times). 0..0x0FFFFFFF in 1..4 bytes.
function vlq(n) {
    if (n < 0) throw new Error("vlq: negative");
    const bytes = [n & 0x7F];
    n >>= 7;
    while (n > 0) {
        bytes.unshift((n & 0x7F) | 0x80);
        n >>= 7;
    }
    return bytes;
}

// Encode a 32-bit big-endian unsigned integer.
function be32(n) {
    return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
}

function be16(n) {
    return [(n >>> 8) & 0xFF, n & 0xFF];
}

// Build a Uint8Array from an array of step objects: { note, velocity? }.
// One step = one 16th-note. Default velocity 100. Default tempo 120 BPM.
// stepsPerBeat lets the caller pick a different rate (e.g. 8 = 8th notes).
export function buildSequenceMidi(steps, opts = {}) {
    const velocity   = opts.velocity  || 100;
    const stepTicks  = opts.stepTicks || TICKS_PER_16TH;
    const tempoBpm   = opts.tempoBpm  || 120;
    const trackName  = opts.trackName || "MicroFreak Seq A";

    const evs = [];

    // Meta: track name
    const nameBytes = Array.from(new TextEncoder().encode(trackName));
    evs.push(...vlq(0), 0xFF, 0x03, ...vlq(nameBytes.length), ...nameBytes);

    // Meta: tempo (microseconds per quarter note)
    const usPerQuarter = Math.round(60000000 / tempoBpm);
    evs.push(...vlq(0), 0xFF, 0x51, 0x03,
        (usPerQuarter >> 16) & 0xFF, (usPerQuarter >> 8) & 0xFF, usPerQuarter & 0xFF);

    // Notes — back-to-back, one step each. Note-on (delta=0) then note-off
    // (delta=stepTicks). Skipping rests for now (treat all stored notes as
    // active; the MF "step active" flag is byte 12 = 0x01 in our decoder
    // and we only emit steps that decoded with a valid note).
    for (let i = 0; i < steps.length; i++) {
        const note = steps[i].note;
        const vel = steps[i].velocity || velocity;
        evs.push(...vlq(0), 0x90, note & 0x7F, vel & 0x7F);          // note-on ch 1
        evs.push(...vlq(stepTicks), 0x80, note & 0x7F, 0);           // note-off
    }

    // Meta: end of track
    evs.push(...vlq(0), 0xFF, 0x2F, 0x00);

    // Header chunk: format 0, 1 track, ticks per quarter
    const header = [
        ...[0x4D, 0x54, 0x68, 0x64],                                  // "MThd"
        ...be32(6),                                                    // length
        ...be16(0),                                                    // format 0
        ...be16(1),                                                    // 1 track
        ...be16(TICKS_PER_QUARTER),                                    // division
    ];

    // Track chunk
    const track = [
        ...[0x4D, 0x54, 0x72, 0x6B],                                  // "MTrk"
        ...be32(evs.length),
        ...evs,
    ];

    return new Uint8Array([...header, ...track]);
}

// Trigger a browser download for the given Uint8Array as a .mid file.
export function downloadMidiFile(bytes, filename) {
    const blob = new Blob([bytes], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
