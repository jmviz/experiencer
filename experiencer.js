var jsmediatags = window.jsmediatags;

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
  constructor(id, type, activeTrack, inactiveTrack, transDur = 5, transRes = 0.05) {
    this.type = type;
    this.transDur = transDur; // seconds
    this.transRes = transRes; // seconds
    this.isTransitioning = false;
    this.activeTrack = activeTrack;
    this.activeTrack.mixer = this;
    this.inactiveTrack = inactiveTrack;
    this.inactiveTrack.mixer = this;
    this.playlist = new Playlist(type);
    this.browser = document.querySelector("#" + id + " .control.browser");
    this.browser.addEventListener("change", () => this.initiatePlaylist(this.browser.files), false);
    this.playButton = document.querySelector("#" + id + " .control.play");
    this.playButton.addEventListener("click", () => this.togglePlay(), false);
    this.skipButton = document.querySelector("#" + id + " .control.skip");
    this.skipButton.addEventListener("click", () => this.skip(), false);
    this.speed = 1;
    this.info = document.querySelector("#" + id + " .info");
    if (type != "image") {
      this.activeTrack.media.addEventListener("timeupdate", () => this.updateSeekBar(), false);
      this.activeTrack.media.addEventListener("durationchange", () => this.seekSetup(), false);
      this.vol = audioCtx.createGain();
      activeTrack.out.connect(this.vol);
      inactiveTrack.out.connect(this.vol);
      this.highpassFilter = audioCtx.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.setValueAtTime(0, audioCtx.currentTime);
      this.vol.connect(this.highpassFilter);
      this.highpassFilterDryWet = new Xfade(this.vol, this.highpassFilter, 1);
      this.lowpassFilter = audioCtx.createBiquadFilter();
      this.lowpassFilter.type = "lowpass";
      this.lowpassFilter.frequency.setValueAtTime(22000, audioCtx.currentTime);
      this.highpassFilterDryWet.connect(this.lowpassFilter);
      this.lowpassFilterDryWet = new Xfade(this.highpassFilterDryWet, this.lowpassFilter, 1);
      this.lowpassFilterDryWet.connect(compressor);
      this.seekBar = document.querySelector("#" + id + " .control.seek");
      this.seekBar.addEventListener("input", () => this.seek(), false);
      this.seekTime = document.querySelector("#" + id + " .time.current");
      this.seekDuration = document.querySelector("#" + id + " .time.duration");
      this.muteButton = document.querySelector("#" + id + " .control.mute");
      this.muteButton.addEventListener("click", () => this.toggleMute(), false);
      this.volBar = document.querySelector("#" + id + " .control.vol");
      this.volBar.addEventListener("input", () => this.setVol(this.volBar.value), false);
      this.HPFBar = document.querySelector("#" + id + " .control.HPF");
      this.HPFBar.addEventListener("input", () => this.setHPF(this.HPFBar.value), false);
      this.LPFBar = document.querySelector("#" + id + " .control.LPF");
      this.LPFBar.addEventListener("input", () => this.setLPF(this.LPFBar.value), false);
      this.speedText = document.querySelector("#" + id + " .setting.speed");
      this.speedBar = document.querySelector("#" + id + " .control.rate");
      this.speedBar.addEventListener("input", () => this.setSpeed(this.speedBar.value), false);

    }
    if (type != "audio") {
      activeTrack.media.style.transition = `filter 0s`;
      inactiveTrack.media.style.transition = `filter 0s`;
    }
    if (type == "image") {
      this.dur = document.querySelector("#" + id + " .setting.duration");
      this.durBar = document.querySelector("#" + id + " .control.dur");
      this.durBar.addEventListener("input", () => this.setDur(this.durBar.value), false);
    }
  }
  initiatePlaylist(files) {
    this.disable();
    this.enable();
    if (this.type == "image") {
      videoMixer.disable(true);
    } else if (this.type == "video") {
      imageMixer.disable(true);
    }
    this.playlist.read(files);
    if (this.playlist.items.length > 0) {
      this.activeTrack.change();
      this.updateInfo();
      this.inactiveTrack.change();
    }
    else {
      this.disable();
      window.alert(`No ${this.type} files found. Try a different folder.`);
    }
  }
  enable() {
    this.isDisabled = false;
    if (this.type != "audio") {
      this.activeTrack.media.style.filter = `opacity(100%)`;
      this.inactiveTrack.media.style.filter = `opacity(0%)`;
    }
  }
  disable(clearBrowser) {
    this.isDisabled = true;
    if (this.playButton.dataset.playing === "true") this.togglePlay();
    if (this.type != "audio") {
      this.activeTrack.media.style.filter = `opacity(0%)`;
      this.inactiveTrack.media.style.filter = `opacity(0%)`;
    }
    if (clearBrowser) this.browser.value = "";
    this.playlist.clear();
    clearInterval(this.activeTrackEndChecker);
    if (this.type == "video") {
      this.activeTrack.media.src = "";
      this.inactiveTrack.media.src = "";

    } else if (this.type == "image") {
      this.activeTrack.media.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
      this.inactiveTrack.media.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
    }
  }
  togglePlay() {
    if (this.playlist.items.length == 0) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    if (this.playButton.dataset.playing === "false") {
      this.play();
      if (this.type != "audio") {
        this.activeTrack.media.style.transition = `filter ${this.transDur}s`;
        this.inactiveTrack.media.style.transition = `filter ${this.transDur}s`;
      }
      this.playButton.firstElementChild.innerText = "pause";
      this.activeTrackEndChecker = setInterval(this.checkForActiveTrackEnd.bind(this), 1000 * this.transRes);
      this.playButton.dataset.playing = "true";
    } else if (this.playButton.dataset.playing === "true") {
      this.pause();
      if (this.type != "audio") {
        this.activeTrack.media.style.transition = `filter 0s`;
        this.inactiveTrack.media.style.transition = `filter 0s`;
      }
      this.playButton.firstElementChild.innerText = "play_arrow";
      this.playButton.dataset.playing = "false";
      
    }
  }
  skip() {
    if (this.playlist.items.length == 0) return;
    if (this.playButton.dataset.playing === "true") {
      this.transition();
    } else {
      this.swapActiveTrack();
      if (this.type != "image") {
        this.seekSetup();
        this.updateSeekBar();
      }
      if (this.type != "audio") {
        this.inactiveTrack.media.style.filter = `opacity(0%)`;
        this.activeTrack.media.style.filter = `opacity(100%)`;
      }
      this.inactiveTrack.change();
    }
  }
  toggleMute() {
    if (this.muteButton.dataset.muted === "false") {
      this.volBeforeMute = this.vol.gain.value;
      this.vol.gain.setValueAtTime(0, audioCtx.currentTime);
      this.volBar.value = 0;
      this.muteButton.firstElementChild.innerText = "volume_off";
      this.muteButton.dataset.muted = "true";
    } else if (this.muteButton.dataset.muted === "true") {
      this.vol.gain.setValueAtTime(this.volBeforeMute, audioCtx.currentTime);
      this.volBar.value = this.volBeforeMute;
      this.muteButton.firstElementChild.innerText = "volume_up";
      this.muteButton.dataset.muted = "false";
    }
  }
  setVol(v) {
    if (this.muteButton.dataset.muted === "true") {
      this.muteButton.firstElementChild.innerText = "volume_up";
      this.muteButton.dataset.muted = "false";
    }
    this.vol.gain.setValueAtTime(v, audioCtx.currentTime);
  }
  setHPF(f) {
    this.highpassFilter.frequency.setValueAtTime(2.2 * Math.pow(10, f), audioCtx.currentTime);
  }
  setLPF(f) {
    this.lowpassFilter.frequency.setValueAtTime(2.2 * Math.pow(10, f), audioCtx.currentTime);
  }
  setSpeed(s) {
    this.speed = Math.pow(4, s);
    this.activeTrack.media.playbackRate = this.speed;
    this.inactiveTrack.media.playbackRate = this.speed;
    this.activeTrack.media.defaultPlaybackRate = this.speed;
    this.inactiveTrack.media.defaultPlaybackRate = this.speed;
    this.speedText.innerHTML = this.speed.toFixed(2) + "x";
  }
  setDur(s) {
    this.activeTrack.media.duration = s;
    this.inactiveTrack.media.duration = s;
    let pad = "&nbsp;".repeat(2 - Math.floor(Math.log10(s)));
    this.dur.innerHTML = pad + s.toString() + "s";
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
    if (this.type != "image") {
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
    } 
    if (this.type != "audio") {
      this.inactiveTrack.media.style.filter = `opacity(0%)`;
      this.activeTrack.media.style.filter = `opacity(100%)`;
    }
    setTimeout(this.endTransition.bind(this), 1000 * this.transDur);
  }
  swapActiveTrack() {
    let temp = this.activeTrack;
    this.activeTrack = this.inactiveTrack;
    this.inactiveTrack = temp;
    this.updateInfo();
    if (this.type != "image") {
      this.seekSetup();
      this.inactiveTrack.media.removeEventListener("timeupdate", () => this.updateSeekBar(), false);
      this.inactiveTrack.media.removeEventListener("durationchange", () => this.seekSetup(), false);
      this.activeTrack.media.addEventListener("timeupdate", () => this.updateSeekBar(), false);
      this.activeTrack.media.addEventListener("durationchange", () => this.seekSetup(), false);
    }
  }
  updateInfo() {
    if (this.type == "audio") {
      jsmediatags.read(this.activeTrack.file, {
        onSuccess: (tag) => {
          if (tag.tags && tag.tags.artist && tag.tags.title) {
            this.info.innerHTML = tag.tags.artist + " - " + tag.tags.title;
          } else {
            this.info.innerHTML = this.activeTrack.file.name;
          }
        },
        onError: (error) => {
          let name = this.activeTrack.file.name;
          // let path = this.activeTrack.file.webkitRelativePath;
          // console.log(error.type + ": " + error.info, path ? path : name);
          this.info.innerHTML = name;
        }
      });
    } else {
      this.info.innerHTML = this.activeTrack.file.name;
    }
  }
  checkForActiveTrackEnd() {
    let media = this.activeTrack.media;
    let timeLeft = (media.duration - media.currentTime) / this.speed;
    if (timeLeft <= this.transDur + this.transRes) this.transition();
  }
  endTransition() {
    this.isTransitioning = false;
    this.inactiveTrack.change();
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
    this.items = [];
    this.i = -1;
    if (files) this.read(files);
  }
  read(files) {
    let re = new RegExp("^" + this.type + "\\/");
    let i = 0;
    for (let file of files) {
      if (re.test(file.type)) {
        let item = {
          "file": file,
          "url": URL.createObjectURL(file),
          "i": i++
        };
        this.items.push(item);
      }
    }
    this.unplayed = new Set([...Array(this.items.length).keys()]);
    this.unplayable = new Set();
  }
  clear() {
    for (let item of this.items) {
      URL.revokeObjectURL(item.url);
    }
    this.items = [];
  }
  next() {
    this.unplayed.delete(this.i);
    if (this.unplayed.size == 0) this.reset();
    let remaining = Array.from(this.unplayed);
    this.i =  remaining[Math.floor(Math.random() * remaining.length)];
    let item = this.items[this.i];
    return item;
  }
  ignore(i) {
    this.unplayable.add(i);
  }
  hasNothingPlayable() {
    return this.unplayable.size >= this.items.length;
  }
  reset() {
    this.unplayed = new Set(this.items.flatMap(x => this.unplayable.has(x.i) ? [] : [x.i]));
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
    this.media.play().catch((error) => {
      let path = this.file.webkitRelativePath;
      let name = this.file.name;
      console.log(error);
      console.log(path ? path : name);
      this.mixer.playlist.ignore(this.i);
      if (this.mixer.playlist.hasNothingPlayable()) {
        this.mixer.disable();
        window.alert(`None of the ${this.mixer.type} files are playable. Try a different folder.`);
        return;
      }
      this.change();
      this.play();
      if (this == this.mixer.activeTrack) {
        this.mixer.updateInfo();
      }
    });
  }
  pause() {
    this.media.pause();
  }
  change() {
    let item = this.mixer.playlist.next();
    this.media.src = item.url;
    this.file = item.file;
    this.i = item.i;
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
    let dur = this.media.duration;
    return isNaN(dur) ? "--:--" : this.secondsToString(dur);
  }
}

class ImageTrack {
  constructor(img, duration = 10, res = 0.05) {
    this.media = img;
    this.media.duration = duration;
    this.media.currentTime = 0;
    this.res = res;
  }
  play() {
    this.currentTimeClock = setInterval(this.updateCurrentTime.bind(this), 1000 * this.res);
  }
  pause() {
    clearInterval(this.currentTimeClock);
  }
  change() {
    let item = this.mixer.playlist.next();
    this.media.src = item.url;
    this.file = item.file;
    this.i = item.i;
    clearInterval(this.currentTimeClock);
    this.media.currentTime = 0;
  }
  updateCurrentTime() {
    this.media.currentTime += this.res;
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

class ControlsUI {
  constructor(id) {
    this.div = document.getElementById(id);
    this.controlsFadeOut = null;
    this.cursorHide = null;
    this.controlsHide = null;
    document.addEventListener("mousemove", () => this.showHide(), false);
    document.addEventListener("mouseup", () => this.showHide(), false);
    document.addEventListener("mousedown", () => this.showHide(), false);
  }
  showHide() {
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
  }
}

musicMixer = new Mixer("music-mixer", "audio",
  new Track(document.querySelector("#music-mixer audio.a")),
  new Track(document.querySelector("#music-mixer audio.b"))
);

speechMixer = new Mixer("speech-mixer", "audio",
  new Track(document.querySelector("#speech-mixer audio.a")),
  new Track(document.querySelector("#speech-mixer audio.b"))
);

videoMixer = new Mixer("video-mixer", "video",
  new Track(document.querySelector("video.a")),
  new Track(document.querySelector("video.b"))
);

imageMixer = new Mixer("image-mixer", "image",
  new ImageTrack(document.querySelector("img.a")),
  new ImageTrack(document.querySelector("img.b")),
);

controls = new ControlsUI("control-container");
