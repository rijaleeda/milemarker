import { json, empty, handle, requireUser, sql, ensureSchema } from "./_lib.js";

export const PUT = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  const { prefs } = await req.json();
  const s = JSON.stringify(prefs || {});
  if (s.length > 2000) return json({ error: "too_large" }, 413);
  await ensureSchema();
  await sql`UPDATE users SET prefs = ${s} WHERE id = ${uid}`;
  return empty();
});
