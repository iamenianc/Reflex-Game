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
const KV_KEY     = 'leaderboard';
const MAX_STORED = 100;

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

    // POST /score
    if (method === 'POST' && url.pathname === '/score') {
      let body;
      try { body = await request.json(); } catch { return bad('invalid json', cors); }

      const { tag, ms } = body;
      if (typeof tag !== 'string' || !/^[A-Z]{5}$/.test(tag))
        return bad('tag must be 5 uppercase letters A-Z', cors);
      if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 100 || ms > 999)
        return bad('ms must be an integer between 100 and 999', cors);

      const raw     = await env.KV.get(KV_KEY);
      const entries = raw ? JSON.parse(raw) : [];

      // Keep only the best score per tag
      const idx = entries.findIndex(e => e.tag === tag);
      if (idx !== -1) {
        if (ms < entries[idx].ms) entries[idx].ms = ms;
        // already have a better or equal score — no update needed otherwise
      } else {
        entries.push({ tag, ms });
      }

      // Sort by ms ascending, keep top MAX_STORED
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
      if (!/^[A-Z]{5}$/.test(tag)) return bad('invalid tag', cors);

      const raw     = await env.KV.get(KV_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      const filtered = entries.filter(e => e.tag !== tag);
      await env.KV.put(KV_KEY, JSON.stringify(filtered));
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
