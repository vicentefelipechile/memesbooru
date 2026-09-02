import * as userRepo from "../repositories/userRepository.js";
import * as sessionRepo from "../repositories/sessionRepository.js";
import { normalizeTag } from "../../shared/validation/index.js";

// Helpers crypto
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}
export async function generateSessionToken(): Promise<{ token: string; hash: ArrayBuffer }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = b64url(bytes);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return { token, hash };
}
export function hashTokenSync(token: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
}

// Google OAuth manual — PLAN 10
type GoogleEnv = { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string };

export function getGoogleAuthUrl(env: GoogleEnv, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCodeForTokens(env: GoogleEnv, code: string): Promise<{ id_token: string; access_token: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id_token: string; access_token: string };
}

export function decodeIdTokenSub(idToken: string): string {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("invalid id_token");
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (!payload.sub) throw new Error("id_token without sub");
  // No verificamos firma aqui — en produccion validar con JWKS de Google
  return payload.sub as string;
}

export function generateUsernameFromSub(sub: string): string {
  // username unico y normalizado sin acentos/ñ
  const base = `user_${sub.slice(-8)}`;
  return normalizeTag(base).slice(0, 20) || `user_${Date.now().toString(36)}`;
}

export async function findOrCreateUserBySub(db: D1Database, sub: string): Promise<{ id: number; username: string; rank: string }> {
  let user = await userRepo.findByGoogleSubject(db, sub);
  if (user) {
    await userRepo.updateLastLogin(db, user.id);
    return { id: user.id, username: user.username, rank: user.rank };
  }
  // Crear username unico (reintentar si colision)
  let username = generateUsernameFromSub(sub);
  for (let i = 0; i < 5; i++) {
    const exists = await userRepo.findByUsername(db, username);
    if (!exists) break;
    username = `${username}_${Math.random().toString(36).slice(2, 4)}`;
  }
  const created = await userRepo.createFromGoogle(db, sub, username);
  return { id: created.id, username: created.username, rank: created.rank };
}

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const { token, hash } = await generateSessionToken();
  const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
  await sessionRepo.createSession(db, userId, hash, expiresAt);
  return token;
}

export async function verifySession(db: D1Database, token: string): Promise<{ userId: number } | null> {
  const hash = await hashTokenSync(token);
  const row = await sessionRepo.findByTokenHash(db, hash);
  if (!row || row.revoked_at) return null;
  if (row.expires_at < Date.now()) return null;
  return { userId: row.user_id };
}

// TOTP (RFC 6238) — simplificado con WebCrypto HMAC SHA1
function base32Decode(s: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = s.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) throw new Error("invalid base32");
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}
export async function totpVerify(secretBase32: string, token: string, window = 1): Promise<boolean> {
  const key = base32Decode(secretBase32);
  const cryptoKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const step = 30;
  const now = Math.floor(Date.now() / 1000 / step);
  for (let i = -window; i <= window; i++) {
    const counter = now + i;
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, BigInt(counter), false);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, buf);
    const offset = new Uint8Array(sig)[19] & 0xf;
    const code = ((new DataView(sig).getUint32(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
    if (code === token) return true;
  }
  return false;
}
export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "";
  let bits = 0, value = 0;
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += "=";
  return out;
}
