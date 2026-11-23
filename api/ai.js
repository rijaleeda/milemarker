import { json, handle, readToken, sql, ensureSchema, env } from "./_lib.js";
const PLAN_MARK = "You are an RV trip planner.";
const CHAT_MARK = "MileMarker's friendly chat assistant";
const CHAT_LIMIT_PER_DAY = 60;

export const POST = handle(async req => {
  let body; try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const prompt = String(body.prompt || "");
  if (!prompt.startsWith(PLAN_MARK) || prompt.length > 6000) return json({ error: "bad_request" }, 400);
  if (prompt.includes(CHAT_MARK)) {
    const uid = await readToken(req);
    if (!uid) return json({ error: "auth" }, 401);
    await ensureSchema();
    const day = new Date().toISOString().slice(0, 10);
    const rows = await sql`INSERT INTO usage (user_id, day, count) VALUES (${uid}, ${day}, 1)
      ON CONFLICT (user_id, day) DO UPDATE SET count = usage.count + 1 RETURNING count`;
    if (rows[0] && Number(rows[0].count) > CHAT_LIMIT_PER_DAY) return json({ error: "limit" }, 429);
  }
  if (!env().ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env().ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) return json({ error: "ai_unavailable" }, 502);
  const j = await r.json();
  return json({ text: (j.content || []).filter(c => c.type === "text").map(c => c.text).join("") });
});
