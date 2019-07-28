class HitObject {
  static fromString(str) {
    const [x, y, time, type, hitSound, ...rest] = str.split(",");
    if (type & 1) {
      return new HitCircle(
        parseInt(x),
        parseInt(y),
        parseInt(time),
        parseInt(type),
        parseInt(hitSound),
        ...rest);
    } else if (type & 2) {
      const [typeAndPoints, repeat, pixelLength, edgeHitsounds, edgeAdditions, extras] = rest;
      const [sliderType, ...curvePoints] = typeAndPoints.split("|");
      return new Slider(parseInt(x),
        parseInt(y),
        parseInt(time),
        parseInt(type),
        parseInt(hitSound),
        sliderType,
        curvePoints,
        parseInt(repeat),
        parseFloat(pixelLength),
        edgeHitsounds,
        edgeAdditions,
        extras
      )
    } else if (type & 8) {
      const [endTime, extras] = rest;
      return new Spinner(
        parseInt(x),
        parseInt(y),
        parseInt(time),
        parseInt(type),
        parseInt(hitSound),
        parseInt(endTime),
        extras);
    } else if (type & 128) {
      const [endTime, ...extras] = rest[0].split(":");
      return new HoldNote(
        parseInt(x),
        parseInt(y),
        parseInt(time),
        parseInt(type),
        parseInt(hitSound),
        parseInt(endTime),
        extras.join(":"));
    } else {
      throw new Error("Could not determine hitobject type");
    }
  }

  constructor(x = 256, y = 192, time = 0, type = 1, hitSound = 0, extras = "0:0:0:0:") {
    this.x = x;
    this.y = y;
    this.time = time;
    this.type = type;
    this.hitSound = hitSound;
    this.extras = extras;
  }

  toString() {
    return [
      this.x,
      this.y,
      this.time,
      this.type,
      this.hitSound,
      this.extras,
    ].join(",");
  }
}
exports.HitObject = HitObject;

class HitCircle extends HitObject {
  constructor(x = 256, y = 192, time = 0, type = 1, hitSound = 0, extras = "0:0:0:0:") {
    super(x, y, time, type, hitSound, extras);
  }
}
exports.HitCircle = HitCircle;


class Slider extends HitObject {
  constructor(x = 256, y = 192, time = 0, type = 2, hitSound = 0, sliderType = "L",
    curvePoints = ["256:193"], repeat = 0, pixelLength = 1, edgeHitsounds = "",
    edgeAdditions = "", extras = "") {
    // TODO: default value for edgeHitsounds
    super(x, y, time, type, hitSound, extras);
    this.sliderType = sliderType;
    this.curvePoints = curvePoints;
    this.repeat = repeat;
    this.pixelLength = pixelLength;
    this.edgeHitsounds = edgeHitsounds;
    this.edgeAdditions = edgeAdditions;
  }

  toString() {
    let arr = [
      this.x,
      this.y,
      this.time,
      this.type,
      this.hitSound,
      [this.sliderType, ...(this.curvePoints)].join("|"),
      this.repeat,
      this.pixelLength,
    ]
    if (this.edgeHitsounds) arr.push(this.edgeHitsounds);
    if (this.edgeAdditions) arr.push(this.edgeAdditions);
    if (this.extras) arr.push(this.extras);
    return arr.join(",");
  }
}
exports.Slider = Slider;

class Spinner extends HitObject {
  constructor(x = 256, y = 192, time = 0, type = 8, hitSound = 0, endTime = 0, extras = "0:0:0:0:") {
    super(x, y, time, type, hitSound, extras);
    this.endTime = endTime;
  }
  toString() {
    return [
      this.x,
      this.y,
      this.time,
      this.type,
      this.hitSound,
      this.endTime,
      this.extras,
    ].join(",");
  }
}
exports.Spinner = Spinner;

class HoldNote extends HitObject {
  constructor(x = 256, y = 192, time = 0, type = 128, hitSound = 0, endTime = 0, extras = "0:0:0:0:") {
    super(x, y, time, type, hitSound, extras);
    this.endTime = endTime;
  }
  toString() {
    return [
      this.x,
      this.y,
      this.time,
      this.type,
      this.hitSound,
      `${this.endTime}:${this.extras}`,
    ].join(",");
  }
}
exports.HoldNote = HoldNote;
