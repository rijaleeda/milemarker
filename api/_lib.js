// Shared helpers for MileMarker's Vercel functions.
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   ANTHROPIC_API_KEY  - from console.anthropic.com
//   SESSION_SECRET     - any long random text (40+ characters)
//   GOOGLE_CLIENT_ID   - Google OAuth web client ID (for sign-in)
//   DATABASE_URL       - added automatically when you connect a Neon database in Vercel > Storage
//   RESEND_API_KEY     - from resend.com, sends sign-up confirmation and password-reset codes
//   MAIL_FROM          - sender, e.g. "MileMarker <hello@yourdomain.com>" (a domain verified in Resend)

const enc = new TextEncoder(), dec = new TextDecoder();
export const env = () => process.env;
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const empty = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

/* ---------- database (Neon Postgres) ---------- */
let neonSql = null;
export async function sql(strings, ...values) {
  if (globalThis.__TEST_SQL) return globalThis.__TEST_SQL(strings, ...values);
  if (!neonSql) {
    const url = env().DATABASE_URL || env().POSTGRES_URL;
    if (!url) throw new Error("no_database");
    const { neon } = await import("@neondatabase/serverless");
    neonSql = neon(url);
  }
  return neonSql(strings, ...values);
}
let schemaReady = null;
export function ensureSchema() {
  if (globalThis.__TEST_SQL) return Promise.resolve();
  return (schemaReady ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, email TEXT, name TEXT, picture TEXT, prefs TEXT DEFAULT '{}', created_at BIGINT)`;
    await sql`CREATE TABLE IF NOT EXISTS trips (user_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at BIGINT, PRIMARY KEY (user_id, id))`;
    await sql`CREATE TABLE IF NOT EXISTS messages (id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at BIGINT)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, id)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pw_hash TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile TEXT DEFAULT '{}'`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_pw ON users (lower(email)) WHERE pw_hash IS NOT NULL`;
    await sql`CREATE TABLE IF NOT EXISTS email_codes (email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, data TEXT, expires BIGINT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, sent_at BIGINT NOT NULL, PRIMARY KEY (email, purpose))`;
    await sql`CREATE TABLE IF NOT EXISTS usage (user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))`;
  })().catch(e => { schemaReady = null; throw e; }));
}

/* ---------- sessions ---------- */
async function hmacKey() {
  const secret = env().SESSION_SECRET;
  if (!secret || secret.length < 20) throw new Error("no_session_secret");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function makeToken(uid) {
  const body = b64u(enc.encode(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 30 * 86400 })));
  return body + "." + b64u(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
}
export async function readToken(req) {
  const h = req.headers.get("authorization") || "";
  const [body, sig] = (h.startsWith("Bearer ") ? h.slice(7) : "").split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), fromB64u(sig), enc.encode(body)))) return null;
    const p = JSON.parse(dec.decode(fromB64u(body)));
    return p.uid && p.exp > Date.now() / 1000 ? p.uid : null;
  } catch { return null; }
}
export async function requireUser(req) {
  const uid = await readToken(req);
  return uid || null;
}

/* ---------- passwords and email codes ---------- */
export async function hashPassword(pw) {
  const { scrypt, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16);
  const h = await new Promise((res, rej) => scrypt(String(pw), salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(k)));
  return "s1$" + salt.toString("base64") + "$" + h.toString("base64");
}
export async function checkPassword(pw, stored) {
  const [v, salt, hash] = String(stored || "").split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const { scrypt, timingSafeEqual } = await import("node:crypto");
  const want = Buffer.from(hash, "base64");
  const got = await new Promise((res, rej) => scrypt(String(pw), Buffer.from(salt, "base64"), want.length, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(k)));
  return got.length === want.length && timingSafeEqual(got, want);
}
export async function sha256(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(String(s)))); }
export function newCode() { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 1000000).padStart(6, "0"); }
export const emailReady = () => !!env().RESEND_API_KEY;
export async function sendEmail(to, subject, text, html) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env().RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env().MAIL_FROM || "MileMarker <onboarding@resend.dev>", to: [to], subject, text, html })
  });
  if (!r.ok) throw new Error("email_failed");
}
export const userJson = u => ({ id: u.id, name: u.name || "", email: u.email || null, picture: u.picture || "", provider: u.google_sub ? "google" : "email",
  emailVerified: !!u.email_verified, prefs: JSON.parse(u.prefs || "{}"), profile: JSON.parse(u.profile || "{}") });

/* ---------- Google sign-in ---------- */
let jwks = null, jwksAt = 0;
async function googleKeys() {
  if (jwks && Date.now() - jwksAt < 3600e3) return jwks;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  jwks = (await r.json()).keys; jwksAt = Date.now();
  return jwks;
}
export async function verifyGoogle(cred) {
  const [h, p, s] = String(cred || "").split(".");
  if (!s) return null;
  const head = JSON.parse(dec.decode(fromB64u(h))), pay = JSON.parse(dec.decode(fromB64u(p)));
  if (head.alg !== "RS256") return null;
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64u(s), enc.encode(h + "." + p)))) return null;
  if (!env().GOOGLE_CLIENT_ID || pay.aud !== env().GOOGLE_CLIENT_ID) return null;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(pay.iss)) return null;
  if (!(pay.exp > Date.now() / 1000)) return null;
  if (pay.email && pay.email_verified === false) return null;
  return pay;
}

/* ---------- wrap a handler: errors become JSON ---------- */
export const handle = fn => async req => {
  try { return await fn(req); }
  catch (e) {
    const msg = String(e && e.message || "");
    if (msg === "no_database") return json({ error: "no_database" }, 503);
    if (msg === "no_session_secret") return json({ error: "not_configured" }, 503);
    if (msg === "email_failed") return json({ error: "email_failed" }, 502);
    return json({ error: "server" }, 500);
  }
};
