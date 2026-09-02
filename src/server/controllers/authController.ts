import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import * as auth from "../services/authService.js";

type Env = Cloudflare.Env & { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string; SESSION_SECRET: string };

export const authApp = new Hono<{ Bindings: Env }>();

// In-memory state store (en produccion usar KV/D1) — Fase 3 simple
const stateStore = new Map<string, number>();

authApp.get("/google", (c) => {
  const env = c.env;
  if (!env.GOOGLE_CLIENT_ID) return c.json({ error: "Google no configurado. Define GOOGLE_CLIENT_ID" }, 500);
  const state = crypto.randomUUID();
  stateStore.set(state, Date.now());
  setTimeout(() => stateStore.delete(state), 10 * 60 * 1000);
  const url = auth.getGoogleAuthUrl(env, state);
  return c.redirect(url);
});

authApp.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || !stateStore.has(state)) return c.text("Invalid state/code", 400);
  stateStore.delete(state);
  const env = c.env;
  const tokens = await auth.exchangeCodeForTokens(env, code);
  const sub = auth.decodeIdTokenSub(tokens.id_token);
  // D1
  const db = (c.env as unknown as { DB: D1Database }).DB;
  if (!db) return c.text("DB no configurada", 500);
  const user = await auth.findOrCreateUserBySub(db, sub);
  const sessionToken = await auth.createSession(db, user.id);
  setCookie(c, "session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return c.redirect("/");
});

authApp.post("/logout", async (c) => {
  const token = getCookie(c, "session");
  if (token) {
    const db = (c.env as unknown as { DB: D1Database }).DB;
    if (db) {
      const hash = await auth.hashTokenSync(token);
      const { revokeSession } = await import("../repositories/sessionRepository.js");
      await revokeSession(db, hash);
    }
  }
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

authApp.get("/me", async (c) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ user: null }, 200);
  const db = (c.env as unknown as { DB: D1Database }).DB;
  if (!db) return c.json({ user: null }, 200);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ user: null }, 200);
  const row = await db.prepare("SELECT id, username, display_name, rank, status FROM users WHERE id = ?").bind(sess.userId).first();
  return c.json({ user: row }, 200);
});

// TOTP endpoints (Fase 3)
authApp.post("/totp/setup", async (c) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const secret = auth.generateTotpSecret();
  // Guardar encriptado (para Fase 3 lo dejamos en claro, en prod cifrar con SESSION_SECRET)
  const enc = new TextEncoder().encode(secret);
  await db.prepare("INSERT OR REPLACE INTO user_totp (user_id, secret_encrypted, is_verified, created_at) VALUES (?,?,0,?)").bind(sess.userId, enc, Date.now()).run();
  return c.json({ secret, uri: `otpauth://totp/Memesbooru:${sess.userId}?secret=${secret}&issuer=Memesbooru` });
});
authApp.post("/totp/verify", async (c) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const { code } = await c.req.json<{ code: string }>();
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const row = await db.prepare("SELECT secret_encrypted FROM user_totp WHERE user_id = ?").bind(sess.userId).first<{ secret_encrypted: Uint8Array }>();
  if (!row) return c.json({ error: "no totp" }, 400);
  const secret = new TextDecoder().decode(row.secret_encrypted);
  const ok = await auth.totpVerify(secret, code);
  if (!ok) return c.json({ ok: false }, 400);
  await db.prepare("UPDATE user_totp SET is_verified = 1, verified_at = ? WHERE user_id = ?").bind(Date.now(), sess.userId).run();
  // Generar 10 recovery codes
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rc = Math.random().toString(36).slice(2, 10).toUpperCase();
    codes.push(rc);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rc));
    await db.prepare("INSERT INTO totp_recovery_codes (user_id, code_hash, created_at) VALUES (?,?,?)").bind(sess.userId, hash, Date.now()).run();
  }
  return c.json({ ok: true, recoveryCodes: codes });
});
