// ═══════════════════════════════════════════════════════════
// MULTIPLAYER (CHALLENGE / 2P MODE)
// Loaded AFTER app.js as a plain script, so it shares global scope and can
// freely call app.js helpers (show, startCountdown, updateScoreBar, showScoreBar,
// applyGradeStyle, timeColor, formatBreakdown, sound*) and read/write the shared
// chal* state declared in app.js.
//
// app.js keeps the inline `mode === 'challenge'` branches in the tap flow and
// owns the chal* state + the score bar; this file owns the challenge RESULT flow
// (challengeResult, showFinal) and the challenge-specific button handlers.
//
// 2P Mode is gated behind FEATURES.TWO_PLAYER_MODE (declared in app.js). When
// disabled the home-screen button is hidden and the handlers no-op as a safety net.
// ═══════════════════════════════════════════════════════════

// ── CHALLENGE RESULT ──
// avg = mean of all TAPS_PER_SET tap times for the current player's set.
// Called once per player per round. First call shows the per-player result and prompts
// phone pass; second call compares both and records the round winner.
// Match is best-of-3 rounds (first to 2 round wins, or whoever leads after 3 rounds).
function challengeResult(avg, taps) {
  chalRoundResults.push({ player: chalTurn, avg, taps });
  chalTimes[chalTurn].push(avg);

  // Show per-player round result
  document.getElementById('crPlayerName').textContent = chalPlayers[chalTurn];
  const crTimeEl = document.getElementById('crTime');
  crTimeEl.textContent = avg;
  crTimeEl.style.color = timeColor(avg);
  document.getElementById('crBreakdown').textContent = formatBreakdown(taps);

  const crGradeEl = document.getElementById('crGrade');
  const g = applyGradeStyle(crGradeEl, avg);
  crGradeEl.textContent = `${g.emoji} ${g.label}`;

  const winnerTag  = document.getElementById('crWinnerTag');
  const nextInfo   = document.getElementById('crNextInfo');
  const nextBtn    = document.getElementById('btnNextRound');
  winnerTag.className = 'round-winner-tag hidden';

  if (chalRoundResults.length === 1) {
    // First player done — pass to second
    nextInfo.textContent = `Now pass to ${chalPlayers[1 - chalTurn]}`;
    nextBtn.textContent  = 'PASS PHONE';
    chalTurn = 1 - chalTurn;
    updateScoreBar();
  } else {
    // Both done — determine round winner by lower average
    const r0 = chalRoundResults[0];
    const r1 = chalRoundResults[1];
    const roundWinner = r0.avg < r1.avg ? r0.player : (r1.avg < r0.avg ? r1.player : -1);

    winnerTag.classList.remove('hidden');
    if (roundWinner === -1) {
      winnerTag.className = 'round-winner-tag tie';
      winnerTag.textContent = '🤝 TIE ROUND';
      soundBadResult();
    } else {
      chalScores[roundWinner]++;
      winnerTag.className = `round-winner-tag p${roundWinner+1}w`;
      winnerTag.textContent = `${chalPlayers[roundWinner]} wins the round!`;
      soundGoodResult();
    }
    updateScoreBar();

    const matchOver = chalScores[0] >= 2 || chalScores[1] >= 2 || chalRound >= 2;
    if (matchOver) {
      nextInfo.textContent = 'See final results';
      nextBtn.textContent  = 'FINAL SCORE';
      nextBtn.dataset.next = 'final';
    } else {
      chalRound++;
      chalRoundResults = [];
      chalTurn = 0;
      nextInfo.textContent = `Round ${chalRound + 1} — ${chalPlayers[0]} goes first`;
      nextBtn.textContent  = 'NEXT ROUND';
      nextBtn.dataset.next = 'round';
    }
  }

  show('chalRound');
}

// ── NEXT ROUND BTN ──
// dataset.next is set by challengeResult: 'final' when match is over, 'round' for next round,
// or '' (mid-round) when the first player just finished and we're passing to the second.
document.getElementById('btnNextRound').addEventListener('click', () => {
  const next = document.getElementById('btnNextRound').dataset.next;
  if (next === 'final') {
    showFinal();
  } else {
    // 'round' (start next round) or '' (pass phone mid-round) — same action
    startCountdown(`Round ${chalRound + 1} · ${chalPlayers[chalTurn]}`);
  }
});

// ── FINAL ──
// Displays the match winner, score breakdown, and per-player best-round averages.
// chalTimes[p] is an array of that player's set-average from each round they played.
function showFinal() {
  showScoreBar(false);
  const w0 = chalScores[0], w1 = chalScores[1];
  const crown  = document.getElementById('finalCrown');
  const nameEl = document.getElementById('finalWinnerName');
  const lblEl  = document.getElementById('finalWinnerLabel');
  const winsEl = document.getElementById('finalWinsLabel');

  if (w0 > w1) {
    crown.textContent = '🏆';
    lblEl.textContent = 'Winner';
    nameEl.textContent = chalPlayers[0];
    nameEl.className = 'final-winner-name p1';
    winsEl.textContent = `${w0} – ${w1}`;
  } else if (w1 > w0) {
    crown.textContent = '🏆';
    lblEl.textContent = 'Winner';
    nameEl.textContent = chalPlayers[1];
    nameEl.className = 'final-winner-name p2';
    winsEl.textContent = `${w1} – ${w0}`;
  } else {
    crown.textContent = '🤝';
    lblEl.textContent = 'It\'s a tie!';
    nameEl.textContent = 'DEAD HEAT';
    nameEl.className = 'final-winner-name tie';
    winsEl.textContent = `${w0} – ${w1}`;
  }

  [0,1].forEach(p => {
    const times   = chalTimes[p];
    const roundAvg = times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : null;
    document.getElementById(`fcName${p+1}`).textContent = chalPlayers[p];
    document.getElementById(`fcBest${p+1}`).textContent = roundAvg ? roundAvg + 'ms' : '—';
    document.getElementById(`fcBreakdown${p+1}`).textContent = times.length > 1 ? formatBreakdown(times) : '';
    document.getElementById(`fcWins${p+1}`).textContent = `${chalScores[p]} win${chalScores[p] !== 1 ? 's' : ''}`;
  });

  show('chalFinal');
}

// ── CHALLENGE BUTTON HANDLERS ──
// btnChallenge → setup screen; btnBegin → initialises challenge state and starts round 1.
// btnRematch → resets scores but keeps player names. btnChalBack/btnFinalHome → return home.

// 2P Mode is gated behind a feature flag. When disabled, hide the button
// entirely and ignore the handler as a safety net.
if (!FEATURES.TWO_PLAYER_MODE) {
  document.getElementById('btnChallenge').classList.add('hidden');
}
document.getElementById('btnChallenge').addEventListener('click', () => {
  if (!FEATURES.TWO_PLAYER_MODE) return;
  show('chalSetup');
});

document.getElementById('btnBegin').addEventListener('click', () => {
  const n1 = document.getElementById('p1Name').value.trim() || 'Player 1';
  const n2 = document.getElementById('p2Name').value.trim() || 'Player 2';
  chalPlayers   = [n1, n2];
  chalScores    = [0, 0];
  chalTimes     = [[], []];
  chalRound     = 0;
  chalTurn      = 0;
  chalRoundResults = [];
  setTaps = []; setTapNum = 0;
  mode = 'challenge';
  updateScoreBar();
  showScoreBar(true);
  document.getElementById('btnNextRound').dataset.next = '';
  startCountdown(`Round 1 · ${chalPlayers[0]}`);
});

document.getElementById('btnChalBack').addEventListener('click', () => {
  show('home');
});

document.getElementById('btnRematch').addEventListener('click', () => {
  setTaps = []; setTapNum = 0;
  chalScores    = [0, 0];
  chalTimes     = [[], []];
  chalRound     = 0;
  chalTurn      = 0;
  chalRoundResults = [];
  updateScoreBar();
  showScoreBar(true);
  startCountdown(`Round 1 · ${chalPlayers[0]}`);
});

document.getElementById('btnFinalHome').addEventListener('click', () => {
  showScoreBar(false); updateBestDisplay(); show('home'); loadLeaderboard();
});
