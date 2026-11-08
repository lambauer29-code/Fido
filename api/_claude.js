// Gemeinsamer Aufruf der Claude-API mit strukturierter Antwort über ein Tool.
// Manche Modelle unterstützen kein erzwungenes tool_choice ("tool"/"any") –
// dann wird automatisch mit tool_choice "auto" + klarer Anweisung wiederholt.
export async function callTool({ tool, content, maxTokens = 8000 }) {
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
  const send = (choice) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, tools: [tool], tool_choice: choice,
      messages: [{ role: "user", content: choice.type === "auto"
        ? [...content, { type: "text", text: `Antworte ausschließlich, indem du das Tool ${tool.name} genau einmal aufrufst.` }]
        : content }]
    })
  });
  let r = await send({ type: "tool", name: tool.name });
  let json = await r.json();
  if (!r.ok && /tool_choice/i.test(json?.error?.message || "")) { r = await send({ type: "auto" }); json = await r.json(); }
  if (!r.ok) return { status: r.status, error: json?.error?.message || "Claude-API-Fehler" };
  const use = json.content?.find((c) => c.type === "tool_use");
  if (use) return { data: use.input };
  // Notfall: JSON aus Textantwort lesen
  const text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return { data: JSON.parse(m[0]) }; } catch {} }
  return { status: 502, error: "Keine strukturierte Antwort erhalten" };
}
