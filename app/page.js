"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [serverModel, setServerModel] = useState("");
  const [serverTemp, setServerTemp] = useState(null);
  const [usage, setUsage] = useState(null);
  const abortRef = useRef(null);
  const [webSearch, setWebSearch] = useState(false);

  // Load persisted state
  const [messages, setMessages] = useState([]); // [{ role: 'user'|'assistant', content: string }]
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("colorburst_state") || "null"
      );
      if (saved) {
        if (typeof saved.prompt === "string") setPrompt(saved.prompt);
        if (typeof saved.model === "string") setModel(saved.model);
        if (typeof saved.temperature === "number")
          setTemperature(saved.temperature);
        if (typeof saved.webSearch === "boolean") setWebSearch(saved.webSearch);
      }
    } catch {}
  }, []);

  // Persist state
  useEffect(() => {
    try {
      localStorage.setItem(
        "colorburst_state",
        JSON.stringify({ prompt, model, temperature, webSearch })
      );
    } catch {}
  }, [prompt, model, temperature, webSearch]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setResult("");
    setCopied(false);
    if (!prompt.trim()) return;
    setLoading(true);
    setUsage(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Build payload: either prompt or messages[] with new user turn
      const payload = {
        model,
        temperature,
      };
      if (messages.length) {
        payload.messages = messages.concat({ role: "user", content: prompt });
      } else {
        payload.prompt = prompt;
      }

      // Prefer streaming endpoint for faster first token
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          tools: [webSearch ? "web_search" : null].filter(Boolean),
          tool_choice: webSearch ? "auto" : "none",
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // Fallback to non-streaming route on error
        const fallback = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await fallback.json();
        if (!fallback.ok) throw new Error(data.error || "Request failed");
        setResult(data.text);
        if (data.model) setServerModel(data.model);
        if (typeof data.temperature === "number")
          setServerTemp(data.temperature);
        setUsage(data.usage || null);
        // Update conversation
        setMessages((prev) =>
          prev.concat(
            { role: "user", content: prompt },
            { role: "assistant", content: data.text || "" }
          )
        );
        return;
      }

      // Read model/temp from headers for immediate display
      const headerModel = res.headers.get("X-Model");
      const headerTemp = res.headers.get("X-Temperature");
      if (headerModel) setServerModel(headerModel);
      if (headerTemp) setServerTemp(parseFloat(headerTemp));
      // const headerTools = res.headers.get("X-Tools"); // optional

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setResult((prev) => (prev ? prev + chunk : chunk));
      }

      // Append streamed assistant message to conversation
      setMessages((prev) =>
        prev.concat(
          { role: "user", content: prompt },
          { role: "assistant", content: accumulated }
        )
      );
      // No token usage via streaming; leave as null
    } catch (err) {
      if (err?.name === "AbortError") {
        setError("Request cancelled");
      } else {
        setError(err.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function clearAll() {
    setPrompt("");
    setResult("");
    setError("");
    setUsage(null);
    setServerModel("");
    setServerTemp(null);
    setMessages([]);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-tr from-pink-500 via-purple-500 to-sky-400 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold drop-shadow-md">
            ColorBurst Chat
          </h1>
          <p className="mt-2 text-white/90">
            Enter a prompt and let AI do the magic.
          </p>
        </header>

        <form
          onSubmit={submit}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-5 sm:p-6 shadow-xl border border-white/20"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              submit(e);
            }
          }}
        >
          {/* Model, temperature and tools */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="model">
                Model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => {
                  const selectedModel = e.target.value;
                  setModel(selectedModel);
                  if (selectedModel === "gpt-5") {
                    setTemperature(1.0);
                  }
                }}
                className="w-full rounded-xl px-3 py-2 bg-white/10 text-white border border-white/20 focus:border-white/40 outline-none"
              >
                <option className="bg-gray-800" value="gpt-4o-mini">
                  gpt-4o-mini
                </option>
                <option className="bg-gray-800" value="gpt-4o">
                  gpt-4o
                </option>
                <option className="bg-gray-800" value="gpt-4.1-mini">
                  gpt-4.1-mini
                </option>
                <option className="bg-gray-800" value="gpt-4.1">
                  gpt-4.1
                </option>
                <option className="bg-gray-800" value="gpt-5">
                  gpt-5
                </option>
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="temperature"
              >
                Temperature:{" "}
                <span className="font-semibold">{temperature.toFixed(2)}</span>
              </label>
              {/* If GPT-5 selected, this must be set to 1.0 and disabled */}
              <input
                id="temperature"
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={model === "gpt-5" ? 1.0 : temperature}
                onChange={(e) => {
                  if (model !== "gpt-5") {
                    setTemperature(parseFloat(e.target.value));
                  }
                }}
                className="w-full accent-yellow-300"
                disabled={model === "gpt-5"}
              />
              <div className="flex justify-between text-xs text-white/80">
                <span>0 (deterministic)</span>
                <span>2 (creative)</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={webSearch}
                  onChange={(e) => setWebSearch(e.target.checked)}
                  className="accent-yellow-300"
                />
                Enable Web search (Responses API tool)
              </label>
            </div>
          </div>

          <label className="block text-sm font-medium mb-2" htmlFor="prompt">
            Your prompt
          </label>
          <textarea
            id="prompt"
            className="w-full min-h-32 max-h-[50vh] rounded-xl p-4 text-base text-white placeholder-white/70 bg-white/10 outline-none border border-white/20 focus:border-white/40 transition"
            placeholder="Write a haiku about summer rain..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-yellow-300 text-black font-semibold shadow hover:bg-yellow-200 active:translate-y-[1px] disabled:opacity-50"
            >
              {loading ? "Thinking…" : "Ask AI"}
            </button>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              disabled={!loading}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30"
            >
              Clear
            </button>
            {error && <span className="text-sm text-red-100/90">{error}</span>}
          </div>
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "bg-white/10 rounded-xl p-3"
                    : "bg-black/20 rounded-xl p-3"
                }
              >
                <div className="text-[11px] uppercase tracking-wide opacity-70 mb-1">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap break-words text-white/95 leading-relaxed">
                  {m.content}
                </div>
              </div>
            ))}
            {(loading || result) && (
              <div className="bg-black/30 rounded-xl p-3 border border-white/10">
                <div className="text-[11px] uppercase tracking-wide opacity-70 mb-1">
                  assistant
                </div>
                <pre className="whitespace-pre-wrap break-words text-white/95 leading-relaxed">
                  {result || (loading ? "…" : "")}
                </pre>
              </div>
            )}
            {!loading && !result && messages.length === 0 && (
              <div className="text-white/70">
                Your AI response will appear here.
              </div>
            )}
          </div>
        </form>

        <section className="mt-6">
          <div className="bg-black/30 rounded-2xl p-5 border border-white/10 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Response</h2>
              <button
                onClick={copy}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-40 text-sm"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {(serverModel || serverTemp !== null) && (
              <div className="text-xs text-white/80 mb-2">
                Used model:{" "}
                <span className="font-semibold">
                  {serverModel || "(default)"}
                </span>{" "}
                · Temp:{" "}
                <span className="font-semibold">
                  {serverTemp ?? "(default)"}
                </span>
                {webSearch && (
                  <span>
                    {" "}
                    · Tools: <span className="font-semibold">web_search</span>
                  </span>
                )}
                {usage && (
                  <>
                    {" "}
                    · Tokens:{" "}
                    <span className="font-semibold">
                      {usage.total_tokens ?? usage.total ?? "?"}
                    </span>
                  </>
                )}
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words text-white/95 leading-relaxed">
              {result || "Your AI response will appear here."}
            </pre>
          </div>
        </section>

        <footer className="mt-10 text-center text-white/80 text-sm">
          Built with Next.js, React, and Tailwind.
        </footer>
      </div>
    </div>
  );
}
