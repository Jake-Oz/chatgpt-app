import OpenAI from "openai";

export const runtime = "nodejs"; // ensure streaming works on Node runtime

export async function POST(request) {
  try {
    const {
      prompt,
      model = "gpt-4o-mini",
      temperature = 0.7,
    } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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
    if (safeModel === "gpt-5") {
      safeTemp = 1.0;
    }

    const stream = await openai.chat.completions.create({
      model: safeModel,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      temperature: safeTemp,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Model": safeModel,
        "X-Temperature": String(safeTemp),
      },
    });
  } catch (err) {
    console.error("/api/chat/stream error", err);
    return new Response(
      JSON.stringify({ error: "Failed to stream completion" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
