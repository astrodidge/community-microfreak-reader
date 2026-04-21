import React, {Component} from "react";
import "./PresetSelector.css";
import {inject, observer} from "mobx-react";
import {readPreset, sendPC, wait, WAIT_BETWEEN_MESSAGES} from "../utils/midi";
import {savePreferences} from "../utils/preferences";
import {faPrint} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    OSC_TYPE, OSC_WAVE, OSC_TIMBRE, OSC_SHAPE,
    FILTER_CUTOFF, FILTER_RESONANCE, FILTER_TYPE,
    CYCLING_ENV_MODE, CYCLING_ENV_RISE, CYCLING_ENV_FALL, CYCLING_ENV_HOLD, CYCLING_ENV_AMOUNT,
    ENVELOPE_ATTACK, ENVELOPE_DECAY, ENVELOPE_SUSTAIN,
    LFO_SHAPE, LFO_SYNC, LFO_RATE_FREE,
    ARP, SEQ, ARP_SEQ_RATE_FREE, ARP_SEQ_SWING,
    PARAPHONIC, OCTAVE, GLIDE,
    CONTROL, SWITCH
} from "../model";
class PresetSelector extends Component {

    state = {
        direct_access: false,
        reading_all: false,
        abort_all: false,
        unread: true
    };

    constructor(props) {
        super(props);
        this.inputOpenFileRef = React.createRef();
    }

    toggleDirectAccess = () => {
        this.setState({direct_access: !this.state.direct_access})
    };

    change = (e) => {
        this.props.state.setPresetNumber(e.target.value);
        if (this.props.state.send_pc) {
            this.go();
        }
    };

    prev = () => {
        const n = this.props.state.preset_number - 1;
        // this.setPreset(n < 0 ? '511' : n.toString());
        this.props.state.setPresetNumber(n < 0 ? 511 : n);
        if (this.props.state.send_pc) {
            this.go();
        }
    };

    next = () => {
        const n = this.props.state.preset_number + 1;
        this.props.state.setPresetNumber(n > 511 ? 0 : n);
        if (this.props.state.send_pc) {
            this.go();
        }
    };

    go = () => {
        sendPC(this.props.state.preset_number);
    };

    selectDirect = (n) => {
        this.props.state.setPresetNumber(n);
        this.setState({direct_access: false});
        if (this.props.state.send_pc) {
            this.go();
        }
    };

    readSelected = async () => {
        if (!this.props.state.hasInputAndOutputEnabled()) {
            if (global.dev) console.log("readAllPresets: no output and/or input connected, ignore request");
            return;
        }
        this.props.state.error = 0;
        if (!await readPreset()) {
            if (global.dev) console.warn("read preset fail");
            this.props.state.error = 1;
        }
    };

    readAll = async (from=0, to=511, unread_only=false) => {

        if (!this.props.state.hasInputAndOutputEnabled()) {
            if (global.dev) console.log("readAllPresets: no output and/or input connected, ignore request");
            return;
        }

        this.props.state.error = 0;

        this.setState({reading_all: true});

        const S = this.props.state;

        for (let n = from; n <= to; n++) {
            if (this.state.abort_all) break;

            if (unread_only && (S.presets.length && (S.presets.length > n && S.presets[n]))) continue;

            if (! await readPreset(n)) {
                if (global.dev) console.warn("read preset fail");
                this.props.state.error = 1;
                break;
            }

            S.setPresetNumber(n);
            await wait(4 * WAIT_BETWEEN_MESSAGES);  // by updating the preset_number _after_ the reading, we avoid to display an empty preset while reading. This is much more pleasant.
        }

        this.setState({reading_all: false});
        this.setState({abort_all: false});
    };

    read1To512 = () => {
        this.readAll(0, 511, this.state.unread);
    };

    readNTo512 = () => {
        this.readAll((this.props.state.preset_number + 1) % 512, 511, this.state.unread);
    };

/*
    read128To256 = () => {
        this.readAll(127, 255, this.state.unread);
    };
*/

    abortAll = () => {
        this.setState({abort_all: true});
    };

    toggleSync = () => {
        this.props.state.send_pc = !this.props.state.send_pc;
        savePreferences({send_pc: this.props.state.send_pc});
    };

    toggleUnread = () => {
        this.setState({unread: !this.state.unread});
    };

    loadData = async e => {
        if (global.dev) console.log("load data", e.target.value);
        if (e.target.value) {
            let response = await fetch("data/" + e.target.value);
            const data = await response.json();
            if (data && Array.isArray(data)) {
                this.props.state.presets = new Array(512).fill(null);
                const maxLength = Math.min(data.length, 512);
                for (let i = 0; i < maxLength; i++) {
                    this.props.state.presets[i] = data[i];
                }
                this.props.state.checkAllPresets();
            }
        }
    };

 onFileSelection = async e => {
    if (global.dev) console.log("onFileSelection");
    
    const fileInput = e.target;
    
    try {
        const file = fileInput.files[0];
        if (!file) {
            console.warn("No file selected");
            return;
        }
        
        console.log("Reading file:", file.name, "Size:", Math.round(file.size/1024), "KB");
        
        // Read file directly without using readFile function (bypass 1MB limit)
        const text = await file.text();
        const data = JSON.parse(text);
        
        console.log("File parsed successfully");
        console.log("Data type:", typeof data);
        console.log("Is array:", Array.isArray(data));
        console.log("Data length:", data ? data.length : 'null');
        
        if (data && Array.isArray(data)) {
            console.log("Loading preset file with", data.length, "slots");
            
            // Reset the presets array 
            this.props.state.presets = new Array(512).fill(null);
            
            // Copy the loaded data
            const maxLength = Math.min(data.length, 512);
            for (let i = 0; i < maxLength; i++) {
                this.props.state.presets[i] = data[i];
            }
            
            // Check all loaded presets
            this.props.state.checkAllPresets();
            
            const presetCount = data.filter(item => item !== null).length;
            console.log("File loaded successfully - found", presetCount, "presets");
            
        } else {
            console.error("File format not recognized - expected an array, got:", typeof data);
            alert("Error: Invalid file format. Expected a MicroFreak Reader JSON file with preset array.");
        }
    } catch (error) {
        console.error("Error loading file:", error);
        alert("Error loading file: " + error.message);
    }
    
    // Safely clear the file input
    try {
        if (fileInput && typeof fileInput.value !== 'undefined') {
            fileInput.value = '';
        }
    } catch (clearError) {
        console.warn("Could not clear file input:", clearError);
    }
};

    importFromFile = () => {
        if (global.dev) console.log("importFromFile");
        this.inputOpenFileRef.current.click()
    };

    exportAsFile = () => {

        let url = window.URL.createObjectURL(new Blob([JSON.stringify(this.props.state.presets)], {type: "application/json"}));

        let now = new Date();
        let timestamp =
            now.getUTCFullYear() + "-" +
            ("0" + (now.getUTCMonth() + 1)).slice(-2) + "-" +
            ("0" + now.getUTCDate()).slice(-2) + "-" +
            ("0" + now.getUTCHours()).slice(-2) + "" +
            ("0" + now.getUTCMinutes()).slice(-2) + "" +
            ("0" + now.getUTCSeconds()).slice(-2);
        let filename = 'microfreak-reader.' + timestamp;

        let shadowlink = document.createElement("a");
        shadowlink.download = filename + ".json";
        shadowlink.style.display = "none";
        shadowlink.href = url;

        document.body.appendChild(shadowlink);
        shadowlink.click();
        document.body.removeChild(shadowlink);

        setTimeout(function() {
            return window.URL.revokeObjectURL(url);
        }, 1000);
    };
    
 exportAsCsv = () => {
        
        // Define all the parameters we want to export in human-readable format
        const parameters = [
            // Basic Info
            { key: 'Slot', getValue: (S, i) => i + 1 },
            { key: 'Name', getValue: (S, i) => S.presetName(i) || '' },
            { key: 'Category', getValue: (S, i) => S.presetCat(i) || '' },
            
            // Oscillator Section
            { key: 'Osc Type', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][OSC_TYPE];
                const v = S.controlValue(control, true, i);
                return control.mapping ? control.mapping(v, fw) : v;
            }},
            { key: 'Osc Wave', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][OSC_WAVE];
                return S.controlValue(control, false, i);
            }},
            { key: 'Osc Timbre', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][OSC_TIMBRE];
                return S.controlValue(control, false, i);
            }},
            { key: 'Osc Shape', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][OSC_SHAPE];
                return S.controlValue(control, false, i);
            }},
            
            // Filter Section
            { key: 'Filter Type', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][FILTER_TYPE];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'Filter Cutoff', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][FILTER_CUTOFF];
                return S.controlValue(control, false, i);
            }},
            { key: 'Filter Resonance', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][FILTER_RESONANCE];
                return S.controlValue(control, false, i);
            }},
            
            // Cycling Envelope
            { key: 'Cycling Env Mode', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][CYCLING_ENV_MODE];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'Cycling Env Rise', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][CYCLING_ENV_RISE];
                return S.controlValue(control, false, i);
            }},
            { key: 'Cycling Env Fall', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][CYCLING_ENV_FALL];
                return S.controlValue(control, false, i);
            }},
            { key: 'Cycling Env Hold', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][CYCLING_ENV_HOLD];
                return S.controlValue(control, false, i);
            }},
            { key: 'Cycling Env Amount', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][CYCLING_ENV_AMOUNT];
                return S.controlValue(control, false, i);
            }},
            
            // Envelope
            { key: 'Env Attack', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][ENVELOPE_ATTACK];
                return S.controlValue(control, false, i);
            }},
            { key: 'Env Decay', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][ENVELOPE_DECAY];
                return S.controlValue(control, false, i);
            }},
            { key: 'Env Sustain', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][ENVELOPE_SUSTAIN];
                return S.controlValue(control, false, i);
            }},
            
            // LFO
            { key: 'LFO Shape', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][LFO_SHAPE];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'LFO Sync', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][LFO_SYNC];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'LFO Rate', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][LFO_RATE_FREE];
                return S.controlValue(control, false, i);
            }},
            
            // ARP/SEQ
            { key: 'Arp', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][ARP];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'Seq', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][SEQ];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'Arp/Seq Rate', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][ARP_SEQ_RATE_FREE];
                return S.controlValue(control, false, i);
            }},
            { key: 'Arp/Seq Swing', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][ARP_SEQ_SWING];
                return S.controlValue(control, false, i);
            }},
            
            // Keyboard
            { key: 'Paraphonic', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][PARAPHONIC];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'Octave', getValue: (S, i) => {
                const fw = S.fwVersion();
                const switchDef = SWITCH[fw][OCTAVE];
                return switchDef ? S.switchValue(switchDef, false, i) : '';
            }},
            { key: 'Glide', getValue: (S, i) => {
                const fw = S.fwVersion();
                const control = CONTROL[fw][GLIDE];
                return S.controlValue(control, false, i);
            }}
        ];

        const S = this.props.state;
        
        // Create CSV content
        let csvContent = '';
        
        // Add headers
        csvContent += parameters.map(p => `"${p.key}"`).join(',') + '\n';
        
        // Add data for each preset - FIXED: Only export slots that actually contain presets
        for (let i = 0; i < 512; i++) {
            // FIXED: Check if preset exists AND is not null AND has actual content
            if (S.presets.length && S.presets.length > i && S.presets[i] && S.presets[i] !== null) {
                
                const preset = S.presets[i];
                
                // Skip completely empty preset objects (no name, no data, etc.)
                if (!preset.name && !preset.data && !preset.cat) {
                    continue;
                }
                
                // Skip "Init" presets entirely - these are empty slots, not real presets
                const presetName = preset.name;
                if (presetName === "Init") {
                    continue;
                }
                
                const isInitPreset = false; // Since we skip Init presets above
                
                const row = parameters.map(param => {
                    try {
                        // For Init presets, only show the slot number, everything else blank
                        if (isInitPreset && param.key !== 'Slot') {
                            return '""';
                        }
                        
                        const value = param.getValue(S, i);
                        // Handle null, undefined, and escape quotes
                        if (value === null || value === undefined) return '""';
                        return `"${String(value).replace(/"/g, '""')}"`;
                    } catch (error) {
                        // If we can't get a value, return empty
                        return '""';
                    }
                }).join(',');
                csvContent += row + '\n';
            }
        }
        
        // Create and download the file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        
        const now = new Date();
        const timestamp = 
            now.getUTCFullYear() + "-" +
            ("0" + (now.getUTCMonth() + 1)).slice(-2) + "-" +
            ("0" + now.getUTCDate()).slice(-2) + "-" +
            ("0" + now.getUTCHours()).slice(-2) + "" +
            ("0" + now.getUTCMinutes()).slice(-2) + "" +
            ("0" + now.getUTCSeconds()).slice(-2);
        
        const filename = 'microfreak-presets-' + timestamp + '.csv';
        
        const shadowlink = document.createElement("a");
        shadowlink.download = filename;
        shadowlink.style.display = "none";
        shadowlink.href = url;
        
        document.body.appendChild(shadowlink);
        shadowlink.click();
        document.body.removeChild(shadowlink);
        
        setTimeout(function() {
            return window.URL.revokeObjectURL(url);
        }, 1000);
    };
    
    render() {

        const S = this.props.state;

        const midi_ok = S.hasInputEnabled() && S.hasOutputEnabled();

        const pc = [];
        const plength = S.presets.length;
        for (let i=0; i<512; i++) {
            let classname = i === S.preset_number ? 'sel' : '';
            if (plength && (plength > i && S.presets[i])) {
                classname += ' loaded';
            }
            pc.push(<div key={i} className={classname} onClick={() => this.selectDirect(i)}>{i+1}</div>);
        }

        let preset_to = S.preset_number + 2;
        if (preset_to > 512) preset_to = 1;

        return (
            <div className={`preset-selector ${midi_ok?'midi-ok':'midi-ko'}`}>
                <div>
                		 <select className="preloader" onChange={this.loadData}>
    						<option value="">Packs...</option>
    						<option value="Factory_1-1.json">Factory 1.1</option>
    						<option value="Factory_2-0.json">Factory 2.0</option>
    						<option value="Factory_3.json">Factory 3</option>
    						<option value="Factory_4.json">Factory 4</option>
    						<option value="Factory_5.json">Factory 5</option>
    						<option value="Abstract_Freak.json">Abstract Freak</option>
    						<option value="Ambient_Peaks.json">Ambient Peaks</option>
    						<option value="Arp_Monster.json">Arp Monster</option>
    						<option value="Back_To_The_'80s.json">Back To The '80s</option>
    						<option value="Blush_Response.json">Blush Response</option>
    						<option value="Clockwork_Nocturnal.json">Clockwork Nocturnal</option>
    						<option value="Clouds_and_Beyond.json">Clouds and Beyond</option>
    						<option value="Conforce_Signature.json">Conforce Signature</option>
    						<option value="Future_Rave.json">Future Rave</option>
    						<option value="Hypnoscillator.json">Hypnoscillator</option>
    						<option value="Immersive_Melodies.json">Immersive Melodies</option>
    						<option value="Naughty_Bass.json">Naughty Bass</option>
    						<option value="Nhar_Signature.json">Nhar Signature</option>
    						<option value="Nostalgia_and_Reminiscence.json">Nostalgia and Reminiscence</option>
    						<option value="Ocular_Semblance.json">Ocular Semblance</option>
    						<option value="Oddiction.json">Oddiction</option>
    						<option value="Plaisir_Pads.json">Plaisir Pads</option>
    						<option value="Solid_Perc.json">Solid Perc</option>
    						<option value="Tech_Loop.json">Tech Loop</option>
    						<option value="Tokyo_88.json">Tokyo 88</option>
    						<option value="Trancentral.json">Trancentral</option>
    						<option value="Vast_Lands.json">Vast Lands</option>
    						<option value="Voltage_Forms.json">Voltage Forms</option>
    					</select>
                    <input ref={this.inputOpenFileRef} type="file" style={{display:"none"}}  onChange={this.onFileSelection} />
                    <button type="button midi-ok" onClick={this.importFromFile}>Load file</button>
                    <button type="button midi-ok" onClick={this.exportAsFile}>Save to file</button>
					<button type="button midi-ok" onClick={this.exportAsCsv}>Export CSV</button>
                    <a href={"?list=1"} target="_blank" rel="noopener noreferrer">
    				<button type="button midi-ok">List View</button>
					</a>
                </div>
                <div className="seq-access">
                    <input type="text" id="preset" name="preset" min="1" max="512" value={S.preset_number_string} onChange={this.change} />
                    <button onClick={this.prev} title="Previous">&lt;</button>
                    <button onClick={this.next} title="Next">&gt;</button>
                    <button onClick={this.toggleDirectAccess} title="Choose the preset number then send a PC message to the MF.">#...</button>
                    {!this.props.state.send_pc && <button className="button-midi" onClick={this.go} title="Send a PC message to the MicroFreak to select this preset on the MicroFreak itself.">send PC</button>}
                    <label title="Automatically sends a PC message to the MF on preset change." className="no-bold"><input type="checkbox" checked={this.props.state.send_pc} onChange={this.toggleSync}/>auto. send PC</label>
                    {/*<button type="button" onClick={this.getURL}>Get URL</button>*/}
                </div>
                <div className="actions">
                    <button className={midi_ok ? "button-midi read-button ok" : "button-midi read-button"} type="button" onClick={this.readSelected}>READ preset #{S.preset_number_string}</button>
                    {!this.state.reading_all && <button className="button-midi" onClick={this.read1To512} title="Read all">Read all</button>}
                    {/*{!this.state.reading_all && <button className="button-midi" onClick={this.readNTo512} title="Read all">Read {preset_to}..512</button>}*/}
                    {this.state.reading_all && <button className="button-midi abort" onClick={this.abortAll} title="Stop reading all">{this.state.abort_all ? "Stopping..." : "STOP"}</button>}
                    <label title="Only read unread presets" className="no-bold"><input type="checkbox" checked={this.state.unread} onChange={this.toggleUnread}/>only unread</label>
                </div>
                {this.state.direct_access && <div className="direct-access">{pc}</div>}
            </div>
        );
    }

}

export default inject('state')(observer(PresetSelector));