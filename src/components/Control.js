import React, {Component} from 'react';
import {inject, observer} from "mobx-react";
import {CONTROL, OSC_TYPE, OSC_WAVE, OSC_TIMBRE, OSC_SHAPE, FILTER_AMT, SWITCH, oscParamInfo, oscParamDisplay, OSC_TYPE_DISPLAY_ORDER, oscTypeName} from "../model";
import {SAMPLE_NAMES, oscTypeUsesSample} from "../model/samples";
import "./Control.css";
import Knob from "./Knob";
import ControlMods from "./ControlMods";
import ControlModsAssign from "./ControlModsAssign";

const OSC_PARAM_KEY = {
    [OSC_WAVE]: 'wave',
    [OSC_TIMBRE]: 'timbre',
    [OSC_SHAPE]: 'shape'
};

const oscLabel = (name) => (name || '').replace(/\n/g, ' ');

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
            // currentOscTypeName() returns the user override if set, otherwise
            // the decoded value — matches what the dropdown shows.
            mapped = S.currentOscTypeName() || (control.mapping ? control.mapping(v, S.fwVersion()) : '');
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

        let oscDropdown = null;
        if (cc === OSC_TYPE && S.taggingEnabled) {
            const override = S.currentOscTypeOverride();
            const data = S.presets[S.preset_number] && S.presets[S.preset_number].data;
            const decoded = data ? oscTypeName(data, fw) : null;
            const selectValue = override || "";
            const autoLabel = decoded ? `(auto: ${oscLabel(decoded)})` : "(auto)";
            const onChange = (e) => {
                const val = e.target.value;
                if (val === "") S.clearCurrentOscTypeOverride();
                else S.setCurrentOscTypeOverride(val);
            };
            oscDropdown = (
                <select
                    className={`osc-type-select${override ? ' osc-type-override' : ''}`}
                    value={selectValue}
                    onChange={onChange}
                >
                    <option value="">{autoLabel}</option>
                    {OSC_TYPE_DISPLAY_ORDER.map(name => (
                        <option key={name} value={name}>{oscLabel(name)}</option>
                    ))}
                </select>
            );
        }

        let oscMappedBlock = null;
        let sampleMappedBlock = null;
        let sampleDropdown = null;
        if (cc === OSC_TYPE) {
            const data = S.presets[S.preset_number] && S.presets[S.preset_number].data;
            const autoDecoded = data ? (oscTypeName(data, fw) || 'n.a.') : '—';
            oscMappedBlock = (
                <div className="osc-name">
                    <div className="osc-sub-label">mapped</div>
                    <div className="osc-mapped-value">{oscLabel(autoDecoded)}</div>
                </div>
            );

            // Effective type (override or auto) decides whether the sample
            // sub-type section is relevant at all.
            const effectiveType = S.currentOscTypeName() || autoDecoded;
            const sampleRelevant = data && oscTypeUsesSample(effectiveType);

            if (sampleRelevant) {
                // "mapped" — always shown from the auto-decoder, even with
                // tagging off. Formula is verified (16/16 tagged match).
                const decoded = S.currentSampleDecoded();
                const decodedLabel = decoded ? `${decoded.idx}. ${decoded.name || ''}` : '—';
                sampleMappedBlock = (
                    <div className="osc-name">
                        <div className="osc-sub-label">sample</div>
                        <div className="osc-mapped-value">{decodedLabel}</div>
                    </div>
                );
            }

            if (sampleRelevant && S.taggingEnabled) {
                const current = S.currentSampleOverride();
                const currentIdx = current ? current.sampleIdx : null;
                const onSampleChange = (e) => {
                    const val = e.target.value;
                    if (val === "") {
                        S.clearCurrentSampleOverride();
                    } else {
                        const idx = parseInt(val, 10);
                        S.setCurrentSampleOverride(SAMPLE_NAMES[idx - 1], idx);
                    }
                };
                sampleDropdown = (
                    <select
                        className={`osc-type-select${currentIdx ? ' osc-type-override' : ''}`}
                        value={currentIdx || ""}
                        onChange={onSampleChange}
                    >
                        <option value="">(not tagged)</option>
                        {SAMPLE_NAMES.map((name, i) => (
                            <option key={i + 1} value={i + 1}>{`${i + 1}. ${name}`}</option>
                        ))}
                    </select>
                );
            }
        }

        return (
            <div className={`control${cc === OSC_TYPE ? ' osc' : ''} ${enabled?'':'control-off'}`}>
                <div className="ctrl-name">{displayName}</div>
                {cc !== OSC_TYPE && <Knob value={v} decimals={1} />}
                {cc === OSC_TYPE && oscMappedBlock}
                {cc === OSC_TYPE && S.taggingEnabled && <div className="osc-sub-label">tagged</div>}
                {cc === OSC_TYPE && oscDropdown}
                {cc === OSC_TYPE && sampleMappedBlock}
                {cc === OSC_TYPE && sampleDropdown && <div className="osc-sub-label">tagged sample</div>}
                {cc === OSC_TYPE && sampleDropdown}
                {cc !== OSC_TYPE && <div className="ctrl-value">{mapped}</div>}
                <ControlMods cc={cc} />
                {this.props.group && <ControlModsAssign cc={cc} group={this.props.group}/>}
            </div>
        );
    }
}

export default inject('state')(observer(Control));
