/** One way for both entries to ask a model for a JSON decision, with every answer saved.
 *
 *  Backends, chosen with `--llm`:
 *    none       no model; the scripts use their scripted or rule-based stand-ins (the default)
 *    ollama     a local model through Ollama (OLLAMA_URL, default http://127.0.0.1:11434; OLLAMA_MODEL, default llama3.1:8b)
 *    anthropic  Claude through the Anthropic SDK (ANTHROPIC_MODEL, default claude-opus-5-5; credentials from the environment)
 *
 *  Every answer is saved in a cache file keyed by backend, model and prompt, so a rerun asks nothing new and gives the
 *  same numbers. Delete the cache file to ask again.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

export type Backend = "none" | "ollama" | "anthropic";

export type Llm = {
  backend: Backend;
  model: string;
  /** Ask for a JSON object. Null when there is no model, it refused, or its reply held no JSON. */
  json<T>(system: string, user: string): Promise<T | null>;
  stats(): { asked: number; cached: number; failed: number };
};

type CacheRow = { key: string; reply: string | null };

export function makeLlm(backend: Backend, cacheFile: string, model?: string): Llm {
  const chosen =
    model ||
    (backend === "ollama" ? process.env.OLLAMA_MODEL || "llama3.1:8b" : backend === "anthropic" ? process.env.ANTHROPIC_MODEL || "claude-opus-5-5" : "none");
  const cache = new Map<string, string | null>();
  if (existsSync(cacheFile)) {
    for (const line of readFileSync(cacheFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as CacheRow;
        cache.set(row.key, row.reply);
      } catch {
        /* a torn last line from an interrupted run */
      }
    }
  } else {
    mkdirSync(dirname(cacheFile), { recursive: true });
  }
  let asked = 0, cached = 0, failed = 0;
  const client = backend === "anthropic" ? new Anthropic() : null;

  async function raw(system: string, user: string): Promise<string | null> {
    if (backend === "ollama") {
      const base = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: chosen,
          stream: false,
          format: "json",
          options: { temperature: 0 },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { message?: { content?: string } };
      return body.message?.content ?? null;
    }
    if (client) {
      // Thinking can't be turned off on this model; low effort keeps each decision quick and cheap. The server-side
      // fallback re-runs a declined request on another model instead of stopping.
      const res = await client.beta.messages.create({
        model: chosen,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") return null;
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    }
    return null;
  }

  return {
    backend,
    model: chosen,
    async json<T>(system: string, user: string): Promise<T | null> {
      if (backend === "none") return null;
      const key = createHash("sha256").update(JSON.stringify([backend, chosen, system, user])).digest("hex");
      let reply: string | null;
      if (cache.has(key)) {
        cached++;
        reply = cache.get(key) ?? null;
      } else {
        asked++;
        try {
          reply = await raw(system, user);
        } catch (err) {
          failed++;
          throw err;
        }
        cache.set(key, reply);
        appendFileSync(cacheFile, JSON.stringify({ key, reply } satisfies CacheRow) + "\n");
      }
      const parsed = parseJson<T>(reply);
      if (parsed === null) failed++;
      return parsed;
    },
    stats: () => ({ asked, cached, failed }),
  };
}

/** The first JSON object in a reply, tolerating prose or a code fence around it. */
export function parseJson<T>(reply: string | null): T | null {
  if (!reply) return null;
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** `--name value` and `--flag` arguments. */
export function args(argv = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = "true";
  }
  return out;
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
