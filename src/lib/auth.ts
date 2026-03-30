import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

type JwtPayload = { uid: number };

const mysqlUrl = process.env.MYSQL_URL;
let pool: mysql.Pool | null = null;
let ready = false;

async function ensureMysql(): Promise<mysql.Pool> {
  if (!mysqlUrl) throw new Error("MYSQL_URL_NOT_SET");
  if (!pool) {
    pool = mysql.createPool({
      uri: mysqlUrl,
      connectionLimit: 10,
      supportBigNumbers: true,
    });
  }
  if (!ready) {
    await pool.execute(`
      create table if not exists users (
        id bigint primary key auto_increment,
        username varchar(64) not null unique,
        password_hash varchar(255) not null,
        created_at datetime not null
      );
    `);
    ready = true;
  }
  return pool;
}

export function validateUsername(usernameRaw: string): string {
  const u = (usernameRaw ?? "").trim();
  if (!u) throw new Error("username_required");
  if (u.length < 3 || u.length > 64) throw new Error("username_invalid_length");
  if (!/^[a-zA-Z0-9_@.]+$/.test(u)) throw new Error("username_invalid_chars");
  return u;
}

export function validatePassword(passwordRaw: string): string {
  const p = String(passwordRaw ?? "");
  if (!p) throw new Error("password_required");
  if (p.length < 8 || p.length > 72) throw new Error("password_invalid_length");
  return p;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(userId: number): string {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret) throw new Error("auth_jwt_secret_not_set");
  return jwt.sign({ uid: userId } satisfies JwtPayload, secret, { expiresIn: "14d" });
}

export function verifyAuthToken(token: string): JwtPayload | null {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as any;
    const uid = Number(decoded?.uid);
    if (!Number.isFinite(uid) || uid <= 0) return null;
    return { uid };
  } catch {
    return null;
  }
}

export async function createUser(username: string, password: string): Promise<{ id: number; username: string }> {
  const pool = await ensureMysql();
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  const passHash = await hashPassword(password);
  try {
    const [res] = await pool.execute<mysql.ResultSetHeader>(
      "insert into users(username, password_hash, created_at) values(?, ?, ?)",
      [username, passHash, now]
    );
    return { id: Number(res.insertId), username };
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("Duplicate") || msg.includes("duplicate")) throw new Error("username_taken");
    throw e;
  }
}

export async function getUserByUsername(
  username: string
): Promise<{ id: number; username: string; password_hash: string } | null> {
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id, username, password_hash from users where username = ? limit 1",
    [username]
  );
  const r = (rows as any[])[0];
  return r ? { id: Number(r.id), username: String(r.username), password_hash: String(r.password_hash) } : null;
}

export async function getUserById(userId: number): Promise<{ id: number; username: string } | null> {
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id, username from users where id = ? limit 1",
    [userId]
  );
  const r = (rows as any[])[0];
  return r ? { id: Number(r.id), username: String(r.username) } : null;
}

