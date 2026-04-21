import React, {Component} from 'react';
import './App.css';
import './List.css';
import {Provider} from "mobx-react";
import {state} from "./state/State";
import {
    DEFAULT_THEME,
    loadPreferences,
    savePreferences
} from "./utils/preferences";
import ListView from "./components/ListView";
import {readFile} from "./utils/files";

const PACKS = {
    "Factory_1-1.json": 'Factory 1.1',
    "Factory_2-0.json": 'Factory 2.0',
    "Factory_3.json": 'Factory 3',
    "Factory_4.json": 'Factory 4',
    "Factory_5.json": 'Factory 5',
    "Abstract_Freak.json": 'Abstract Freak',
    "Ambient_Peaks.json": 'Ambient Peaks',
    "Arp_Monster.json": 'Arp Monster',
    "Back_To_The_'80s.json": "Back To The '80s",
    "Blush_Response.json": 'Blush Response',
    "Clockwork_Nocturnal.json": 'Clockwork Nocturnal',
    "Clouds_and_Beyond.json": 'Clouds and Beyond',
    "Conforce_Signature.json": 'Conforce Signature',
    "Future_Rave.json": 'Future Rave',
    "Hypnoscillator.json": 'Hypnoscillator',
    "Immersive_Melodies.json": 'Immersive Melodies',
    "Naughty_Bass.json": 'Naughty Bass',
    "Nhar_Signature.json": 'Nhar Signature',
    "Nostalgia_and_Reminiscence.json": 'Nostalgia and Reminiscence',
    "Ocular_Semblance.json": 'Ocular Semblance',
    "Oddiction.json": 'Oddiction',
    "Plaisir_Pads.json": 'Plaisir Pads',
    "Solid_Perc.json": 'Solid Perc',
    "Tech_Loop.json": 'Tech Loop',
    "Tokyo_88.json": 'Tokyo 88',
    "Trancentral.json": 'Trancentral',
    "Vast_Lands.json": 'Vast Lands',
    "Voltage_Forms.json": 'Voltage Forms'
};

class List extends Component {

    state = {
        theme: DEFAULT_THEME,
        pack: null,
        filename: null
    };

    constructor(props) {
        super(props);
        this.inputOpenFileRef = React.createRef();
    }

    selectTheme = (e) => {
        this.setState({theme: e.target.value});
        savePreferences({theme: e.target.value});
    };

    selectPresetPos = (e) => {
        this.setState({presets_pos: e.target.value});
        savePreferences({presets_pos: e.target.value});
    };

    loadData = async e => {
        const n = e.target.value;
        if (global.dev) console.log("load data", n);
        if (n) {
            let response = await fetch("data/" + n);
            const data = await response.json();
            if (data && Array.isArray(data)) {
                state.presets = new Array(512).fill(null);
                const maxLength = Math.min(data.length, 512);
                for (let i = 0; i < maxLength; i++) {
                    state.presets[i] = data[i];
                }
                state.checkAllPresets();
                this.setState({pack: n, filename: PACKS[n]});
            }
        }
    };

onFileSelection = async e => {
        if (global.dev) console.log("onFileSelection");

        // Check if a file was actually selected (user didn't cancel)
        if (!e.target.files || e.target.files.length === 0) {
            if (global.dev) console.log("No file selected (user cancelled)");
            return;
        }

        const f = e.target.files[0];
        const data = await readFile(f);

        if (data && Array.isArray(data)) {
            state.presets = new Array(512).fill(null);
            const maxLength = Math.min(data.length, 512);
            for (let i = 0; i < maxLength; i++) {
                state.presets[i] = data[i];
            }
            state.checkAllPresets();
            this.setState({pack: "", filename: f.name});
        } else {
            console.error("Failed to load file:", f && f.name ? f.name : "unknown");
        }

        // Reset the file input so the same file can be selected again if needed
        if (e.target && e.target.value !== undefined) {
            e.target.value = '';
        }
    };

    importFromFile = () => {
        if (global.dev) console.log("importFromFile");
        this.inputOpenFileRef.current.click()
    };


    componentDidMount(){
        const s = loadPreferences();
        this.setState({
            theme: s.theme || DEFAULT_THEME
        });
    }

    render() {

        const { theme } = this.state;
        document.documentElement.setAttribute('data-theme', theme);

        return (
            <Provider state={state}>
                <div className="lw">
                    <div className="header">
                        <div className="title">
                            MicroFreak presets
                            {this.state.filename && <span>: {this.state.filename}</span>}
                            {/*<div className="lw-pack">{this.state.pack}</div>*/}
                        </div>
                 	<select className="preloader" onChange={this.loadData} value={this.state.pack}>
    					<option value="">Select an official pack...</option>
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
                        <button className="bt-file" type="button" onClick={this.importFromFile}>Or load a file...</button>
                        <div className="header-options">
                            <select value={this.state.theme} onChange={this.selectTheme}>
                                <option value="light">Light theme</option>
                                <option value="dark">Dark theme</option>
                                <option value="darker">Darkest theme</option>
                            </select>
                        </div>
                    </div>
                    <div className="App">
                        <ListView />
                    </div>
                </div>
            </Provider>
        );
    }

}

export default List;
