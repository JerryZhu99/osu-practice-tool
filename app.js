const net = require('net');
const ioHook = require('iohook');

const { log, setCurrentFile, setStatus } = require('./renderer');

const {
  generateOszWithAR,
  generateOszWithRate,
  generateOszWithNoSVs,
  generateOszWithNoLNs,
} = require('./modifiers');

let currentFile;
let buffer = "";
let server = net.createServer(function (socket) {
  socket.on('data', function (rawData) {
    let textChunk = buffer + rawData.toString('utf8');
    buffer = textChunk;
    if (!textChunk) return;
    if (!buffer.includes("{")) return;
    let startIndex = buffer.indexOf("{");
    let endIndex;
    let balance = 0;
    let quoted = false;
    for (let i = startIndex; i < buffer.length; i++) {
      if (buffer[i] === "\"") quoted = !quoted;
      if (quoted) continue;
      if (buffer[i] === "{") balance++;
      if (buffer[i] === "}") balance--;
      if (buffer[i] === "\\") i++;

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
        console.error('json parse failed for: ', json);
      }
    }
  });
});

server.listen(7839, 'localhost');

ioHook.on("keypress", event => {
  if (event.altKey && event.shiftKey && event.rawcode === 72 && currentFile) {
    // Alt-Shift-H pressed, 1.33 rate to negate HT 0.75
    let rate = 1.33;
    generateOszWithRate(currentFile, rate);
  } else if (event.altKey && event.shiftKey && event.rawcode === 68 && currentFile) {
    // Alt-Shift-D pressed, 0.66 rate to negate DT 1.5
    let rate = 0.66;
    generateOszWithRate(currentFile, rate);
  } else if (event.altKey && event.rawcode >= 48 && event.rawcode <= 57 && currentFile) {
    // Alt-0 to Alt-9 pressed
    if (event.shiftKey) {
      let key = (event.rawcode - 48);
      if (key === 0) return;
      let rate = key < 5 ? 1 + 0.1 * key : 0.1 * key; // 0.5x to 1.4x
      rate = Math.round(rate * 10) / 10; // correct floating point rounding errors
      generateOszWithRate(currentFile, rate);
    } else {
      let ar = event.rawcode - 48;
      generateOszWithAR(currentFile, ar);
    }
  } else if (event.altKey && event.rawcode === 84 && currentFile) {
    // Alt-T pressed, AR 10
    generateOszWithAR(currentFile, 10);
  } else if (event.altKey && event.rawcode === 86 && currentFile) {
    // Alt-V pressed, no SVs
    generateOszWithNoSVs(currentFile);
  } else if (event.altKey && event.rawcode === 76 && currentFile) {
    // Alt-L pressed, no SVs
    generateOszWithNoLNs(currentFile);
  }
});
ioHook.start();
