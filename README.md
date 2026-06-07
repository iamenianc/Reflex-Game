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
| **Don't Tap** | A decoy screen — the circle stays green but reads "DON'T TAP!" instead of "TAP!". Tapping on it fails the set. Resisting for 1500ms passes the screen. |

## Gameplay
Wait for the screen to turn green, then tap as fast as you can. Each set consists of 6 or 7 taps — the count is chosen randomly at the start of the set. Tap too early and the set fails. Too slow (>1500ms) and it also fails. Your average reaction time across all taps is graded from S-tier (under 200ms) down to F. Play solo (one set per run) or challenge a friend in head-to-head mode where the faster set average wins the round, best of 3.

## Don't Tap mechanic
Every set is guaranteed to include at least one **Don't Tap** screen and at least one guaranteed clean **TAP!** somewhere in positions 2–5. Beyond the guarantees, each tap screen has a 30% chance of being a Don't Tap, capped at 5 per set. Tapping on a Don't Tap screen counts as a failure (same penalty as tapping too early).
