import { json, empty, handle, requireUser, sql, ensureSchema } from "./_lib.js";
const okId = id => /^[a-z0-9]{4,40}$/.test(id || "");

// GET /api/trips            -> list
// PUT /api/trips?id=ID      -> save one trip  { data }
// DELETE /api/trips?id=ID   -> delete one trip
export const GET = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  await ensureSchema();
  const rows = await sql`SELECT data FROM trips WHERE user_id = ${uid} ORDER BY updated_at DESC LIMIT 50`;
  return json({ trips: rows.map(r => ({ data: JSON.parse(r.data) })) });
});

export const PUT = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!okId(id)) return json({ error: "bad_id" }, 400);
  const { data } = await req.json();
  const s = JSON.stringify(data || {});
  if (s.length > 150000) return json({ error: "too_large" }, 413);
  await ensureSchema();
  const count = await sql`SELECT COUNT(*) AS n FROM trips WHERE user_id = ${uid}`;
  const exists = await sql`SELECT 1 FROM trips WHERE user_id = ${uid} AND id = ${id}`;
  if (!exists.length && Number(count[0].n) >= 100) return json({ error: "too_many" }, 409);
  await sql`INSERT INTO trips (user_id, id, data, updated_at) VALUES (${uid}, ${id}, ${s}, ${Date.now()})
    ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`;
  return empty();
});

export const DELETE = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!okId(id)) return json({ error: "bad_id" }, 400);
  await ensureSchema();
  await sql`DELETE FROM trips WHERE user_id = ${uid} AND id = ${id}`;
  return empty();
});
