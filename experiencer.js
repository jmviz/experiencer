var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioCtx = new AudioContext();

class Mixer {
  constructor(id, track0, track1, xfade = 0, vol = 1) {
    this.track0 = track0;
    this.track1 = track1;
    this.setXfade(xfade);
    this.setVol(vol);
    this.playButton = document.querySelector('#' + id + ' .control.play');
    this.playButton.addEventListener('click', () => this.togglePlayButton(), false);
    this.xfadeSlider = document.querySelector('#' + id + ' .control.xfade');
    this.xfadeSlider.addEventListener('input', () => this.setXfade(this.xfadeSlider.value), false);
    this.volSlider = document.querySelector('#' + id + ' .control.vol');
    this.volSlider.addEventListener('input', () => this.setVol(this.volSlider.value), false);
  }
  togglePlayButton() {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (this.playButton.dataset.playing === 'false') {
      this.play();
      this.playButton.dataset.playing = 'true';
    } else if (this.playButton.dataset.playing === 'true') {
      this.pause();
      this.playButton.dataset.playing = 'false';
    }
  }
  setXfade(xfade) {
    this.xfade = xfade;
    this.track0.xfadeGain.gain.value = Math.cos(xfade * 0.5 * Math.PI);
    this.track1.xfadeGain.gain.value = Math.cos((1.0 - xfade) * 0.5 * Math.PI);
  }
  setVol(vol) {
    this.vol = vol;
    this.track0.volGain.gain.value = vol;
    this.track1.volGain.gain.value = vol;
  }
  play() {
    this.track0.play();
    this.track1.play();
  }
  pause() {
    this.track0.pause();
    this.track1.pause();
  }
}

class Track {
  constructor(audio, xfade = 0.5, vol = 1) {
    this.audio = audio;
    this.source = audioCtx.createMediaElementSource(audio);
    this.xfadeGain = audioCtx.createGain();
    this.xfadeGain.gain.value = xfade;
    this.volGain = audioCtx.createGain();
    this.volGain.gain.value = vol;
    this.source.connect(this.xfadeGain);
    this.xfadeGain.connect(this.volGain);
    this.volGain.connect(audioCtx.destination);
  }
  play() {
    this.audio.play();
  }
  pause() {
    this.audio.pause();
  }
}

mixer0 = new Mixer("mixer0",
  new Track(document.querySelector('#mixer0 .track0')),
  new Track(document.querySelector('#mixer0 .track1'))
);

mixer1 = new Mixer("mixer1",
  new Track(document.querySelector('#mixer1 .track0')),
  new Track(document.querySelector('#mixer1 .track1'))
);
