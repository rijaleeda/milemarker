import { json, handle, requireUser, sql, ensureSchema, userJson } from "./_lib.js";

// PUT /api/profile  { name, profile: { home, rvType, rvLength, phone, travelers } }
const RV_TYPES = ["Class A", "Class B", "Class C", "Travel trailer", "Fifth wheel", "Camper van", "Truck camper", "Pop-up", "Other", ""];
export const PUT = handle(async req => {
  const uid = await requireUser(req);
  if (!uid) return json({ error: "auth" }, 401);
  const b = await req.json().catch(() => ({}));
  const p = b.profile || {};
  const clean = {
    home: String(p.home || "").slice(0, 120),
    rvType: RV_TYPES.includes(p.rvType) ? p.rvType : "",
    rvLength: Math.max(0, Math.min(60, Math.round(+p.rvLength || 0))) || "",
    rvYear: Math.max(0, Math.min(2100, Math.round(+p.rvYear || 0))) || "",
    rvName: String(p.rvName || "").slice(0, 60),
    travelers: Array.isArray(p.travelers) ? p.travelers.slice(0, 12).map(t => ({ name: String(t.name || "").slice(0, 30), age: Math.max(0, Math.min(110, Math.round(+t.age || 0))) })) : []
  };
  await ensureSchema();
  await sql`UPDATE users SET name = ${String(b.name || "").trim().slice(0, 60)}, profile = ${JSON.stringify(clean)} WHERE id = ${uid}`;
  const u = (await sql`SELECT * FROM users WHERE id = ${uid}`)[0];
  return json({ user: userJson(u) });
});
