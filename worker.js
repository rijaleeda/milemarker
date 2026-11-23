// MileMarker API — Cloudflare Worker (v2: accounts + AI)
// Bindings (Worker > Settings):
//   D1 database binding named DB            (run schema.sql once in the D1 console)
//   Secret  ANTHROPIC_API_KEY               (from console.anthropic.com)
//   Secret  SESSION_SECRET                  (any long random string, 40+ characters)
//   Text    GOOGLE_CLIENT_ID                (your Google OAuth web client ID)
//   Text    ALLOWED_ORIGIN                  (e.g. https://milemarkerrv.com — no trailing slash)
// Routes: POST /ai, POST /auth/google, GET /me, PUT /prefs, GET /trips, PUT|DELETE /trips/:id,
//         GET|POST /messages, DELETE /account

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const CHAT_LIMIT_PER_DAY = 60;
const PLAN_MARK = "You are an RV trip planner.";
const CHAT_MARK = "MileMarker's friendly chat assistant";

async function hmacKey(env) {
  return crypto.subtle.importKey("raw", enc.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(env, uid) {
  const body = b64u(enc.encode(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 30 * 86400 })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body));
  return body + "." + b64u(sig);
}
async function readToken(env, req) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [body, sig] = t.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64u(sig), enc.encode(body)))) return null;
    const p = JSON.parse(dec.decode(fromB64u(body)));
    return p.uid && p.exp > Date.now() / 1000 ? p.uid : null;
  } catch { return null; }
}

let JWKS = null, JWKS_AT = 0;
async function googleKeys() {
  if (JWKS && Date.now() - JWKS_AT < 3600e3) return JWKS;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  JWKS = (await r.json()).keys; JWKS_AT = Date.now();
  return JWKS;
}
async function verifyGoogle(env, cred) {
  const [h, p, s] = String(cred || "").split(".");
  if (!s) return null;
  const head = JSON.parse(dec.decode(fromB64u(h)));
  const pay = JSON.parse(dec.decode(fromB64u(p)));
  if (head.alg !== "RS256") return null;
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64u(s), enc.encode(h + "." + p)))) return null;
  if (pay.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(pay.iss)) return null;
  if (!(pay.exp > Date.now() / 1000)) return null;
  if (pay.email && pay.email_verified === false) return null;
  return pay;
}

async function ai(req, env, json, uid) {
  let body; try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const prompt = String(body.prompt || "");
  if (!prompt.startsWith(PLAN_MARK) || prompt.length > 6000) return json({ error: "bad_request" }, 400);
  if (prompt.includes(CHAT_MARK)) {
    if (!uid) return json({ error: "auth" }, 401);
    const day = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare(
      "INSERT INTO usage(user_id, day, count) VALUES(?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 RETURNING count"
    ).bind(uid, day).first();
    if (row && row.count > CHAT_LIMIT_PER_DAY) return json({ error: "limit" }, 429);
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) return json({ error: "ai_unavailable" }, 502);
  const j = await r.json();
  return json({ text: (j.content || []).filter(c => c.type === "text").map(c => c.text).join("") });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "") || "/";
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Vary": "Origin",
    };
    const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, "content-type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (env.ALLOWED_ORIGIN && req.headers.get("Origin") !== env.ALLOWED_ORIGIN) return json({ error: "forbidden" }, 403);

    try {
      const uid = await readToken(env, req);

      if (req.method === "POST" && (path === "/" || path === "/ai")) return await ai(req, env, json, uid);

      if (req.method === "POST" && path === "/auth/google") {
        const { credential } = await req.json();
        const g = await verifyGoogle(env, credential);
        if (!g || !g.sub) return json({ error: "auth" }, 401);
        const id = "g" + String(g.sub).replace(/[^0-9a-zA-Z]/g, "");
        await env.DB.prepare(
          "INSERT INTO users(id, google_sub, email, name, picture, prefs, created_at) VALUES(?, ?, ?, ?, ?, '{}', ?) " +
          "ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture"
        ).bind(id, String(g.sub), g.email || null, g.name || "", g.picture || "", Date.now()).run();
        const u = await env.DB.prepare("SELECT prefs FROM users WHERE id = ?").bind(id).first();
        return json({ token: await makeToken(env, id), user: { id, name: g.name || "", email: g.email || null, picture: g.picture || "", prefs: JSON.parse(u?.prefs || "{}") } });
      }

      if (!uid) return json({ error: "auth" }, 401);

      if (req.method === "GET" && path === "/me") {
        const u = await env.DB.prepare("SELECT id, name, email, picture, prefs FROM users WHERE id = ?").bind(uid).first();
        if (!u) return json({ error: "auth" }, 401);
        return json({ user: { id: u.id, name: u.name, email: u.email, picture: u.picture, prefs: JSON.parse(u.prefs || "{}") } });
      }

      if (req.method === "PUT" && path === "/prefs") {
        const { prefs } = await req.json();
        const s = JSON.stringify(prefs || {});
        if (s.length > 2000) return json({ error: "too_large" }, 413);
        await env.DB.prepare("UPDATE users SET prefs = ? WHERE id = ?").bind(s, uid).run();
        return new Response(null, { status: 204, headers: cors });
      }

      if (req.method === "GET" && path === "/trips") {
        const { results } = await env.DB.prepare("SELECT data FROM trips WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50").bind(uid).all();
        return json({ trips: results.map(r => ({ data: JSON.parse(r.data) })) });
      }

      const tm = path.match(/^\/trips\/([a-z0-9]{4,40})$/);
      if (tm && req.method === "PUT") {
        const { data } = await req.json();
        const s = JSON.stringify(data || {});
        if (s.length > 150000) return json({ error: "too_large" }, 413);
        const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM trips WHERE user_id = ?").bind(uid).first();
        const exists = await env.DB.prepare("SELECT 1 FROM trips WHERE user_id = ? AND id = ?").bind(uid, tm[1]).first();
        if (!exists && c.n >= 100) return json({ error: "too_many" }, 409);
        await env.DB.prepare(
          "INSERT INTO trips(user_id, id, data, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
        ).bind(uid, tm[1], s, Date.now()).run();
        return new Response(null, { status: 204, headers: cors });
      }
      if (tm && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM trips WHERE user_id = ? AND id = ?").bind(uid, tm[1]).run();
        return new Response(null, { status: 204, headers: cors });
      }

      if (req.method === "GET" && path === "/messages") {
        const { results } = await env.DB.prepare("SELECT role, text FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 60").bind(uid).all();
        return json({ messages: results.reverse().map(m => ({ r: m.role, t: m.text })) });
      }
      if (req.method === "POST" && path === "/messages") {
        const { messages } = await req.json();
        const list = (Array.isArray(messages) ? messages : []).slice(0, 4)
          .map(m => ({ r: m.r === "u" ? "u" : "b", t: String(m.t || "").slice(0, 2000) })).filter(m => m.t);
        const now = Date.now();
        await env.DB.batch([
          ...list.map(m => env.DB.prepare("INSERT INTO messages(user_id, role, text, created_at) VALUES(?, ?, ?, ?)").bind(uid, m.r, m.t, now)),
          env.DB.prepare("DELETE FROM messages WHERE user_id = ? AND id NOT IN (SELECT id FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 200)").bind(uid, uid),
        ]);
        return new Response(null, { status: 204, headers: cors });
      }

      if (req.method === "DELETE" && path === "/account") {
        await env.DB.batch(["messages", "trips", "usage"].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid))
          .concat(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid)));
        return new Response(null, { status: 204, headers: cors });
      }

      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: "server" }, 500);
    }
  },
};
