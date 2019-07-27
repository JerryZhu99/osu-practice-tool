const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const archiver = require('archiver');
const remote = require('electron').remote;

const { log, setCurrentFile, setStatus } = require('./renderer');
const settings = require('./settings');

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
    if (data) this.lines = data.toString("UTF-8").split('\n');
    this.filename = filename;
    this.dirname = dirname;
    this.songsDirectory = songsDirectory;
  }

  getVersion() {
    return parseInt(this.lines[0].match(/\d+/)[0]);
  }

  setVersion(version) {
    this.lines[0] = `osu file format v${version}`;
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

  generateOsu() {
    return new Promise((resolve, reject) => {
      const filename = path.join(this.songsDirectory, this.dirname, this.filename);
      fs.writeFile(filename, this.toString(), (err) => {
        if (err) return reject(err);
        resolve();
      })
    })
  }

  generateOsz(archiveCallback) {
    let oszFileName = path.join(this.songsDirectory, `${this.dirname}.osz`);
    let output = fs.createWriteStream(oszFileName);
    let archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
    });
    archive.on('error', function (err) {
      throw err;
    });
    archive.pipe(output);
    if (archiveCallback) archiveCallback(archive);
    archive.append(this.toString(), {
      name: this.filename
    });
    return archive.finalize();
  }

  clone() {
    const copy = new OsuFile(null, this.filename, this.dirname, this.songsDirectory);
    copy.lines = this.lines.slice();
    return copy;
  }
}


async function generateOszWithCS(osupath, cs = 0) {
  log(`Generating CS${cs} edit for ${osupath}`);
  setStatus('Reading .osu file...', 1);
  try {
    let osuFile = await OsuFile.fromFile(osupath);

    setStatus('Processing .osu file...');
    let difficulty = osuFile.getProperty("Version")
    let circleSize = osuFile.getProperty("CircleSize");

    if (parseFloat(circleSize) === cs) {
      log(`CS is already ${cs}!`);
      setStatus(`CS is already ${cs}!`, -1);
      return;
    }

    // Required to fix older file formats
    if (!Number.isInteger(cs) && osuFile.getVersion() < 13) osuFile.setVersion(13);

    osuFile.setProperty("Version", `${difficulty} CS${cs}`);
    osuFile.setProperty("BeatmapID", 0);
    osuFile.setProperty("CircleSize", cs);
    osuFile.appendToDiffName(`CS${cs}`);

    setStatus('Generating .osu file...');
    await osuFile.generateOsu();
  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
  setStatus('Done!', -1);
}

async function generateOszWithAR(osupath, ar = 0) {
  log(`Generating AR${ar} edit for ${osupath}`);
  setStatus('Reading .osu file...', 1);
  try {
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
      setStatus(`AR is already ${ar}!`, -1);
      return;
    }

    // Required to fix older file formats
    if (!Number.isInteger(ar) && osuFile.getVersion() < 13) osuFile.setVersion(13);

    osuFile.setProperty("Version", `${difficulty} AR${ar}`);
    osuFile.setProperty("BeatmapID", 0);
    osuFile.setProperty("ApproachRate", ar);
    osuFile.appendToDiffName(`AR${ar}`);

    setStatus('Generating .osu file...');
    await osuFile.generateOsu();

  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
  setStatus('Done!', -1);
}


async function generateOszWithOD(osupath, od = 0) {
  log(`Generating OD${od} edit for ${osupath}`);
  setStatus('Reading .osu file...', 1);
  try {
    let osuFile = await OsuFile.fromFile(osupath);

    setStatus('Processing .osu file...');
    let difficulty = osuFile.getProperty("Version")
    let overallDifficulty = osuFile.getProperty("OverallDifficulty");

    if (parseFloat(overallDifficulty) === od) {
      log(`OD is already ${od}!`);
      setStatus(`OD is already ${od}!`, -1);
      return;
    }

    // Required to fix older file formats
    if (!Number.isInteger(od) && osuFile.getVersion() < 13) osuFile.setVersion(13);

    osuFile.setProperty("Version", `${difficulty} OD${od}`);
    osuFile.setProperty("BeatmapID", 0);
    osuFile.setProperty("OverallDifficulty", od);
    osuFile.appendToDiffName(`OD${od}`);

    setStatus('Generating .osu file...');
    await osuFile.generateOsu();
  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
  setStatus('Done!', -1);
}

async function generateOszWithHP(osupath, hp = 0) {
  log(`Generating HP${hp} edit for ${osupath}`);
  setStatus('Reading .osu file...', 1);
  try {
    let osuFile = await OsuFile.fromFile(osupath);

    setStatus('Processing .osu file...');
    let difficulty = osuFile.getProperty("Version")
    let hpDrainRate = osuFile.getProperty("HPDrainRate");

    if (parseFloat(hpDrainRate) === hp) {
      log(`HP is already ${hp}!`);
      setStatus(`HP is already ${hp}!`, -1);
      return;
    }

    // Required to fix older file formats
    if (!Number.isInteger(hp) && osuFile.getVersion() < 13) osuFile.setVersion(13);

    osuFile.setProperty("Version", `${difficulty} HP${hp}`);
    osuFile.setProperty("BeatmapID", 0);
    osuFile.setProperty("HPDrainRate", hp);
    osuFile.appendToDiffName(`HP${hp}`);

    setStatus('Generating .osu file...');
    await osuFile.generateOsu();
  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
  setStatus('Done!', -1);
}


async function generateOszWithRate(osupath, rate = 1.33) {
  try {
    log(`Generating ${rate}x edit for ${osupath}`);
    setStatus('Reading .osu file...', 1);
    let osuFile = await OsuFile.fromFile(osupath);
    setStatus('Processing .osu file...');

    let difficulty = osuFile.getProperty("Version");
    let previewTime = parseInt(osuFile.getProperty("PreviewTime"));
    let sliderMultiplier = parseFloat(osuFile.getProperty("SliderMultiplier"));
    let audioFilename = osuFile.getProperty("AudioFilename");

    osuFile.setProperty("Version", `${difficulty} ${rate}x`);
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

    const tempFilename = `${Date.now()}-${Math.random()}.mp3`;

    const args = ['-y',
      '-i',
      `"${path.join(songsDirectory, dirname, audioFilename)}"`,
      '-filter:a',
      settings.get('pitchShift') ? `"aresample=192k/${rate},asetrate=192k"` : `"atempo=${rate}"`,
      '-vn',
      `"${path.join(remote.app.getPath('temp'), tempFilename)}"`];
    let ffmpeg = spawn(ffmpegPath, args, { windowsVerbatimArguments: true });

    ffmpeg.on('exit', async (statusCode) => {
      if (statusCode === 0) {
        log('conversion successful');
      } else {
        log("An error occured in ffmpeg");
        setStatus("An error occured in ffmpeg", -1);
        return;
      }
      try {
        osuFile.appendToDiffName(`${rate}x`);

        setStatus('Generating .osz file...')

        const archiveCallback = (archive) => {
          archive.file(path.join(remote.app.getPath('temp'), tempFilename), { name: audioFilename });
          archive.glob("*.png", { cwd: path.join(songsDirectory, dirname) });
          archive.glob("*.jpg", { cwd: path.join(songsDirectory, dirname) });
        }

        osuFile.dirname = `${osuFile.dirname} ${rate}`;
        await osuFile.generateOsz(archiveCallback);

        fs.unlinkSync(path.join(remote.app.getPath('temp'), tempFilename));
      } catch (e) {
        setStatus('An error occurred.', -1);
        log(e);
        throw e;
      }
      log('Done!');
      setStatus('Done!', -1);
    })

    ffmpeg
      .stderr
      .on('data', (err) => {
        log(new String(err))
      });

  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
}

async function generateOszWithCopy(osupath) {
  try {
    log(`Generating copy for ${osupath}`);
    setStatus('Reading .osu file...', 1);
    let osuFile = await OsuFile.fromFile(osupath);
    setStatus('Processing .osu file...');

    let difficulty = osuFile.getProperty("Version");
    osuFile.setProperty("Version", `${difficulty} (Copy)`);
    osuFile.setProperty("BeatmapID", 0);

    osuFile.appendToDiffName(`(Copy)`);

    setStatus('Generating .osz file...')

    const { songsDirectory, dirname } = osuFile;

    const archiveCallback = (archive) => {
      archive.glob("*.mp3", { cwd: path.join(songsDirectory, dirname) });
      archive.glob("*.png", { cwd: path.join(songsDirectory, dirname) });
      archive.glob("*.jpg", { cwd: path.join(songsDirectory, dirname) });
    }

    osuFile.dirname = `${osuFile.dirname} Copy`;
    await osuFile.generateOsz(archiveCallback);
    log('Done!');
    setStatus('Done!', -1);
  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
}


async function generateOszWithSplit(osupath) {
  try {
    log(`Generating split for ${osupath}`);
    setStatus('Reading .osu file...', 1);
    let osuFile = await OsuFile.fromFile(osupath);
    setStatus('Processing .osu file...');

    let difficulty = osuFile.getProperty("Version");

    if (!difficulty.includes('(Copy)')) {
      setStatus('The map is not a copy.', -1);
      log('The map is not a copy.');
      return;
    }

    difficulty = `${difficulty.split('(Copy)')[0]}`;

    osuFile.setProperty("BeatmapID", 0);

    const bookmarks = (osuFile.getProperty('Bookmarks') || '')
      .split(",")
      .filter(e => (e.trim().length > 0))
      .map(e => parseInt(e));

    if (bookmarks.length == 0) {
      setStatus('No bookmarks set!.', -1);
      log('No bookmarks set!');
      return;
    }
    const sections = [0, ...bookmarks.sort((a, b) => (a - b)), Infinity];

    const hitObjectsIndex = osuFile.lines.findIndex(e => e.startsWith("[HitObjects]"))

    const promises = [];

    for (let i = 1; i < sections.length; i++) {
      const start = sections[i - 1];
      const end = sections[i];
      const sectionFile = osuFile.clone();

      sectionFile.setProperty("Version", `${difficulty} (Split ${i})`);
      sectionFile.appendToDiffName(i);

      sectionFile.lines = sectionFile.lines.filter((line, index) => {
        if (index > hitObjectsIndex) {
          let [x, y, time, ...rest] = line.split(",");
          time = parseInt(time);
          return (start <= time && time <= end);
        } else {
          return true;
        }
      })

      await sectionFile.generateOsu();
    }
    log('Done!');
    setStatus('Done!', -1);
  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
}

async function generateOszWithNoSVs(osupath) {
  try {
    log(`Generating No SVs edit for ${osupath}`);
    setStatus('Reading .osu file...', 1);
    let osuFile = await OsuFile.fromFile(osupath);

    setStatus('Processing .osu file...');

    if (osuFile.getProperty("Version").includes('No SVs')) {
      log('Map already has no SVs!');
      setStatus('Map already has no SVs!', -1);
      return;
    }

    osuFile.setProperty("Version", `${osuFile.getProperty("Version")} No SVs`);
    osuFile.setProperty("BeatmapID", 0);

    let timingPointsIndex = osuFile.lines.findIndex(e => e.startsWith("[TimingPoints]"))
    let timingPointsEndIndex = osuFile.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["))

    let bpms = new Map();
    osuFile.lines.filter((l, index) => {
      return ((index > timingPointsIndex && index < timingPointsEndIndex))
    }).filter(l => {
      let [time, msPerBeat, ...rest] = l.split(",");
      msPerBeat = parseFloat(msPerBeat);
      return (msPerBeat > 0);
    }).forEach((l, i, arr) => {
      let [time, msPerBeat] = l.split(",");
      if (i + 1 >= arr.length) {
        let [x, y, endTime] = osuFile.lines[osuFile.lines.length - 2].split(",");
        let duration = parseInt(endTime) - parseInt(time);
        if (!bpms.has(msPerBeat)) bpms.set(msPerBeat, 0);
        bpms.set(msPerBeat, bpms.get(msPerBeat) + duration);
        return;
      }
      let [endTime] = arr[i + 1].split(",");
      let duration = parseInt(endTime) - parseInt(time);
      if (!bpms.has(msPerBeat)) bpms.set(msPerBeat, 0);
      bpms.set(msPerBeat, bpms.get(msPerBeat) + duration);
    });

    let mainBpm = 60000 / [...bpms.entries()]
      .reduce(([mainMsPerBeat, maxCount], [msPerBeat, count]) => {
        return count > maxCount ? [msPerBeat, count] : [mainMsPerBeat, maxCount]
      }, [0, 0])[0];

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

    setStatus('Generating .osu file...')
    await osuFile.generateOsu();
  } catch (e) {
    setStatus('An error occurred.', -1);
    log(e);
    throw e;
  }
  log('Done!');
  setStatus('Done!', -1);
}

async function generateOszWithNoLNs(osupath) {
  log(`Generating No LNs edit for ${osupath}`);
  setStatus('Reading .osu file...');

  let osuFile = await OsuFile.fromFile(osupath);
  setStatus('Processing .osu file...');

  if (osuFile.getProperty("Version").includes('No LNs')) {
    log('Map already has no LNs!');
    setStatus('Map already has no LNs!');
    return;
  }

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

  setStatus('Generating .osu file...');
  osuFile.generateOsu();
  log('Done!');
  setStatus('Done!');
}

module.exports = {
  generateOszWithCS,
  generateOszWithAR,
  generateOszWithOD,
  generateOszWithHP,
  generateOszWithRate,
  generateOszWithCopy,
  generateOszWithSplit,
  generateOszWithNoSVs,
  generateOszWithNoLNs,
}
