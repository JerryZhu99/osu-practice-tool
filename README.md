# osu-ar-tool

A tool to quickly generate practice difficulties for osu!.

## Requirements

- StreamCompanion (tested on v 190618.17)

This tool uses data from StreamCompanion to locate .osu files and place generated files.

## Setup

1. Install any missing requirements.
2. Add the following pattern to "Output patterns" in StreamCompanion's settings and hit "Save":
    - File/Command name: `file`
    - Save Event: `All`
    - Formatting: `!OsuFileLocation!`
    - Also check the `Enable TCP output of patterns` box at the bottom.

## Usage

To start the application:

1. Start osu!.
2. Start StreamCompanion.
3. Start osu-ar-tool.
4. Change the current map in osu!.

### Actions

While in game, you can do the following actions. These will generate an .osz file and place it in your Songs directory. Press `F5` after each to refresh.

To generate a map with a modified ApproachRate (AR) for the currently selected map:

* For AR 0 to AR 9, press `Alt-<X>` where `<X>` is the number corresponding to the target AR.
    * e.g. `Alt-5` generates an AR 5 version of the current map.
* Press `Alt-T` for AR 10.
* Commands will do nothing if the map AR is already the target AR.

To generate a map with a modified playback rate for the currently selected map:

* Press `Alt-Shift-1` to `Alt-Shift-4` for rates 1.1x to 1.4x
* Press `Alt-Shift-5` to `Alt-Shift-9` for rates 0.5x to 0.9x
* Press `Alt-Shift-H` for the rate 1.33x
    * This negates the effect of the HalfTime mod.
* Press `Alt-Shift-D` for the rate 0.66x
    * This negates the effect of the DoubleTime mod.
* Note: This may take some time, especially for longer maps.
* Note: This will generate an `audio.mp3` file in the project directory. This can be deleted afterwards.

See the wiki for more options.

## Development Requirements

Note: This tool has only been tested on the version numbers listed. It may or may not work on other versions.

- npm (6.9.2)

## Development Setup

1. Follow regular setup steps.
2. Run `npm install` to install dependencies.

## Development Usage

- Run `npm start` to start the application.
- Run `npm build` to build the package for your platform.
