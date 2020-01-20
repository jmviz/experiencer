var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioCtx = new AudioContext();

var compressor = audioCtx.createDynamicsCompressor();
compressor.threshold.setValueAtTime(0, audioCtx.currentTime);
compressor.knee.setValueAtTime(9, audioCtx.currentTime);
compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
compressor.attack.setValueAtTime(0.01, audioCtx.currentTime);
compressor.release.setValueAtTime(0.02, audioCtx.currentTime);
compressor.connect(audioCtx.destination);

function equalPowerCurve(x) {
  return Math.cos(x * 0.5 * Math.PI);
}

var upEqualPowerCurve = Array(101).fill(0).map((x, y) => equalPowerCurve(1 - (x + y * 0.01)));
var downEqualPowerCurve = Array(101).fill(0).map((x, y) => equalPowerCurve(x + y * 0.01));
var incomingLowpass = false;
var filterInCurve, filterOutCurve;
if (incomingLowpass) {
  filterInCurve = Array(101).fill(0).map((x, y) => 300 + (20000 - 300) * (x + y * 0.01));
  filterOutCurve = Array(101).fill(0).map((x, y) => 1000 * (x + y * 0.01));
} else {
  filterInCurve = Array(101).fill(0).map((x, y) => 1000 * (1 - (x + y * 0.01)));
  filterOutCurve = Array(101).fill(0).map((x, y) => 300 + (20000 - 300) * (1 - (x + y * 0.01)));
}

class Mixer {
  constructor(id, type, activeTrack, inactiveTrack, transDur = 7.5) {
    this.type = type;
    if (type == "video") {
      activeTrack.media.style.transition = `filter ${transDur}s`;
      inactiveTrack.media.style.transition = `filter ${transDur}s`;
    }
    this.transDur = transDur; // seconds
    this.transRes = 0.05; // seconds
    this.isTransitioning = false;
    this.activeTrack = activeTrack;
    this.activeTrack.media.addEventListener("timeupdate", () => this.updateSeekBar(), false);
    this.activeTrack.media.addEventListener("durationchange", () => this.seekSetup(), false);
    this.inactiveTrack = inactiveTrack;
    this.playlist = new Playlist(type);
    this.vol = audioCtx.createGain();
    activeTrack.out.connect(this.vol);
    inactiveTrack.out.connect(this.vol);
    this.vol.connect(compressor);
    this.browser = document.querySelector("#" + id + " .control.browser");
    this.browser.addEventListener("change", () => this.initiatePlaylist(this.browser.files), false);
    this.playButton = document.querySelector("#" + id + " .control.play");
    this.playButton.addEventListener("click", () => this.togglePlayButton(), false);
    this.seekBar = document.querySelector("#" + id + " .control.seek");
    this.seekBar.addEventListener("input", () => this.seek(), false);
    this.seekTime = document.querySelector("#" + id + " .time.current");
    this.seekDuration = document.querySelector("#" + id + " .time.duration");
    this.skipButton = document.querySelector("#" + id + " .control.skip");
    this.skipButton.addEventListener("click", () => this.transition(), false);
    this.volBar = document.querySelector("#" + id + " .control.vol");
    this.volBar.addEventListener("input", () => this.setVol(this.volBar.value), false);
  }
  initiatePlaylist(files) {
    this.playlist.clear();
    this.playlist.read(files);
    this.change(this.activeTrack);
    this.change(this.inactiveTrack);
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
  seekSetup() {
    this.seekBar.max = this.activeTrack.media.duration;
  }
  seek() {
    this.isSeeking = true;
    this.activeTrack.media.currentTime = this.seekBar.value;
    this.isSeeking = false;
  }
  updateSeekBar() {
    if (!this.isSeeking) {
      this.seekBar.value = this.activeTrack.media.currentTime;
    }
    this.seekTime.innerHTML = this.activeTrack.currentTimeString();
    this.seekDuration.innerHTML = this.activeTrack.durationString();
  }
  transition() {
    if (this.isTransitioning) return;
    clearInterval(this.activeTrackEndChecker);
    this.isTransitioning = true;
    this.swapActiveTrack();
    this.activeTrack.play();
    this.activeTrackEndChecker = setInterval(this.checkForActiveTrackEnd.bind(this), 1000 * this.transRes);
    this.activeTrack.out.gain.setValueCurveAtTime(upEqualPowerCurve, audioCtx.currentTime, this.transDur);
    this.inactiveTrack.out.gain.setValueCurveAtTime(downEqualPowerCurve, audioCtx.currentTime, this.transDur);
    if (incomingLowpass) {
      this.activeTrack.highpassFilter.frequency.setValueAtTime(0, audioCtx.currentTime);
      this.activeTrack.lowpassFilter.frequency.setValueCurveAtTime(filterInCurve, audioCtx.currentTime, this.transDur);
      this.inactiveTrack.highpassFilter.frequency.setValueCurveAtTime(filterOutCurve, audioCtx.currentTime, this.transDur);
    } else {
      this.activeTrack.lowpassFilter.frequency.setValueAtTime(22000, audioCtx.currentTime);
      this.activeTrack.highpassFilter.frequency.setValueCurveAtTime(filterInCurve, audioCtx.currentTime, this.transDur);
      this.inactiveTrack.lowpassFilter.frequency.setValueCurveAtTime(filterOutCurve, audioCtx.currentTime, this.transDur);
    }
    if (this.type == "video") {
      this.inactiveTrack.media.style.filter = `opacity(0%)`;
      this.activeTrack.media.style.filter = `opacity(100%)`;
    }
    setTimeout(this.change.bind(this), 1000 * this.transDur, this.inactiveTrack);
  }
  swapActiveTrack() {
    let temp = this.activeTrack;
    this.activeTrack = this.inactiveTrack;
    this.inactiveTrack = temp;
    this.inactiveTrack.media.removeEventListener("timeupdate", () => this.updateSeekBar(), false);
    this.inactiveTrack.media.removeEventListener("durationchange", () => this.seekSetup(), false);
    this.activeTrack.media.addEventListener("timeupdate", () => this.updateSeekBar(), false);
    this.activeTrack.media.addEventListener("durationchange", () => this.seekSetup(), false);
  }
  checkForActiveTrackEnd() {
    let media = this.activeTrack.media;
    let timeLeft = media.duration - media.currentTime;
    if (timeLeft <= this.transDur + this.transRes) this.transition();
  }
  change(track) {
    this.isTransitioning = false;
    track.media.src = this.playlist.next();
  }
  setVol(v) {
    this.vol.gain.value = v;
  }
  play() {
    this.activeTrack.play();
    if (this.isTransitioning) this.inactiveTrack.play();
  }
  pause() {
    this.activeTrack.pause();
    if (this.isTransitioning) this.inactiveTrack.pause();
  }
}

class Playlist {
  constructor(type, files) {
    this.type = type;
    this.urls = [];
    this.i = 0;
    if (files) this.read(files);
  }
  read(files) {
    for (let file of files) {
      let re = (this.type == "audio") ? /^audio\// : /^video\//;
      if (re.test(file.type)) {
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
  constructor(media) {
    this.media = media;
    this.source = audioCtx.createMediaElementSource(media);
    this.highpassFilter = audioCtx.createBiquadFilter();
    this.highpassFilter.type = "highpass";
    this.highpassFilter.frequency.setValueAtTime(0, audioCtx.currentTime);
    this.source.connect(this.highpassFilter);
    this.highpassFilterDryWet = new Xfade(this.source, this.highpassFilter, 1);
    this.lowpassFilter = audioCtx.createBiquadFilter();
    this.lowpassFilter.type = "lowpass";
    this.lowpassFilter.frequency.setValueAtTime(22000, audioCtx.currentTime);
    this.highpassFilterDryWet.connect(this.lowpassFilter);
    this.lowpassFilterDryWet = new Xfade(this.highpassFilterDryWet, this.lowpassFilter, 1);
    this.delay = audioCtx.createDelay();
    this.delay.delayTime.setValueAtTime(0.5, audioCtx.currentTime);
    this.delayFeedback = audioCtx.createGain();
    this.delayFeedback.gain.value = 0.4;
    this.delayFilter = audioCtx.createBiquadFilter();
    this.delayFilter.frequency.value = 1000;
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayFilter);
    this.delayFilter.connect(this.delay);
    this.lowpassFilterDryWet.connect(this.delay);
    this.delayDryWet = new Xfade(this.lowpassFilterDryWet, this.delay, 0);
    this.out = audioCtx.createGain();
    this.delayDryWet.connect(this.out);
  }
  play() {
    this.media.play();
  }
  pause() {
    this.media.pause();
  }
  secondsToString(s) {
    let padTime = t => t < 10 ? "0" + t : t;
    if (typeof s !== "number") return "";
    if (s < 0) s = Math.abs(s);
    let hours = Math.floor(s / 3600);
    let minutes = Math.floor((s % 3600) / 60);
    let seconds = Math.floor(s % 60);
    let hour = hours > 0 ? padTime(hours) + ":" : "";
    return hour + padTime(minutes) + ":" + padTime(seconds);
  }
  currentTimeString() {
    return this.secondsToString(this.media.currentTime);
  }
  durationString() {
    return this.secondsToString(this.media.duration);
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
    this.aGain.gain.setValueCurveAtTime(upEqualPowerCurve, time, duration);
    this.bGain.gain.setValueCurveAtTime(downEqualPowerCurve, time, duration);
  }
  fadeToB(duration = 20, time = audioCtx.currentTime) {
    this.aGain.gain.setValueCurveAtTime(downEqualPowerCurve, time, duration);
    this.bGain.gain.setValueCurveAtTime(upEqualPowerCurve, time, duration);
  }
  connect(node) {
    this.aGain.connect(node);
    this.bGain.connect(node);
  }
}

mixer0 = new Mixer("mixer0", "audio",
  new Track(document.querySelector("#mixer0 audio.active")),
  new Track(document.querySelector("#mixer0 audio.inactive"))
);

mixer1 = new Mixer("mixer1", "audio",
  new Track(document.querySelector("#mixer1 audio.active")),
  new Track(document.querySelector("#mixer1 audio.inactive"))
);

mixer2 = new Mixer("mixer2", "video",
  new Track(document.querySelector("video.active")),
  new Track(document.querySelector("video.inactive"))
);

class ControlsUI {
  constructor(id) {
    this.div = document.getElementById(id);
    this.controlsFadeOut = null;
    this.cursorHide = null;
    this.controlsHide = null;
    document.onmousemove = () => {
      this.div.style.opacity = 1;
      document.body.style.cursor = "auto";
      this.div.classList.remove("hidden");
      clearTimeout(this.controlsFadeOut);
      clearTimeout(this.cursorHide);
      clearTimeout(this.controlsHide);
      this.controlsFadeOut = setTimeout(
        () => {
          this.div.style.opacity = 0;
        }, 2000);
      this.controlsHide = setTimeout(
        () => {
          this.div.classList.add("hidden");
          document.body.style.cursor = "none";
        }, 4000);
      this.cursorHide = setTimeout(
        () => {
          document.body.style.cursor = "none";
        }, 4100);
    };
  }
}

controls = new ControlsUI("control-container");
