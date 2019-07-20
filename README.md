# osu-practice-tool

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
3. Start osu-practice-tool.
4. Change the current map in osu!.

See the wiki for usage details.

## Development Requirements

Note: This tool has only been tested on the version numbers listed. It may or may not work on other versions.

- npm (6.9.2)

## Development Setup

1. Follow regular setup steps.
2. Run `npm install` to install dependencies.

## Development Usage

- Run `npm start` to start the application.
- Run `npm build` to build the package for your platform.
