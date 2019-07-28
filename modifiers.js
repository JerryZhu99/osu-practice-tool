const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const remote = require("electron").remote;

const { log, setCurrentFile, setStatus } = require("./renderer");
const {
  OsuFile,
  setCS, setAR, setOD, setHP,
  setRate, splitByBookmarks,
  addCombo, removeSVs, removeLNs
} = require("./osufile");

const settings = require("./settings");

async function generateMp3WithRate(filename, rate) {
  const tempFilename = path.join(remote.app.getPath("temp"), `${Date.now()}-${Math.random()}.mp3`);
  const args = ["-y",
    "-i",
    `"${filename}"`,
    "-filter:a",
    settings.get("pitchShift") ? `"aresample=192k/${rate},asetrate=192k"` : `"atempo=${rate}"`,
    "-vn",
    `"${tempFilename}"`];
  let ffmpeg = spawn(ffmpegPath, args, { windowsVerbatimArguments: true });
  ffmpeg
    .stderr
    .on("data", (err) => {
      log(new String(err));
    });
  let statusCode = await new Promise((resolve) => ffmpeg.on("exit", resolve));
  if (statusCode === 0) {
    return tempFilename;
  }
  else {
    throw new Error("An error occured in ffmpeg");
  }
}

async function generateOszWithFunction(osupath, fn, ...args) {
  try {
    setStatus("Reading .osu file...", 1);
    let osuFile = await OsuFile.fromFile(osupath);
    setStatus("Processing .osu file...");
    await fn(osuFile, ...args);
    setStatus("Generating .osu file...");
    await osuFile.generateOsu();
    setStatus("Done!", -1);
    log("Done!");
  }
  catch (e) {
    setStatus("An error occurred.", -1);
    log(e);
  }
}

async function generateOszWithCS(osupath, cs = 0) {
  log(`Generating CS${cs} edit for ${osupath}`);
  return generateOszWithFunction(osupath, setCS, cs);
}

async function generateOszWithAR(osupath, ar = 0) {
  log(`Generating AR${ar} edit for ${osupath}`);
  return generateOszWithFunction(osupath, setAR, ar);
}

async function generateOszWithOD(osupath, od = 0) {
  log(`Generating OD${od} edit for ${osupath}`);
  return generateOszWithFunction(osupath, setOD, od);
}

async function generateOszWithHP(osupath, hp = 0) {
  log(`Generating HP${hp} edit for ${osupath}`);
  return generateOszWithFunction(osupath, setHP, hp);
}

async function generateOszWithRate(osupath, rate) {
  log(`Generating ${rate}x edit for ${osupath}`);

  try {
    setStatus("Reading .osu file...", 1);
    let osuFile = await OsuFile.fromFile(osupath);

    setStatus("Processing .osu file...");
    await setRate(osuFile, rate);

    setStatus("Gnerating modified .mp3 file")
    let audioFilename = osuFile.getProperty("AudioFilename");
    let { songsDirectory, dirname } = osuFile;
    let audioFilePath = path.join(songsDirectory, dirname, audioFilename);
    let tempFilename = await generateMp3WithRate(audioFilePath, rate);

    setStatus("Generating .osz file...")

    const archiveCallback = (archive) => {
      archive.file(tempFilename, { name: audioFilename });
      archive.glob("*.png", { cwd: path.join(songsDirectory, dirname) });
      archive.glob("*.jpg", { cwd: path.join(songsDirectory, dirname) });
    }

    osuFile.dirname = `${dirname} ${rate}`;
    await osuFile.generateOsz(archiveCallback);

    fs.unlinkSync(tempFilename);
    setStatus("Done!", -1)
    log("Done!");
  } catch (e) {
    setStatus("An error occurred.", -1);
    log(e);
  }
}

async function generateOszWithCopy(osupath) {
  log(`Generating copy for ${osupath}`);
  try {
    setStatus("Reading .osu file...", 1);
    let osuFile = await OsuFile.fromFile(osupath);

    setStatus("Processing .osu file...");

    let difficulty = osuFile.getProperty("Version");
    osuFile.setProperty("Version", `${difficulty} (Copy)`);
    osuFile.setProperty("BeatmapID", 0);

    osuFile.appendToDiffName(`(Copy)`);

    setStatus("Generating .osz file...")

    const { songsDirectory, dirname } = osuFile;

    const archiveCallback = (archive) => {
      archive.glob("*.mp3", { cwd: path.join(songsDirectory, dirname) });
      archive.glob("*.png", { cwd: path.join(songsDirectory, dirname) });
      archive.glob("*.jpg", { cwd: path.join(songsDirectory, dirname) });
    }

    osuFile.dirname = `${osuFile.dirname} Copy`;
    await osuFile.generateOsz(archiveCallback);
    setStatus("Done!", -1);
  } catch (e) {
    setStatus("An error occurred.", -1);
    log(e);
  }
}

async function generateOszWithSplit(osupath) {
  log(`Generating split for ${osupath}`);
  try {
    setStatus("Reading .osu file...", 1);
    let osuFile = await OsuFile.fromFile(osupath);
    setStatus("Processing .osu file...");
    let sectionFiles = await splitByBookmarks(osuFile);
    setStatus("Generating .osu files...");
    await Promise.all(sectionFiles.map(file => file.generateOsu()));
    setStatus("Done!", -1);
  } catch (e) {
    setStatus("An error occurred.", -1);
    log(e);
  }
}

async function generateOszWithCombo(osupath, combo = 100) {
  log(`Generating +${combo} combo edit for ${osupath}`);
  generateOszWithFunction(osupath, addCombo, combo);
}

async function generateOszWithNoSVs(osupath) {
  log(`Generating No SVs edit for ${osupath}`);
  generateOszWithFunction(osupath, removeSVs);
}

async function generateOszWithNoLNs(osupath) {
  log(`Generating No LNs edit for ${osupath}`);
  generateOszWithFunction(osupath, removeLNs);
}


module.exports = {
  generateOszWithCS,
  generateOszWithAR,
  generateOszWithOD,
  generateOszWithHP,
  generateOszWithRate,
  generateOszWithCopy,
  generateOszWithSplit,
  generateOszWithCombo,
  generateOszWithNoSVs,
  generateOszWithNoLNs,
}
