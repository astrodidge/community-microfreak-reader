import React, {Component} from 'react';
import "./WarningBanner.css";

// Bump this string with every reverse-engineering patch so we can eyeball
// in the running app whether the latest code is actually loaded.
// Format: RE-N (parameter1, parameter2, ...)
export const RE_PATCH_VERSION = "RE-42 (FilterAmt via ENV→Cutoff mod cell: correct for FW1+FW2)";

export class WarningBanner extends Component {

    render() {
        return (
            <div className="warning-top">
                <strong style={{background: '#ff0', color: '#000', padding: '0 6px', marginRight: 8}}>
                    [{RE_PATCH_VERSION}]
                </strong>
            </div>
        );
    }

}
