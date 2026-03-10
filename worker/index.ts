export interface Env {
  ASSETS: Fetcher;
  JWT_SECRET: string;
  DEV_ORIGIN?: string;
  DB: D1Database;
}

interface SessionPayload {
  email: string;
  userId: string;
  scopes: string[];
  gravatarHash: string;
  exp: number;
  iat: number;
  iss: string;
}

/**
 * Verify an HMAC-SHA256 signed session token from auth.ljs.app
 */
async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  try {
    const decoded: { data: string; sig: string } = JSON.parse(atob(token));
    const { data, sig } = decoded;
    const payload: SessionPayload = JSON.parse(data);

    // Check expiry
    if (payload.exp < Date.now()) return null;

    // Check issuer
    if (payload.iss !== "auth.ljs.app") return null;

    // Verify HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = new Uint8Array(
      sig.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16))
    );
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));

    return valid ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Parse a specific cookie from the Cookie header
 */
function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Get the origin for this request (handles DEV_ORIGIN for local dev)
 */
function getOrigin(request: Request, env: Env): string {
  if (env.DEV_ORIGIN) return env.DEV_ORIGIN;
  const host = request.headers.get("host") || "surge.ljs.app";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, url, env);
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  // --- Health check ---
  if (url.pathname === "/api/health") {
    return Response.json({ status: "ok", game: "surge" });
  }

  // --- Auth callback: receives token from auth.ljs.app, sets session cookie ---
  if (url.pathname === "/api/auth/callback" && request.method === "GET") {
    const token = url.searchParams.get("token");
    const returnTo = url.searchParams.get("returnTo") || "/";

    if (!token) {
      return Response.json({ error: "missing_token" }, { status: 400 });
    }

    // Verify the token is valid before setting cookie
    const user = await verifySessionToken(token, env.JWT_SECRET);
    if (!user) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }

    const host = request.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");

    const cookieFlags = [
      `session=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${30 * 24 * 60 * 60}`,
    ];
    if (!isLocalhost) cookieFlags.push("Secure");

    return new Response(null, {
      status: 302,
      headers: {
        Location: returnTo,
        "Set-Cookie": cookieFlags.join("; "),
      },
    });
  }

  // --- Auth me: returns current user info from session cookie ---
  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const token = getCookie(request, "session");
    if (!token) {
      return Response.json({ authenticated: false });
    }

    const user = await verifySessionToken(token, env.JWT_SECRET);
    if (!user) {
      return Response.json({ authenticated: false });
    }

    return Response.json({
      authenticated: true,
      email: user.email,
      userId: user.userId,
    });
  }

  // --- Auth login: redirect to auth.ljs.app ---
  if (url.pathname === "/api/auth/login" && request.method === "GET") {
    const returnTo = url.searchParams.get("returnTo") || "/";
    const origin = getOrigin(request, env);

    const callbackUrl = new URL("/api/auth/callback", origin);
    callbackUrl.searchParams.set("returnTo", returnTo);

    const authUrl = new URL("/login", "https://auth.ljs.app");
    authUrl.searchParams.set("returnTo", callbackUrl.toString());

    return new Response(null, {
      status: 302,
      headers: { Location: authUrl.toString() },
    });
  }

  // --- Auth logout: clear session cookie ---
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const host = request.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");

    const cookieFlags = [
      "session=",
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
    ];
    if (!isLocalhost) cookieFlags.push("Secure");

    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookieFlags.join("; ") } }
    );
  }

  // --- Scores: submit (authenticated) ---
  if (url.pathname === "/api/scores" && request.method === "POST") {
    return handleScoreSubmit(request, env);
  }

  // --- Scores: global leaderboard (public) ---
  if (url.pathname === "/api/scores" && request.method === "GET") {
    return handleScoresGet(url, env);
  }

  // --- Scores: current user's best (authenticated) ---
  if (url.pathname === "/api/scores/me" && request.method === "GET") {
    return handleScoresMe(request, env);
  }

  // Future endpoints:
  // POST /api/match      - join multiplayer queue
  // WS   /api/match/:id  - multiplayer websocket

  return Response.json({ error: "not found" }, { status: 404 });
}

// ─── Score submission types ───────────────────────────────────────────────────

interface ScoreSubmission {
  score: number;
  wave: number;
  kills: number;
  checksum: number;
  displayName: string;
}

interface ScoreRow {
  id: number;
  user_id: string;
  display_name: string;
  score: number;
  wave: number;
  kills: number;
  created_at: string;
}

// ─── Checksum (must match client logic in src/game/logic.ts) ──────────────────

function accumulateChecksum(current: number, word: string, speed: number, zone: string, points: number): number {
  const event = `${word}|${speed.toFixed(6)}|${zone}|${points}`;
  let hash = current;
  for (let i = 0; i < event.length; i++) {
    hash = (Math.imul(hash, 31) + event.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Keep accumulateChecksum accessible for future server-side replay validation
void accumulateChecksum;

// ─── Sanity checks (thresholds kept server-side only) ─────────────────────────

/** Maximum plausible score per kill: fastest speed × longest word × 500 × CRITICAL(3) × generous combo × double_score(2) */
const MAX_POINTS_PER_KILL = 2.0 * 12 * 500 * 3 * 5.0 * 2; // ~360,000

/** Maximum plausible kills per wave (enemy count scales, but cap generously) */
const MAX_KILLS_PER_WAVE = 50;

/** Minimum seconds between submissions from same user */
const RATE_LIMIT_SECONDS = 10;

function validateSubmission(sub: ScoreSubmission): string | null {
  // Type checks
  if (typeof sub.score !== "number" || !Number.isFinite(sub.score) || sub.score < 0) {
    return "invalid_score";
  }
  if (typeof sub.wave !== "number" || !Number.isInteger(sub.wave) || sub.wave < 0) {
    return "invalid_wave";
  }
  if (typeof sub.kills !== "number" || !Number.isInteger(sub.kills) || sub.kills < 0) {
    return "invalid_kills";
  }
  if (typeof sub.checksum !== "number" || !Number.isFinite(sub.checksum)) {
    return "invalid_checksum";
  }
  if (typeof sub.displayName !== "string" || sub.displayName.length < 1 || sub.displayName.length > 64) {
    return "invalid_display_name";
  }

  // Sanity: score cannot exceed theoretical max for claimed kills
  if (sub.kills > 0 && sub.score / sub.kills > MAX_POINTS_PER_KILL) {
    return "score_exceeds_plausible_maximum";
  }

  // Sanity: kills must be plausible for the wave reached
  const maxKills = (sub.wave + 1) * MAX_KILLS_PER_WAVE;
  if (sub.kills > maxKills) {
    return "kills_exceed_plausible_maximum";
  }

  // Zero kills means zero score
  if (sub.kills === 0 && sub.score > 0) {
    return "score_without_kills";
  }

  return null;
}

// ─── Score API handlers ───────────────────────────────────────────────────────

async function handleScoreSubmit(request: Request, env: Env): Promise<Response> {
  // Authenticate
  const token = getCookie(request, "session");
  if (!token) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  const user = await verifySessionToken(token, env.JWT_SECRET);
  if (!user) {
    return Response.json({ error: "invalid_session" }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const sub = body as ScoreSubmission;

  // Validate fields
  const validationError = validateSubmission(sub);
  if (validationError) {
    return Response.json({ error: "submission_rejected" }, { status: 422 });
  }

  // Rate limit: check last submission time
  const recent = await env.DB.prepare(
    "SELECT created_at FROM scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(user.userId).first<{ created_at: string }>();

  if (recent) {
    const lastTime = new Date(recent.created_at + "Z").getTime();
    const now = Date.now();
    if ((now - lastTime) / 1000 < RATE_LIMIT_SECONDS) {
      return Response.json({ error: "submission_rejected" }, { status: 429 });
    }
  }

  // Insert score
  const result = await env.DB.prepare(
    "INSERT INTO scores (user_id, display_name, score, wave, kills, checksum) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    user.userId,
    sub.displayName,
    sub.score,
    sub.wave,
    sub.kills,
    sub.checksum
  ).run();

  return Response.json({
    ok: true,
    id: result.meta.last_row_id,
  }, { status: 201 });
}

async function handleScoresGet(url: URL, env: Env): Promise<Response> {
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(100, Math.max(1, parseInt(limitParam || "25", 10) || 25));

  const rows = await env.DB.prepare(
    "SELECT id, user_id, display_name, score, wave, kills, created_at FROM scores ORDER BY score DESC LIMIT ?"
  ).bind(limit).all<ScoreRow>();

  return Response.json({
    scores: rows.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      score: row.score,
      wave: row.wave,
      kills: row.kills,
      createdAt: row.created_at,
    })),
  });
}

async function handleScoresMe(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, "session");
  if (!token) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  const user = await verifySessionToken(token, env.JWT_SECRET);
  if (!user) {
    return Response.json({ error: "invalid_session" }, { status: 401 });
  }

  const rows = await env.DB.prepare(
    "SELECT id, user_id, display_name, score, wave, kills, created_at FROM scores WHERE user_id = ? ORDER BY score DESC LIMIT 10"
  ).bind(user.userId).all<ScoreRow>();

  return Response.json({
    scores: rows.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      score: row.score,
      wave: row.wave,
      kills: row.kills,
      createdAt: row.created_at,
    })),
  });
}
