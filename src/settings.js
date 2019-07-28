
const fs = require('fs');
const remote = require('electron').remote;
const path = require('path');

const userData = remote.app.getPath('userData');
const settingsFile = path.join(userData, 'settings.json');

let settings = {
  pitchShift: false,
}

if (fs.existsSync(settingsFile)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile));
  } catch (e) {
    console.error('Settings could not be loaded');
  }
}

function setOption(name, value) {
  settings[name] = value;
  fs.writeFile(settingsFile, JSON.stringify(settings), (err) => {
    if (err) console.error('Settings could not be saved');
  })
}

function getOption(name) {
  return settings[name];
}

module.exports = {
  set: setOption,
  get: getOption,
}
