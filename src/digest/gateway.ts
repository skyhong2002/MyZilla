import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Ask } from "./pipeline";

// Calls an OpenAI-compatible gateway (/chat/completions) with a strict JSON schema; the answer's `model` is the model that actually ran.
// node:http rather than fetch: fetch gives up after 5 minutes without response headers, and a high-effort digest can take longer.
export async function gatewayAsk(
  baseUrl: string,
  apiKey: string,
  log: (line: string) => void = () => {},
  timeout = 20 * 60000,
) {
  if (!apiKey)
    throw new Error(
      "MYZILLA_LLM_API_KEY is required with MYZILLA_LLM_BASE_URL",
    );
  const url = new URL(baseUrl.replace(/\/*$/, "/") + "chat/completions");
  const post = (body: string) =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          },
          signal: AbortSignal.timeout(timeout),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  const ask: Ask = async (step, model, effort, prompt, schema) => {
    const started = Date.now();
    const { status, text } = await post(
      JSON.stringify({
        model,
        reasoning_effort: effort,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: step.replace(/[^\w-]/g, "_"),
            strict: true,
            schema,
          },
        },
      }),
    ).catch((error) => {
      throw new Error(`${step} (${model}) failed: ${error.message}`);
    });
    if (status < 200 || status >= 300)
      throw new Error(
        `${step} (${model}) failed: HTTP ${status} ${text.slice(0, 300)}`,
      );
    const body = JSON.parse(text);
    const choice = body.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string"
    )
      throw new Error(
        `${step} (${model}) returned no complete answer: ${choice?.finish_reason ?? text.slice(0, 300)}`,
      );
    const resolved = String(body.model || model);
    log(
      `${step}: ${model} → ${resolved}, ${prompt.length} chars, ${Math.round((Date.now() - started) / 1000)}s`,
    );
    return { answer: JSON.parse(choice.message.content), model: resolved };
  };
  return { ask, close: async () => {} };
}
