// MicroFreak factory sample list (bank "Factory" in MCC), 1-based slot →
// name. Selected on the hardware via SHIFT + TYPE knob when the OSC type is
// Sample / Scan Grains / Cloud Grains / Hit Grains.
//
// Slots 53–64 exist but are user-fillable (empty by default in the Factory
// bank). Left out of this list; if we ever need to tag user-bank samples we
// can extend it or let the user type a free-form label.
export const SAMPLE_NAMES = [
    "Piano Pop",    "Piano Lofi",   "Piano Clean",   "Shamisen",
    "String Staccat","E Piano",     "Acc Guitar",    "PGTS Keys",
    "Harp",         "Braam",        "Cyber Pad",     "SQ Choir",
    "Synth Layer",  "Unison Pad",   "Voice Aah",     "Wind Pad",
    "Acc Strings",  "Morph Lead",   "808 Drive",     "Neuro",
    "Pluck",        "Formant",      "Harmonic",      "Spector",
    "Spectral",     "Vocal",        "Blue Jingle",   "Chord Jingle",
    "Major Jingle", "Dub Jingle",   "Harp Arp",      "Synth Arp",
    "Emotion",      "Eth Bells",    "Lofi Chords",   "Voice Riff",
    "Bird Pad",     "Old FX",       "Water Drop",    "Zap",
    "Future Drums", "Drum Break",   "Harsh FM",      "Three Words",
    "Digital Voice","Furniture",    "Water Stream",  "Aliasing",
    "Birds",        "ProVS Noise",  "Vinyl",         "Disco Loop",
];

// The 4 OSC types that load samples. String must match exactly what
// oscTypeName() returns (including '\n' in multi-word names).
const SAMPLE_OSC_TYPES = new Set([
    "Sample",
    "Scan\nGrains",
    "Cloud\nGrains",
    "Hit\nGrains",
]);

export function oscTypeUsesSample(typeName) {
    return !!typeName && SAMPLE_OSC_TYPES.has(typeName);
}

// Returns the factory sample name for a 1-based idx, or a generic label for
// user-bank slots (53..64) whose names we don't know.
export function sampleNameFromIdx(idx) {
    if (idx == null || idx < 1) return null;
    if (idx <= SAMPLE_NAMES.length) return SAMPLE_NAMES[idx - 1];
    return `(user slot ${idx})`;
}
