import store from "storejs";
import {unpackMidi7bit, findUnpackedMarker} from "../model";

const STORAGE_KEY = "studiocode.microfreak.osc_overrides";
const VCOD_MARKER = [0x23,0x56,0x43,0x4f,0x44,0x54,0x79,0x70,0x65]; // '#VCODType'
const VCOD_CAPTURE_LEN = 128;

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

export function setOverride(hash, oscType, vcodBytes, presetName) {
    if (!hash) return;
    const map = loadOverrides();
    map[hash] = {
        oscType,
        vcodBytes: Array.from(vcodBytes || []),
        presetName: presetName || "",
        savedAt: new Date().toISOString()
    };
    saveOverrides(map);
}

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
