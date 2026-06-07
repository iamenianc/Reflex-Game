# Reflex-Game
- A game that tests reaction time
- playable dev version here [text](https://iamenianc.github.io/Reflex-Game/)
- made by i.c.

## Terminology

| Term | Definition |
|------|------------|
| **Tap** | One ready→wait→tap cycle. The screen turns red (wait), then green (tap) — your reaction time for that single cycle is recorded. |
| **Set** | A group of taps (randomly 6 or 7 per set, chosen fresh each set). The average of all taps in a set produces one score. Solo mode is always one set. |
| **Round** | Challenge (2P) mode only. One round = both players each complete one set. The match is best of 3 rounds. |
| **Don't Tap** | A decoy screen — the circle turns dark red and reads "DON'T TAP!" with no sound. Tapping on it fails the set. Resisting for 1500ms passes the screen. |

## Gameplay
Wait for the screen to turn green, then tap as fast as you can. Tap too early and the set fails. Too slow (>1500ms) and it also fails. Your average reaction time across all taps is graded from S-tier (under 200ms) down to F. Play solo (one set per run) or challenge a friend in head-to-head mode where the faster set average wins the round, best of 3.

## Don't Tap mechanic
Every set is guaranteed to include at least one **Don't Tap** screen and at least one clean **TAP!** screen. Tapping on a Don't Tap screen counts as a failure (same penalty as tapping too early).

## Tap/Don't-Tap probability and sequence

At the start of each set, the full sequence of tap types is pre-determined — not decided screen-by-screen. The process:

1. For each of the 6 or 7 slots in the set, independently assign a 50% chance of being "Don't Tap" using `crypto.getRandomValues` for cryptographic-quality entropy.
2. If every slot ended up as Don't Tap, one random slot is flipped to TAP!
3. If no slot ended up as Don't Tap, one random slot is flipped to DON'T TAP!

This means:
- The **first tap** in a set can be a Don't Tap (no special protection for slot 0).
- The sequence is fully fixed before play begins — there is no adaptive or memory-based adjustment mid-set.
- Expected Don't Tap screens per set: ~3 out of 6, or ~3.5 out of 7 (50%), before the guarantee corrections kick in.
