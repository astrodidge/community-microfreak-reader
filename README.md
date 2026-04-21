
UPDATE: 2026-04-21: working now for all presets on Microfreak with v5!


FROM THE ORIGINAL REPO OF FRANCOIS:

---

# NOT MAINTAINED ANYMORE

**I'm sorry but this project is not maintained anymore. I don't have the resources (time, hardware) to update it. Feel free to fork it.**

---


# MicroFreak Reader

_(en français [plus bas](#Lecteur-de-preset-MicroFreak))_

This application allows you to **read and display the presets stored in the MicroFreak memory**.

You can only read _saved_ presets. The application can not read the current, unsaved, values of the controllers.

This application can only _read_ presets. You can not edit presets. You can not send values to the MicroFreak.

However, the application can send a PC (Program Change) message to the MicroFreak when you select a preset in the application.

Once the application has read a preset, it is kept in memory until you close your browser or refresh the page.

This application does not read nor display the stored sequences.

[![light theme](/screenshots/light-theme-320x196.png)](https://raw.githubusercontent.com/francoisgeorgy/microfreak-reader/master/screenshots/light-theme.png) [![dark theme](/screenshots/dark-theme-320x196.png)](https://raw.githubusercontent.com/francoisgeorgy/microfreak-reader/master/screenshots/dark-theme.png)

_light and dark themes_

## Accuracy of the displayed data 

:warning: To create this application I reverse-engineered some of the sysex messages exchanged between the MicroFreak and the
Arturia MIDI Control Center. This process is subject to errors and misinterpretations. Therefore **NO GUARANTEE, EXPRESS OR IMPLIED, IS GIVEN AS TO THE ACCURACY OF THE DISPLAYED DATA**. 

If you think the application display wrong values, send me the preset
and any useful info to reproduce the problem and I will fix the application if necessary. 
If possible, use the https://github.com/francoisgeorgy/microfreak-reader/issues page to send any feedback.

## Requirements

- An Arturia MicroFreak synthesizer.
- A browser supporting the WebMIDI API (Chrome, Opera).

## Usage

1. Connect the MicroFreak to your PC via its USB or MIDI ports.
2. If it's not already done, open the Application in your browser.
3. In the application, select the MIDI input and output ports corresponding to your MicroFreak.
4. In the application, enter the preset number you want to read.
5. Click the `READ` button.

The buttons `READ 1..512`, et al. allows you to read all the MicroFreak presets at once. It can take some time. Be patient.
Click the STOP button to abort the read process.  

### File save

You can save the application's currently loaded data in a file. This allow you to read the MicroFreak once and, later on, to
reload this file and view the presets without having to read the MicroFreak again.

The application already provides the pre-loaded data for the factory presets and other free presets packs offered
by Arturia.

The file saved by the application is **not** a sysex file nor a MicroFreak preset file. You can not use it with the 
MIDI Control Center.

## Limitations

### Sequences

This reader does not read the **sequences**.

### Unsupported factory presets

Some factory preset uses a format different from the user preset, especially with the MOD Matrix. The application is
usually able to detect these presets and will display a warning if it does not support all or part of the preset format.

#### Viewing unsupported factory presets

If one copy an unsupported factory preset in a user slot or if one overwrite an unsupported factory preset, then, magically, the preset
format is updated and the reader is then able to read it.

Here are these two workarounds:

**Copy to a user slot:**

On the MicroFreak:

1. press the _Save_ button
2. choose the destination preset with the _Preset_ dial
3. click on the _Preset_ Dial twice
4. press _Save_ button

**Save over itself:**

First disable the write protection:

1. press the _Utility_ button
2. select _Misc_,
3. select _Mem protect_
4. turn the Dial to select _OFF_
5. click the _Utility_ button

Then copy the factory preset over itself:

1. press and hold the _Save_ button for 2 seconds


## Problems, bug

If the Application does not display anything after having red a preset, that's probably because the MIDI communication is 
not working correctly between your browser and the MicroFreak. Restart your MicroFreak. If the problem persist, restart
the MicroFreak and reload the Application in your browser.

For any other problem or suggestion, feel free to open an issue at https://github.com/francoisgeorgy/microfreak-reader/issues

## Trademarks

Arturia, MicroFreak and all other products, logos or company names quoted in this document and in the application are
trademarks or registered trademarks of their respective owners.

If you like this application, you can [![Buy Me A Coffee](https://bmc-cdn.nyc3.digitaloceanspaces.com/BMC-button-images/custom_images/orange_img.png)](https://www.buymeacoffee.com/c6dVm4Q).

----
