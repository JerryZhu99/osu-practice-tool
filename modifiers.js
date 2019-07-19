const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const archiver = require('archiver');

const { log, setCurrentFile, setStatus } = require('./renderer');

class OsuFile {

  /**
   * Reads an .osu file asynchronously.
   * @param {string} osupath
   * @returns {Promise<OsuFile>}
   */
  static fromFile(osupath) {
    return new Promise((resolve, reject) => {
      const filename = path.parse(osupath).base;
      const dirs = path.dirname(osupath).split(path.sep);
      const dirname = dirs.pop();
      const songsDirectory = path.join(...dirs);
      fs.readFile(osupath, (err, data) => {
        if (err) return reject(err);
        resolve(new OsuFile(data, filename, dirname, songsDirectory));
      });
    });
  }

  /**
   * Constucts a new OsuFile instance.
   * @param {Buffer} data
   * @param {string} filename
   * @param {string} dirname
   * @param {string} songsDirectory
   */
  constructor(data, filename, dirname, songsDirectory) {
    this.lines = data.toString("UTF-8").split('\n');
    this.filename = filename;
    this.dirname = dirname;
    this.songsDirectory = songsDirectory;
  }

  /**
   * Gets a property from an osu file.
   * @param {string} name the name of the property
   * @param {string=} defaultValue the default value
   */
  getProperty(name, defaultValue) {
    let line = this.lines.find(e => e.startsWith(name));
    return line ? line.slice(line.indexOf(":") + 1).trim() : defaultValue;
  }

  /**
   * Sets a property of an osu file.
   * @param {string} data the contents of the .osu file
   * @param {string} name the name of the property
   */
  setProperty(name, value) {
    let index = this.lines.findIndex(e => e.startsWith(name));
    if (index == -1) return -1;
    this.lines[index] = `${this.lines[index].slice(0, this.lines[index].indexOf(":"))}: ${value}`;
  }

  toString() {
    return this.lines.join('\n');
  }

  appendToDiffName(postfix) {
    this.filename = `${this.filename.substring(0, this.filename.lastIndexOf("]"))} ${postfix}].osu`
  }

  generateOsz() {
    let oszFileName = path.join(this.songsDirectory, `${this.dirname}.osz`);
    let output = fs.createWriteStream(oszFileName);
    let archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
    });
    archive.on('error', function (err) {
      throw err;
    });
    archive.pipe(output);
    archive.append(this.toString(), {
      name: this.filename
    });
    return archive.finalize();
  }
}

async function generateOszWithAR(osupath, ar = 0) {
  log(`Generating AR${ar} edit for ${osupath}`);
  setStatus('Reading .osu file...');
  let osuFile = await OsuFile.fromFile(osupath);

  setStatus('Processing .osu file...');
  let difficulty = osuFile.getProperty("Version")
  let approachRate = osuFile.getProperty("ApproachRate");

  if (!approachRate) {
    // For older map without AR, insert AR after OD.
    let odIndex = osuFile.lines.findIndex(e => e.startsWith("OverallDifficulty"));
    osuFile.lines.splice(odIndex + 1, 0, `ApproachRate:-1`);
    approachRate = -1;
  }

  if (parseFloat(approachRate) === ar) {
    log(`AR is already ${ar}!`);
    setStatus(`AR is already ${ar}!`);
    return;
  }

  osuFile.setProperty("Version", `${difficulty} AR${ar}`);
  osuFile.setProperty("BeatmapID", 0);
  osuFile.setProperty("ApproachRate", ar);
  osuFile.appendToDiffName(`AR${ar}`);

  setStatus('Generating .osz file...');
  await osuFile.generateOsz();

  setStatus('Done!');
}

async function generateOszWithRate(osupath, rate = 1.33) {
  log(`Generating ${rate}x edit for ${osupath}`);
  setStatus('Reading .osu file...');
  let osuFile = await OsuFile.fromFile(osupath);
  setStatus('Processing .osu file...');

  let difficulty = osuFile.getProperty("Version");
  let previewTime = parseInt(osuFile.getProperty("PreviewTime"));
  let sliderMultiplier = parseFloat(osuFile.getProperty("SliderMultiplier"));
  let audioFilename = osuFile.getProperty("AudioFilename");

  osuFile.setProperty("Version", `${difficulty} ${rate}x`);
  osuFile.setProperty("AudioFilename", "audio.mp3");
  osuFile.setProperty("PreviewTime", Math.round(previewTime / rate));
  osuFile.setProperty("BeatmapID", 0);

  let breaksIndex = osuFile.lines.findIndex(e => e.startsWith("//Break Periods"))
  let breaksEndIndex = osuFile.lines.findIndex(e => e.startsWith("//Storyboard Layer 0"))
  let timingPointsIndex = osuFile.lines.findIndex(e => e.startsWith("[TimingPoints]"))
  let timingPointsEndIndex = osuFile.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["))
  let hitObjectsIndex = osuFile.lines.findIndex(e => e.startsWith("[HitObjects]"))

  osuFile.lines = osuFile.lines.map((l, index) => {
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
  const { songsDirectory, dirname } = osuFile;

  const args = ['-y',
    '-i',
    `"${path.join(songsDirectory, dirname, audioFilename)}"`,
    '-filter:a',
    `"atempo=${rate}"`,
    '-vn',
    `"audio.mp3"`];
  let ffmpeg = spawn(ffmpegPath, args, { windowsVerbatimArguments: true });

  ffmpeg.on('exit', async (statusCode) => {
    if (statusCode === 0) {
      log('conversion successful');
    } else {
      error("An error occured in ffmpeg");
      return;
    }

    osuFile.appendToDiffName(`${rate}x`);

    setStatus('Generating .osz file...')

    let output = fs.createWriteStream(path.join(songsDirectory, `${dirname} ${rate}.osz`));
    let archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
    });
    archive.on('error', function (err) {
      throw err;
    });
    archive.pipe(output);
    archive.append(osuFile.toString(), {
      name: osuFile.filename
    });
    archive.file("audio.mp3");
    archive.glob(path.join("*.png"), { cwd: path.join(songsDirectory, dirname) });
    archive.glob(path.join("*.jpg"), { cwd: path.join(songsDirectory, dirname) });
    await archive.finalize();
    log('Done!');
    setStatus('Done!');
  })

  ffmpeg
    .stderr
    .on('data', (err) => {
      log(new String(err))
    });
}

async function generateOszWithNoSVs(osupath) {
  log(`Generating No SVs edit for ${osupath}`);
  setStatus('Reading .osu file...');
  let osuFile = await OsuFile.fromFile(osupath);

  setStatus('Processing .osu file...');

  osuFile.setProperty("Version", `${osuFile.getProperty("Version")} No SVs`);
  osuFile.setProperty("BeatmapID", 0);

  let timingPointsIndex = osuFile.lines.findIndex(e => e.startsWith("[TimingPoints]"))
  let timingPointsEndIndex = osuFile.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["))

  let mainBpm = osuFile.lines.filter((l, index) => {
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

  osuFile.lines = osuFile.lines.map((l, index) => {
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

  osuFile.appendToDiffName('No SVs');

  setStatus('Generating .osz file...')
  await osuFile.generateOsz();
  log('Done!');
  setStatus('Done!');
}

async function generateOszWithNoLNs(osupath) {
  log(`Generating No LNs edit for ${osupath}`);
  setStatus('Reading .osu file...');

  let osuFile = await OsuFile.fromFile(osupath);
  setStatus('Processing .osu file...');

  osuFile.setProperty("Version", `${osuFile.getProperty("Version")} No LNs`);
  osuFile.setProperty("BeatmapID", 0);

  let hitObjectsIndex = osuFile.lines.findIndex(e => e.startsWith("[HitObjects]"))

  osuFile.lines = osuFile.lines.map((l, index) => {
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

  osuFile.appendToDiffName('No LNs');

  setStatus('Generating .osz file...');
  osuFile.generateOsz();
  log('Done!');
  setStatus('Done!');
}

module.exports = {
  generateOszWithAR,
  generateOszWithRate,
  generateOszWithNoSVs,
  generateOszWithNoLNs,
}
