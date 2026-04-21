import React, {Component} from 'react';
import "./WarningBanner.css";

// Bump this string with every reverse-engineering patch so we can eyeball
// in the running app whether the latest code is actually loaded.
// Format: RE-N (parameter1, parameter2, ...)
export const RE_PATCH_VERSION = "RE-32 (mod matrix: unpacked decoder for all fw, no hiding)";

export class WarningBanner extends Component {

    render() {
        return (
            <div className="warning-top">
                <strong style={{background: '#ff0', color: '#000', padding: '0 6px', marginRight: 8}}>
                    [{RE_PATCH_VERSION}]
                </strong>
                Updated community version: Now supports 512 presets loading & saving. Parameters from firmware v1 work, with v2 partially supported. Please contact if you'd like to help add support for firmware versions 3-5.
            </div>
        );
    }

}
