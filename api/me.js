import { json, handle, requireUser, sql, ensureSchema } from "./_lib.js";

export const GET = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  await ensureSchema();
  const rows = await sql`SELECT id, name, email, picture, prefs FROM users WHERE id = ${uid}`;
  const u = rows[0];
  if (!u) return json({ error: "auth" }, 401);
  return json({ user: { id: u.id, name: u.name, email: u.email, picture: u.picture, prefs: JSON.parse(u.prefs || "{}") } });
});
