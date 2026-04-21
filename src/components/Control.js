import React, {Component} from 'react';
import {inject, observer} from "mobx-react";
import {CONTROL, OSC_TYPE, OSC_WAVE, OSC_TIMBRE, OSC_SHAPE, FILTER_AMT, SWITCH, oscParamInfo, oscParamDisplay} from "../model";
import "./Control.css";
import Knob from "./Knob";
import ControlMods from "./ControlMods";
import ControlModsAssign from "./ControlModsAssign";

const OSC_PARAM_KEY = {
    [OSC_WAVE]: 'wave',
    [OSC_TIMBRE]: 'timbre',
    [OSC_SHAPE]: 'shape'
};

class Control extends Component {

    render() {

        const {cc, state: S, raw=false, sw=null, inverseSw=false} = this.props;

        const fw = S.fwVersion();

        const control = CONTROL[fw][cc];

        // Defensive: if this cc isn't defined for the current fw (e.g. RE
        // additions only in FW2), render an empty placeholder rather than
        // crashing on control.name / S.controlValue below.
        if (!control) {
            return <div className="control control-off"><div className="ctrl-name">—</div></div>;
        }

        let v = S.controlValue(control, raw);

        // For OSC wave/timbre/shape, use the per-osc-type name + range.
        const oscParamKey = OSC_PARAM_KEY[cc];
        let oscInfo = null;
        let oscDisplay = null;
        if (oscParamKey) {
            const typeName = S.currentOscTypeName();
            oscInfo = oscParamInfo(oscParamKey, typeName);
            const rawVal = S.controlValue(control, true);
            oscDisplay = oscParamDisplay(rawVal, oscParamKey, typeName);
        }

        // FILTER_AMT: bipolar -100..+100 with sign+magnitude encoding where
        // the negative side is INVERTED (byte 0 = -100, byte 127 = just-below-0).
        //   sign bit:  data[32][8] & 0x02
        //   magnitude: data[32][10]  (0..0x7F)
        //   positive: display = byte * 100/127
        //   negative: display = -(100 - byte * 100/127)
        let bipolarMapped = null;
        if (cc === FILTER_AMT) {
            const preset = S.presets && S.presets[S.preset_number];
            const data = preset && preset.data;
            if (data && data.length > 32 && data[32] && data[32].length > 10) {
                const signByte = data[32][8];
                const magByte  = data[32][10];
                const isNeg    = (signByte & 0x02) !== 0;
                const mag      = (magByte / 127) * 100;
                const displayPct = isNeg ? -(100 - mag) : mag;
                bipolarMapped = Math.round(displayPct) + "%";
                // Knob visual: map -100..+100 to 0..100 (center at 50).
                v = Math.max(0, Math.min(100, 50 + displayPct / 2));
            }
        }

        let mapped;
        if (cc === OSC_TYPE) {
            mapped = control.mapping ? control.mapping(v, S.fwVersion()) : '';
        } else if (oscDisplay !== null) {
            mapped = oscDisplay;
        } else if (bipolarMapped !== null) {
            mapped = bipolarMapped;
        } else {
            mapped = control.mapping ? control.mapping(v) : v.toFixed(1);
        }

        const displayName = (oscInfo && oscInfo.name) || control.name;

        let enabled = true;
        if (sw) {
            enabled = S.switchValue(SWITCH[fw][sw], true) > 0;
            if (inverseSw) enabled = !enabled;
            // console.log("control", S.switchValue(SWITCH[fw][sw], raw), inverseSw, enabled);
        }

        return (
            <div className={`control${cc === OSC_TYPE ? ' osc' : ''} ${enabled?'':'control-off'}`}>
                <div className="ctrl-name">{displayName}</div>
                {cc !== OSC_TYPE && <Knob value={v} decimals={1} />}
                {cc === OSC_TYPE && <div className="osc-name">{mapped}</div>}
                {cc !== OSC_TYPE && <div className="ctrl-value">{mapped}</div>}
                <ControlMods cc={cc} />
                {this.props.group && <ControlModsAssign cc={cc} group={this.props.group}/>}
            </div>
        );
    }
}

export default inject('state')(observer(Control));
