import { json, empty, handle, requireUser, sql, ensureSchema } from "./_lib.js";

// DELETE /api/account -> permanently deletes the user's trips, chats, usage and profile.
export const DELETE = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  await ensureSchema();
  await sql`DELETE FROM messages WHERE user_id = ${uid}`;
  await sql`DELETE FROM trips WHERE user_id = ${uid}`;
  await sql`DELETE FROM usage WHERE user_id = ${uid}`;
  const u = (await sql`SELECT email FROM users WHERE id = ${uid}`)[0];
  if (u && u.email) await sql`DELETE FROM email_codes WHERE email = ${String(u.email).toLowerCase()}`;
  await sql`DELETE FROM users WHERE id = ${uid}`;
  return empty();
});
