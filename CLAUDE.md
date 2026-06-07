# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Do not edit or update this file unless the user explicitly asks you to update CLAUDE.md.**
**Read README.md as the first step if you have no other context**
**Automatically bump the version number after any change to index.html. The version lives in the `.version-footer` div (format `vMAJOR.MINOR.PATCH`, e.g. `v1.0.003`); increment the PATCH segment by one each time, zero-padded to 3 digits.**
**At the end of every response, output the number of tokens used in the format: `Tokens used: {input} in / {output} out`**/


## Project Overview

Reflex-Game is a single-file reaction time game deployed on GitHub Pages. No build system, no dependencies, no package manager — everything lives in `index.html`.

**Live**: https://iamenianc.github.io/Reflex-Game/

## Running Locally

Open `index.html` directly in a browser. No server or build step needed.

## Architecture

The entire app is one file (`index.html`, ~1200 lines) with three sections:

- **CSS** (lines 13–422): CSS custom properties for theming, responsive `clamp()` sizing, keyframe animations
- **HTML** (lines 424–570): Ten `.screen` divs representing game states
- **JavaScript** (lines 572–1209): Game logic, audio engine, PWA bootstrap

### Screen/State System

All UI is driven by toggling `.hidden` on `.screen` divs:

```javascript
show('screenName')  // hides all screens, reveals the named one
```

Screens: `home`, `countdown`, `getReady`, `wait`, `tap`, `early`, `slow`, `result`, `chalSetup`, `chalRound`, `chalFinal`

### Game Flow

**Solo**: `home → countdown → getReady → wait → tap → [early|slow|result] → home`

**Challenge**: `home → chalSetup → [N rounds: countdown → getReady → wait → tap → chalRound] → chalFinal → home`

### Timing

Reaction times are measured with `performance.now()`. The green-screen clock starts only after a double `requestAnimationFrame` to ensure the paint has committed before measuring begins.

### Audio

Web Audio API only — no audio files. `playTone(freq, type, duration, gain, startTime, rampDown)` synthesizes all sounds inline.

### Persistence (LocalStorage)

| Key | Value |
|-----|-------|
| `rfx_hist` | Array of reaction times (last 20) |
| `rfx_streak` | Consecutive successful rounds |
| `rfx_taps` | User's preferred taps-per-set (3–10) |

### PWA

The manifest and service worker are generated programmatically at the bottom of the JS section — no separate manifest.json or sw.js files exist.
