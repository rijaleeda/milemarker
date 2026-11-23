import { json, empty, handle, requireUser, sql, ensureSchema } from "./_lib.js";

// DELETE /api/account -> permanently deletes the user's trips, chats, usage and profile.
export const DELETE = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  await ensureSchema();
  await sql`DELETE FROM messages WHERE user_id = ${uid}`;
  await sql`DELETE FROM trips WHERE user_id = ${uid}`;
  await sql`DELETE FROM usage WHERE user_id = ${uid}`;
  await sql`DELETE FROM users WHERE id = ${uid}`;
  return empty();
});
