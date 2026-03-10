export interface Env {
  ASSETS: Fetcher;
  JWT_SECRET: string;
  DEV_ORIGIN?: string;
  // Future: D1 for leaderboards
  // DB: D1Database;
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

  // Future endpoints:
  // POST /api/scores     - submit score
  // GET  /api/scores     - leaderboard
  // POST /api/match      - join multiplayer queue
  // WS   /api/match/:id  - multiplayer websocket

  return Response.json({ error: "not found" }, { status: 404 });
}
