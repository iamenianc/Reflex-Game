// ═══════════════════════════════════════════════════════════
// FEATURE FLAGS
// Toggle in-progress / disabled features here. Set TWO_PLAYER_MODE back to
// true to re-enable the 2P Mode button on the home screen.
// ═══════════════════════════════════════════════════════════
const FEATURES = {
  TWO_PLAYER_MODE: false,
};

// ═══════════════════════════════════════════════════════════
// SOUND ENGINE
// All audio is synthesized via Web Audio API — no audio files.
// Entry point: playTone(freq, type, duration, gain, startTime, rampDown)
// High-level helpers: soundCountdownBeep, soundEarly, soundSlow,
//   soundGoodResult, soundBadResult, startReactionTone, stopReactionTone.
// ═══════════════════════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let bgmSource  = null;
let bgmGain    = null;
let bgmEnabled = localStorage.getItem('rfx_bgm') === '1'; // default off

function startBGM() {
  if (bgmSource || !bgmEnabled) return;
  const ctx = getAudioCtx();
  bgmGain = ctx.createGain();
  bgmGain.gain.setValueAtTime(0.25, ctx.currentTime);
  bgmGain.connect(ctx.destination);
  fetch('bgmc.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => ctx.decodeAudioData(buf))
    .then(decoded => {
      if (!bgmEnabled) return; // toggled off while loading
      bgmSource = ctx.createBufferSource();
      bgmSource.buffer = decoded;
      bgmSource.loop   = true;
      bgmSource.connect(bgmGain);
      bgmSource.start(0);
    });
}

function stopBGM() {
  if (bgmSource) { try { bgmSource.stop(); } catch(e) {} bgmSource = null; }
  if (bgmGain)   { bgmGain.disconnect(); bgmGain = null; }
}

// First time in a tab session that the player reaches the end of a solo set,
// turn the music on automatically. Guarded by a sessionStorage flag so it fires
// exactly once per tab (cleared when the tab closes) and never overrides a player
// who has already turned music on/off themselves this session.
function autoStartMusicOnce() {
  if (sessionStorage.getItem('rfx_bgm_auto') === '1') return;
  sessionStorage.setItem('rfx_bgm_auto', '1');
  if (bgmEnabled) return; // already on — nothing to do
  bgmEnabled = true;
  localStorage.setItem('rfx_bgm', '1');
  updateBGMToggle();
  startBGM();
}

// Creates the context if needed and resumes it. Safe to call anywhere.
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// iOS requires that an AudioContext be created AND a node started in the same
// synchronous call stack as the user gesture. We create the context here (first
// touch anywhere) and play a near-silent real oscillator — not just a buffer —
// so Safari actually unlocks the audio hardware. After this, any sounds called
// from setTimeout/setInterval will play normally for the rest of the session.
function unlockAudio() {
  ['touchstart', 'pointerdown', 'click'].forEach(ev =>
    document.removeEventListener(ev, unlockAudio, { capture: true }));
  if (!audioCtx) audioCtx = new AudioCtx();
  audioCtx.resume();
  startBGM();
  // Play a real (but near-inaudible) oscillator node synchronously inside this
  // gesture so iOS registers the context as user-activated.
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.001);
}

['touchstart', 'pointerdown', 'click'].forEach(ev =>
  document.addEventListener(ev, unlockAudio, { passive: true, capture: true }));

// Core oscillator helper. startTime is ctx.currentTime (or offset from it for chained tones).
// rampDown=false leaves the tone at full gain — only used by the continuous reaction tone.
function playTone(freq, type, duration, gainVal, startTime, rampDown = true) {
  const ctx  = getAudioCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainVal, startTime);
  if (rampDown) gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function soundCountdownBeep(isFinal) {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  playTone(isFinal ? 880 : 440, 'sine', 0.12, 0.3, t);
}

function soundEarly() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  playTone(120, 'sawtooth', 0.4, 0.4, t);
}

function soundSlow() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  playTone(180, 'sawtooth', 0.35, 0.35, t);
  playTone(140, 'sawtooth', 0.35, 0.25, t + 0.15);
}

function soundGoodResult() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  playTone(660, 'sine', 0.12, 0.25, t);
  playTone(880, 'sine', 0.18, 0.25, t + 0.13);
}

function soundBadResult() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  playTone(260, 'sine', 0.3, 0.25, t);
}

// ── REACTION TONE ──
// A continuous 880 Hz sine tone plays while the tap screen is visible — gives the player
// an audio cue alongside the visual. Stopped immediately on tap or triggerSlow.
let reactionOsc  = null;
let reactionGain = null;

function startReactionTone(freq = 780) {
  const ctx = getAudioCtx();
  reactionOsc  = ctx.createOscillator();
  reactionGain = ctx.createGain();
  reactionOsc.connect(reactionGain);
  reactionGain.connect(ctx.destination);
  reactionOsc.type = 'sine';
  reactionOsc.frequency.setValueAtTime(freq, ctx.currentTime);
  reactionGain.gain.setValueAtTime(0.20, ctx.currentTime);
  reactionOsc.start(ctx.currentTime);
}

function stopReactionTone() {
  if (!reactionOsc) return;
  const ctx = getAudioCtx();
  reactionGain.gain.setValueAtTime(0, ctx.currentTime);
  reactionOsc.stop(ctx.currentTime);
  reactionOsc  = null;
  reactionGain = null;
}


// ── GRADES ──
// 30 tiers ordered best → worst. getGrade(ms) returns the first entry whose max > ms.
// Shifting right accommodates Go/No-Go split decision processing times.
// Good baseline (above average) is calibrated around 380ms or better.
// cls maps to a CSS class (grade-s through grade-f) for color theming.
const GRADES = [
  // S-Tier: Elite / Near-Instantaneous Decision Making (Under 220ms)
  { max: 150,      emoji: '⚡', label: 'SYNAPTIC LIGHTNING',   cls: 'grade-s' },
  { max: 165,      emoji: '🤖', label: 'CYBORG CORE',          cls: 'grade-s' },
  { max: 178,      emoji: '🏎️', label: 'F1 DRIVER',            cls: 'grade-s' },
  { max: 190,      emoji: '🐍', label: 'VIPER REFLEXES',       cls: 'grade-s' },
  { max: 202,      emoji: '🗡️', label: 'KATANA BLADE',         cls: 'grade-s' },
  { max: 215,      emoji: '🥷', label: 'SHADOW NINJA',         cls: 'grade-s' },

  // A-Tier: Good / Above Average Performance (215ms to 280ms)
  { max: 225,      emoji: '🎮', label: 'PRO GAMER',            cls: 'grade-a' },
  { max: 234,      emoji: '🦅', label: 'EAGLE-EYED',           cls: 'grade-a' },
  { max: 243,      emoji: '🐆', label: 'CHETAH SPEED',         cls: 'grade-a' },
  { max: 252,      emoji: '🏹', label: 'LASER SIGHT',          cls: 'grade-a' },
  { max: 261,      emoji: '🎯', label: 'BULLSEYE',             cls: 'grade-a' },
  { max: 270,      emoji: '☕', label: 'HOT COFFEE',           cls: 'grade-a' },
  { max: 280,      emoji: '🧨', label: 'FIRECRACKER',          cls: 'grade-a' },

  // B-Tier: Average Population / Steady Control (280ms to 325ms)
  { max: 288,      emoji: '🦘', label: 'KANGAROO',             cls: 'grade-b' },
  { max: 296,      emoji: '🐕', label: 'LABRADOR',             cls: 'grade-b' },
  { max: 304,      emoji: '🐿️', label: 'SQUIRREL',             cls: 'grade-b' },
  { max: 312,      emoji: '🦫', label: 'BEAVER',               cls: 'grade-b' },
  { max: 320,      emoji: '🦡', label: 'BADGER',               cls: 'grade-b' },
  { max: 325,      emoji: '🦉', label: 'OWL',                  cls: 'grade-b' },

  // C-Tier: Mild Lag / Slightly Fatigued (325ms to 370ms)
  { max: 333,      emoji: '🦥', label: 'SLOTH',                cls: 'grade-c' },
  { max: 342,      emoji: '🐨', label: 'KOALA',                cls: 'grade-c' },
  { max: 352,      emoji: '🐼', label: 'PANDA',                cls: 'grade-c' },
  { max: 362,      emoji: '🐸', label: 'TOAD',                 cls: 'grade-c' },
  { max: 370,      emoji: '🐌', label: 'SNAIL',                cls: 'grade-c' },

  // D-Tier: Substantial Delay / Heavy Processing (370ms to 420ms)
  { max: 380,      emoji: '🦕', label: 'FOSSIL REFLEXES',      cls: 'grade-d' },
  { max: 392,      emoji: '🛋️', label: 'COUCH ARCHAEOLOGIST', cls: 'grade-d' },
  { max: 405,      emoji: '🧓', label: 'DIAL-UP CONNECTION',   cls: 'grade-d' },
  { max: 420,      emoji: '🧱', label: 'MOLASSES REACTION',    cls: 'grade-d' },

  // F-Tier: Severely Delayed (Over 420ms)
  { max: 450,      emoji: '🐢', label: 'GEOLOGICAL EPOCH',     cls: 'grade-f' },
  { max: Infinity, emoji: '🌌', label: 'HEAT DEATH OF UNIVERSE', cls: 'grade-f' },
];

function getGrade(ms) {
  return GRADES.find(g => ms < g.max);
}

// ── SCREENS ──
// All UI state is driven by toggling .hidden on .screen divs. The score bar (#chalScoreBar)
// is NOT in this list — it sits outside the screen system and is toggled via showScoreBar().
// To add a new screen: add its HTML id here, add a <div class="screen hidden" id="..."> in HTML,
// then call show('yourId') to navigate to it.
const allScreens = ['home','countdown','getReady','wait','tap','early','slow','result','chalSetup','chalRound','chalFinal'];
const scrEls = {};
allScreens.forEach(id => scrEls[id] = document.getElementById(id));

function show(name) {
  allScreens.forEach(id => scrEls[id].classList.toggle('hidden', id !== name));
  // Version number is only visible on the home screen — it disappears once
  // the player clicks into any other screen (i.e. starts playing).
  document.querySelector('.version-footer').classList.toggle('hidden', name !== 'home');
}

// ── PERSISTENT STATE ──
// rfx_hist: last 20 solo set-averages (ms). Used to compute all-time best on home screen.
// rfx_streak: consecutive non-failing solo sets. Persisted but not currently displayed in UI.
let history = JSON.parse(localStorage.getItem('rfx_hist') || '[]');
let streak  = parseInt(localStorage.getItem('rfx_streak') || '0');

// ── GAME STATE ──
// tapStartTime: performance.now() snapshot when green tap screen is painted (set in showTap via double-rAF).
//               0 means the tap screen is not active — used as a guard in handleTap.
// waitTimeout:  setTimeout handle for the random wait-to-green delay. Cleared on early tap.
// slowTimeout:  setTimeout handle for the too-slow cutoff. Cleared on successful tap.
// mode:         'solo' or 'challenge' — controls which result flow runs after a set.
const DEFAULT_TAP_WINDOW_MS = 1500; // Default milliseconds to tap before it's considered too slow and triggers the penalty flow.
const INFINITE_TAP_WINDOW_MS = 999; // Starting milliseconds to tap in infinite mode — calibrated around 400ms with some leniency for fatigue
const INFINITE_TAP_WINDOW_MIN_MS = 100; // Hard lower bound to keep the mode playable as it ramps up.

let tapStartTime = 0;
let waitTimeout  = null;
let slowTimeout  = null;
let tapOpacityFrame = null;
let mode = 'solo'; // 'solo' | 'challenge' | 'infinite'
let infiniteScore = 0;
let infiniteFailReason = null;
let infiniteFailMs = 0;
let currentInfiniteTapWindow = INFINITE_TAP_WINDOW_MS;

function stopTapCircleOpacityAnimation() {
  if (tapOpacityFrame !== null) {
    cancelAnimationFrame(tapOpacityFrame);
    tapOpacityFrame = null;
  }
  const tapTextEl = document.getElementById('tapText');
  if (tapTextEl) {
    tapTextEl.style.setProperty('--tap-bg-opacity', '1');
  }
  resetTapProgressBar();
}

function resetTapProgressBar() {
  const el = document.getElementById('tapProgressFill');
  if (!el) return;
  el.style.transition = 'none';
  el.style.width = '0%';
}

function startTapProgressBar(durationMs) {
  const el = document.getElementById('tapProgressFill');
  if (!el) return;
  resetTapProgressBar();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `width ${durationMs}ms linear`;
      el.style.width = '100%';
    });
  });
}

function updateTapCircleOpacity() {
  if (!tapStartTime) return;
  const tapTextEl = document.getElementById('tapText');
  if (!tapTextEl) return;

  const maxWindow = mode === 'infinite' ? currentInfiniteTapWindow : DEFAULT_TAP_WINDOW_MS;
  const elapsed = Math.min(performance.now() - tapStartTime, maxWindow);
  const ratio = maxWindow > 0 ? elapsed / maxWindow : 1;
  const targetOpacity = 1 - (ratio * 0.5);
  tapTextEl.style.setProperty('--tap-bg-opacity', targetOpacity.toString());

  tapOpacityFrame = requestAnimationFrame(updateTapCircleOpacity);
}

function resetInfiniteTapWindow() {
  currentInfiniteTapWindow = INFINITE_TAP_WINDOW_MS;
}

function reduceInfiniteTapWindow() {
  currentInfiniteTapWindow = Math.max(INFINITE_TAP_WINDOW_MIN_MS, currentInfiniteTapWindow -10);
}
// Set state — randomized to 6 or 7 taps per set, chosen fresh at startCountdown.
let TAPS_PER_SET = 6;
let setTaps   = []; // reaction times (ms) collected so far in the current set
let setTapNum = 0;  // number of successful taps completed so far

// Don't-tap mode: pre-shuffled sequence per set.
// tapSequence[i] = true means tap i is a "don't tap" screen.
// Constraints: at least one TAP! and at least one DON'T TAP!, probability ~49% don't-tap.
let dontTapMode = false;
let tapSequence = [];

// Challenge (2P) state — reset when a new challenge match begins (btnBegin) or on rematch.
// These live here (not in multiplayer.js) because the solo tap-flow functions below
// branch on `mode === 'challenge'` and mutate chalScores/chalTurn inline. The challenge
// RESULT flow (challengeResult, showFinal) and its button handlers live in multiplayer.js.
// chalRound:        0-based index of the current round (max 2 for best-of-3).
// chalTurn:         index into chalPlayers of whose turn it currently is (0 or 1).
// chalRoundResults: [{player, avg}] for the current round; cleared after both players finish.
let chalPlayers      = ['Player 1', 'Player 2'];
let chalScores       = [0, 0];   // round wins per player
let chalTimes        = [[], []]; // per-player array of set-average times, one entry per round
let chalRound        = 0;
let chalTurn         = 0;
let chalRoundResults = [];

const scoreBar = document.getElementById('chalScoreBar');

// ── UTILS ──
// Refreshes the home screen "Best Xms" line from history array.
function updateBestDisplay() {
  const best = history.length ? Math.min(...history) : null;
  const el = document.getElementById('bestDisplay');
  el.innerHTML = best ? `Best <span>${best}ms</span>` : 'Best — — —';
}

// Removes all grade-* classes, applies the correct one for ms, returns the grade object.
function applyGradeStyle(el, ms) {
  const g = getGrade(ms);
  el.classList.remove('grade-s', 'grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f');
  el.classList.add(g.cls);
  return g;
}

// Returns a CSS color variable for the numeric result display based on reaction time.
function timeColor(ms) {
  if (ms < 200) return 'var(--green)';
  if (ms < 260) return 'var(--blue)';
  if (ms < 340) return 'var(--amber)';
  if (ms < 500) return 'var(--white)';
  return 'var(--red)';
}

// ── SCORE BAR ──
// Fixed-position bar shown at top during challenge rounds. Displays player names and pip wins.
// active-player class dims a half to a neutral white — applied to the INACTIVE player's half
// so the active player's colored half stands out.
// Kept in app.js (not multiplayer.js) because the solo tap-flow branches call updateScoreBar().
function updateScoreBar() {
  document.getElementById('sbName1').textContent = chalPlayers[0];
  document.getElementById('sbName2').textContent = chalPlayers[1];
  [0,1].forEach(p => {
    const pipsEl = document.getElementById(`sbPips${p+1}`);
    pipsEl.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const d = document.createElement('div');
      d.className = 'pip' + (i < chalScores[p] ? ' won' : '');
      pipsEl.appendChild(d);
    }
  });
  // Dim the inactive player's half (chalTurn 0 = P1 active → dim P2, and vice versa).
  document.getElementById('scoreBarP1').classList.toggle('active-player', chalTurn !== 0 || mode !== 'challenge');
  document.getElementById('scoreBarP2').classList.toggle('active-player', chalTurn !== 1 || mode !== 'challenge');
}

function showScoreBar(visible) {
  scoreBar.classList.toggle('hidden', !visible);
}

// ── COUNTDOWN ──
// Entry point for every game flow. context is a string shown above the number
// (e.g. "Round 2 · Alice" in challenge mode, '' for solo).
// Also calls randomizeTapsPerSet() so TAPS_PER_SET is fresh for each set.
// Flow after countdown: showGetReady → startWait → showTap → handleTap → result
function startCountdown(context) {
  // Solo (test) mode uses a fixed 4-tap set. Challenge mode inlines the
  // previous randomization logic here so we can remove the helper.
  if (mode === 'solo') {
    TAPS_PER_SET = 4;
    setTaps = [];
    setTapNum = 0;
  } else if (mode === 'challenge') {
    // Decide the set length (6 or 7) and build a per-set don't-tap sequence.
    TAPS_PER_SET = Math.random() < 0.5 ? 6 : 7;
    setTaps = [];
    setTapNum = 0;

    // Challenge: ~40% chance of DON'T TAP per slot, enforce at least one
    // TAP! and at least one DON'T TAP!, and prevent first 3 from all being DON'T TAP.
    const dontTapProb = 0.40;
    const buf = new Uint32Array(TAPS_PER_SET);
    crypto.getRandomValues(buf);
    tapSequence = Array.from(buf, v => (v / 0x100000000) < dontTapProb);

    if (tapSequence.every(v => !v)) {
      tapSequence[Math.floor(Math.random() * TAPS_PER_SET)] = true;
    }
    const HEAD = 3;
    if (tapSequence.slice(0, HEAD).every(v => v)) {
      tapSequence[Math.floor(Math.random() * HEAD)] = false;
    }
  }
  show('countdown');
  let n = 3;
  const numEl = document.getElementById('countNum');
  numEl.textContent = n;
  soundCountdownBeep(false);
  const interval = setInterval(() => {
    n--;
    if (n > 0) {
      numEl.textContent = n;
      numEl.style.animation = 'none';
      void numEl.offsetWidth; // force reflow to restart the pulse animation each tick
      numEl.style.animation = '';
      soundCountdownBeep(false);
    } else {
      clearInterval(interval);
      soundCountdownBeep(true);
      if (mode === 'infinite') {
        resetInfiniteTapWindow();
        startWait();
      } else {
        showGetReady();
      }
    }
  }, 1000);
}

function showGetReady() {
  show('getReady');
  setTimeout(startWait, 1000);
}

// `randomizeTapsPerSet` removed — challenge randomization is inlined in
// `startCountdown()` and solo uses a fixed 4-tap set.

function startWait() {
  tapStartTime = 0; // reset so touchstart guard works
  show('wait');
  if (mode === 'challenge') {
    document.getElementById('waitPlayerTag').textContent =
      `${chalPlayers[chalTurn]} — Round ${chalRound + 1}`;
  } else {
    document.getElementById('waitPlayerTag').textContent = '';
  }
  const minDelay = 400;
  const maxDelay = mode === 'infinite' ? 1010 : 4000;
  const delay = minDelay + Math.random() * (maxDelay - minDelay);
  waitTimeout = setTimeout(showTap, delay);
}

// ── WAIT → EARLY ──
// Any touch/click during the red wait screen is an early tap — cancels the whole set.
// waitTimeout being non-null means the countdown to green is still pending.
scrEls.wait.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!waitTimeout) return; // race: showTap already fired, let handleTap take it
  clearTimeout(waitTimeout);
  waitTimeout = null;
  setTaps   = []; // discard any partial-set taps (early mid-set resets everything)
  setTapNum = 0;
  soundEarly();
  if (mode === 'infinite') {
    infiniteFailReason = 'TOO SOON';
    infiniteFailMs = 0;
    document.getElementById('earlyText').textContent = 'TOO SOON';
    document.getElementById('earlySub').textContent  = 'Wait for green';
    show('early');
    return;
  }
  if (mode === 'solo') {
    streak = 0;
    localStorage.setItem('rfx_streak', streak);
  } else {
    chalScores[1 - chalTurn]++;
    updateScoreBar();
  }
  document.getElementById('earlyText').textContent = 'TOO SOON';
  document.getElementById('earlySub').textContent  = 'Wait for green';
  show('early');
});

// ── SHOW TAP ──
// triggerSlow fires via setTimeout after the configured tap window — too-slow penalty.
// It zeros tapStartTime so the early-return guard in handleTap catches any late taps.
function triggerSlow() {
  if (!tapStartTime) return; // already tapped
  const ms = Math.round(performance.now() - tapStartTime);
  tapStartTime = 0;
  stopTapCircleOpacityAnimation();
  setTaps      = [];
  setTapNum    = 0;
  dontTapMode  = false;
  stopReactionTone();
  if (mode === 'infinite') {
    soundSlow();
    infiniteFailReason = 'TOO SLOW';
    infiniteFailMs = ms;
    document.getElementById('earlyText').textContent = 'TOO SLOW';
    document.getElementById('earlySub').textContent  = `Under ${currentInfiniteTapWindow}ms next time`;
    show('slow');
    return;
  }
  soundSlow();
  if (mode === 'solo') {
    streak = 0;
    localStorage.setItem('rfx_streak', streak);
  } else {
    chalScores[1 - chalTurn]++;
    updateScoreBar();
  }
  show('slow');
}

// Fires after the configured tap window when player correctly avoids tapping on a "don't tap" screen.
// Counts as a successful resist — advance the set without recording a reaction time.
function resolveDontTap() {
  if (!tapStartTime) return; // already fired (tapped too early or handled)
  tapStartTime = 0;
  stopTapCircleOpacityAnimation();
  dontTapMode  = false;
  stopReactionTone();

  if (mode === 'infinite') {
    infiniteScore++;
    reduceInfiniteTapWindow();
    soundGoodResult();
    startWait();
    return;
  }

  setTapNum++;
  if (setTapNum < TAPS_PER_SET) {
    showGetReady();
  } else {
    const taps = setTaps.slice();
    const avg  = Math.round(taps.reduce((a, b) => a + b, 0) / taps.length);
    setTaps   = [];
    setTapNum = 0;
    if (mode === 'solo') soloResult(avg, taps);
    else challengeResult(avg, taps);
  }
}

// Double-rAF ensures tapStartTime is set only after the browser has fully painted the
// green tap screen. First rAF = style/layout flush, second rAF = paint committed.
function showTap() {
  if (mode === 'infinite') {
    // Infinite mode uses an independent don't-tap probability (40%).
    // Use crypto.getRandomValues for stronger randomness than Math.random.
    const _rv = new Uint32Array(1);
    crypto.getRandomValues(_rv);
    dontTapMode = (_rv[0] / 0x100000000) < 0.51;
  } else {
    dontTapMode = tapSequence[setTapNum] === true;
  }
  const tapTextEl = document.getElementById('tapText');
  if (dontTapMode) {
    tapTextEl.innerHTML = `<span class="dont-label">DON'T</span><span>TAP!</span>`;
  } else {
    tapTextEl.textContent = 'TAP!';
  }
  tapTextEl.classList.toggle('dont-tap', dontTapMode);
  show('tap');
  const tapWindow = mode === 'infinite' ? currentInfiniteTapWindow : DEFAULT_TAP_WINDOW_MS;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      tapStartTime = performance.now();
      stopTapCircleOpacityAnimation();
      startTapProgressBar(tapWindow);
      updateTapCircleOpacity();
      if (dontTapMode) {
        playTone(600, 'triangle', 0.25, 0.20, getAudioCtx().currentTime, false);
      } else {
        startReactionTone(780);
      }
      slowTimeout = setTimeout(
        dontTapMode ? resolveDontTap : triggerSlow,
        tapWindow
      );
    });
  });
}

// ── TAP ──
// touchstart for iOS (fires earlier than pointerdown).
// mousedown for desktop mouse clicks.
// touchstart calls preventDefault to stop the synthetic mousedown
// that would otherwise double-fire on mobile.

// handleTap: fires on touchstart (iOS) or mousedown (desktop) while the tap screen is visible.
// tapStartTime guards against firing before the double-rAF paint commit in showTap.
// The >configured tap window path is handled earlier by triggerSlow's setTimeout, so we never reach it here
// — by then tapStartTime has been zeroed and the guard above already returned.
function handleTap(e) {
  if (!tapStartTime) return; // guard: fired before paint committed, or after triggerSlow ran
  clearTimeout(slowTimeout);
  slowTimeout = null;
  stopTapCircleOpacityAnimation();

  const ms = Math.round(performance.now() - tapStartTime);

  if (dontTapMode) {
    // Player tapped when they shouldn't have
    tapStartTime = 0;
    dontTapMode  = false;
    setTaps   = [];
    setTapNum = 0;
    stopReactionTone();
    soundEarly();
    if (mode === 'infinite') {
      infiniteFailReason = 'TOO SOON';
      infiniteFailMs = ms;
      document.getElementById('earlyText').textContent = "DON'T TAP!";
      document.getElementById('earlySub').textContent  = 'You were not supposed to tap';
      show('early');
      return;
    }
    if (mode === 'solo') {
      streak = 0;
      localStorage.setItem('rfx_streak', streak);
    } else {
      chalScores[1 - chalTurn]++;
      updateScoreBar();
    }
    document.getElementById('earlyText').textContent = "DON'T TAP!";
    document.getElementById('earlySub').textContent  = 'You were not supposed to tap';
    show('early');
    return;
  }

  stopReactionTone();
  tapStartTime = 0; // zero before any show() call to prevent double-fire

  if (mode === 'infinite') {
    if (ms >= currentInfiniteTapWindow) {
      soundSlow();
      infiniteFailReason = 'TOO SLOW';
      infiniteFailMs = ms;
      document.getElementById('earlyText').textContent = 'TOO SLOW';
      document.getElementById('earlySub').textContent  = `Under ${currentInfiniteTapWindow}ms next time`;
      show('slow');
      return;
    }
    infiniteScore++;
    reduceInfiniteTapWindow();
    soundGoodResult();
    startWait();
    return;
  }

  setTaps.push(ms);
  setTapNum++;

  if (setTapNum < TAPS_PER_SET) {
    // More taps needed in this set
    showGetReady();
  } else {
    // Set complete — average all taps
    const taps = setTaps.slice();
    const avg  = Math.round(taps.reduce((a, b) => a + b, 0) / taps.length);
    setTaps   = [];
    setTapNum = 0;
    if (mode === 'solo') soloResult(avg, taps);
    else challengeResult(avg, taps);
  }
}

scrEls.tap.addEventListener('touchstart', e => {
  e.preventDefault(); // stops subsequent mousedown firing on mobile
  handleTap(e);
}, { passive: false });

scrEls.tap.addEventListener('mousedown', handleTap);

// ── SOLO RESULT ──
// avg = mean of all TAPS_PER_SET tap times in the completed set (6 or 7 taps).
// Adds to history (capped at 20), increments streak, shows the result screen.
function formatBreakdown(taps) {
  return taps.join(' + ') + ' ÷ ' + taps.length + ' = ' + Math.round(taps.reduce((a, b) => a + b, 0) / taps.length) + 'ms';
}

function infiniteResult(score, ms, reason) {
  const timeEl = document.getElementById('resultTime');
  const gradeEl = document.getElementById('resultGrade');
  const captionEl = document.getElementById('resultCaption');
  const breakdownEl = document.getElementById('resultBreakdown');
  const unitEl = document.getElementById('resultUnit');
  const bestEl = document.getElementById('statBest');

  document.getElementById('resultLabel').textContent = 'INFINITE MODE';
  timeEl.textContent = score;
  timeEl.style.color = 'var(--amber)';
  unitEl.textContent = 'tests passed';
  // Show a clear caption depending on why the run ended.
  // If the player failed for being too slow, show the final score and the reason.
  // Otherwise present that they survived the run.
  captionEl.textContent = reason === 'TOO SLOW' ? 'Final score' : 'You survived:';
  breakdownEl.textContent = reason === 'TOO SLOW'
    ? `Reaction time ${ms}ms — you fell short of ${currentInfiniteTapWindow}ms`
    : `Respond in under ${currentInfiniteTapWindow}ms to keep going`;
  // Normalize casing for the passed label.
  gradeEl.textContent = score > 0 ? `${score} passed` : 'TRY AGAIN';
  bestEl.textContent = `${score} passed`;
  if (score > 0) soundGoodResult(); else soundBadResult();
  show('result');
}

function soloResult(avg, taps) {
  history.push(avg);
  if (history.length > 20) history = history.slice(-20);
  localStorage.setItem('rfx_hist', JSON.stringify(history));
  streak++;
  localStorage.setItem('rfx_streak', streak);

  const best = Math.min(...history);

  const timeEl  = document.getElementById('resultTime');
  const gradeEl = document.getElementById('resultGrade');
  timeEl.textContent = avg;
  timeEl.style.color = timeColor(avg);
  const g = applyGradeStyle(gradeEl, avg);
  // Minimalist: list each recorded tap time, comma-separated (no average equation).
  // No unit — the large averaged time above already shows "ms".
  document.getElementById('resultBreakdown').textContent = taps.join(', ');

  if (avg === best && history.length > 1) {
    document.getElementById('resultCaption').textContent = '🏆 new best! Your Reflex rating is:';
  } else {
    document.getElementById('resultCaption').textContent = 'Your Reflex rating is:';
  }
  gradeEl.textContent = `${g.emoji} ${g.label}`;

  document.getElementById('statBest').textContent = best + 'ms';
  if (avg < 350) soundGoodResult(); else soundBadResult();
  show('result');

  // First completed set of the tab session: kick the music on automatically.
  autoStartMusicOnce();

  // Refresh the board, then — if this run would make the global top 100 —
  // ask for a tag. The server is the source of truth on whether it places:
  // we ask /standing (no write) with a pre-filled tag, and only prompt when
  // it qualifies. The tag is never silently reused — every qualifying run
  // prompts (the previous tag is pre-filled for convenience).
  (async () => {
    await loadLeaderboard();
    const standing = await fetchStanding(playerTag, avg);
    if (!standing || !standing.qualifies) return;
    pendingScore = avg;
    pendingStanding = standing;
    showTagModal(standing);
  })();
}

// ── BUTTON HANDLERS ──
// btnStart → solo flow; btnChallenge → setup screen; btnBegin → initialises challenge state
// and starts round 1. btnRematch → resets scores but keeps player names.
// goHome → shared handler for slow/early back buttons (resets partial set state).
// Challenge-specific handlers (btnChallenge, btnBegin, btnChalBack, btnRematch,
// btnFinalHome, btnNextRound) live in multiplayer.js.
const bgmToggleEl = document.getElementById('bgmToggle');
function updateBGMToggle() {
  bgmToggleEl.textContent = bgmEnabled ? 'MUSIC ON' : 'MUSIC OFF';
  bgmToggleEl.classList.toggle('on', bgmEnabled);
}
updateBGMToggle();
bgmToggleEl.addEventListener('click', () => {
  bgmEnabled = !bgmEnabled;
  localStorage.setItem('rfx_bgm', bgmEnabled ? '1' : '0');
  updateBGMToggle();
  if (bgmEnabled) startBGM(); else stopBGM();
});

document.getElementById('btnStart').addEventListener('click', () => {
  mode = 'solo';
  showScoreBar(false);
  startCountdown('');
});

document.getElementById('btnInfinite').addEventListener('click', () => {
  mode = 'infinite';
  infiniteScore = 0;
  infiniteFailReason = null;
  infiniteFailMs = 0;
  showScoreBar(false);
  startCountdown('');
});

document.getElementById('btnRetry').addEventListener('click', () => {
  if (mode === 'infinite') {
    infiniteScore = 0;
    showScoreBar(false);
    startCountdown('');
    return;
  }
  mode = 'solo'; showScoreBar(false);
  startCountdown('');
});

document.getElementById('btnHome').addEventListener('click', () => {
  showScoreBar(false); updateBestDisplay(); show('home'); loadLeaderboard();
});

function goHome() {
  setTaps = []; setTapNum = 0;
  if (mode === 'infinite' && infiniteFailReason) {
    const score = infiniteScore;
    const reason = infiniteFailReason;
    const ms = infiniteFailMs;
    infiniteFailReason = null;
    infiniteFailMs = 0;
    infiniteResult(score, ms, reason);
    return;
  }
  infiniteScore = 0;
  showScoreBar(false);
  updateBestDisplay();
  show('home');
  loadLeaderboard();
}

function handleFailScreenBack(e) {
  e.preventDefault();
  e.stopPropagation();
  goHome();
}

const failScreenButtons = [
  document.getElementById('btnSlowContinue'),
  document.getElementById('btnEarlyBack')
];

failScreenButtons.forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  btn.addEventListener('click', handleFailScreenBack);
});

// ── BLOCK ALL KEYBOARD INPUT ──
// Buttons respond to Space/Enter natively; prevent that at capture phase.
// Allow normal typing in INPUT elements only (tag modal + player name inputs).
function blockKeyboard(e) {
  if (e.target.tagName !== 'INPUT') e.preventDefault();
}
document.addEventListener('keydown', blockKeyboard, { capture: true });
document.addEventListener('keyup',   blockKeyboard, { capture: true });

// ── LEADERBOARD / TAG ──
const WORKER_URL = 'https://reflex-scores.reflex-game.workers.dev';
let playerTag = sessionStorage.getItem('rfx_tag') || ''; // persists across refreshes, cleared when the tab closes
let pendingScore = null;      // qualifying solo score awaiting a tag before submit
let pendingStanding = null;   // its { qualifies, rank }, captured at prompt time
let leaderboard = [];          // last fetched top-20 [{tag, ms, at}, ...]
const BOARD_SIZE = 20;         // ordered rows the server returns / we display
const BOARD_COLLAPSED = 5;     // rows shown before the "show all" toggle
let lbExpanded = false;        // whether the board is showing all entries
// The player's last known standing in the top 100 when they are NOT in the
// ordered top-20 rows: { ms, rank } with rank === '20+'. Drives the pinned
// "you" row at the bottom of the home list. null when they're in the top 20
// (they render inline) or have no qualifying score.
let myStanding = null;
let submitInFlight = false;    // one POST at a time
let lastSubmitAt = 0;          // epoch ms of last successful POST
const SUBMIT_COOLDOWN_MS = 30_000;

function isValidTag(t) { return /^[A-Z]{1,6}$/.test(t); }

function showTagModal(standing) {
  document.getElementById('tagModal').classList.remove('hidden');
  // Banner celebrates making the top 100, with the would-be position when known.
  const banner = document.getElementById('tagBanner');
  if (standing && standing.qualifies) {
    banner.textContent = standing.rank === '20+'
      ? 'You made the top 100!'
      : `You made #${standing.rank}!`;
  } else {
    banner.textContent = '';
  }
  // Pre-fill the previous tag for convenience, but the player must still
  // confirm it each run — it is never submitted without showing this prompt.
  tagInput.value = playerTag || '';
  tagError.textContent = '';
  warnedTag = null;
  const inp = document.getElementById('tagInput');
  inp.focus();
  inp.select();
}

function hideTagModal() {
  document.getElementById('tagModal').classList.add('hidden');
}

const tagInput = document.getElementById('tagInput');
const tagError = document.getElementById('tagError');

let warnedTag = null; // tag the user was told already exists, awaiting re-confirm

tagInput.addEventListener('input', () => {
  tagInput.value = tagInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  tagError.textContent = '';
  warnedTag = null; // editing clears any prior "already taken" warning
});

tagInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmTag();
});

document.getElementById('btnTagConfirm').addEventListener('click', confirmTag);
document.getElementById('btnTagSkip').addEventListener('click', () => {
  pendingScore = null;
  pendingStanding = null;
  hideTagModal();
});

// Returns true if the tag is already recorded on the server. On any network
// error returns false (don't block the player over a failed check).
async function tagExists(tag) {
  try {
    const res = await fetch(`${WORKER_URL}/exists?tag=${encodeURIComponent(tag)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.exists;
  } catch (_) { return false; }
}

async function confirmTag() {
  const val = tagInput.value.trim().toUpperCase();
  if (!isValidTag(val)) {
    tagError.textContent = '1–6 letters A–Z only';
    return;
  }
  // If this tag is already taken, warn once and let them re-confirm or change it.
  if (val !== warnedTag && await tagExists(val)) {
    warnedTag = val;
    tagError.textContent = `“${val}” is taken — confirm again to use it, or change it`;
    return;
  }
  playerTag = val;
  sessionStorage.setItem('rfx_tag', val);
  warnedTag = null;
  hideTagModal();
  if (pendingScore !== null) {
    // Remember a top-100-but-outside-20 placement so the home list can pin a
    // "you" row; an inline (top-20) placement renders itself, so clear it.
    myStanding = (pendingStanding && pendingStanding.rank === '20+')
      ? { tag: val, ms: pendingScore, rank: '20+' }
      : null;
    submitScore(pendingScore);
    pendingScore = null;
    pendingStanding = null;
  }
  loadLeaderboard();
}

// Ask the server (no write) whether this run would make the global top 100,
// and where it would land. Returns { qualifies, rank } or null on any error
// (a failed check should not block or falsely prompt the player).
// rank is 1..20 if it lands in the ordered display, the string '20+' if it
// makes the top 100 but past the 20 ordered rows, or null when it doesn't place.
async function fetchStanding(tag, ms) {
  try {
    const q = new URLSearchParams({ ms: String(ms) });
    if (isValidTag(tag)) q.set('tag', tag);
    const res = await fetch(`${WORKER_URL}/standing?${q}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function submitScore(ms) {
  if (!isValidTag(playerTag)) return;
  // Client-side guards mirror the Worker: one in-flight POST, one per 30s.
  // The Worker is the real enforcer; this just avoids pointless 429s.
  if (submitInFlight) return;
  if (Date.now() - lastSubmitAt < SUBMIT_COOLDOWN_MS) return;
  submitInFlight = true;
  try {
    const res = await fetch(`${WORKER_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: playerTag, ms })
    });
    if (res.status === 429) return; // rate limited by server; leave board as-is
    if (res.ok) {
      lastSubmitAt = Date.now();
      loadLeaderboard(); // reflect the newly posted score
    }
  } catch (_) {
  } finally {
    submitInFlight = false;
  }
}

async function loadLeaderboard() {
  try {
    const res  = await fetch(`${WORKER_URL}/scores`);
    const data = await res.json();
    leaderboard = Array.isArray(data) ? data : [];
    renderLeaderboard(leaderboard);
  } catch (_) {
    document.getElementById('lbRows').innerHTML =
      '<div style="font-size:10px;color:var(--muted);text-align:center;padding:6px 0">unavailable</div>';
  }
}

function renderLeaderboard(entries) {
  const el = document.getElementById('lbRows');
  const toggle = document.getElementById('lbToggle');
  document.getElementById('leaderboard').classList.toggle('lb-expanded', lbExpanded);
  if (!entries || !entries.length) {
    el.innerHTML = '<div style="font-size:10px;color:var(--muted);text-align:center;padding:6px 0">no scores yet</div>';
    toggle.classList.add('hidden');
    return;
  }
  // If the player is present in the ordered rows, they render inline — drop any
  // stale "outside top 20" standing so we don't also pin a duplicate row.
  if (myStanding && entries.some(e => e.tag === myStanding.tag)) myStanding = null;

  const visible = lbExpanded ? entries : entries.slice(0, BOARD_COLLAPSED);
  let html = visible.map((e, i) => {
    const isYou = e.tag === playerTag;
    return `<div class="lb-row${isYou ? ' lb-you' : ''}">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-tag">${e.tag}</span>
      <span class="lb-ms">${e.ms}ms</span>
      <span class="lb-date">${fmtScoreDate(e.at)}</span>
    </div>`;
  }).join('');

  // Pin the player's own row at the bottom when they made the top 100 but sit
  // outside the ordered top 20. Rank is shown as "20+" (we don't order past 20).
  if (myStanding) {
    html += `<div class="lb-row lb-you lb-pinned">
      <span class="lb-rank">20+</span>
      <span class="lb-tag">${myStanding.tag}</span>
      <span class="lb-ms">${myStanding.ms}ms</span>
      <span class="lb-date"></span>
    </div>`;
  }
  el.innerHTML = html;

  // Only offer the toggle when there are more than the collapsed count.
  if (entries.length > BOARD_COLLAPSED) {
    toggle.classList.remove('hidden');
    toggle.textContent = lbExpanded ? 'Show top 5' : `Show top ${entries.length}`;
  } else {
    toggle.classList.add('hidden');
  }
}

document.getElementById('lbToggle').addEventListener('click', () => {
  lbExpanded = !lbExpanded;
  renderLeaderboard(leaderboard);
});

// Format an epoch-ms timestamp as a local date in "d mmm yyyy" form (e.g. 8 Jun 2026).
// Returns '' for missing/invalid values (older entries have no `at`).
function fmtScoreDate(at) {
  if (typeof at !== 'number' || !isFinite(at)) return '';
  const d = new Date(at);
  if (isNaN(d)) return '';
  const day = d.getDate();
  const mmm = d.toLocaleDateString([], { month: 'short' });
  const yyyy = d.getFullYear();
  return `${day} ${mmm} ${yyyy}`;
}

// ── INIT ──
updateBestDisplay();
show('home');
loadLeaderboard();

// ── PWA BOOTSTRAP ──
// Generates a manifest and service worker entirely from JS blobs so the
// game installs as a home-screen app when opened in Safari and added via
// Share → Add to Home Screen.

(function initPWA() {
  // 1. Draw the app icon on a canvas and use it as the touch icon
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 512, 512);
  ctx.beginPath();
  ctx.arc(256, 256, 200, 0, Math.PI * 2);
  ctx.fillStyle = '#00e676';
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.font = 'bold 88px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RFX', 256, 256);
  const iconDataUrl = canvas.toDataURL('image/png');

  // Apply as apple-touch-icon
  document.getElementById('appleTouchIcon').href = iconDataUrl;

  // 2. Inject a blob manifest so Safari sees a proper PWA name + icon
  const manifest = {
    name: 'REFLEX',
    short_name: 'REFLEX',
    display: 'fullscreen',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [{ src: iconDataUrl, sizes: '512x512', type: 'image/png' }]
  };
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  document.getElementById('pwaManifest').href = URL.createObjectURL(manifestBlob);
  // 3. Register an inline service worker for offline support
  if ('serviceWorker' in navigator) {
    const swCode = `
      const CACHE = 'reflex-v1';
      self.addEventListener('install', e => { self.skipWaiting(); });
      self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
      self.addEventListener('fetch', e => {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
      });
    `;
    const swBlob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(swBlob), { scope: '/' })
      .catch(() => {}); // silently fail — game still works without SW
  }
})();
