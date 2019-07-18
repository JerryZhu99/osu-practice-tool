const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const archiver = require('archiver');
const ioHook = require('iohook');

const { log, setCurrentFile, setStatus } = require('./renderer');

function generateOszWithAR(osupath, ar = 0) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  log(`Generating AR${ar} edit for ${filename}`);
  setStatus('Reading .osu file...');
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    setStatus('Processing .osu file...');
    let lines = data.toString("UTF-8").split("\n");

    if (!lines.some(e => e.startsWith("ApproachRate"))) {
      // For older map without AR, insert AR after OD.
      let odIndex = lines.findIndex(e => e.startsWith("OverallDifficulty"));
      let od = lines[odIndex].split(":")[1].trim();
      lines.splice(odIndex + 1, 0, `ApproachRate:${od}`)
    }

    let difficulty = lines.find(e => e.startsWith("Version")).split(":")[1].trim();
    let approachRate = lines.find(e => e.startsWith("ApproachRate")).split(":")[1].trim();

    if (parseFloat(approachRate) === ar) {
      log(`AR is already ${ar}!`);
      setStatus(`AR is already ${ar}!`);
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
    archive.append(lines.join("\n"), {
      name: `${filename.substring(0, filename.lastIndexOf("]"))} AR${ar}].osu`
    });
    archive.finalize();
    archive.on('finish', () => {
      log('Done!');
      setStatus('Done!');
    })
  });
}

function generateOszWithRate(osupath, rate = 1.33) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  log(`Generating ${rate}x edit for ${filename}`);
  setStatus('Reading .osu file...');
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    setStatus('Processing .osu file...');

    let lines = data.toString("UTF-8").split("\n");

    let difficulty = lines.find(e => e.startsWith("Version")).split(":")[1].trim();
    let previewTime = parseInt(lines.find(e => e.startsWith("PreviewTime")).split(":")[1].trim());
    let sliderMultiplier = parseFloat(lines.find(e => e.startsWith("SliderMultiplier")).split(":")[1].trim());
    let audioFilename = lines.find(e => e.startsWith("AudioFilename")).split(":")[1].trim();

    let breaksIndex = lines.findIndex(e => e.startsWith("//Break Periods"))
    let breaksEndIndex = lines.findIndex(e => e.startsWith("//Storyboard Layer 0"))
    let timingPointsIndex = lines.findIndex(e => e.startsWith("[TimingPoints]"))
    let timingPointsEndIndex = lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["))
    let hitObjectsIndex = lines.findIndex(e => e.startsWith("[HitObjects]"))

    lines = lines.map((l, index) => {
      if (l.startsWith("Version")) {
        return `Version:${difficulty} ${rate}x`;
      }
      if (l.startsWith("AudioFilename")) {
        return `AudioFilename: audio.mp3`;
      }
      if (l.startsWith("PreviewTime")) {
        return `PreviewTime:${Math.round(previewTime / rate)}`;
      }
      if (l.startsWith("BeatmapID")) return "BeatmapID:0";
      // if (l.startsWith("SliderMultiplier")) return `SliderMultiplier:${sliderMultiplier * rate}`;
      if (l.trim() !== "") {
        // is a break
        if ((index > breaksIndex && index < breaksEndIndex)) {
          let [n, start, end] = l.split(",");
          return [n, Math.round(parseInt(start) / rate), Math.round(parseInt(end) / rate)].join(",");
        }

        // is a timing point
        if ((index > timingPointsIndex && index < timingPointsEndIndex)) {
          let [time, msPerBeat, ...rest] = l.split(",");
          msPerBeat = parseFloat(msPerBeat);
          if (msPerBeat > 0) msPerBeat = msPerBeat / rate;
          return [Math.round(parseInt(time) / rate), msPerBeat, ...rest].join(",");
        }

        // is a hitobject
        if (index > hitObjectsIndex) {
          let [x, y, time, type, ...rest] = l.split(",");
          if ((parseInt(type) & (8 | 128)) > 0) { // spinner (8) or mania hold note (128)
            rest[1] = "" + Math.round(parseInt(rest[1]) / rate); // scale endTime;
          }
          return [x, y, Math.round(parseInt(time) / rate), type, ...rest].join(",");
        }
      }
      return l;
    })

    setStatus('Generating modified .mp3 file...')
    const args = ['-y',
      '-i',
      `"${path.join(songsDirectory, dirname, audioFilename)}"`,
      '-filter:a',
      `"atempo=${rate}"`,
      '-vn',
      `"audio.mp3"`];
    let ffmpeg = spawn(ffmpegPath, args, { windowsVerbatimArguments: true });

    ffmpeg.on('exit', (statusCode) => {
      if (statusCode === 0) {
        log('conversion successful');
      } else {
        error("An error occured in ffmpeg");
        return;
      }
      setStatus('Generating .osz file...')

      let output = fs.createWriteStream(path.join(songsDirectory, `${dirname} ${rate}.osz`));
      let archive = archiver('zip', {
        zlib: { level: 0 } // Sets the compression level.
      });
      archive.on('error', function (err) {
        throw err;
      });
      archive.pipe(output);
      archive.append(lines.join("\n"), {
        name: `${filename.substring(0, filename.lastIndexOf("]"))} ${rate}x].osu`
      });
      archive.file("audio.mp3");
      archive.glob(path.join("*.png"), { cwd: path.join(songsDirectory, dirname) });
      archive.glob(path.join("*.jpg"), { cwd: path.join(songsDirectory, dirname) });
      archive.finalize();
      archive.on('finish', () => {
        log('Done!');
        setStatus('Done!');
      })
    })

    ffmpeg
      .stderr
      .on('data', (err) => {
        log('ffmpeg:', new String(err))
      })
  });
}

function generateOszWithNoSVs(osupath) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  log(`Generating No SVs edit for ${filename}`);
  setStatus('Reading .osu file...');
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    setStatus('Processing .osu file...');
    let lines = data.toString("UTF-8").split("\n");

    let timingPointsIndex = lines.findIndex(e => e.startsWith("[TimingPoints]"))
    let timingPointsEndIndex = lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["))

    let mainBpm = lines.filter((l, index) => {
      return ((index > timingPointsIndex && index < timingPointsEndIndex))
    }).filter(l => {
      let [time, msPerBeat, ...rest] = l.split(",");
      msPerBeat = parseFloat(msPerBeat);
      return (msPerBeat > 0);
    }).reduce(([max, ms], l, i, arr) => {
      if (i + 1 >= arr.length) return [max, ms];
      let [time, msPerBeat] = l.split(",");
      let [endTime] = arr[i + 1].split(",");
      let duration = parseInt(endTime) - parseInt(time);
      if (duration >= max) {
        return [duration, 60000 / parseFloat(msPerBeat)];
      } else {
        return [max, ms];
      }
    }, [0, 0])[1];

    log("Estimated BPM:", mainBpm);
    let currentBpm = mainBpm;

    lines = lines.map((l, index) => {
      if (l.startsWith("Version")) {
        return `${l.trim()} No SVs`;
      }
      if (l.startsWith("BeatmapID")) return "BeatmapID:0";

      // is a timing point
      if ((index > timingPointsIndex && index < timingPointsEndIndex)) {
        let [time, msPerBeat, ...rest] = l.split(",");
        msPerBeat = parseFloat(msPerBeat);
        const bpm = 60000 / msPerBeat;
        if (msPerBeat < 0) {
          return [time, -100 * currentBpm / mainBpm, ...rest].join(",");
        } else {
          rest[4] = 0;
          currentBpm = bpm;
          return `${l.trim()}\n${[time, -100 * bpm / mainBpm, ...rest].join(",")}`;
        }
      }
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
    archive.append(lines.join("\n"), {
      name: `${filename.substring(0, filename.lastIndexOf("]"))} No SVs].osu`
    });
    archive.finalize();
    archive.on('finish', () => {
      log('Done!');
      setStatus('Done!');
    })
  });
}

function generateOszWithNoLNs(osupath) {
  let filename = path.parse(osupath).base;
  let dirs = path.dirname(osupath).split(path.sep);
  let dirname = dirs.pop();
  let songsDirectory = path.join(...dirs);
  log(`Generating No LNs edit for ${filename}`);
  setStatus('Reading .osu file...');
  fs.readFile(osupath, (err, data) => {
    if (err) throw err;
    setStatus('Processing .osu file...');
    let lines = data.toString("UTF-8").split("\n");

    let hitObjectsIndex = lines.findIndex(e => e.startsWith("[HitObjects]"))

    lines = lines.map((l, index) => {
      if (l.startsWith("Version")) {
        return `${l.trim()} No LNs`;
      }
      if (l.startsWith("BeatmapID")) return "BeatmapID:0";

      if (l.trim() !== "") {
        // is a hitobject
        if (index > hitObjectsIndex) {
          let [x, y, time, type, ...rest] = l.split(",");
          if ((parseInt(type) & 128) > 0) { // mania hold note (128)
            type = type & ~128 | 1;
            rest = [rest[0], rest[1].split(":").slice(1).join(":")];
          }
          return [x, y, time, type, ...rest].join(",");
        }
      }
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
    archive.append(lines.join("\n"), {
      name: `${filename.substring(0, filename.lastIndexOf("]"))} No LNs].osu`
    });
    archive.finalize();
    archive.on('finish', () => {
      log('Done!');
      setStatus('Done!');
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
