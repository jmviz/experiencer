var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioCtx = new AudioContext();

function equalPowerCurve(x) {
  return Math.cos(x * 0.5 * Math.PI);
}

var upCurve = Array(101).fill(0).map((x, y) => equalPowerCurve(1 - (x + y * 0.01)));
var downCurve = Array(101).fill(0).map((x, y) => equalPowerCurve(x + y * 0.01));

class Mixer {
  constructor(id, trackA, trackB) {
    this.transDur = 20; // seconds
    this.transRes = 0.05; // seconds
    this.isTransitioning = false;
    this.activeTrack = this.trackA = trackA;
    this.unactiveTrack = this.trackB = trackB;
    this.xfade = new Xfade(trackA.out, trackB.out, 0);
    this.playlist = new Playlist();
    this.vol = audioCtx.createGain();
    this.xfade.connect(this.vol);
    this.vol.connect(audioCtx.destination);
    this.browser = document.querySelector("#" + id + " .control.browser");
    this.browser.addEventListener("change", () => this.initiatePlaylist(this.browser.files), false);
    this.playButton = document.querySelector("#" + id + " .control.play");
    this.playButton.addEventListener("click", () => this.togglePlayButton(), false);
    this.skipButton = document.querySelector("#" + id + " .control.skip");
    this.skipButton.addEventListener("click", () => this.transition(), false);
    this.volSlider = document.querySelector("#" + id + " .control.vol");
    this.volSlider.addEventListener("input", () => this.setVol(this.volSlider.value), false);
  }
  initiatePlaylist(files) {
    this.playlist.clear();
    this.playlist.read(files);
    this.change(this.trackA);
    this.change(this.trackB);
  }
  togglePlayButton() {
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    if (this.playButton.dataset.playing === "false") {
      this.play();
      this.activeTrackEndChecker = setInterval(this.checkForActiveTrackEnd.bind(this), 1000 * this.transRes);
      this.playButton.dataset.playing = "true";
    } else if (this.playButton.dataset.playing === "true") {
      this.pause();
      this.playButton.dataset.playing = "false";
    }
  }
  transition() {
    if (this.isTransitioning) return;
    clearInterval(this.activeTrackEndChecker);
    this.isTransitioning = true;
    this.swapActiveTrack();
    this.activeTrack.play();
    this.activeTrackEndChecker = setInterval(this.checkForActiveTrackEnd.bind(this), 1000 * this.transRes);
    if (this.activeTrack == this.trackA) {
      this.xfade.fadeToA(this.transDur);
    } else {
      this.xfade.fadeToB(this.transDur);
    }
    setTimeout(this.change.bind(this), 1000 * this.transDur, this.unactiveTrack);
  }
  swapActiveTrack() {
    let temp = this.activeTrack;
    this.activeTrack = this.unactiveTrack;
    this.unactiveTrack = temp;
  }
  checkForActiveTrackEnd() {
    let audio = this.activeTrack.audio;
    let timeLeft = audio.duration - audio.currentTime;
    if (timeLeft <= this.transDur + this.transRes) this.transition();
  }
  change(track) {
    this.isTransitioning = false;
    track.audio.src = this.playlist.next();
  }
  setVol(v) {
    this.vol.gain.value = v;
  }
  play() {
    this.activeTrack.play();
    if (this.isTransitioning) this.unactiveTrack.play();
  }
  pause() {
    this.activeTrack.pause();
    if (this.isTransitioning) this.unactiveTrack.pause();
  }
}

class Playlist {
  constructor(files) {
    this.urls = [];
    this.i = 0;
    if (files) this.read(files);
  }
  read(files) {
    for (let file of files) {
      if (/^audio/.test(file.type)) {
        this.urls.push(URL.createObjectURL(file));
      }
    }
  }
  clear() {
    for (let url of this.urls) {
      URL.revokeObjectURL(url);
    }
    this.urls = [];
  }
  next() {
    let i = this.i;
    this.i = (i + 1) % this.urls.length;
    return this.urls[i];
  }
}

class Track {
  constructor(audio) {
    this.audio = audio;
    this.source = audioCtx.createMediaElementSource(audio);
    this.filter = audioCtx.createBiquadFilter();
    this.source.connect(this.filter);
    this.filterDryWet = new Xfade(this.source, this.filter, 0);
    this.delay = audioCtx.createDelay();
    this.delay.delayTime.setValueAtTime(0.5, audioCtx.currentTime);
    this.delayFeedback = audioCtx.createGain();
    this.delayFeedback.gain.value = 0.4;
    this.delayFilter = audioCtx.createBiquadFilter();
    this.delayFilter.frequency.value = 1000;
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayFilter);
    this.delayFilter.connect(this.delay);
    this.filterDryWet.connect(this.delay);
    this.delayDryWet = new Xfade(this.filterDryWet, this.delay, 0);
    this.out = audioCtx.createGain();
    this.delayDryWet.connect(this.out);
  }
  play() {
    this.audio.play();
  }
  pause() {
    this.audio.pause();
  }
}

class Xfade {
  constructor(a, b, x = 0) {
    this.a = a;
    this.b = b;
    this.aGain = audioCtx.createGain();
    this.bGain = audioCtx.createGain();
    this.aGain.gain.value = equalPowerCurve(x);
    this.bGain.gain.value = equalPowerCurve(1 - x);
    a.connect(this.aGain);
    b.connect(this.bGain);
  }
  set(x, time = audioCtx.currentTime) {
    this.aGain.gain.setValueAtTime(equalPowerCurve(x), time);
    this.bGain.gain.setValueAtTime(equalPowerCurve(1 - x), time);
  }
  fadeToA(duration = 20, time = audioCtx.currentTime) {
    this.aGain.gain.setValueCurveAtTime(upCurve, time, duration);
    this.bGain.gain.setValueCurveAtTime(downCurve, time, duration);
  }
  fadeToB(duration = 20, time = audioCtx.currentTime) {
    this.aGain.gain.setValueCurveAtTime(downCurve, time, duration);
    this.bGain.gain.setValueCurveAtTime(upCurve, time, duration);
  }
  connect(node) {
    this.aGain.connect(node);
    this.bGain.connect(node);
  }
}

mixer0 = new Mixer("mixer0",
  new Track(document.querySelector("#mixer0 .trackA")),
  new Track(document.querySelector("#mixer0 .trackB"))
);

mixer1 = new Mixer("mixer1",
  new Track(document.querySelector("#mixer1 .trackA")),
  new Track(document.querySelector("#mixer1 .trackB"))
);
