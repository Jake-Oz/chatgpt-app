import OpenAI from "openai";

export const runtime = "nodejs"; // ensure streaming works on Node runtime

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      prompt,
      messages,
      model = "gpt-4o-mini",
      temperature = 0.7,
      tools: requestedTools = [],
      tool_choice = "auto",
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
    if (safeModel === "gpt-5") {
      safeTemp = 1.0;
    }

    // Note: The Chat Completions API supports only "function" tools.
    // The "browser" and "code_interpreter" tools are available via the Responses/Assistants APIs, not chat.completions.
    // To use those tools, migrate this route to the Responses API.
    // Map requested tool strings to Responses API tool objects
    const allowedTools = new Set([
      "code_interpreter",
      "file_search",
      "web_search",
    ]);
    const tools = Array.isArray(requestedTools)
      ? requestedTools
          .filter((t) => typeof t === "string" && allowedTools.has(t))
          .map((t) => ({ type: t }))
      : [];

    // Use the Responses API with streaming for tool support
    // If messages array is provided, concatenate a simple transcript for input.
    // For richer context, switch to responses.create with messages array when supported.
    const transcript =
      Array.isArray(messages) && messages.length
        ? messages
            .map((m) => `${m.role || "user"}: ${String(m.content ?? "")}`)
            .join("\n")
        : prompt;

    const stream = await openai.responses.stream({
      model: safeModel,
      input: transcript,
      temperature: safeTemp,
      ...(tools.length ? { tools, tool_choice } : {}),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              controller.enqueue(encoder.encode(event.delta));
            } else if (event.type === "response.error") {
              throw new Error(event.error?.message || "Response stream error");
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
        ...(tools.length
          ? { "X-Tools": tools.map((t) => t.type).join(",") }
          : {}),
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
