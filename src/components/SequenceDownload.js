import React, {Component} from 'react';
import {inject, observer} from "mobx-react";
import {decodeSequence} from "../model";
import {buildSequenceMidi, downloadMidiFile} from "../utils/midiFile";

class SequenceDownload extends Component {

    onClick = () => {
        const S = this.props.state;
        const preset = S.presets[S.preset_number];
        if (!preset) return;
        const steps = decodeSequence(preset.data);
        if (!steps || !steps.length) return;
        const bytes = buildSequenceMidi(steps, {
            trackName: `MF #${S.preset_number + 1} ${preset.name || ""}`.trim(),
        });
        const safeName = (preset.name || `preset_${S.preset_number + 1}`)
            .replace(/[^a-zA-Z0-9_-]+/g, "_");
        downloadMidiFile(bytes, `microfreak_${S.preset_number + 1}_${safeName}_seqA.mid`);
    };

    render() {
        const S = this.props.state;
        const preset = S.presets[S.preset_number];
        if (!preset || !preset.data || !preset.data.length) return null;
        const steps = decodeSequence(preset.data);
        if (!steps || !steps.length) return null;
        return (
            <button className="button-midi" onClick={this.onClick}
                    title={`Download seq A (${steps.length} steps) as a .mid file`}>
                ⬇ MIDI ({steps.length} steps)
            </button>
        );
    }

}

export default inject('state')(observer(SequenceDownload));
