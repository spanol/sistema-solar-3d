import { state } from './state.js';

const PLANET_TONES = {
  mercury: 880, venus: 659, earth: 528, mars: 440,
  jupiter: 293, saturn: 220, uranus: 174, neptune: 130,
};

let audioCtx = null;
export let audioEnabled = false;
let ambGain = null, ambOsc1 = null, ambOsc2 = null;
let ptOsc = null, ptGain = null, ptLFO = null;

function initAudioCtx() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  ambGain = audioCtx.createGain();
  ambGain.gain.value = 0;
  ambGain.connect(audioCtx.destination);

  ambOsc1 = audioCtx.createOscillator();
  ambOsc1.type = 'sine';
  ambOsc1.frequency.value = 55;
  ambOsc1.start();
  ambOsc1.connect(ambGain);

  ambOsc2 = audioCtx.createOscillator();
  ambOsc2.type = 'sine';
  ambOsc2.frequency.value = 82.5;
  ambOsc2.start();
  ambOsc2.connect(ambGain);
}

export function startPlanetTone(planet) {
  if (!audioEnabled || !audioCtx) return;
  stopPlanetTone();
  const freq = PLANET_TONES[planet.data.id];
  if (!freq) return;

  ptGain = audioCtx.createGain();
  ptGain.gain.value = 0;
  ptGain.connect(audioCtx.destination);

  ptOsc = audioCtx.createOscillator();
  ptOsc.type = 'sine';
  ptOsc.frequency.value = freq;
  ptOsc.connect(ptGain);
  ptOsc.start();

  ptLFO = audioCtx.createOscillator();
  const lfoG = audioCtx.createGain();
  lfoG.gain.value = freq * 0.004;
  ptLFO.frequency.value = 0.25;
  ptLFO.connect(lfoG);
  lfoG.connect(ptOsc.frequency);
  ptLFO.start();

  ptGain.gain.setTargetAtTime(0.07, audioCtx.currentTime, 0.8);
}

export function stopPlanetTone() {
  if (!ptOsc) return;
  ptGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.4);
  const o = ptOsc, g = ptGain, l = ptLFO;
  setTimeout(() => { try { o.stop(); l.stop(); } catch (_) {} }, 700);
  ptOsc = null; ptGain = null; ptLFO = null;
}

export function syncAudioBtn() {
  const btn = document.getElementById('btn-audio');
  btn.textContent = audioEnabled ? '🔊' : '🔇';
  btn.setAttribute('aria-pressed', String(audioEnabled));
  btn.setAttribute('aria-label', audioEnabled ? 'Desativar som' : 'Ativar som');
  btn.setAttribute('title', audioEnabled ? 'Desativar som' : 'Som ambiente (mudo por padrão)');
}

document.getElementById('btn-audio').addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  if (audioEnabled) {
    initAudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    ambGain.gain.setTargetAtTime(0.04, audioCtx.currentTime, 1.2);
    if (state.viewMode === 'front' && state.activePlanet) startPlanetTone(state.activePlanet);
  } else {
    if (audioCtx) ambGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
    stopPlanetTone();
  }
  syncAudioBtn();
});
