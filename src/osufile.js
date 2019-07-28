const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { log } = require("./renderer");
const { TimingPoint } = require("./timingpoint");
const { HitObject, HitCircle, Slider, Spinner, HoldNote } = require("./hitobject");
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
        if (err)
          return reject(err);
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
    if (data)
      this.lines = data.toString("UTF-8").split("\n");
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
    if (index == -1)
      return -1;
    this.lines[index] = `${this.lines[index].slice(0, this.lines[index].indexOf(":"))}: ${value}`;
  }

  appendToDiffName(postfix) {
    this.filename = `${this.filename.substring(0, this.filename.lastIndexOf("]"))} ${postfix}].osu`;
  }

  getTimingPoints() {
    let timingPointsIndex = this.lines.findIndex(e => e.startsWith("[TimingPoints]"));
    let timingPointsEndIndex = this.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["));
    return this.lines
      .filter((e, i) => (timingPointsIndex < i && i < timingPointsEndIndex))
      .filter(e => e.trim() !== "")
      .map(e => TimingPoint.fromString(e));
  }

  setTimingPoints(timingPoints) {
    let timingPointsIndex = this.lines.findIndex(e => e.startsWith("[TimingPoints]"));
    let timingPointsEndIndex = this.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["));
    this.lines.splice(
      timingPointsIndex + 1,
      timingPointsEndIndex - timingPointsIndex - 1,
      ...(timingPoints
        .sort((a, b) => (a.offset - b.offset))
        .map(e => e.toString())),
      "",
    );
  }

  getTimingPointAt(time) {
    return this.getTimingPoints()
      .reverse()
      .find(e => Math.floor(e.offset) <= time);
  }

  getMainBPM() {
    let bpms = new Map();
    this.getTimingPoints().filter(point => point.msPerBeat > 0)
      .forEach((point, i, arr) => {
        let endTime = Infinity;
        if (i + 1 >= arr.length) {
          endTime = this.getHitObjects().pop().time;
        } else {
          endTime = arr[i + 1].offset;
        }
        let duration = endTime - point.offset;
        if (!bpms.has(point.msPerBeat)) {
          bpms.set(point.msPerBeat, 0);
        }
        bpms.set(point.msPerBeat, bpms.get(point.msPerBeat) + duration);
      });
    let mainBpm = 60000 / [...bpms.entries()]
      .reduce(([mainMsPerBeat, maxCount], [msPerBeat, count]) => {
        return count > maxCount ? [msPerBeat, count] : [mainMsPerBeat, maxCount];
      }, [0, 0])[0];
    return mainBpm;
  }

  getHitObjects() {
    let hitObjectsIndex = this.lines.findIndex(e => e.startsWith("[HitObjects]"));
    let hitObjectsEndIndex = this.lines.length;
    return this.lines
      .filter((e, i) => (hitObjectsIndex < i && i < hitObjectsEndIndex))
      .filter(e => e.trim() !== "")
      .map(e => HitObject.fromString(e));
  }

  /**
   * @param {HitObject[]} hitObjects
   */
  setHitObjects(hitObjects) {
    let hitObjectsIndex = this.lines.findIndex(e => e.startsWith("[HitObjects]"));
    let hitObjectsEndIndex = this.lines.length;
    this.lines.splice(
      hitObjectsIndex + 1,
      hitObjectsEndIndex - hitObjectsIndex - 1,
      ...(hitObjects
        .sort((a, b) => (a.time - b.time))
        .map(e => e.toString())),
      ""
    );
  }

  getComboAt(time) {
    const sliderMultiplier = parseFloat(this.getProperty("SliderMultiplier", "1.4"));
    const sliderTickRate = parseFloat(this.getProperty("SliderTickRate", "1"));
    const hitObjects = this.getHitObjects().filter(e => e.time < time);
    let combo = 0;
    for (const hitObject of hitObjects) {
      if (hitObject instanceof HitCircle) {
        combo += 1;
      } else if (hitObject instanceof Slider) {
        let svMultiplier = 1.0;
        let timingPoint = this.getTimingPointAt(hitObject.time);
        if (timingPoint.msPerBeat < 0) svMultiplier = -100.0 / timingPoint.msPerBeat;
        const epsilon = 0.1;
        let pixelsPerBeat = 0;
        if (this.getVersion() < 8) {
          pixelsPerBeat = sliderMultiplier * 100.0;
        } else {
          pixelsPerBeat = sliderMultiplier * 100.0 * svMultiplier;
        }
        let numBeats = hitObject.pixelLength * hitObject.repeat / pixelsPerBeat;
        let ticks = Math.ceil((numBeats - epsilon) / hitObject.repeat * sliderTickRate) - 1;
        ticks = Math.max(0, ticks);
        combo += ticks * hitObject.repeat;
        combo += hitObject.repeat;
        combo += 1;
      } else if (hitObject instanceof Spinner) {
        combo += 1;
      }
    }
    return combo;
  }


  toString() {
    return this.lines.join("\n");
  }

  generateOsu() {
    return new Promise((resolve, reject) => {
      const filename = path.join(this.songsDirectory, this.dirname, this.filename);
      fs.writeFile(filename, this.toString(), (err) => {
        if (err)
          return reject(err);
        resolve();
      });
    });
  }
  generateOsz(archiveCallback) {
    let oszFileName = path.join(this.songsDirectory, `${this.dirname}.osz`);
    let output = fs.createWriteStream(oszFileName);
    let archive = archiver("zip", {
      zlib: { level: 0 } // Sets the compression level.
    });
    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(output);
    if (archiveCallback)
      archiveCallback(archive);
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
exports.OsuFile = OsuFile;

async function setCS(osuFile, cs) {
  let difficulty = osuFile.getProperty("Version");
  let circleSize = osuFile.getProperty("CircleSize");
  if (parseFloat(circleSize) === cs) {
    throw new Error(`CS is already ${cs}!`);
  }
  // Required to fix older file formats
  if (!Number.isInteger(cs) && osuFile.getVersion() < 13)
    osuFile.setVersion(13);
  osuFile.setProperty("Version", `${difficulty} CS${cs}`);
  osuFile.setProperty("BeatmapID", 0);
  osuFile.setProperty("CircleSize", cs);
  osuFile.appendToDiffName(`CS${cs}`);
  return osuFile;
}
exports.setCS = setCS;

async function setAR(osuFile, ar) {
  let difficulty = osuFile.getProperty("Version");
  let approachRate = osuFile.getProperty("ApproachRate");
  if (!approachRate) {
    // For older map without AR, insert AR after OD.
    let odIndex = osuFile.lines.findIndex(e => e.startsWith("OverallDifficulty"));
    osuFile.lines.splice(odIndex + 1, 0, `ApproachRate:-1`);
    approachRate = -1;
  }
  if (parseFloat(approachRate) === ar) {
    throw new Error(`AR is already ${ar}!`);
  }
  // Required to fix older file formats
  if (!Number.isInteger(ar) && osuFile.getVersion() < 13)
    osuFile.setVersion(13);
  osuFile.setProperty("Version", `${difficulty} AR${ar}`);
  osuFile.setProperty("BeatmapID", 0);
  osuFile.setProperty("ApproachRate", ar);
  osuFile.appendToDiffName(`AR${ar}`);
  return osuFile;
}
exports.setAR = setAR;

async function setOD(osuFile, od) {
  let difficulty = osuFile.getProperty("Version");
  let overallDifficulty = osuFile.getProperty("OverallDifficulty");
  if (parseFloat(overallDifficulty) === od) {
    throw new Error(`OD is already ${od}!`);
  }
  // Required to fix older file formats
  if (!Number.isInteger(od) && osuFile.getVersion() < 13)
    osuFile.setVersion(13);
  osuFile.setProperty("Version", `${difficulty} OD${od}`);
  osuFile.setProperty("BeatmapID", 0);
  osuFile.setProperty("OverallDifficulty", od);
  osuFile.appendToDiffName(`OD${od}`);
  return osuFile;
}
exports.setOD = setOD;

async function setHP(osuFile, hp) {
  let difficulty = osuFile.getProperty("Version");
  let hpDrainRate = osuFile.getProperty("HPDrainRate");
  if (parseFloat(hpDrainRate) === hp) {
    throw new Error(`HP is already ${hp}!`);
  }
  // Required to fix older file formats
  if (!Number.isInteger(hp) && osuFile.getVersion() < 13)
    osuFile.setVersion(13);
  osuFile.setProperty("Version", `${difficulty} HP${hp}`);
  osuFile.setProperty("BeatmapID", 0);
  osuFile.setProperty("HPDrainRate", hp);
  osuFile.appendToDiffName(`HP${hp}`);
  return osuFile;
}
exports.setHP = setHP;

/**
 * Scales the timing of entries in the osu file to the rate.
 * @param {OsuFile} osuFile
 * @param {number} rate
 */
async function setRate(osuFile, rate) {
  let difficulty = osuFile.getProperty("Version");
  let previewTime = parseInt(osuFile.getProperty("PreviewTime"));
  let sliderMultiplier = parseFloat(osuFile.getProperty("SliderMultiplier"));
  osuFile.setProperty("Version", `${difficulty} ${rate}x`);
  osuFile.setProperty("PreviewTime", Math.round(previewTime / rate));
  osuFile.setProperty("BeatmapID", 0);
  let breaksIndex = osuFile.lines.findIndex(e => e.startsWith("//Break Periods"));
  let breaksEndIndex = osuFile.lines.findIndex(e => e.startsWith("//Storyboard Layer 0"));

  osuFile.lines = osuFile.lines.map((l, index) => {
    if (l.trim() !== "") {
      // is a break
      if ((index > breaksIndex && index < breaksEndIndex)) {
        let [n, start, end] = l.split(",");
        return [n, Math.round(parseInt(start) / rate), Math.round(parseInt(end) / rate)].join(",");
      }
    }
    return l;
  });

  let timingPoints = osuFile.getTimingPoints();
  for (let point of timingPoints) {
    if (point.msPerBeat > 0) {
      point.msPerBeat = point.msPerBeat / rate;
    }
    point.offset = point.offset / rate;
  };
  osuFile.setTimingPoints(timingPoints);

  let hitObjects = osuFile.getHitObjects();
  for (let object of hitObjects) {
    if (object instanceof Spinner || object instanceof HoldNote) {
      object.endTime = Math.round(object.endTime / rate);
    }
    object.time = Math.round(object.time / rate);
  }
  osuFile.setHitObjects(hitObjects);

  osuFile.appendToDiffName(`${rate}x`);
  return osuFile;
}
exports.setRate = setRate;

/**
 * Splits the hit objects of a file by bookmarks.
 * @param {OsuFile} osuFile
 */
async function splitByBookmarks(osuFile) {
  let difficulty = osuFile.getProperty("Version");
  if (!difficulty.includes("(Split)")) {
    throw new Error("The map is not marked for split.");
  }
  difficulty = `${difficulty.split("(Split)")[0]}`;
  const bookmarks = (osuFile.getProperty("Bookmarks") || "")
    .split(",")
    .filter(e => (e.trim().length > 0))
    .map(e => parseInt(e));
  if (bookmarks.length == 0) {
    throw new Error("No bookmarks set!.");
  }
  const sections = [0, ...bookmarks.sort((a, b) => (a - b)), Infinity];
  const hitObjectsIndex = osuFile.lines.findIndex(e => e.startsWith("[HitObjects]"));
  const files = [];
  for (let i = 1; i < sections.length; i++) {
    const start = sections[i - 1];
    const end = sections[i];
    const sectionFile = osuFile.clone();
    sectionFile.setProperty("Version", `${difficulty} (${i}/${sections.length - 1})`);
    sectionFile.setProperty("BeatmapID", 0);
    sectionFile.appendToDiffName(i);
    sectionFile.lines = sectionFile.lines.filter((line, index) => {
      if (index > hitObjectsIndex) {
        let [x, y, time, ...rest] = line.split(",");
        time = parseInt(time);
        return (start <= time && time <= end);
      }
      else {
        return true;
      }
    });
    files.push(sectionFile);
  }
  return files;
}
exports.splitByBookmarks = splitByBookmarks;

/**
 * Adds invisible spinners of combo to the beginning of the osu file.
 * @param {OsuFile} osuFile
 * @param {number} combo
 */
async function addCombo(osuFile, combo = 100) {
  let addCombo = combo;
  let oldComboMatch = osuFile.getProperty("Version").match(/\s[+][0-9]+x/);
  let oldCombo;
  if (oldComboMatch) {
    oldCombo = parseInt(oldComboMatch[0]);
    combo = oldCombo + addCombo;
    osuFile.setProperty("Version", osuFile.getProperty("Version").replace(/\s[+][0-9]+x/, ""));
    osuFile.filename = osuFile.filename.replace(/\s[+][0-9]+x/, "");
  }
  osuFile.setProperty("Version", `${osuFile.getProperty("Version")} +${combo}x`);
  osuFile.setProperty("BeatmapID", 0);

  let hitObjects = osuFile.getHitObjects();
  let firstObject = hitObjects[0];

  let spinnerTime = oldCombo ? firstObject.time : firstObject.time - 1000;
  let spinners = [];
  for (let i = 0; i < addCombo; i++) {
    hitObjects.push(new Spinner(256, 192, spinnerTime, 12, 0, spinnerTime, "0:0:0:0:"));
  }

  osuFile.setHitObjects(hitObjects);

  if (!oldCombo) {
    let timingPoints = osuFile.getTimingPoints();
    let lastTimingPoint = osuFile.getTimingPointAt(firstObject.time);

    let silentPoint = lastTimingPoint.clone();
    silentPoint.offset = spinnerTime;
    silentPoint.volume = 0;
    if (lastTimingPoint.inherited && lastTimingPoint.offset !== timingPoints[0].offset) {
      silentPoint.msPerBeat = -100;
      silentPoint.inherited = 0;
    }
    timingPoints.push(silentPoint);

    if (lastTimingPoint.offset < firstObject.time) {
      let startPoint = lastTimingPoint.clone();
      startPoint.offset = firstObject.time;
      if (lastTimingPoint.inherited && lastTimingPoint.offset !== timingPoints[0].offset) {
        startPoint.msPerBeat = -100;
        startPoint.inherited = 0;
      }
      timingPoints.push(startPoint);
    }

    osuFile.setTimingPoints(timingPoints)
  }
  osuFile.appendToDiffName(`+${combo}x`);
  return osuFile;
}
exports.addCombo = addCombo;

/**
 * Removes SVs from an osu file.
 * @param {OsuFile} osuFile
 */
async function removeSVs(osuFile) {
  if (osuFile.getProperty("Version").includes("No SVs")) {
    throw new Error("Map already has no SVs!");
  }
  osuFile.setProperty("Version", `${osuFile.getProperty("Version")} No SVs`);
  osuFile.setProperty("BeatmapID", 0);

  let mainBpm = osuFile.getMainBPM();
  let currentBpm = mainBpm;

  let timingPoints = osuFile.getTimingPoints();
  timingPoints.forEach((point) => {
    const bpm = 60000 / point.msPerBeat;
    if (point.msPerBeat < 0) {
      point.msPerBeat = -100 * currentBpm / mainBpm;
    }
    else {
      currentBpm = bpm;
      let newPoint = point.clone()
      newPoint.inherited = 0;
      newPoint.msPerBeat = -100 * currentBpm / mainBpm;
      timingPoints.push(newPoint);
    }
  });
  osuFile.setTimingPoints(timingPoints);
  osuFile.appendToDiffName("No SVs");
  return osuFile;
}
exports.removeSVs = removeSVs;

/**
 * Replaces mania hold notes with hit circles in an osu file.
 * @param {OsuFile} osuFile
 */
async function removeLNs(osuFile) {
  if (osuFile.getProperty("Version").includes("No LNs")) {
    throw new Error("Map already has no LNs!");
  }
  osuFile.setProperty("Version", `${osuFile.getProperty("Version")} No LNs`);
  osuFile.setProperty("BeatmapID", 0);
  let hitObjectsIndex = osuFile.lines.findIndex(e => e.startsWith("[HitObjects]"));
  osuFile.setHitObjects(osuFile.getHitObjects().map(object => {
    if (object instanceof HoldNote) {
      let { x, y, time, type, hitSound, extras } = object;
      return new HitCircle(x, y, time, type & ~128 | 1, hitSound, extras);
    }
    return object
  }));
  osuFile.appendToDiffName("No LNs");
  return osuFile;
}
exports.removeLNs = removeLNs;
