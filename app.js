const net = require('net');
const ioHook = require('iohook');
const activeWin = require('active-win');

const settings = require('./src/settings');
const { setCurrentFile } = require('./src/renderer');

const {
  generateOszWithAR,
  generateOszWithCS,
  generateOszWithOD,
  generateOszWithHP,
  generateOszWithRate,
  generateOszWithCopy,
  generateOszWithSplit,
  generateOszWithCombo,
  generateOszWithComboSplit,
  generateOszWithNoSVs,
  generateOszWithNoLNs,
} = require('./src/modifiers');

let currentFile;
let buffer = "";
let server = net.createServer(function (socket) {
  socket.on('data', function (rawData) {
    buffer = buffer + rawData.toString('utf8');
    if (!buffer.includes("{")) return;
    let startIndex = buffer.indexOf("{");
    let endIndex;
    let balance = 0;
    let quoted = false;
    for (let i = startIndex; i < buffer.length; i++) {
      if (buffer[i] === "\\") i++;
      if (buffer[i] === "\"") quoted = !quoted;
      if (quoted) continue;
      if (buffer[i] === "{") balance++;
      if (buffer[i] === "}") balance--;
      if (balance === 0) {
        endIndex = i + 1;
        break;
      }
    }
    if (endIndex) {
      let json = buffer.substring(startIndex, endIndex);
      buffer = buffer.substring(endIndex);
      try {
        currentFile = JSON.parse(json).file;
        setCurrentFile(currentFile);
      } catch (e) {
        log('Error: json parse failed for: ', json);
      }
    }
  });
});

server.listen(7839, 'localhost');

let keysDown = new Set();
ioHook.on("keydown", event => {
  keysDown.add(event.rawcode)
})

ioHook.on("keyup", event => {
  keysDown.delete(event.rawcode);
})

const key = (name) => name.charCodeAt(0);

ioHook.on("keypress", async event => {
  const window = await activeWin();
  if (!window || window.title.trim() !== 'osu!') return;
  if (event.altKey && currentFile) {
    const isNumber = (event.rawcode >= key('0') && event.rawcode <= key('9'))
      || event.rawcode === key('T');
    if (event.shiftKey && event.rawcode === key('C')) {
      generateOszWithCopy(currentFile);
    } else if (event.shiftKey && event.rawcode === key('H')) {
      const rate = 1.33; // 1.33 rate to negate HT 0.75
      generateOszWithRate(currentFile, rate);
    } else if (event.shiftKey && event.rawcode === key('D')) {
      const rate = 0.67; // 0.67 rate to negate DT 1.5
      generateOszWithRate(currentFile, rate);
    } else if (isNumber) {
      let value = event.rawcode === key('T') ? 10 : (event.rawcode - 48);
      if (event.shiftKey) {
        if (value === 0 || value === 10) return;
        let rate = value < 5 ? 1 + 0.1 * value : 0.1 * value; // 0.5x to 1.4x
        rate = Math.round(rate * 10) / 10; // correct floating point rounding errors
        generateOszWithRate(currentFile, rate);
      } else if (keysDown.has(key('C'))) {
        generateOszWithCS(currentFile, value);
      } else if (keysDown.has(key('A'))) {
        generateOszWithAR(currentFile, value);
      } else if (keysDown.has(key('O'))) {
        generateOszWithOD(currentFile, value);
      } else if (keysDown.has(key('H'))) {
        generateOszWithHP(currentFile, value);
      }
    } else if (event.rawcode === key('U')) {
      if (event.shiftKey) {
        if (settings.get('customRate'))
          generateOszWithRate(currentFile, settings.get('customRate'));
      } else if (keysDown.has(key('C'))) {
        if (settings.get('customCS'))
          generateOszWithCS(currentFile, settings.get('customCS'));
      } else if (keysDown.has(key('A'))) {
        if (settings.get('customAR'))
          generateOszWithAR(currentFile, settings.get('customAR'));
      } else if (keysDown.has(key('O'))) {
        if (settings.get('customOD'))
          generateOszWithOD(currentFile, settings.get('customOD'));
      } else if (keysDown.has(key('H'))) {
        if (settings.get('customHP'))
          generateOszWithHP(currentFile, settings.get('customHP'));
      }
    } else if (event.rawcode === key('P')) {
      if (event.shiftKey) {
        generateOszWithComboSplit(currentFile);
      } else {
        generateOszWithSplit(currentFile);
      }
    } else if (event.rawcode === key('F')) {
      generateOszWithCombo(currentFile, 100);
    } else if (event.rawcode === key('V')) {
      generateOszWithNoSVs(currentFile);
    } else if (event.rawcode === key('L')) {
      generateOszWithNoLNs(currentFile);
    }
  }
});
ioHook.start();
