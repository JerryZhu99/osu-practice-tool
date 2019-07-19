const ipc = require('electron').ipcRenderer;

const statusElement = document.getElementById('status');
const currentFileElement = document.getElementById('current-file');
const consoleOutputElement = document.getElementById('console-output');

consoleOutputElement.addEventListener('click', function () {
  consoleOutputElement.classList.toggle('hidden');
})

const log = (...data) => {
  consoleOutputElement.append(...data, "\n");
  console.log(data);
}

const setCurrentFile = (filename) => {
  currentFileElement.innerText = filename;
}

const setStatus = (status) => {
  statusElement.innerText = status;
}

module.exports = {
  log,
  setCurrentFile,
  setStatus,
}
