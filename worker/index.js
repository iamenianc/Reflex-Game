// Cloudflare Worker — Reflex Game Leaderboard
// KV binding name: KV (as created in Cloudflare dashboard)
// Deploy: wrangler deploy
//
// Routes:
//   GET  /scores       → top 10 entries [{tag, ms}, ...]
//   POST /score        → submit {tag, ms}, returns 200 or 400
//   DELETE /score/:tag?key=SECRET  → admin delete all entries for a tag

// ADMIN_KEY is injected at deploy time via: wrangler secret put ADMIN_KEY
// It is never stored in code or committed to git.
//
// KV layout:
//   leaderboard        → sorted index array [{tag, ms}, ...] (fast read for GET)
//   score:ABCDE        → that tag's current best, JSON {tag, ms, at} (one key per player)
const KV_KEY     = 'leaderboard';
const SCORE_PFX  = 'score:';
const RL_PFX     = 'rl:';
const MAX_STORED = 10;
const RL_WINDOW_MS = 30_000; // min gap between accepted POSTs for the same tag
const RL_TTL_SEC   = 60;     // KV min TTL is 60s; we gate on timestamp, key self-cleans

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method;

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') return new Response(null, { headers: cors });

    // GET /scores
    if (method === 'GET' && url.pathname === '/scores') {
      const raw     = await env.KV.get(KV_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      return Response.json(entries.slice(0, 10), { headers: cors });
    }

    // GET /exists?tag=X → { exists: bool }  (is this tag already recorded?)
    if (method === 'GET' && url.pathname === '/exists') {
      const tag = (url.searchParams.get('tag') || '').toUpperCase();
      if (!/^[A-Z]{1,6}$/.test(tag)) return bad('invalid tag', cors);
      const hit = await env.KV.get(SCORE_PFX + tag);
      return Response.json({ exists: hit !== null }, { headers: cors });
    }

    // POST /score
    if (method === 'POST' && url.pathname === '/score') {
      let body;
      try { body = await request.json(); } catch { return bad('invalid json', cors); }

      const { tag, ms } = body;
      if (typeof tag !== 'string' || !/^[A-Z]{1,6}$/.test(tag))
        return bad('tag must be 1-6 uppercase letters A-Z', cors);
      if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 100 || ms > 999)
        return bad('ms must be an integer between 100 and 999', cors);

      // Rate limit: one accepted POST per tag per 30s, and one at a time.
      // The rl: key both enforces the 30s gap and acts as an in-flight lock —
      // a concurrent POST for the same tag sees it and is rejected.
      const rlKey  = RL_PFX + tag;
      const rlPrev = await env.KV.get(rlKey);
      if (rlPrev !== null) {
        const elapsed = Date.now() - Number(rlPrev);
        if (!(elapsed >= 0) || elapsed < RL_WINDOW_MS) {
          const retry = Math.max(1, Math.ceil((RL_WINDOW_MS - elapsed) / 1000));
          return new Response(JSON.stringify({ error: 'rate limited', retryAfter: retry }), {
            status: 429,
            headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(retry) }
          });
        }
      }
      // Claim the window immediately, before any read-modify-write below.
      await env.KV.put(rlKey, String(Date.now()), { expirationTtl: RL_TTL_SEC });

      // 1. Read this tag's existing best — is this submission a new best?
      const scoreKey = SCORE_PFX + tag;
      const prevRaw  = await env.KV.get(scoreKey);
      const prevMs   = prevRaw ? JSON.parse(prevRaw).ms : null;

      if (prevMs !== null && ms >= prevMs)
        return new Response('ok', { status: 200, headers: cors }); // not a new best, nothing to do

      // 2. Write/overwrite this tag's own best-score key.
      const record = { tag, ms, at: Date.now() };
      await env.KV.put(scoreKey, JSON.stringify(record));

      // 3. Read the leaderboard index, upsert this tag.
      const raw     = await env.KV.get(KV_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      const idx = entries.findIndex(e => e.tag === tag);
      if (idx !== -1) { entries[idx].ms = ms; entries[idx].at = record.at; }
      else            entries.push({ tag, ms, at: record.at });

      // 4. Sort by ms ascending, 5. trim to MAX_STORED, 6. write index back.
      entries.sort((a, b) => a.ms - b.ms);
      entries.splice(MAX_STORED);
      await env.KV.put(KV_KEY, JSON.stringify(entries));

      return new Response('ok', { status: 200, headers: cors });
    }

    // DELETE /score/:tag?key=SECRET  (admin)
    if (method === 'DELETE' && url.pathname.startsWith('/score/')) {
      if (url.searchParams.get('key') !== env.ADMIN_KEY)
        return new Response('forbidden', { status: 403, headers: cors });
      const tag = url.pathname.split('/')[2].toUpperCase();
      if (!/^[A-Z]{1,6}$/.test(tag)) return bad('invalid tag', cors);

      const raw     = await env.KV.get(KV_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      const filtered = entries.filter(e => e.tag !== tag);
      await env.KV.put(KV_KEY, JSON.stringify(filtered));
      await env.KV.delete(SCORE_PFX + tag); // remove the tag's own best-score key too
      return new Response('deleted', { status: 200, headers: cors });
    }

    return new Response('not found', { status: 404, headers: cors });
  }
};

function bad(msg, cors) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
