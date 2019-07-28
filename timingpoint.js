class TimingPoint {
  static fromString(str) {
    let [offset, msPerBeat, meter, set, index, volume, inherited, kiai] = str.split(",");
    return new TimingPoint(
      parseFloat(offset),
      parseFloat(msPerBeat),
      parseInt(meter),
      parseInt(set),
      parseInt(index),
      parseInt(volume),
      parseInt(inherited),
      parseInt(kiai));
  }

  constructor(offset = 0, msPerBeat = 1000, meter = 4, set = 0, index = 0, volume = 100, inherited = 0, kiai = 0) {
    this.offset = offset;
    this.msPerBeat = msPerBeat;
    this.meter = meter;
    this.set = set;
    this.index = index;
    this.volume = volume;
    this.inherited = inherited;
    this.kiai = kiai;
  }

  toString() {
    return [
      this.offset,
      this.msPerBeat,
      this.meter,
      this.set,
      this.index,
      this.volume,
      this.inherited,
      this.kiai
    ].join(",");
  }

  clone() {
    return new TimingPoint(
      this.offset,
      this.msPerBeat,
      this.meter,
      this.set,
      this.index,
      this.volume,
      this.inherited,
      this.kiai,
    )
  }
}
exports.TimingPoint = TimingPoint;
