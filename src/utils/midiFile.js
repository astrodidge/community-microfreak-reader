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

    // Walk the 64-step grid:
    //   on  -> close any held note, emit note-on, hold for 1 step
    //   tie -> extend the held note's gate by 1 step (no new attack)
    //   off -> close any held note, advance time by 1 step (rest)
    // Time accumulates as `pendingDelta` (ticks since the last emitted
    // event) so consecutive rests / ties just sum into the next event's
    // delta-time without emitting anything in between.
    let heldNote = -1;       // MIDI note currently held, or -1 if none
    let pendingDelta = 0;    // ticks since last emitted event
    const closeHeld = () => {
        if (heldNote >= 0) {
            evs.push(...vlq(pendingDelta), 0x80, heldNote & 0x7F, 0);
            pendingDelta = 0;
            heldNote = -1;
        }
    };
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.state === 'on') {
            closeHeld();
            const note = s.note & 0x7F;
            const vel = (s.velocity || velocity) & 0x7F;
            evs.push(...vlq(pendingDelta), 0x90, note, vel);
            pendingDelta = stepTicks;
            heldNote = note;
        } else if (s.state === 'tie') {
            if (heldNote >= 0) {
                pendingDelta += stepTicks;     // extend the held note's gate
            } else if ((s.note & 0xFF) <= 127) {
                // Tie at the start (or after a rest) with no held note —
                // play the tie's own note. The MF likely treats this as
                // a continuation from the loop's previous pass; in a
                // one-shot MIDI export we just let it sound.
                const note = s.note & 0x7F;
                const vel = (s.velocity || velocity) & 0x7F;
                evs.push(...vlq(pendingDelta), 0x90, note, vel);
                pendingDelta = stepTicks;
                heldNote = note;
            } else {
                pendingDelta += stepTicks;     // tie with no note byte — rest
            }
        } else {
            // off / rest
            closeHeld();
            pendingDelta += stepTicks;
        }
    }
    closeHeld();

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
