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

        // FILTER_AMT: bipolar -100..+100 from the ENV→CUTOFF mod matrix cell
        // (per MF manual, the knob is a shortcut for that mod amount).
        // Decoder returns signed 16-bit raw (-32768..+32767) already.
        let bipolarMapped = null;
        if (cc === FILTER_AMT) {
            const rawSigned = S.controlValue(control, true);
            const displayPct = rawSigned * 100 / 32768;
            bipolarMapped = Math.round(displayPct) + "%";
            v = Math.max(0, Math.min(100, 50 + displayPct / 2));
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
