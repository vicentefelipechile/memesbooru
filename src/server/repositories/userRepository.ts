import * as d1 from "../infrastructure/d1/index.js";

export type UserRow = {
  id: number;
  username: string;
  display_name: string | null;
  rank: string;
  status: string;
  trust_score: number;
  created_at: number;
  last_login_at: number | null;
  last_activity_at: number | null;
};

export async function findById(db: D1Database, id: number): Promise<UserRow | null> {
  return d1.first<UserRow>(db, "SELECT * FROM users WHERE id = ?", [id]);
}
export async function findByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return d1.first<UserRow>(db, "SELECT * FROM users WHERE username = ?", [username]);
}
export async function findByGoogleSubject(db: D1Database, sub: string): Promise<UserRow | null> {
  return d1.first<UserRow>(
    db,
    "SELECT u.* FROM users u JOIN google_identities g ON g.user_id = u.id WHERE g.google_subject = ?",
    [sub],
  );
}
export async function createFromGoogle(db: D1Database, sub: string, username: string): Promise<UserRow> {
  const now = Date.now();
  // Transaccion simple: users -> google_identities -> user_activity
  const id = await d1
    .first<{ max: number }>(db, "SELECT COALESCE(MAX(id),0)+1 as max FROM users")
    .then((r) => r?.max ?? 1);
  await db.batch([
    db.prepare("INSERT INTO users (id, username, rank, status, trust_score, created_at) VALUES (?,?,'new','active',0,?)").bind(id, username, now),
    db.prepare("INSERT INTO google_identities (user_id, google_subject, created_at) VALUES (?,?,?)").bind(id, sub, now),
    db.prepare("INSERT INTO user_activity (user_id, updated_at) VALUES (?,?)").bind(id, now),
  ]);
  const row = await findById(db, id);
  if (!row) throw new Error("create user failed");
  return row;
}
export async function updateLastLogin(db: D1Database, userId: number): Promise<void> {
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE users SET last_login_at = ?, last_activity_at = ? WHERE id = ?").bind(now, now, userId),
    db.prepare("UPDATE google_identities SET last_login_at = ? WHERE user_id = ?").bind(now, userId),
  ]);
}
