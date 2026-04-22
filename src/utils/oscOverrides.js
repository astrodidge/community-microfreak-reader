import store from "storejs";
import {unpackMidi7bit, findUnpackedMarker} from "../model";

const STORAGE_KEY = "studiocode.microfreak.osc_overrides";
const VCOD_MARKER = [0x23,0x56,0x43,0x4f,0x44,0x54,0x79,0x70,0x65]; // '#VCODType'
const VCOD_CAPTURE_LEN = 128;
// Extended window captured when tagging a sample sub-type. The sample index
// lives somewhere beyond the VCODType section (per user: SHIFT+TYPE knob,
// distinct from FParam1) — we capture a generous slice so Python analysis
// has the bytes to hunt through without us needing to know where it is.
const EXTENDED_CAPTURE_LEN = 1024;

// Return the first VCOD_CAPTURE_LEN bytes of the unpacked stream starting at
// the '#VCODType' marker, or null if the marker isn't found. This captures
// the primary value + FParam1/2/3 + surrounding bytes that may carry the
// legacy-encoding signal.
export function extractVcodBytes(data) {
    if (!data || !data.length) return null;
    // Marker at unpacked offset 0; we capture up to VCOD_CAPTURE_LEN bytes.
    // Unpack just enough to cover that window rather than all 146 blocks.
    const unpacked = unpackMidi7bit(data, VCOD_CAPTURE_LEN + 16);
    const at = findUnpackedMarker(unpacked, VCOD_MARKER);
    if (at < 0) return null;
    const end = Math.min(unpacked.length, at + VCOD_CAPTURE_LEN);
    return unpacked.slice(at, end);
}

// Stable key for a preset's VCOD section. Two presets with the same VCOD
// bytes (i.e. the same on-device OSC-type encoding) share an override.
export function hashVcodBytes(bytes) {
    if (!bytes || !bytes.length) return null;
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] & 0xff).toString(16).padStart(2, "0");
    return s;
}

// In-memory cache. localStorage reads + JSON.parse are slow when hit 512
// times per preset-list render; this keeps them to one call per session.
let _cache = null;

export function loadOverrides() {
    if (_cache) return _cache;
    const raw = store.get(STORAGE_KEY);
    if (!raw) return (_cache = {});
    try { return (_cache = JSON.parse(raw) || {}); }
    catch { return (_cache = {}); }
}

function saveOverrides(map) {
    _cache = map;
    store(STORAGE_KEY, JSON.stringify(map));
}

// Extended capture from the start of the unpacked stream — broader than
// extractVcodBytes(). Used when tagging samples, since the sample-index byte
// is not yet localised. Null if data is empty.
export function extractExtendedBytes(data) {
    if (!data || !data.length) return null;
    const unpacked = unpackMidi7bit(data, EXTENDED_CAPTURE_LEN);
    return unpacked.slice(0, Math.min(unpacked.length, EXTENDED_CAPTURE_LEN));
}

// Merge a patch into the stored entry for this hash. Callers pass only the
// fields they want to update; everything else is preserved. Used by both
// OSC-type tagging (patch: { oscType, vcodBytes, presetName }) and sample
// tagging (patch: { sample, sampleIdx, extendedBytes, presetName }).
export function setOverride(hash, patch) {
    if (!hash || !patch) return;
    const map = loadOverrides();
    const existing = map[hash] || {};
    const next = { ...existing, ...patch, savedAt: new Date().toISOString() };
    // Normalise byte arrays so JSON stays tidy (accept Uint8Array / array).
    if (patch.vcodBytes) next.vcodBytes = Array.from(patch.vcodBytes);
    if (patch.extendedBytes) next.extendedBytes = Array.from(patch.extendedBytes);
    map[hash] = next;
    saveOverrides(map);
}

// Remove specific fields from an entry, deleting the whole entry if no
// override data remains.
export function clearOverrideFields(hash, fields) {
    if (!hash) return;
    const map = loadOverrides();
    const existing = map[hash];
    if (!existing) return;
    for (const f of fields) delete existing[f];
    const hasOscType = !!existing.oscType;
    const hasSample = existing.sample != null;
    if (!hasOscType && !hasSample) {
        delete map[hash];
    } else {
        existing.savedAt = new Date().toISOString();
    }
    saveOverrides(map);
}

// Back-compat alias: deleting the whole entry.
export function clearOverride(hash) {
    if (!hash) return;
    const map = loadOverrides();
    if (hash in map) {
        delete map[hash];
        saveOverrides(map);
    }
}

export function getOverride(hash) {
    if (!hash) return null;
    const map = loadOverrides();
    return map[hash] || null;
}

export function exportOverridesJson() {
    return JSON.stringify(loadOverrides(), null, 2);
}
