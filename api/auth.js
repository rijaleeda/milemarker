import { json, handle, verifyGoogle, makeToken, sql, ensureSchema, userJson } from "./_lib.js";

// POST /api/auth  { credential }  -> Google sign-in; creates the account on first visit.
export const POST = handle(async req => {
  const { credential } = await req.json();
  const g = await verifyGoogle(credential);
  if (!g || !g.sub) return json({ error: "auth" }, 401);
  await ensureSchema();
  const id = "g" + String(g.sub).replace(/[^0-9a-zA-Z]/g, "");
  await sql`INSERT INTO users (id, google_sub, email, name, picture, prefs, profile, email_verified, created_at)
    VALUES (${id}, ${String(g.sub)}, ${g.email || null}, ${g.name || ""}, ${g.picture || ""}, '{}', '{}', TRUE, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, picture = EXCLUDED.picture, email_verified = TRUE,
      name = CASE WHEN coalesce(users.name,'') = '' THEN EXCLUDED.name ELSE users.name END`;
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return json({ token: await makeToken(id), user: userJson(rows[0]) });
});
