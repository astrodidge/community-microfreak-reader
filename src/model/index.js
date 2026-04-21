import {getRightShift} from "../utils/bits-utils";
import oscParamRanges from "./oscParamRanges.json";

export const FW1 = 0;
export const FW2 = 1;

// Resolve the current osc type's NAME from the raw byte at data[0][14].
// Delegates to _osc_type (declared below) to avoid duplicating band boundaries.
export function oscTypeName(rawByte, fw = FW2) {
    return _osc_type(rawByte, fw);
}

// Look up the per-osc-type info for one of the three OSC knobs.
// paramKey: 'wave' | 'timbre' | 'shape'.
// Returns { name, range?: [min,max,unit?], values?: string[] } or null.
export function oscParamInfo(paramKey, typeName) {
    if (!typeName) return null;
    const clean = String(typeName).replace(/\n/g, " ").trim();
    const entry = oscParamRanges.ranges[clean];
    if (!entry) return null;
    return entry[paramKey] || null;
}

// Compute the display STRING for a knob given its raw 15-bit value,
// using the per-osc-type range. Returns null if no mapping is available
// (caller should fall back to the default v.toFixed(1) behavior).
export function oscParamDisplay(rawValue, paramKey, typeName) {
    const info = oscParamInfo(paramKey, typeName);
    if (!info) return null;
    const t = Math.max(0, Math.min(1, rawValue / 32767));
    if (Array.isArray(info.values) && info.values.length) {
        const idx = Math.min(info.values.length - 1, Math.floor(t * info.values.length));
        return info.values[idx];
    }
    if (Array.isArray(info.range) && info.range.length >= 2) {
        const [min, max, unit] = info.range;
        const v = min + (max - min) * t;
        const decimals = (Number.isInteger(min) && Number.isInteger(max) && Math.abs(max - min) >= 20) ? 0 : 1;
        return v.toFixed(decimals) + (unit ? " " + unit : "");
    }
    return null;
}

export const multibytesValue = (MSB, LSB, msb_byte, mask_msb, sign_byte, mask_sign) => {

    // if mask_sign is 0, sign is ignored

    // console.log("multibytesValue", h(MSB), h(LSB), h(msb_byte), h(mask_sign), h(mask_msb));

    let sign_bit = 0;
    if (mask_sign > 0) {
        const j = getRightShift(mask_sign);
        sign_bit = (sign_byte >> j) & 0x01;
    }

    const k = getRightShift(mask_msb);
    const msb_bit = (msb_byte >> k) & 0x01;

    // const neg = msb & 0x02;
    const high = (MSB & 0x7f) << 8;
    const mid  = LSB & 0x7f;
    const low = msb_bit << 7;
    const n = high + mid + low;
    // let f;
    let raw;
    if (sign_bit) {
        // const c2 = ((~n) & 0x7fff) + 1;
        // f = - (c2 * 1000 / 32768);
        raw = -(((~n) & 0x7fff) + 1)
    } else {
        // f = n * 1000 / 32768;
        raw = n;
    }

    return raw;
};


const _percent = v => `${v.toFixed(0)}%`;

// Linear display mapping for a knob: takes the scaled % value (0..100) that
// Control.js passes to mapping() and returns a formatted string using the
// given min/max/unit. Used for filter/envelope/LFO/cyc-env/glide/etc. —
// ranges captured from device display via the reverse-engineering walk.
const _ranged = (min, max, unit) => function (v) {
    const t = Math.max(0, Math.min(1, v / 100));
    const out = min + (max - min) * t;
    const bigIntSpan = Number.isInteger(min) && Number.isInteger(max) && (max - min) >= 20;
    const str = bigIntSpan ? String(Math.round(out)) : out.toFixed(1);
    return unit ? `${str} ${unit}` : str;
};

// Log display mapping: min * (max/min)^t. Use for frequency knobs where the
// MicroFreak display is perceptually linear (doubling per unit of knob
// rotation). Requires min > 0.
const _rangedLog = (min, max, unit) => function (v) {
    const t = Math.max(0, Math.min(1, v / 100));
    const out = min * Math.pow(max / min, t);
    let str;
    if (out >= 100)      str = out.toFixed(0);
    else if (out >= 10)  str = out.toFixed(1);
    else if (out >= 1)   str = out.toFixed(2);
    else                 str = out.toFixed(3);
    return unit ? `${str} ${unit}` : str;
};

// Power-curve display mapping: d = max * t^k (min = 0 implied).
// Empirically determined k=3 for MicroFreak time knobs (attack/decay/rise/
// fall/hold/glide) via a 5-point calibration: 50/1200/4600 ms at t=0.171/
// 0.496/0.777 all fit t^3 within ~2 %.
const _rangedPow = (max, k, unit) => function (v) {
    const t = Math.max(0, Math.min(1, v / 100));
    const out = max * Math.pow(t, k);
    let str;
    if (out >= 1000)     str = out.toFixed(0);
    else if (out >= 100) str = out.toFixed(0);
    else if (out >= 10)  str = out.toFixed(1);
    else if (out >= 1)   str = out.toFixed(2);
    else if (out > 0)    str = out.toFixed(3);
    else                 str = '0';
    return unit ? `${str} ${unit}` : str;
};

const _osc_type = function (v, fw=FW2) {
    if (fw === FW2) {
        // Band boundaries from reverse-engineering preset 448 with all other
        // parameters zeroed; see reverse-engineering/findings.json (osc_type_prescan).
        // 22 types, ~6-unit bands. Upper-bound values are the actual observed v.
        // NOTE: FW2 === 1 (not 2) — the previous `fw === 2` was a latent bug
        // that made this branch dead code; modern presets were being decoded
        // by the FW1 fallback below, which is why the old mapping looked wrong.
        switch (true) {
            case (v >= 0x00) && (v <= 0x05): return "Basic\nWaves";
            case (v > 0x05) && (v <= 0x0b): return "Superwave";
            case (v > 0x0b) && (v <= 0x11): return "Wavetable";
            case (v > 0x11) && (v <= 0x17): return "Harmo";
            case (v > 0x17) && (v <= 0x1d): return "Karplus\nStrong";
            case (v > 0x1d) && (v <= 0x22): return "V. Analog";
            case (v > 0x22) && (v <= 0x28): return "Waveshaper";
            case (v > 0x28) && (v <= 0x2e): return "Two Op.\nFM";
            case (v > 0x2e) && (v <= 0x34): return "Formant";
            case (v > 0x34) && (v <= 0x3a): return "Chords";
            case (v > 0x3a) && (v <= 0x40): return "Speech";
            case (v > 0x40) && (v <= 0x45): return "Modal";
            case (v > 0x45) && (v <= 0x4b): return "Noise";
            case (v > 0x4b) && (v <= 0x51): return "Vocoder";
            case (v > 0x51) && (v <= 0x57): return "Bass";
            case (v > 0x57) && (v <= 0x5d): return "SawX";
            case (v > 0x5d) && (v <= 0x62): return "Harm";
            case (v > 0x62) && (v <= 0x68): return "User\nWavetable";
            case (v > 0x68) && (v <= 0x6e): return "Sample";
            case (v > 0x6e) && (v <= 0x74): return "Scan\nGrains";
            case (v > 0x74) && (v <= 0x7a): return "Cloud\nGrains";
            case (v > 0x7a) && (v <= 0x7f): return "Hit\nGrains";
            default: return "?";
        }
    } else {
        switch (true) {
            case (v >= 0x00) && (v <= 0x0a):
                return "Basic\nWaves";
            case (v > 0x0a) && (v <= 0x15):
                return "Superwave";
            case (v > 0x15) && (v <= 0x20):
                return "Wavetable";
            case (v > 0x20) && (v <= 0x2a):
                return "Harmonic";
            case (v > 0x2a) && (v <= 0x35):
                return "Karplus\nStrong";
            case (v > 0x35) && (v <= 0x40):
                return "V. Analog";
            case (v > 0x40) && (v <= 0x4a):
                return "Waveshaper";
            case (v > 0x4a) && (v <= 0x55):
                return "Two Op.\nFM";
            case (v > 0x55) && (v <= 0x5f):
                return "Formant";
            case (v > 0x5f) && (v <= 0x6a):
                return "Chords";
            case (v > 0x6a) && (v <= 0x75):
                return "Speech";
            case (v > 0x75) && (v <= 0x7f):
                return "Modal";
            default:
                return "?";
        }
    }

    // switch (v) {
    //     case 10:     0x0a
    //         return "Basic\nWaves";
    //     case 21:     0x15
    //         return "Superwave";
    //     case 32:     0x20
    //         return "Wavetable";
    //     case 42:     0x2a
    //         return "Harmonic";
    //     case 53:     0x35
    //         return "Karplus\nStrong";
    //     case 64:     0x40
    //         return "V. Analog";
    //     case 74:     0x4a
    //         return "Waveshaper";
    //     case 85:     0x55
    //         return "Two Op.\nFM";
    //     case 95:     0x5f
    //         return "Formant";
    //     case 106:    0x6a
    //         return "Chords";
    //     case 117:    0x75
    //         return "Speech";
    //     case 127:    0x7f
    //         return "Modal";
    //     default:
    //         return "?";

};

const _arp_rate_sync = function (v) {
    // console.log(`arp rate sync`, v, typeof v);

    // arp rate sync
    // 1	0x00	0	0
    // 2	0x0c	12	3277
    // 2t	0x19	25	6553
    // 4	0x26	38	9830
    // 4t	0x33	51	13107
    // 8	0x40	64	16384
    // 8t	0x4c	76	19660
    // 16	0x59	89	22937
    // 16t	0x66	102	26214
    // 32	0x73	115	29490
    // 32t	0x7f	127	32767

    switch (true) {
        case (v >= 0x00) && (v < 3277):     return "1/1";
        case (v >= 3277) && (v < 6553):     return "1/2";
        case (v >= 6553) && (v < 9830):     return "1/2T";
        case (v >= 9830) && (v < 13107):    return "1/4";
        case (v >= 13107) && (v < 16384):   return "1/4T";
        case (v >= 16384) && (v < 19660):   return "1/8";
        case (v >= 19660) && (v < 22937):   return "1/8T";
        case (v >= 22937) && (v < 26214):   return "1/16";
        case (v >= 26214) && (v < 29490):   return "1/16T";
        case (v >= 29490) && (v < 32767):   return "1/32";
        case (v >= 32767):                  return "1/32T";
        default:
            return "?";
    }
};

const _lfo_rate_sync = function (v) {

    // 8	    0	    0
    // 4	    0x0a	10
    // 2	    0x15	21
    // 1	    0x20	32
    // 1/2	    0x2a	42
    // 1/2t	    0x35	53
    // 1/4	    0x40	64
    // 1/4t	    0x4a	74
    // 1/8	    0x55	85
    // 1/8t	    0x5f	95
    // 1/16	    0x6a	106
    // 1/16t	0x75	117
    // 1/32	    0x7f	127

    const R = ['8/1', '4/1', '2/1', '1/1', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32'];

    const delta = 32768 / 12;

    // console.log(`lfo rate sync`, v, v / delta, delta, Math.floor(v / delta + 0.5));

    return R[Math.floor(v / delta + 0.5)];

    // switch (true) {
    //     case (v >= 0x00) && (v < 3277):     return "1/1";
    //     case (v >= 3277) && (v < 6553):     return "1/2";
    //     case (v >= 6553) && (v < 9830):     return "1/2T";
    //     case (v >= 9830) && (v < 13107):    return "1/4";
    //     case (v >= 13107) && (v < 16384):   return "1/4T";
    //     case (v >= 16384) && (v < 19660):   return "1/8";
    //     case (v >= 19660) && (v < 22937):   return "1/8T";
    //     case (v >= 22937) && (v < 26214):   return "1/16";
    //     case (v >= 26214) && (v < 29490):   return "1/16T";
    //     case (v >= 29490) && (v < 32767):   return "1/32";
    //     case (v >= 32767):                  return "1/32T";
    //     default:
    //         return "?";
    // }
};

/*
const _0_100 = function (v) {
    return Math.floor(v / 127 * 100 + 0.5);
};
*/


/*
const arpSyncOn = function () {

    if (!this.presets.length || (this.presets.length < this.preset_number) || !this.presets[this.preset_number]) {
        return 0;
    }
    const data = this.presets[this.preset_number].data;
    if (data.length < 39) return;  //FIXME

    console.log("arpSyncOn", this.switchValue(SWITCH[this.presets[this.preset_number].fw][ARP_SEQ_SYNC]));

    return this.switchValue(SWITCH[this.presets[this.preset_number].fw][ARP_SEQ_SYNC]) > 0;
}
*/


export const CATEGORY = [
    "Bass", // 0
    "Brass", // 1
    "Keys", // 2
    "Lead", // 3
    "Organ", // 4
    "Pad", // 5
    "Percussion", // 6
    "Sequence", // 7
    "SFX", // 8
    "Strings", // 9
    "Template"  // 10
];

// default mask for LSB and MSB : 0x7f
// default mask for MSB_lsb : 0x01
// default mask for sign in MSB_lsb : 0x02

export const DEFAULT_msb_mask = 0x01;
export const DEFAULT_sign_mask = 0x02;

// controls
export const OSC_TYPE = Symbol('OSC_TYPE');
export const OSC_WAVE = Symbol('OSC_WAVE');
export const OSC_TIMBRE = Symbol('OSC_TIMBRE');
export const OSC_SHAPE = Symbol('OSC_SHAPE');
export const FILTER_CUTOFF = Symbol('FILTER_CUTOFF');
export const FILTER_AMT = Symbol('FILTER_AMT');
export const FILTER_RESONANCE = Symbol('FILTER_RESONANCE');
export const CYCLING_ENV_RISE = Symbol('CYCLING_ENV_RISE');
export const CYCLING_ENV_RISE_SHAPE = Symbol('CYCLING_ENV_RISE_SHAPE');
export const CYCLING_ENV_FALL = Symbol('CYCLING_ENV_FALL');
export const CYCLING_ENV_FALL_SHAPE = Symbol('CYCLING_ENV_FALL_SHAPE');
export const CYCLING_ENV_HOLD = Symbol('CYCLING_ENV_HOLD');
export const CYCLING_ENV_AMOUNT = Symbol('CYCLING_ENV_AMOUNT');
export const ARP_SEQ_RATE_FREE = Symbol('ARP_SEQ_RATE_FREE');
export const ARP_SEQ_RATE_SYNC = Symbol('ARP_SEQ_RATE_SYNC');
export const ARP_SEQ_SWING = Symbol('ARP_SEQ_SWING');
export const LFO_RATE_FREE = Symbol('LFO_RATE_FREE');
export const LFO_RATE_SYNC = Symbol('LFO_RATE_SYNC');
export const ENVELOPE_ATTACK = Symbol('ENVELOPE_ATTACK');
export const ENVELOPE_DECAY = Symbol('ENVELOPE_DECAY');
export const ENVELOPE_SUSTAIN = Symbol('ENVELOPE_SUSTAIN');
export const GLIDE = Symbol('GLIDE');
export const SPICE = Symbol('SPICE');

// switches
export const FILTER_TYPE = Symbol('FILTER_TYPE');
export const AMP_MOD = Symbol('AMP_MOD');
export const CYCLING_ENV_MODE = Symbol('CYCLING_ENV_MODE');
export const LFO_SHAPE = Symbol('LFO_SHAPE');
export const LFO_SYNC = Symbol('LFO_SYNC');
export const ARP = Symbol('ARP');
export const SEQ = Symbol('SEQ');
export const ARP_SEQ_MOD = Symbol('ARP_SEQ_MOD');
export const ARP_SEQ_SYNC = Symbol('ARP_SEQ_SYNC');
export const PARAPHONIC = Symbol('PARAPHONIC');
export const OCTAVE = Symbol('OCTAVE');
export const HOLD = Symbol('HOLD');

// misc mod destination
export const LFO_DIVISION = Symbol('LFO_DIVISION');
export const LFO_RATE = Symbol('LFO_RATE');
export const PITCH = Symbol('PITCH');

// mod-matrix sources:
export const MOD_SRC_CYC_ENV = Symbol('MOD_SRC_CYC_ENV');
export const MOD_SRC_ENV = Symbol('MOD_SRC_ENV');
export const MOD_SRC_PRESS = Symbol('MOD_SRC_PRESS');
export const MOD_SRC_KEY_ARP = Symbol('MOD_SRC_KEY_ARP');
export const MOD_SRC_LFO = Symbol('MOD_SRC_LFO');

// // mod-matrix destinations not in control or switch:
export const ASSIGN1 = Symbol('ASSIGN1');
export const ASSIGN2 = Symbol('ASSIGN2');
export const ASSIGN3 = Symbol('ASSIGN3');

export const MOD_GROUP_OSC = Symbol('MOD_GROUP_OSC');
export const MOD_GROUP_FILTER = Symbol('MOD_GROUP_FILTER');
export const MOD_GROUP_CYCLING_ENV = Symbol('MOD_GROUP_CYCLING_ENV');
export const MOD_GROUP_ENVELOPE = Symbol('MOD_GROUP_ENVELOPE');
export const MOD_GROUP_LFO = Symbol('MOD_GROUP_LFO');
export const MOD_GROUP_ARP_SEQ = Symbol('MOD_GROUP_ARP_SEQ');  //TODO: define in MOD_ASSIGN_DEST
export const MOD_GROUP_KEYBOARD = Symbol('MOD_GROUP_KEYBOARD'); //TODO: define in MOD_ASSIGN_DEST
export const MOD_GROUP_MATRIX_PITCH = Symbol('MOD_GROUP_MATRIX_PITCH');
export const MOD_GROUP_MATRIX_WAVE = Symbol('MOD_GROUP_MATRIX_WAVE');
export const MOD_GROUP_MATRIX_TIMBRE = Symbol('MOD_GROUP_MATRIX_TIMBRE');
export const MOD_GROUP_MATRIX_CUTOFF = Symbol('MOD_GROUP_MATRIX_CUTOFF');
export const MOD_GROUP_MATRIX_ASSIGN1 = Symbol('MOD_GROUP_MATRIX_ASSIGN1');
export const MOD_GROUP_MATRIX_ASSIGN2 = Symbol('MOD_GROUP_MATRIX_ASSIGN2');
export const MOD_GROUP_MATRIX_ASSIGN3 = Symbol('MOD_GROUP_MATRIX_ASSIGN3');

// mapping utility
export const MOD_GROUP_MOD_DEST = {
    [PITCH]: MOD_GROUP_MATRIX_PITCH,
    [OSC_WAVE]: MOD_GROUP_MATRIX_WAVE,
    [OSC_TIMBRE]: MOD_GROUP_MATRIX_TIMBRE,
    [FILTER_CUTOFF]: MOD_GROUP_MATRIX_CUTOFF,
    [ASSIGN1]: MOD_GROUP_MATRIX_ASSIGN1,
    [ASSIGN2]: MOD_GROUP_MATRIX_ASSIGN2,
    [ASSIGN3]: MOD_GROUP_MATRIX_ASSIGN3,
};

// names (labels)
export const MOD_SOURCE = {
    [MOD_SRC_CYC_ENV] : 'Cyclic Env',
    [MOD_SRC_ENV]: 'Env',
    [MOD_SRC_LFO]: 'LFO',
    [MOD_SRC_PRESS]: 'Pressure',
    [MOD_SRC_KEY_ARP]: 'Key/Arp'
};

export const MOD_SOURCE_SHORT = {
    [MOD_SRC_CYC_ENV] : 'CycEnv',
    [MOD_SRC_ENV]: 'Env',
    [MOD_SRC_LFO]: 'LFO',
    [MOD_SRC_PRESS]: 'Press',
    [MOD_SRC_KEY_ARP]: 'Key/Arp'
};

export const MOD_SOURCE_CSS = {
    [MOD_SRC_CYC_ENV] : 'mod-src-cyc_env',
    [MOD_SRC_ENV]: 'mod-src-env',
    [MOD_SRC_LFO]: 'mod-src-lfo',
    [MOD_SRC_PRESS]: 'mod-src-press',
    [MOD_SRC_KEY_ARP]: 'mod-src-key_arp'
    // [MOD_GROUP_CYCLING_ENV]: 'mod-src-cyc_env',     // for ASSIGN
    // [MOD_GROUP_ENVELOPE]: 'mod-src-env',
    // [MOD_GROUP_LFO]: 'mod-src-lfo',
    // [MOD_GROUP_ARP_SEQ]: 'mod-src-key_arp',
    // [MOD_GROUP_KEYBOARD]: 'mod-src-press',
};

// names (labels)
// Mod Matrix desitnation row (name of columns)
export const MOD_MATRIX_DESTINATION = {
    [PITCH]: 'Pitch',
    [OSC_WAVE]: 'Wave',
    [OSC_TIMBRE]: 'Timbre',
    [FILTER_CUTOFF]: 'Cutoff',
    [ASSIGN1]: 'Assign 1',
    [ASSIGN2]: 'Assign 2',
    [ASSIGN3]: 'Assign 3'
};

// All mod destinations available
export const MOD_DESTINATION = {
    [PITCH]: 'Pitch',
    [OSC_TYPE]: 'Type',
    [OSC_WAVE]: 'Wave',
    [OSC_TIMBRE]: 'Timbre',
    [OSC_SHAPE]: 'Shape',
    [FILTER_CUTOFF]: 'Cutoff',
    [FILTER_RESONANCE]: 'Resonance',
    [ASSIGN1]: 'Assign 1',
    [ASSIGN2]: 'Assign 2',
    [ASSIGN3]: 'Assign 3',
    [ENVELOPE_ATTACK]: 'Attack',
    [ENVELOPE_DECAY]: 'Decay',
    [ENVELOPE_SUSTAIN]: 'Sustain',
    [CYCLING_ENV_RISE]: 'Rise',
    [CYCLING_ENV_FALL]: 'Fall',
    [CYCLING_ENV_HOLD]: 'Hold',
    [CYCLING_ENV_AMOUNT]: 'Amount',
    [LFO_DIVISION]: 'Division',
    [LFO_RATE]: 'Rate',
    [LFO_SHAPE]: 'Shape',
    [MOD_SRC_CYC_ENV]: 'Mod CycEnv',
    [MOD_SRC_ENV]: 'Mod Env',
    [MOD_SRC_LFO]: 'Mod LFO',
    [MOD_SRC_PRESS]: 'Mod Press',
    [MOD_SRC_KEY_ARP]: 'Mod Key/Arp',
    [GLIDE]: 'Glide',
    [ARP_SEQ_RATE_FREE]: 'Rate'
};


// names (labels)
export const MOD_GROUP_NAME = {
    [MOD_GROUP_OSC]: 'Osc',
    [MOD_GROUP_FILTER]: 'Filter',
    [MOD_GROUP_CYCLING_ENV]: 'CycEnv',
    [MOD_GROUP_ENVELOPE]: 'Env',
    [MOD_GROUP_LFO]: 'LFO',
    [MOD_GROUP_ARP_SEQ]: 'Arp/Seq',
    [MOD_GROUP_KEYBOARD]: 'Keyboard',
    [MOD_GROUP_MATRIX_PITCH]: 'Pitch',
    [MOD_GROUP_MATRIX_WAVE]: 'Wave',
    [MOD_GROUP_MATRIX_TIMBRE]: 'Timbre',
    [MOD_GROUP_MATRIX_CUTOFF]: 'Cutoff',
    [MOD_GROUP_MATRIX_ASSIGN1]: 'Assign1',
    [MOD_GROUP_MATRIX_ASSIGN2]: 'Assign2',
    [MOD_GROUP_MATRIX_ASSIGN3]: 'Assign3'
};

// mod-matrix assign destination configuration
// key is value in memory, read with the help of MOD_ASSIGN_SLOT
export const MOD_ASSIGN_DEST = {
    0x00: {
        mod_group: MOD_GROUP_OSC,
        control: {
            0: OSC_TYPE,
            1: OSC_WAVE,
            3: OSC_TIMBRE,
            5: OSC_SHAPE
        }
    },
    0x01: {
        mod_group: MOD_GROUP_FILTER,
        control: {
            1: FILTER_CUTOFF,
            2: FILTER_RESONANCE
        }
    },
    0x02: {
        mod_group: MOD_GROUP_CYCLING_ENV,
        control: {
            1: CYCLING_ENV_RISE,
            3: CYCLING_ENV_FALL,
            4: CYCLING_ENV_HOLD,
            6: CYCLING_ENV_AMOUNT
        }
    },
    0x03: {
        mod_group: MOD_GROUP_KEYBOARD,
        control: {
            0: GLIDE
        }
    },
    0x04: {
        mod_group: MOD_GROUP_ARP_SEQ,
        control: {
            3: ARP_SEQ_RATE_FREE
        }
    },
    0x05: {
        mod_group: MOD_GROUP_LFO,
        control: {
            0: LFO_SHAPE,
            1: LFO_DIVISION,
            2: LFO_RATE
        }
    },
    0x06: {
        mod_group: MOD_GROUP_ENVELOPE,
        control: {
            1: ENVELOPE_ATTACK,
            2: ENVELOPE_DECAY,
            3: ENVELOPE_SUSTAIN
        }
    },
    0x0A: {
        mod_group: MOD_GROUP_MATRIX_PITCH,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP  //'Key/Arp'
        }
    },
    0x0B: {
        mod_group: MOD_GROUP_MATRIX_WAVE,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP
        }
    },
    0x0C: {
        mod_group: MOD_GROUP_MATRIX_TIMBRE,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP
        }
    },
    0x0D: {
        mod_group: MOD_GROUP_MATRIX_CUTOFF,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP
        }
    },
    0x0E: {
        mod_group: MOD_GROUP_MATRIX_ASSIGN1,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP
        }
    },
    0x0F: {
        mod_group: MOD_GROUP_MATRIX_ASSIGN2,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP
        }
    },
    0x10: {
        mod_group: MOD_GROUP_MATRIX_ASSIGN3,
        control: {
            0: MOD_SRC_CYC_ENV,    // MOD MATRIX SRC
            1: MOD_SRC_ENV,
            2: MOD_SRC_LFO,
            3: MOD_SRC_PRESS,
            4: MOD_SRC_KEY_ARP
        }
    }
};

// mod matrix assign slots configuration
// The values in memory at mod_group and control are to be used with the MOD_ASSIGN_DEST map.
export const MOD_ASSIGN_SLOT = {
    [FW1]: {
        [ASSIGN1]: {
            mod_group: [21, 5],     // value is key for MOD_ASSIGN_DEST
            control: [21, 4]
        },
        [ASSIGN2]: {
            mod_group: [21, 19],
            control: [21, 18]
        },
        [ASSIGN3]: {
            mod_group: [22, 1],
            control: [21, 31]
        }
    },
    [FW2]: {
        [ASSIGN1]: {
            mod_group: [21, 27],     // value is key for MOD_ASSIGN_DEST
            control: [21, 26]
        },
        [ASSIGN2]: {
            mod_group: [22, 9],
            control: [22, 7]
        },
        [ASSIGN3]: {
            mod_group: [22, 22],
            control: [22, 21]
        }
    }
};

// RE-30: FW2 mod-matrix decoder using MIDI 7-bit unpacking.
//
// Preset data as stored on disk / received on the wire is 7-bit packed MIDI
// SysEx: every 8 packed bytes encode 7 data bytes, with the first byte of
// each group holding the bit-7 values of the following 7 bytes (LSB-first
// bit-to-byte mapping: flag bit 0 -> bit 7 of byte 1, flag bit 1 -> byte 2,
// etc.). RE-29 and earlier worked on the still-packed stream at hardcoded
// byte positions, which only coincidentally decoded correctly when upstream
// flag bytes happened to be zero - hence the "shifted-left" failures on
// many presets. After unpacking, the mod matrix is a plain fixed-width grid:
// a single @#Co1 marker anchors the region, destinations are 45 bytes apart,
// and each cell is a signed 16-bit little-endian value in the last 2 bytes
// of an 8-byte source row.
export function unpackMidi7bit(data) {
    const flat = [];
    for (let b = 0; b < data.length; b++) {
        const block = data[b];
        for (let i = 0; i < block.length; i++) flat.push(block[i]);
    }
    const out = [];
    for (let i = 0; i < flat.length; i += 8) {
        const flag = flat[i];
        const end = Math.min(i + 8, flat.length);
        for (let k = i + 1; k < end; k++) {
            const bit = (flag >> (k - i - 1)) & 1;
            out.push((bit << 7) | flat[k]);
        }
    }
    return out;
}

const MOD_MATRIX_FW2_SRC_INDEX = new Map([
    [MOD_SRC_CYC_ENV, 0],
    [MOD_SRC_ENV, 1],
    [MOD_SRC_LFO, 2],
    [MOD_SRC_PRESS, 3],
    [MOD_SRC_KEY_ARP, 4],
]);

const MOD_MATRIX_FW2_DEST_INDEX = new Map([
    [PITCH, 0],
    [OSC_WAVE, 1],
    [OSC_TIMBRE, 2],
    [FILTER_CUTOFF, 3],
    [ASSIGN1, 4],
    [ASSIGN2, 5],
    [ASSIGN3, 6],
]);

function findCo1Marker(unpacked) {
    // 40 23 43 6F 31 = '@#Co1'
    for (let i = 0; i < unpacked.length - 4; i++) {
        if (unpacked[i] === 0x40 && unpacked[i + 1] === 0x23 &&
            unpacked[i + 2] === 0x43 && unpacked[i + 3] === 0x6F &&
            unpacked[i + 4] === 0x31) return i;
    }
    return -1;
}

export function decodeModMatrixFW2(data, src, dest) {
    const s = MOD_MATRIX_FW2_SRC_INDEX.get(src);
    const d = MOD_MATRIX_FW2_DEST_INDEX.get(dest);
    if (s === undefined || d === undefined) return null;
    const unpacked = unpackMidi7bit(data);
    const co1 = findCo1Marker(unpacked);
    if (co1 < 0) return null;
    const rowStart = co1 + d * 45 + 5 + s * 8;
    const lsb = unpacked[rowStart + 6];
    const msb = unpacked[rowStart + 7];
    if (lsb === undefined || msb === undefined) return null;
    const u16 = (msb << 8) | lsb;
    return u16 >= 0x8000 ? u16 - 0x10000 : u16;
}

// [row, col] for data received when reading preset. Data does not include sysex header, sysex footer, man. id and constant data header
export const MOD_MATRIX = {
    [FW1]: {
        [MOD_SRC_CYC_ENV]: {
            [PITCH]: {
                MSB: [22, 15],
                LSB: [22, 14],
                msb: [22, 8, 0x20],
                sign: [22, 8, 0x40]
            },
            [OSC_WAVE]: {
                MSB: [24, 3],
                LSB: [24, 2],
                msb: [24, 0, 0x02],
                sign: [24, 0, 0x04]
            },
            [OSC_TIMBRE]: {
                MSB: [25, 22],
                LSB: [25, 21],
                msb: [25, 16, 0x10],
                sign: [25, 16, 0x20]
            },
            [FILTER_CUTOFF]: {
                MSB: [27, 10],
                LSB: [27, 9],
                msb: [27, 8, 0x01],
                sign: [27, 8, 0x02]
            },
            [ASSIGN1]: {
                MSB: [28, 29],
                LSB: [28, 28],
                msb: [28, 24, 0x08],
                sign: [28, 24, 0x10]
            },
            [ASSIGN2]: {
                MSB: [30, 17],
                LSB: [30, 15],
                msb: [30, 8, 0x40],
                sign: [30, 16, 0x01]
            },
            [ASSIGN3]: {
                MSB: [32, 4],
                LSB: [32, 3],
                msb: [32, 0, 0x04],
                sign: [32, 0, 0x08]
            }
        },
        [MOD_SRC_ENV]: {
            [PITCH]: {              // OK
                MSB: [22, 25],
                LSB: [22, 23],
                msb: [22, 16, 0x40],
                sign: [22, 24, 0x01]
            },
            [OSC_WAVE]: {
                MSB: [24, 12],
                LSB: [24, 11],
                msb: [24, 8, 0x04],
                sign: [24, 8, 0x08]
            },
            [OSC_TIMBRE]: {
                MSB: [25, 31],
                LSB: [25, 30],
                msb: [25, 24, 0x20],
                sign: [25, 24, 0x40]
            },
            [FILTER_CUTOFF]: {
                MSB: [27, 19],
                LSB: [27, 18],
                msb: [27, 16, 0x02],
                sign: [27, 16, 0x04]
            },
            [ASSIGN1]: {
                MSB: [29, 6],
                LSB: [29, 5],
                msb: [29, 0, 0x10],
                sign: [29, 0, 0x20]
            },
            [ASSIGN2]: {
                MSB: [30, 26],
                LSB: [30, 25],
                msb: [30, 24, 0x01],
                sign: [30, 24, 0x02]
            },
            [ASSIGN3]: {
                MSB: [32, 13],
                LSB: [32, 12],
                msb: [32, 8, 0x08],
                sign: [32, 8, 0x10]
            }
        },
        [MOD_SRC_LFO]: {
            [PITCH]: {
                MSB: [23, 2],
                LSB: [23, 1],
                msb: [23, 0, 0x01],
                sign: [23, 0, 0x02]
            },
            [OSC_WAVE]: {
                MSB: [24, 21],
                LSB: [24, 20],
                msb: [24, 16, 0x08],
                sign: [24, 16, 0x10]
            },
            [OSC_TIMBRE]: {
                MSB: [26, 9],
                LSB: [26, 7],
                msb: [26, 0, 0x40],
                sign: [26, 8, 0x01]
            },
            [FILTER_CUTOFF]: {
                MSB: [27, 28],
                LSB: [27, 27],
                msb: [27, 24, 0x04],
                sign: [27, 24, 0x08]
            },
            [ASSIGN1]: {
                MSB: [29, 15],
                LSB: [29, 14],
                msb: [29, 8, 0x20],
                sign: [29, 8, 0x40]
            },
            [ASSIGN2]: {
                MSB: [31, 3],
                LSB: [31, 2],
                msb: [31, 0, 0x02],
                sign: [31, 0, 0x04]
            },
            [ASSIGN3]: {
                MSB: [32, 22],
                LSB: [32, 21],
                msb: [32, 16, 0x10],
                sign: [32, 16, 0x20]
            }
        },
        [MOD_SRC_PRESS]: {
            [PITCH]: {
                MSB: [23, 11],
                LSB: [23, 10],
                msb: [23, 8, 0x02],
                sign: [23, 8, 0x04]
            },
            [OSC_WAVE]: {
                MSB: [24, 30],
                LSB: [24, 29],
                msb: [24, 24, 0x10],
                sign: [24, 24, 0x20]
            },
            [OSC_TIMBRE]: {
                MSB: [26, 18],
                LSB: [26, 17],
                msb: [26, 16, 0x01],
                sign: [26, 16, 0x02]
            },
            [FILTER_CUTOFF]: {
                MSB: [28, 5],
                LSB: [28, 4],
                msb: [28, 0, 0x08],
                sign: [28, 0, 0x10]
            },
            [ASSIGN1]: {
                MSB: [29, 25],
                LSB: [29, 23],
                msb: [29, 16, 0x40],
                sign: [29, 24, 0x01]
            },
            [ASSIGN2]: {
                MSB: [31, 12],
                LSB: [31, 11],
                msb: [31, 8, 0x04],
                sign: [31, 8, 0x08]
            },
            [ASSIGN3]: {
                MSB: [32, 31],
                LSB: [32, 30],
                msb: [32, 24, 0x20],
                sign: [32, 24, 0x40]
            }
        },
        [MOD_SRC_KEY_ARP]: {
            [PITCH]: {
                MSB: [23, 20],
                LSB: [23, 19],
                msb: [23, 16, 0x04],
                sign: [23, 16, 0x08]
            },
            [OSC_WAVE]: {
                MSB: [25, 7],
                LSB: [25, 6],
                msb: [25, 0, 0x20],
                sign: [25, 0, 0x40]
            },
            [OSC_TIMBRE]: {
                MSB: [26, 27],
                LSB: [26, 26],
                msb: [26, 24, 0x02],
                sign: [26, 24, 0x04]
            },
            [FILTER_CUTOFF]: {
                MSB: [28, 14],
                LSB: [28, 13],
                msb: [28, 8, 0x10],
                sign: [28, 8, 0x20]
            },
            [ASSIGN1]: {
                MSB: [30, 2],
                LSB: [30, 1],
                msb: [30, 0, 0x01],
                sign: [30, 0, 0x02]
            },
            [ASSIGN2]: {
                MSB: [31, 21],
                LSB: [31, 20],
                msb: [31, 16, 0x08],
                sign: [31, 16, 0x10]
            },
            [ASSIGN3]: {
                MSB: [33, 9],
                LSB: [33, 7],
                msb: [33, 0, 0x40],
                sign: [33, 8, 0x01]
            }
        }
    },
    [FW2]: (() => {
        // RE-29: Full FW2 mod-matrix generator based on empirically-verified
        // pattern (user preset #449). Anchors are the 7 Env-row cells
        // (empirically confirmed), then per-source shifts:
        //   - LSB byte stride: +9 if previous source was classic, +10 if split
        //   - flag byte stride: +8 classic, +16 split (split cells use 2 flag slots)
        //   - msb bit position cycles (env_msb_bit + S - 1) mod 7
        //   - When msb bit would land on 6, cell is "split": sign moves to a
        //     wedge byte between LSB and MSB (at LSB+1 bit 0); MSB at LSB+2.
        // Known-cell verification: all 12 empirically-probed cells match
        // this generator exactly. Remaining 23 cells are extrapolated.
        const ENV_ANCHORS = [
            [PITCH,         27*32+14, 27*32+8,  5],
            [OSC_WAVE,      29*32+2,  29*32+0,  1],
            [OSC_TIMBRE,    30*32+21, 30*32+16, 4],
            [FILTER_CUTOFF, 32*32+9,  32*32+8,  0],
            [ASSIGN1,       33*32+28, 33*32+24, 3],
            [ASSIGN2,       35*32+15, 35*32+8,  6],
            [ASSIGN3,       37*32+3,  37*32+0,  2],
        ];
        const SOURCES = [MOD_SRC_CYC_ENV, MOD_SRC_ENV, MOD_SRC_LFO, MOD_SRC_PRESS, MOD_SRC_KEY_ARP];
        const toBB = (lin) => [Math.floor(lin / 32), lin % 32];
        const result = {};
        SOURCES.forEach((s) => { result[s] = {}; });
        for (const [destSym, envLsbLin, envFlagLin, envMsbBit] of ENV_ANCHORS) {
            const bits = SOURCES.map((_, s) => ((envMsbBit + s - 1) % 7 + 7) % 7);
            const splits = bits.map((b) => b === 6);
            const lsbLins = new Array(5);
            lsbLins[1] = envLsbLin;
            lsbLins[0] = envLsbLin - (splits[0] ? 10 : 9);
            for (let s = 2; s < 5; s++) lsbLins[s] = lsbLins[s-1] + (splits[s-1] ? 10 : 9);
            const flagLins = new Array(5);
            flagLins[1] = envFlagLin;
            flagLins[0] = envFlagLin - (splits[0] ? 16 : 8);
            for (let s = 2; s < 5; s++) flagLins[s] = flagLins[s-1] + (splits[s-1] ? 16 : 8);
            for (let s = 0; s < 5; s++) {
                const msbBit = bits[s];
                const split = splits[s];
                const lsbL = lsbLins[s];
                const flagL = flagLins[s];
                if (split) {
                    result[SOURCES[s]][destSym] = {
                        LSB:  toBB(lsbL),
                        MSB:  toBB(lsbL + 2),
                        msb:  [...toBB(flagL), 0x40],
                        sign: [...toBB(lsbL + 1), 0x01],
                    };
                } else {
                    result[SOURCES[s]][destSym] = {
                        LSB:  toBB(lsbL),
                        MSB:  toBB(lsbL + 1),
                        msb:  [...toBB(flagL), 1 << msbBit],
                        sign: [...toBB(flagL), 1 << (msbBit + 1)],
                    };
                }
            }
        }
        return result;
    })()
};


// if mod_group is defined, that means that the control can be a modulation destination
export const CONTROL = {
    [FW1]: {
        [GLIDE]: {
            MSB: [6, 23],
            LSB: [6, 22],
            //sign: [0, 0, 0x02],
            msb: [6, 16, 0x20],
            cc: 5,
            mapping: null,
            name: "Glide",
            // group: MOD_GROUP_
        },
        [OSC_TYPE]: {
            MSB: null,
            LSB: [0, 14],
            msb: null,
            cc: 9,
            mapping: _osc_type,
            name: "Type",
            mod_group: MOD_GROUP_OSC
        },
        [OSC_WAVE]: {
            MSB: [0, 27],
            LSB: [0, 26],
            //sign: [0, 0, 0x02],
            msb: [0, 24, 0x10],
            cc: 10,
            mapping: null,
            name: 'Wave',
            mod_group: MOD_GROUP_OSC
        },
        [OSC_TIMBRE]: {
            MSB: [1, 7],
            LSB: [1, 6],
            //sign: [0, 0, 0x02],
            msb: [1, 0, 0x02],
            cc: 12,
            mapping: null,
            name: 'Timbre',
            mod_group: MOD_GROUP_OSC
        },
        [OSC_SHAPE]: {      // ok
            MSB: [1, 20],
            LSB: [1, 19],
            //sign: [0, 0, 0x02],
            msb: [1, 16, 0x04],
            cc: 13,
            mapping: null,
            name: 'Shape',
            mod_group: MOD_GROUP_OSC
        },
        [FILTER_CUTOFF]: {
            MSB: [2, 30],
            LSB: [2, 29],
            //sign: [0, 0, 0x02],
            msb: [2, 24, 0x10],
            cc: 23,
            mapping: null,
            name: 'Cutoff',
            mod_group: MOD_GROUP_FILTER
        },
        [FILTER_RESONANCE]: {
            MSB: [3, 9],
            LSB: [3, 7],
            //sign: [0, 0, 0x02],
            msb: [3, 0, 0x40],
            cc: 83,
            mapping: _percent,
            name: 'Resonance',
            mod_group: MOD_GROUP_FILTER
        },
        [CYCLING_ENV_RISE]: {
            MSB: [4, 6],
            LSB: [4, 5],
            //sign: [0, 0, 0x02],
            msb: [4, 0, 0x10],
            cc: 102,
            mapping: null,  //_0_100,
            name: 'Rise',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_FALL]: {
            MSB: [5, 2],
            LSB: [5, 1],
            //sign: [0, 0, 0x02],
            msb: [5, 0, 0x01],
            cc: 103,
            mapping: null,
            name: 'Fall',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_HOLD]: {
            MSB: [5, 12],
            LSB: [5, 11],
            //sign: [0, 0, 0x02],
            msb: [5, 8, 0x04],
            cc: 28,
            mapping: null,
            name: 'Hold',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_AMOUNT]: {
            MSB: [6, 6],
            LSB: [6, 5],
            //sign: [0, 0, 0x02],
            msb: [6, 0, 0x10],
            cc: 24,
            mapping: _percent,
            name: 'Amount',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_RISE_SHAPE]: {
            MSB: [4, 20],
            LSB: [4, 19],
            msb: [4, 16, 0x04],
            cc: 24,
            mapping: null,
            name: 'Rise shape'
        },
        [CYCLING_ENV_FALL_SHAPE]: {
            MSB: [5, 26],
            LSB: [5, 25],
            msb: [5, 24, 0x01],
            cc: 24,
            mapping: null,
            name: 'Fall shape'
        },
        [ARP_SEQ_RATE_FREE]: {
            MSB: [10, 5],
            LSB: [10, 4],
            msb: [10, 0, 0x08],
            cc: 91,
            mapping: null,
            name: 'Rate free'
        },
        [ARP_SEQ_RATE_SYNC]: {
            MSB: [9, 27],
            LSB: [9, 26],
            msb: [9, 24, 0x02],
            cc: 92,
            mapping: _arp_rate_sync,
            // enabled: state.arpSyncOn,
            name: 'Rate sync'
        },
        [ARP_SEQ_SWING]: {
            MSB: [10, 17],
            LSB: [10, 15],
            msb: [19, 8, 0x40],
            cc: 0,
            mapping: null,  // 50%..75%
            name: 'Swing'
        },
        [LFO_RATE_FREE]: {
            MSB: [13, 10],
            LSB: [13, 9],
            msb: [13, 8, 0x01],
            cc: 93,
            mapping: null,
            name: 'Rate free'
        },
        [LFO_RATE_SYNC]: {
            MSB: [12, 31],
            LSB: [12, 30],
            msb: [12, 24, 0x20],
            cc: 94,
            mapping: _lfo_rate_sync,
            name: 'Rate sync'
        },
        [ENVELOPE_ATTACK]: {
            MSB: [14, 29],
            LSB: [14, 28],
            // sign: [1, 0x02],
            msb: [14, 24, 0x08],
            cc: 105,
            mapping: null,
            name: 'Attack',
            mod_group: MOD_GROUP_ENVELOPE
        },
        [ENVELOPE_DECAY]: {
            MSB: [15, 10],
            LSB: [15, 9],
            //sign: [0, 0, 0x02],
            msb: [15, 8, 0x01],
            cc: 106,
            mapping: null,
            name: 'Decay/Rel',
            mod_group: MOD_GROUP_ENVELOPE
        },
        [ENVELOPE_SUSTAIN]: {
            MSB: [15, 23],
            LSB: [15, 22],
            //sign: [0, 0, 0x02],
            msb: [15, 16, 0x20],
            cc: 29,
            mapping: _percent,
            name: 'Sustain',
            mod_group: MOD_GROUP_ENVELOPE
        },
        // [HOLD]: {
        //     MSB: [0, 0],
        //     LSB: [0, 0],
        //     //sign: [0, 0, 0x02],
        //     msb: [0, 0, 0x01],
        //     cc: 64,
        //     mapping: null,
        //     name: 'Hold'
        // },
        [SPICE]: {
            MSB: [0, 0],
            LSB: [0, 0],
            //sign: [0, 0, 0x02],
            msb: [0, 0, 0x01],
            cc: 2,
            mapping: null,
            name: 'Spice'
        }
    },
    [FW2]: {
        [GLIDE]: {
            // RE walk: positions + cubic ms curve 0..10 s.
            LSB: [7, 3],
            MSB: [7, 4],
            msb: [7, 0, 0x04],
            cc: 5,
            mapping: _rangedPow(10000, 3, "ms"),
            name: "Glide",
        },
        [OSC_TYPE]: {
            MSB: null,
            LSB: [0, 14],
            msb: null,
            cc: 9,
            mapping: _osc_type,
            name: "Type",
            mod_group: MOD_GROUP_OSC
        },
        [OSC_WAVE]: {
            LSB: [0, 26],
            MSB: [0, 27],
            //sign: [0, 0, 0x02],
            msb: [0, 24, 0x02],
            cc: 10,
            mapping: null,
            name: 'Wave',
            mod_group: MOD_GROUP_OSC
        },
        [OSC_TIMBRE]: {
            LSB: [1, 6],
            MSB: [1, 7],
            msb: [1, 0, 0x20],
            cc: 12,
            mapping: null,
            name: 'Timbre',
            mod_group: MOD_GROUP_OSC
        },
        [OSC_SHAPE]: {      // ok
            MSB: [1, 20],
            LSB: [1, 19],
            //sign: [0, 0, 0x02],
            msb: [1, 16, 0x04],
            cc: 13,
            mapping: null,
            name: 'Shape',
            mod_group: MOD_GROUP_OSC
        },
        [FILTER_CUTOFF]: {
            // RE walk: positions + log Hz range (16..26900). Log because
            // cutoff is perceptually linear (octaves per knob turn).
            LSB: [3, 10],
            MSB: [3, 11],
            msb: [3, 8, 0x02],
            cc: 23,
            mapping: _rangedLog(16, 26900, "Hz"),
            name: 'Cutoff',
            mod_group: MOD_GROUP_FILTER
        },
        [FILTER_RESONANCE]: {
            // RE walk: positions + 0..100%
            LSB: [3, 20],
            MSB: [3, 21],
            msb: [3, 16, 0x08],
            cc: 83,
            mapping: _ranged(0, 100, "%"),
            name: 'Resonance',
            mod_group: MOD_GROUP_FILTER
        },
        [FILTER_AMT]: {
            // RE walk: bipolar -100..+100. Byte [32][10] is the primary (0..0x7F)
            // with center ~0x40 = 0%. [32][8] and [32][9] carry sign/precision
            // that we decode specially in Control.js (raw={true} path).
            MSB: null,
            LSB: [32, 10],
            msb: null,
            cc: 0,
            mapping: null,
            name: 'Filter Amt',
            mod_group: MOD_GROUP_FILTER
        },
        [CYCLING_ENV_RISE]: {
            LSB: [4, 18],
            MSB: [4, 19],
            msb: [4, 16, 0x02],
            cc: 102,
            mapping: _rangedPow(10000, 3, "ms"),
            name: 'Rise',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_FALL]: {
            LSB: [5, 13],
            MSB: [5, 14],
            msb: [5, 8, 0x10],
            cc: 103,
            mapping: _rangedPow(10000, 3, "ms"),
            name: 'Fall',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_HOLD]: {
            // LSB/MSB non-adjacent. Unlike rise/fall (ms), HOLD is linear %.
            LSB: [5, 23],
            MSB: [5, 25],
            msb: [5, 16, 0x40],
            cc: 28,
            mapping: _ranged(0, 100, "%"),
            name: 'Hold',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_AMOUNT]: {
            // RE walk: positions + 0..100%
            LSB: [6, 18],
            MSB: [6, 19],
            msb: [6, 16, 0x02],
            cc: 24,
            mapping: _ranged(0, 100, "%"),
            name: 'Amount',
            mod_group: MOD_GROUP_CYCLING_ENV
        },
        [CYCLING_ENV_RISE_SHAPE]: {
            // RE walk: positions + 0..100% (LSB/MSB span block boundary)
            LSB: [4, 31],
            MSB: [5, 1],
            msb: [4, 24, 0x40],
            cc: 24,
            mapping: _ranged(0, 100, "%"),
            name: 'Rise shape'
        },
        [CYCLING_ENV_FALL_SHAPE]: {
            // RE walk: positions + 0..100%
            LSB: [6, 5],
            MSB: [6, 6],
            msb: [6, 0, 0x10],
            cc: 24,
            mapping: _ranged(0, 100, "%"),
            name: 'Fall shape'
        },
        [ARP_SEQ_RATE_FREE]: {
            // RE walk (sync OFF): positions confirmed. Linear BPM 30..240.
            // Note: encoder saturates the stored byte at raw = 31500 (= 0x7B00 + 0x0C)
            // which is ~96.1% of full 15-bit scale, NOT 32767. Scaling factor
            // 210/96.13 = 2.1845 converts the controlValue-scaled v (0..100) to BPM.
            LSB: [11, 6],
            MSB: [11, 7],
            msb: [11, 0, 0x01],
            cc: 91,
            mapping: function (v) {
                const t = Math.max(0, Math.min(1, v / 96.13));
                return Math.round(30 + 210 * t) + " BPM";
            },
            name: 'Rate free'
        },
        [ARP_SEQ_RATE_SYNC]: {
            // RE walk (sync ON): positions updated for FW2. Division mapping unchanged.
            LSB: [10, 28],
            MSB: [10, 29],
            msb: [10, 24, 0x08],
            cc: 92,
            mapping: _arp_rate_sync,
            name: 'Rate sync'
        },
        [ARP_SEQ_SWING]: {
            MSB: [11, 5],
            LSB: [11, 6],
            msb: [11, 0, 0x10],
            cc: 0,
            mapping: null,  // 50%..75%
            name: 'Swing'
        },
        [LFO_RATE_FREE]: {
            // RE walk (sync OFF): positions + log Hz range (0.06 .. 100 Hz).
            LSB: [14, 11],
            MSB: [14, 12],
            msb: [14, 8, 0x04],
            cc: 93,
            mapping: _rangedLog(0.06, 100, "Hz"),
            name: 'Rate free'
        },
        [LFO_RATE_SYNC]: {
            // RE walk (sync ON): positions updated for FW2. Division mapping
            // stays as the existing _lfo_rate_sync (13 values 8/1..1/32).
            LSB: [14, 1],
            MSB: [14, 2],
            msb: [14, 0, 0x01],
            cc: 94,
            mapping: _lfo_rate_sync,
            name: 'Rate sync'
        },
        [ENVELOPE_ATTACK]: {
            LSB: [15, 30],
            MSB: [15, 31],
            msb: [15, 24, 0x20],
            cc: 105,
            mapping: _rangedPow(10000, 3, "ms"),
            name: 'Attack',
            mod_group: MOD_GROUP_ENVELOPE
        },
        [ENVELOPE_DECAY]: {
            // ms range up to 25 s
            LSB: [16, 11],
            MSB: [16, 12],
            msb: [16, 8, 0x04],
            cc: 106,
            mapping: _rangedPow(25000, 3, "ms"),
            name: 'Decay/Rel',
            mod_group: MOD_GROUP_ENVELOPE
        },
        [ENVELOPE_SUSTAIN]: {
            // RE walk: positions + 0..100%
            LSB: [16, 25],
            MSB: [16, 26],
            msb: [16, 24, 0x01],
            cc: 29,
            mapping: _ranged(0, 100, "%"),
            name: 'Sustain',
            mod_group: MOD_GROUP_ENVELOPE
        },
        // [HOLD]: {
        //     MSB: [0, 0],
        //     LSB: [0, 0],
        //     //sign: [0, 0, 0x02],
        //     msb: [0, 0, 0x01],
        //     cc: 64,
        //     mapping: null,
        //     name: 'Hold'
        // },
        [SPICE]: {
            MSB: [0, 0],
            LSB: [0, 0],
            //sign: [0, 0, 0x02],
            msb: [0, 0, 0x01],
            cc: 2,
            mapping: null,
            name: 'Spice'
        }
    }
};

export const SWITCH = {
    [FW1]: {
        [FILTER_TYPE]: {
            MSB: [2, 18],
            LSB: [2, 17],
            msb: [2, 16, 0x01],
            values: [
                {name: 'LPF', value: 0},
                {name: 'BPF', value: 0x4000},
                {name: 'HPF', value: 0x7fff}
            ],
            name: "Filter type"
        },
        [AMP_MOD]: {
            MSB: [14, 17],
            LSB: [14, 15],
            msb: [14, 8, 0x40],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: "Amp mod"
        },
        [CYCLING_ENV_MODE]: {
            MSB: [3, 25],
            LSB: [3, 23],
            msb: [3, 16, 0x40],
            values: [
                {name: 'Env', value: 0},
                {name: 'Run', value: 0x4000},
                {name: 'Loop', value: 0x7fff}
            ],
            name: "Mode"
        },
        [LFO_SHAPE]: {
            MSB: [12, 22],
            LSB: [12, 21],
            msb: [12, 16, 0x10],
            values: [
                {name: 'Sine', value: 0},
                {name: 'Tri', value: 0x1999},
                {name: 'Saw', value: 0x3333},
                {name: 'Sqa', value: 0x4ccc},
                {name: 'SnH', value: 0x6666},
                {name: 'SnHF', value: 0x7fff}
            ],
            name: "Shape",
            mod_group: MOD_GROUP_LFO
        },
        [ARP]: {
            MSB: [9, 6],
            LSB: [9, 5],
            msb: [9, 0, 0x10],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: "Arp"
        },
        [SEQ]: {
            MSB: [12, 5],
            LSB: [12, 4],
            msb: [12, 0, 0x08],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: "Seq"
        },
        [ARP_SEQ_MOD]: {
            MSB: [9, 18],
            LSB: [9, 17],
            msb: [9, 16, 0x01],
            values: [
                {name: '1', value: 17408},
                {name: '2', value: 10922},
                {name: '3', value: 21845},
                {name: '4', value: 0x7fff}
            ],
            name: "Mod"
        },
        [ARP_SEQ_SYNC]: {   //TODO
            MSB: [10, 27],
            LSB: [10, 26],
            msb: [10, 24, 0x02],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: "Sync"
        },
        [LFO_SYNC]: {
            MSB: [13, 20],
            LSB: [13, 19],
            msb: [13, 16, 0x04],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: "Sync"
        },
        [PARAPHONIC]: {
            MSB: [16, 23],
            LSB: [16, 22],
            msb: [16, 16, 0x20],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: "Paraphonic"
        },
        [OCTAVE]: {
            MSB: [7, 4],
            LSB: [7, 3],
            msb: [7, 0, 0x04],
            // mapping: _octave,
            values: [
                {name: '-3', value: 0},
                {name: '-2', value: 0x1555},
                {name: '-1', value: 0x2aaa},
                {name: '0', value: 0x4000},
                {name: '+1', value: 0x5555},
                {name: '+2', value: 0x6aaa},
                {name: '+3', value: 0x7fff}
            ],
            name: "Octave"
        },
        [HOLD]: {   //TODO
            MSB: [0, 0],
            LSB: [0, 0],
            msb: [0, 0, 0],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: 'Hold'
        }
    },
    [FW2]: {
        [FILTER_TYPE]: {
            // RE prescan: positions corrected; values[] same as pre-existing model
            // (which had the right raw assignments all along; only the positions
            // were outdated for FW2).
            LSB: [2, 29],
            MSB: [2, 30],
            msb: [2, 24, 0x10],
            values: [
                {name: 'LPF', value: 0x0000},
                {name: 'BPF', value: 0x4000},
                {name: 'HPF', value: 0x7FFF}
            ],
            name: "Filter type"
        },
        // [AMP_MOD]: {
        //     MSB: [14, 17],
        //     LSB: [14, 15],
        //     msb: [14, 8, 0x40],
        //     values: [
        //         {name: 'Off', value: 0},
        //         {name: 'On', value: 0x7fff}
        //     ],
        //     name: "Amp mod"
        // },
        [AMP_MOD]: {
            // RE prescan: positions updated for FW2.
            LSB: [15, 18],
            MSB: [15, 19],
            msb: [15, 16, 0x02],
            values: [
                {name: 'Off', value: 0x0000},
                {name: 'On',  value: 0x7FFF}
            ],
            name: "Amp mod"
        },
        [CYCLING_ENV_MODE]: {
            // RE prescan: positions updated for FW2; values same as pre-existing model.
            LSB: [4, 4],
            MSB: [4, 5],
            msb: [4, 0, 0x08],
            values: [
                {name: 'Env', value: 0x0000},
                {name: 'Run', value: 0x4000},
                {name: 'Loop', value: 0x7FFF}
            ],
            name: "Mode"
        },
        // [LFO_SHAPE]: {
        //     MSB: [12, 22],
        //     LSB: [12, 21],
        //     msb: [12, 16, 0x10],
        //     values: [
        //         {name: 'Sine', value: 0},
        //         {name: 'Tri', value: 0x1999},
        //         {name: 'Saw', value: 0x3333},
        //         {name: 'Sqa', value: 0x4ccc},
        //         {name: 'SnH', value: 0x6666},
        //         {name: 'SnHF', value: 0x7fff}
        //     ],
        //     name: "Shape",
        //     mod_group: MOD_GROUP_LFO
        // },
        [LFO_SHAPE]: {
            // RE prescan: positions correct. Raw encoding formula is
            //   (MSB << 8) + (msb_bit << 7) + LSB
            // giving evenly-spaced values at 0x1999 increments in cycle order.
            // values[] is in HARDWARE display order (2-col grid, row-major):
            //   Sine Sqr
            //   Tri  SnH
            //   Saw  SnHF
            // switchValue() uses nearest-match so display order is free.
            LSB: [13, 23],
            MSB: [13, 25],
            msb: [13, 16, 0x40],
            values: [
                {name: 'Sine', value: 0x0000},   // 0
                {name: 'Sqr',  value: 0x4CCC},   // 19660
                {name: 'Tri',  value: 0x1999},   // 6553
                {name: 'SnH',  value: 0x6666},   // 26214
                {name: 'Saw',  value: 0x3333},   // 13107
                {name: 'SnHF', value: 0x7FFF}    // 32767
            ],
            name: "Shape",
            mod_group: MOD_GROUP_LFO
        },
        [ARP]: {
            // RE prescan: positions updated for FW2.
            LSB: [10, 7],
            MSB: [10, 9],
            msb: [10, 0, 0x40],
            values: [
                {name: 'Off', value: 0x0000},
                {name: 'On',  value: 0x7FFF}
            ],
            name: "Arp"
        },
        [SEQ]: {
            // RE prescan: positions updated for FW2.
            LSB: [13, 6],
            MSB: [13, 7],
            msb: [13, 0, 0x20],
            values: [
                {name: 'Off', value: 0x0000},
                {name: 'On',  value: 0x7FFF}
            ],
            name: "Seq"
        },
        // [ARP_SEQ_MOD]: {
        //     MSB: [9, 18],
        //     LSB: [9, 17],
        //     msb: [9, 16, 0x01],
        //     values: [
        //         {name: '1', value: 17408},
        //         {name: '2', value: 10922},
        //         {name: '3', value: 21845},
        //         {name: '4', value: 0x7fff}
        //     ],
        //     name: "Mod"
        // },
        [ARP_SEQ_MOD]: {
            // RE prescan: positions updated for FW2. Values are 4 evenly-spaced
            // at 0x2AAA intervals (old "1" value 17408 was 0x4400 — wrong).
            LSB: [10, 19],
            MSB: [10, 20],
            msb: [10, 16, 0x04],
            values: [
                {name: '1', value: 0x0000},
                {name: '2', value: 0x2AAA},
                {name: '3', value: 0x5555},
                {name: '4', value: 0x7FFF}
            ],
            name: "Mod"
        },
        [ARP_SEQ_SYNC]: {
            // RE walk: positions updated for FW2.
            LSB: [11, 28],
            MSB: [11, 29],
            msb: [11, 24, 0x08],
            values: [
                {name: 'Off', value: 0x0000},
                {name: 'On',  value: 0x7FFF}
            ],
            name: "Sync"
        },
        [LFO_SYNC]: {
            // RE walk: positions updated for FW2.
            LSB: [14, 21],
            MSB: [14, 22],
            msb: [14, 16, 0x10],
            values: [
                {name: 'Off', value: 0x0000},
                {name: 'On',  value: 0x7FFF}
            ],
            name: "Sync"
        },
        [PARAPHONIC]: {
            // RE walk: positions updated for FW2. Removed duplicate entry.
            LSB: [18, 3],
            MSB: [18, 4],
            msb: [18, 0, 0x04],
            values: [
                {name: 'Off', value: 0x0000},
                {name: 'On',  value: 0x7FFF}
            ],
            name: "Paraphonic"
        },
        [OCTAVE]: {
            // RE prescan: positions updated for FW2; values already correct
            // (7 evenly-spaced at 0x1555 intervals).
            LSB: [7, 15],
            MSB: [7, 17],
            msb: [7, 8, 0x40],
            values: [
                {name: '-3', value: 0x0000},
                {name: '-2', value: 0x1555},
                {name: '-1', value: 0x2AAA},
                {name: '0',  value: 0x4000},
                {name: '+1', value: 0x5555},
                {name: '+2', value: 0x6AAA},
                {name: '+3', value: 0x7FFF}
            ],
            name: "Octave"
        },
        [HOLD]: {   //TODO
            MSB: [0, 0],
            LSB: [0, 0],
            msb: [0, 0, 0],
            values: [
                {name: 'Off', value: 0},
                {name: 'On', value: 0x7fff}
            ],
            name: 'Hold'
        }
    }
};
