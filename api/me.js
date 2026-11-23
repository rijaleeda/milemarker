import { json, handle, requireUser, sql, ensureSchema, userJson } from "./_lib.js";

export const GET = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  await ensureSchema();
  const rows = await sql`SELECT * FROM users WHERE id = ${uid}`;
  const u = rows[0];
  if (!u) return json({ error: "auth" }, 401);
  return json({ user: userJson(u) });
});
