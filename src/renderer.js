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
const statusCountElement = document.getElementById('status-count');
const currentFileElement = document.getElementById('current-file');
const consoleOutputElement = document.getElementById('console-output');

consoleOutputElement.addEventListener('click', function () {
  consoleOutputElement.classList.toggle('hidden');
})

const log = (...data) => {
  consoleOutputElement.append(...data, '\n');
  console.log(...data);
}

const setCurrentFile = (filename) => {
  currentFileElement.innerText = filename || "No file selected.";
}

let count = 0;

const setStatus = (status, start = 0) => {
  count += start;
  statusCountElement.innerText = count > 0 ? `(${count})` : '';
  if (count === 0 || (count === 1 && start !== -1)) {
    // if only one active task and another task did not just end
    statusElement.innerText = status;
  } else {
    statusElement.innerText = `${status} (${count})`;
  }
}

// Options

/** @type {HTMLInputElement} */
const pitchShift = document.getElementById('pitch-shift');
/** @type {HTMLInputElement} */
const customCS = document.getElementById('custom-cs');
/** @type {HTMLInputElement} */
const customAR = document.getElementById('custom-ar');
/** @type {HTMLInputElement} */
const customOD = document.getElementById('custom-od');
/** @type {HTMLInputElement} */
const customHP = document.getElementById('custom-hp');
/** @type {HTMLInputElement} */
const customRate = document.getElementById('custom-rate');

pitchShift.checked = settings.get('pitchShift');
customCS.value = settings.get('customCS');
customAR.value = settings.get('customAR');
customOD.value = settings.get('customOD');
customHP.value = settings.get('customHP');
customRate.value = settings.get('customRate');

pitchShift.addEventListener('change', (event) => {
  settings.set('pitchShift', pitchShift.checked);
});

const createDifficultyHandler = (setting) => (event) => {
  /** @type {HTMLInputElement} */
  let elem = event.target;
  if (elem.validity.badInput) {
    elem.value = '';
    settings.set(setting, undefined);
    return;
  }
  if (elem.validity.rangeUnderflow) elem.value = elem.min;
  if (elem.validity.rangeOverflow) elem.value = elem.max;
  settings.set(setting, elem.valueAsNumber);
}

customCS.addEventListener('blur', createDifficultyHandler('customCS'));
customAR.addEventListener('blur', createDifficultyHandler('customAR'));
customOD.addEventListener('blur', createDifficultyHandler('customOD'));
customHP.addEventListener('blur', createDifficultyHandler('customHP'));
customRate.addEventListener('blur', createDifficultyHandler('customRate'));

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
