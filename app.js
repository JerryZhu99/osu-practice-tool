const net = require('net');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const ioHook = require('iohook');

function generateOsz(osupath) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  console.log(`Generating AR0 edit for ${filename}`);
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    let lines = data.toString("UTF-8").split("\n");

    let difficulty = lines.find(e => e.startsWith("Version")).split(":")[1].trim();
    let approachRate = lines.find(e => e.startsWith("ApproachRate")).split(":")[1].trim();

    if (parseFloat(approachRate) == 0) {
      console.log("AR is already 0!");
      return;
    }

    lines = lines.map(l => {
      if (l.startsWith("Version")) {
        return `Version:${difficulty} AR0`;
      }
      if (l.startsWith("BeatmapID")) return "BeatmapID:0";
      if (l.startsWith("ApproachRate")) return "ApproachRate:0";
      return l;
    })

    let output = fs.createWriteStream(path.join(songsDirectory, `${dirname}.osz`));
    let archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
    });
    archive.on('error', function (err) {
      throw err;
    });
    archive.pipe(output);
    archive.append(lines.join("\n"), { name: filename.replace(`[${difficulty}]`, `[${difficulty} AR0]`) });
    archive.finalize();
    console.log("Done!");
  });
}


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
    for (let i = startIndex; i < buffer.length; i++) {
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
      currentFile = JSON.parse(json).file;
    }
  });
});

server.listen(7839, 'localhost');

ioHook.on("keypress", event => {
  if (event.rawcode === 48 && event.altKey && currentFile) {
    generateOsz(currentFile);
  }
});
ioHook.start();
