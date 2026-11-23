import { json, empty, handle, requireUser, sql, ensureSchema } from "./_lib.js";

export const GET = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  await ensureSchema();
  const rows = await sql`SELECT role, text FROM messages WHERE user_id = ${uid} ORDER BY id DESC LIMIT 60`;
  return json({ messages: rows.reverse().map(m => ({ r: m.role, t: m.text })) });
});

export const POST = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  const { messages } = await req.json();
  const list = (Array.isArray(messages) ? messages : []).slice(0, 4)
    .map(m => ({ r: m.r === "u" ? "u" : "b", t: String(m.t || "").slice(0, 2000) })).filter(m => m.t);
  await ensureSchema();
  const now = Date.now();
  for (const m of list) await sql`INSERT INTO messages (user_id, role, text, created_at) VALUES (${uid}, ${m.r}, ${m.t}, ${now})`;
  await sql`DELETE FROM messages WHERE user_id = ${uid} AND id NOT IN (SELECT id FROM messages WHERE user_id = ${uid} ORDER BY id DESC LIMIT 200)`;
  return empty();
});
