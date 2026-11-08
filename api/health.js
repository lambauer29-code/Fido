// Vercel Function: prüft, ob die App richtig eingerichtet ist (verrät keine Geheimnisse)
export default function handler(req, res) {
  const token = process.env.APP_TOKEN;
  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    ok: true,
    key: !!process.env.ANTHROPIC_API_KEY,
    tokenRequired: !!token,
    tokenOk: !token || req.headers["x-app-token"] === token,
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5"
  });
}
