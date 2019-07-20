const remote = require('electron').remote;
const settings = require('./settings');

// Navigation

let tabs = [...document.querySelectorAll('.tab')];
let pages = [...document.querySelectorAll('.page')];

tabs.forEach(tab => {
  tab.addEventListener('click', (event) => {
    tabs.forEach(e => e.classList.remove('active'));
    tab.classList.add('active')
    pages.forEach(page => page.classList.remove('active'));
    const id = tab.getAttribute('href').slice(1);
    pages.find(page => page.id === id).classList.add('active');
  })
})

// Status

const statusElement = document.getElementById('generation-status');
const currentFileElement = document.getElementById('current-file');
const consoleOutputElement = document.getElementById('console-output');

consoleOutputElement.addEventListener('click', function () {
  consoleOutputElement.classList.toggle('hidden');
})

const log = (...data) => {
  consoleOutputElement.append(...data, '\n');
  console.log(data);
}

const setCurrentFile = (filename) => {
  currentFileElement.innerText = filename;
}

const setStatus = (status) => {
  statusElement.innerText = status;
}

// Options

/** @type HTMLInputElement */
const pitchShift = document.getElementById('pitch-shift');
pitchShift.checked = settings.get('pitchShift');

pitchShift.addEventListener('change', (event) => {
  settings.set('pitchShift', pitchShift.checked);
})

// Help

document.querySelectorAll('a.external').forEach(e => {
  e.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    remote.shell.openExternal(e.getAttribute('href'));
  })
})

const appNameElement = document.getElementById('app-name');
const appVersionElement = document.getElementById('app-version');
appNameElement.innerText = remote.app.getName();
appVersionElement.innerText = remote.app.getVersion();

module.exports = {
  log,
  setCurrentFile,
  setStatus,
}
