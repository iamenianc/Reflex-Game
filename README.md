# Reflex-Game
- A game that tests reaction time
- playable dev version here [text](https://iamenianc.github.io/Reflex-Game/)
- made by i.c.

## Terminology

| Term | Definition |
|------|------------|
| **Tap** | One ready→wait→tap cycle. The screen turns red (wait), then green (tap) — your reaction time for that single cycle is recorded. |
| **Set** | A group of taps (randomly 6 or 7 per set, chosen fresh each set; the length is fixed before the tap sequence is generated). The average of all taps in a set produces one score. A solo run is always one set. |
| **Round** | Challenge (2P) mode only — currently disabled behind a feature flag. One round = both players each complete one set. The match is best of 3 rounds. |
| **Don't Tap** | A decoy screen — the circle turns dark red and reads "DON'T TAP!" with no sound. Tapping on it fails the set. Resisting for 1500ms passes the screen. |

## Gameplay
Press **BEGIN TEST**, then after a randomized wait (0.4–4.0s) the screen turns green — tap as fast as you can. Tap too early and the set fails. Too slow (>1500ms) and it also fails. Your average reaction time across all taps is graded from S-tier (under 200ms) down to F. Each run is one solo set.

> **Note:** Head-to-head **2P Mode** is gated behind a feature flag (`FEATURES.TWO_PLAYER_MODE`) and is currently **disabled** while it's being reworked. The code (setup, rounds, best-of-3 final) is intact and re-enabling it is a one-line flip.

## Global leaderboard
Qualifying solo scores can be submitted under a 1–6 letter tag to a global "Global Best" board (top 10), backed by a Cloudflare Worker. The board shows the top 5 by default and expands to all 10 on demand. Dates are shown in `d mmm yyyy` format.

## Don't Tap mechanic
Every set is guaranteed to include at least one clean **TAP!** screen **within the first 6 tests**, and at least one **Don't Tap** screen somewhere in the set. Tapping on a Don't Tap screen counts as a failure (same penalty as tapping too early).

## Tap/Don't-Tap probability and sequence

The set length (6 or 7) is decided **first**, then the full sequence of tap types is pre-determined — not decided screen-by-screen. The process:

1. For each slot in the set, independently assign a 49% chance of being "Don't Tap" using `crypto.getRandomValues` for cryptographic-quality entropy.
2. If the **first 6 slots** all ended up as Don't Tap, one random slot among those first 6 is flipped to TAP! — guaranteeing an early clean tap every set.
3. If no slot in the whole set ended up as Don't Tap, one random slot is flipped to DON'T TAP!

   Both guarantee flips draw fresh `Math.random()` entropy for the index, independent of the entropy used to build the sequence.

This means:
- There is always a real **TAP!** within the first six tests of every set.
- The sequence is fully fixed before play begins — there is no adaptive or memory-based adjustment mid-set.
- Expected Don't Tap screens per set: ~2.9 out of 6, or ~3.4 out of 7 (≈49%), before the guarantee corrections kick in.
