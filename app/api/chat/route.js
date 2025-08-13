import OpenAI from "openai";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      prompt,
      messages,
      model = "gpt-4o-mini",
      temperature = 0.7,
    } = body || {};
    if (
      (!messages || !Array.isArray(messages) || messages.length === 0) &&
      (!prompt || typeof prompt !== "string")
    ) {
      return new Response(
        JSON.stringify({ error: "Missing prompt or messages" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not set on server" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openai = new OpenAI({ apiKey });

    const safeModel =
      typeof model === "string" && model.trim() ? model : "gpt-4o-mini";
    const tNum = Number(temperature);
    let safeTemp = Number.isFinite(tNum) ? Math.min(2, Math.max(0, tNum)) : 0.7;
    // Enforce special rule: if using gpt-5, lock temperature to 1.0
    if (safeModel === "gpt-5") {
      safeTemp = 1.0;
    }

    // Use provided conversation if available; otherwise use single-turn prompt
    const chatMessages =
      Array.isArray(messages) && messages.length
        ? [
            { role: "system", content: "You are a helpful assistant." },
            ...messages
              .map((m) => ({
                role: m?.role,
                content: String(m?.content ?? ""),
              }))
              .filter(
                (m) =>
                  (m.role === "user" ||
                    m.role === "assistant" ||
                    m.role === "system") &&
                  m.content.trim()
              ),
          ]
        : [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt },
          ];

    const completion = await openai.chat.completions.create({
      model: safeModel,
      messages: chatMessages,
      temperature: safeTemp,
    });

    const text = completion.choices?.[0]?.message?.content ?? "";
    const usage = completion.usage || null;

    return new Response(
      JSON.stringify({ text, model: safeModel, temperature: safeTemp, usage }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("/api/chat error", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch completion" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
