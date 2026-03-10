export interface Env {
  ASSETS: Fetcher;
  // Future: D1 for leaderboards
  // DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API routes (future: leaderboards, multiplayer)
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, url, env);
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(_request: Request, url: URL, _env: Env): Promise<Response> {
  if (url.pathname === "/api/health") {
    return Response.json({ status: "ok", game: "surge" });
  }

  // Future endpoints:
  // POST /api/scores     - submit score
  // GET  /api/scores     - leaderboard
  // POST /api/match      - join multiplayer queue
  // WS   /api/match/:id  - multiplayer websocket

  return Response.json({ error: "not found" }, { status: 404 });
}
