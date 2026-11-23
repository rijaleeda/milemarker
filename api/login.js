import { json, handle, makeToken, sql, ensureSchema, hashPassword, checkPassword, sha256, newCode, emailReady, sendEmail, userJson } from "./_lib.js";

// POST /api/login  { action, ... }  — email + password accounts with emailed 6-digit codes.
//   signup  { name, email, password }  -> { needCode: true }  (account is created after the code is confirmed)
//   verify  { email, code }            -> { token, user }
//   login   { email, password }        -> { token, user } or { needCode: true } if the email isn't confirmed yet
//   resend  { email }                  -> { needCode: true }
//   forgot  { email }                  -> { needCode: true } (same answer whether or not the email has an account)
//   reset   { email, code, password }  -> { token, user }
const CODE_MIN = 15, MAX_TRIES = 5, RESEND_GAP = 45e3;
const cleanEmail = e => String(e || "").trim().toLowerCase();
const okEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const okPw = p => typeof p === "string" && p.length >= 8 && p.length <= 200;

async function findUser(email) {
  const r = await sql`SELECT * FROM users WHERE lower(email) = ${email} ORDER BY (pw_hash IS NOT NULL) DESC, created_at LIMIT 1`;
  return r[0] || null;
}
async function issueCode(email, purpose, data) {
  const prev = (await sql`SELECT sent_at FROM email_codes WHERE email = ${email} AND purpose = ${purpose}`)[0];
  if (prev && Date.now() - Number(prev.sent_at) < RESEND_GAP) return "wait";
  const code = newCode();
  await sql`INSERT INTO email_codes (email, purpose, code_hash, data, expires, tries, sent_at)
    VALUES (${email}, ${purpose}, ${await sha256(email + ":" + code)}, ${data ? JSON.stringify(data) : null}, ${Date.now() + CODE_MIN * 60e3}, 0, ${Date.now()})
    ON CONFLICT (email, purpose) DO UPDATE SET code_hash = EXCLUDED.code_hash, data = COALESCE(EXCLUDED.data, email_codes.data), expires = EXCLUDED.expires, tries = 0, sent_at = EXCLUDED.sent_at`;
  const what = purpose === "reset" ? "reset your MileMarker password" : "confirm your MileMarker account";
  await sendEmail(email, `${code} is your MileMarker code`,
    `Your code to ${what} is ${code}. It expires in ${CODE_MIN} minutes. If you didn't ask for this, you can ignore this email.`,
    `<div style="font-family:system-ui,sans-serif;max-width:460px;margin:auto;padding:24px;color:#14323b"><h2 style="margin:0 0 8px">MileMarker</h2><p>Your code to ${what}:</p><p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:12px 0">${code}</p><p style="color:#5b6b70">It expires in ${CODE_MIN} minutes. If you didn't ask for this, you can ignore this email.</p></div>`);
  return "sent";
}
async function takeCode(email, purpose, code) {
  const row = (await sql`SELECT * FROM email_codes WHERE email = ${email} AND purpose = ${purpose}`)[0];
  if (!row || Number(row.expires) < Date.now()) return { err: "code_expired" };
  if (row.tries >= MAX_TRIES) return { err: "too_many_tries" };
  if (row.code_hash !== await sha256(email + ":" + String(code || "").trim())) {
    await sql`UPDATE email_codes SET tries = tries + 1 WHERE email = ${email} AND purpose = ${purpose}`;
    return { err: "wrong_code" };
  }
  await sql`DELETE FROM email_codes WHERE email = ${email} AND purpose = ${purpose}`;
  return { data: row.data ? JSON.parse(row.data) : {} };
}
async function signedIn(id) {
  const u = (await sql`SELECT * FROM users WHERE id = ${id}`)[0];
  return json({ token: await makeToken(id), user: userJson(u) });
}
async function createOrConfirm(email, name, pwHash) {
  const u = await findUser(email);
  if (u) {
    await sql`UPDATE users SET pw_hash = COALESCE(${pwHash}, pw_hash), email_verified = TRUE, name = CASE WHEN coalesce(name,'') = '' THEN ${name || ""} ELSE name END WHERE id = ${u.id}`;
    return u.id;
  }
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  const id = "e" + Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
  await sql`INSERT INTO users (id, email, name, picture, prefs, profile, pw_hash, email_verified, created_at)
    VALUES (${id}, ${email}, ${name || ""}, '', '{}', '{}', ${pwHash}, TRUE, ${Date.now()})`;
  return id;
}

export const POST = handle(async req => {
  const b = await req.json().catch(() => ({}));
  const email = cleanEmail(b.email), action = b.action;
  if (!okEmail(email)) return json({ error: "bad_email" }, 400);
  await ensureSchema();

  if (action === "signup") {
    const name = String(b.name || "").trim().slice(0, 60);
    if (!okPw(b.password)) return json({ error: "weak_password" }, 400);
    const u = await findUser(email);
    if (u && u.pw_hash && u.email_verified) return json({ error: "exists" }, 409);
    const pwHash = await hashPassword(b.password);
    // Without an email service yet, accounts are confirmed right away (see SETUP.md).
    if (!emailReady()) return signedIn(await createOrConfirm(email, name, pwHash));
    // The password is only attached once the emailed code is confirmed, so nobody can claim someone else's address.
    const r = await issueCode(email, "confirm", { name, pwHash });
    if (r === "wait") await sql`UPDATE email_codes SET data = ${JSON.stringify({ name, pwHash })} WHERE email = ${email} AND purpose = 'confirm'`;
    return json({ needCode: true, purpose: "confirm" });
  }
  if (action === "verify") {
    const t = await takeCode(email, "confirm", b.code);
    if (t.err) return json({ error: t.err }, 400);
    return signedIn(await createOrConfirm(email, t.data.name, t.data.pwHash || null));
  }
  if (action === "login") {
    const u = await findUser(email);
    if (!u || !u.pw_hash || !(await checkPassword(b.password, u.pw_hash))) return json({ error: "bad_login" }, 401);
    if (!u.email_verified && emailReady()) { await issueCode(email, "confirm", { name: u.name, pwHash: u.pw_hash }); return json({ needCode: true, purpose: "confirm" }); }
    return signedIn(u.id);
  }
  if (action === "resend") {
    const purpose = b.purpose === "reset" ? "reset" : "confirm";
    if (!emailReady()) return json({ error: "email_not_set_up" }, 503);
    const has = (await sql`SELECT 1 FROM email_codes WHERE email = ${email} AND purpose = ${purpose}`)[0];
    if (has && (await issueCode(email, purpose)) === "wait") return json({ error: "wait" }, 429);
    return json({ needCode: true, purpose });
  }
  if (action === "forgot") {
    if (!emailReady()) return json({ error: "email_not_set_up" }, 503);
    const u = await findUser(email);
    if (u) { if ((await issueCode(email, "reset")) === "wait") return json({ error: "wait" }, 429); }
    return json({ needCode: true, purpose: "reset" });
  }
  if (action === "reset") {
    if (!okPw(b.password)) return json({ error: "weak_password" }, 400);
    const t = await takeCode(email, "reset", b.code);
    if (t.err) return json({ error: t.err }, 400);
    const u = await findUser(email);
    if (!u) return json({ error: "code_expired" }, 400);
    await sql`UPDATE users SET pw_hash = ${await hashPassword(b.password)}, email_verified = TRUE WHERE id = ${u.id}`;
    return signedIn(u.id);
  }
  return json({ error: "bad_action" }, 400);
});
