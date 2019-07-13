const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const archiver = require('archiver');
const ioHook = require('iohook');

function generateOszWithAR(osupath, ar = 0) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  console.log(`Generating AR${ar} edit for ${filename}`);
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    let lines = data.toString("UTF-8").split("\n");

    let difficulty = lines.find(e => e.startsWith("Version")).split(":")[1].trim();
    let approachRate = lines.find(e => e.startsWith("ApproachRate")).split(":")[1].trim();

    if (parseFloat(approachRate) === ar) {
      console.log(`AR is already ${ar}!`);
      return;
    }

    lines = lines.map(l => {
      if (l.startsWith("Version")) {
        return `Version:${difficulty} AR${ar}`;
      }
      if (l.startsWith("BeatmapID")) return "BeatmapID:0";
      if (l.startsWith("ApproachRate")) return `ApproachRate:${ar}`;
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
    archive.append(lines.join("\n"), { name: filename.replace(`[${difficulty}]`, `[${difficulty} AR${ar}]`) });
    archive.finalize();
    console.log("Done!");
  });
}

function generateOszWithRate(osupath, rate = 1.33) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  console.log(`Generating ${rate}x edit for ${filename}`);
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    let lines = data.toString("UTF-8").split("\n");

    let difficulty = lines.find(e => e.startsWith("Version")).split(":")[1].trim();
    let previewTime = parseInt(lines.find(e => e.startsWith("PreviewTime")).split(":")[1].trim());
    let sliderMultiplier = parseFloat(lines.find(e => e.startsWith("SliderMultiplier")).split(":")[1].trim());
    let audioFilename = lines.find(e => e.startsWith("AudioFilename")).split(":")[1].trim();

    let breaksIndex = lines.findIndex(e => e.startsWith("//Break Periods"))
    let breaksEndIndex = lines.findIndex(e => e.startsWith("//Storyboard Layer 0"))
    let timingPointsIndex = lines.findIndex(e => e.startsWith("[TimingPoints]"))
    let coloursIndex = lines.findIndex(e => e.startsWith("[Colours]"))
    let hitObjectsIndex = lines.findIndex(e => e.startsWith("[HitObjects]"))

    lines = lines.map((l, index) => {
      if (l.startsWith("Version")) {
        return `Version:${difficulty} ${rate}x`;
      }
      if (l.startsWith("AudioFilename")) {
        return `AudioFilename: audio.mp3`;
      }
      if (l.startsWith("PreviewTime")) {
        return `PreviewTime:${Math.floor(previewTime / rate)}`;
      }
      if (l.startsWith("BeatmapID")) return "BeatmapID:0";
      if (l.startsWith("SliderMultiplier")) return `SliderMultiplier:${(sliderMultiplier / rate).toFixed(2)}`;
      if (l.trim() !== "") {
        // is a break
        if ((index > breaksIndex && index < breaksEndIndex)) {
          let [n, start, end] = l.split(",");
          return [n, Math.floor(parseInt(start) / rate), Math.floor(parseInt(end) / rate)].join(",");
        }

        // is a timing point
        if ((index > timingPointsIndex && index < coloursIndex)) {
          let [time, msPerBeat, ...rest] = l.split(",");
          return [Math.floor(parseInt(time) / rate), Math.floor(parseInt(msPerBeat) / rate), ...rest].join(",");
        }

        // is a hitobject
        if (index > hitObjectsIndex) {
          let [x, y, time, type, ...rest] = l.split(",");
          if ((parseInt(type) & 8) > 0) {
            console.log(rest[1]);
            rest[1] = "" + Math.floor(parseInt(rest[1]) / rate);
          }
          return [x, y, Math.floor(parseInt(time) / rate), type, ...rest].join(",");
        }
      }
      return l;
    })

    const args = ['-y',
      '-i',
      `"${path.join(songsDirectory, dirname, audioFilename)}"`,
      '-filter:a',
      `"atempo=${rate}"`,
      '-vn',
      `"audio.mp3"`];
    let ffmpeg = spawn('ffmpeg', args, { windowsVerbatimArguments: true });

    ffmpeg.on('exit', (statusCode) => {
      if (statusCode === 0) {
        console.log('conversion successful');
      } else {
        console.error("An error occured in ffmpeg");
        return;
      }

      let output = fs.createWriteStream(path.join(songsDirectory, `${dirname} ${rate}.osz`));
      let archive = archiver('zip', {
        zlib: { level: 0 } // Sets the compression level.
      });
      archive.on('error', function (err) {
        throw err;
      });
      archive.pipe(output);
      archive.append(lines.join("\n"), { name: filename.replace(`[${difficulty}]`, `[${difficulty} ${rate}x]`) });
      archive.file("audio.mp3");
      archive.glob(path.join("*.png"), { cwd: path.join(songsDirectory, dirname) });
      archive.glob(path.join("*.jpg"), { cwd: path.join(songsDirectory, dirname) });
      archive.finalize();
      console.log("Done!");
    })

    ffmpeg
      .stderr
      .on('data', (err) => {
        console.log('ffmpeg:', new String(err))
      })
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
      try {
        currentFile = JSON.parse(json).file;
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
      generateOszWithRate(currentFile, rate);
    } else {
      let ar = event.rawcode - 48;
      generateOszWithAR(currentFile, ar);
    }
  }
});
ioHook.start();
