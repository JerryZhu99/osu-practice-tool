const net = require('net');
const ioHook = require('iohook');

const { setCurrentFile } = require('./renderer');

const {
  generateOszWithAR,
  generateOszWithCS,
  generateOszWithOD,
  generateOszWithHP,
  generateOszWithRate,
  generateOszWithNoSVs,
  generateOszWithNoLNs,
} = require('./modifiers');

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

ioHook.on("keypress", event => {
  // If 0-9 or T
  const isNumber = (event.rawcode >= 48 && event.rawcode <= 57) || event.rawcode === 84;

  if (event.altKey && event.shiftKey && event.rawcode === 72 && currentFile) {
    // Alt-Shift-H pressed, 1.33 rate to negate HT 0.75
    let rate = 1.33;
    generateOszWithRate(currentFile, rate);
  } else if (event.altKey && event.shiftKey && event.rawcode === 68 && currentFile) {
    // Alt-Shift-D pressed, 0.66 rate to negate DT 1.5
    let rate = 0.66;
    generateOszWithRate(currentFile, rate);
  } else if (event.altKey && isNumber && currentFile) {
    let key = event.rawcode === 84 ? 10 : (event.rawcode - 48);
    if (event.shiftKey) {
      if (key === 0 || key === 10) return;
      // Alt-Shift-1 to Alt-Shift-9 pressed
      let rate = key < 5 ? 1 + 0.1 * key : 0.1 * key; // 0.5x to 1.4x
      rate = Math.round(rate * 10) / 10; // correct floating point rounding errors
      generateOszWithRate(currentFile, rate);
    } else if (keysDown.has(67)) {
      // Alt-C-(key) pressed
      let cs = key;
      generateOszWithCS(currentFile, cs);
    } else if (keysDown.has(65)) {
      // Alt-A-(key) pressed
      let ar = key;
      generateOszWithAR(currentFile, ar);
    } else if (keysDown.has(79)) {
      // Alt-O-(key) pressed
      let od = key;
      generateOszWithOD(currentFile, od);
    } else if (keysDown.has(72)) {
      // Alt-H-(key) pressed
      let hp = key;
      generateOszWithHP(currentFile, hp);
    }
  } else if (event.altKey && event.rawcode === 86 && currentFile) {
    // Alt-V pressed, no SVs
    generateOszWithNoSVs(currentFile);
  } else if (event.altKey && event.rawcode === 76 && currentFile) {
    // Alt-L pressed, no LNs
    generateOszWithNoLNs(currentFile);
  }
});
ioHook.start();
