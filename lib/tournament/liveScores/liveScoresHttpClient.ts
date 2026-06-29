export type LiveScoresHttpDebug = {
  url: string;
  httpStatus: number;
  contentType: string | null;
  elapsedMs: number;
  bodySnippet: string;
  parseError: string | null;
};

export type LiveScoresHttpOutcome<T> =
  | { ok: true; data: T; debug: LiveScoresHttpDebug }
  | { ok: false; error: string; debug: LiveScoresHttpDebug; data?: T };

function snippet(text: string, max = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function looksLikeHtml(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("<body");
}

export function parseLiveScoresResponseBody<T extends { ok?: boolean }>(
  input: {
    url: string;
    httpStatus: number;
    contentType: string | null;
    bodyText: string;
    elapsedMs: number;
  },
): LiveScoresHttpOutcome<T> {
  const debug: LiveScoresHttpDebug = {
    url: input.url,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    elapsedMs: input.elapsedMs,
    bodySnippet: snippet(input.bodyText),
    parseError: null,
  };

  if (!input.bodyText.trim()) {
    return {
      ok: false,
      error:
        "Empty response body — the server likely timed out or closed the connection before returning JSON.",
      debug,
    };
  }

  if (looksLikeHtml(input.bodyText)) {
    return {
      ok: false,
      error:
        "Server returned HTML instead of JSON (often a login redirect or error page). See technical details for a snippet.",
      debug,
    };
  }

  let parsed: T;
  try {
    parsed = JSON.parse(input.bodyText) as T;
  } catch (e) {
    debug.parseError = e instanceof Error ? e.message : "JSON parse failed";
    return {
      ok: false,
      error: `Response was not valid JSON (HTTP ${input.httpStatus}). See technical details for a snippet.`,
      debug,
    };
  }

  if (parsed == null || typeof parsed !== "object") {
    return {
      ok: false,
      error: "Response JSON was not an object.",
      debug,
      data: parsed,
    };
  }

  if (typeof parsed.ok !== "boolean") {
    return {
      ok: false,
      error: `Response JSON missing boolean "ok" field (HTTP ${input.httpStatus}).`,
      debug,
      data: parsed,
    };
  }

  if (!input.httpStatus || input.httpStatus >= 400) {
    const message =
      "error" in parsed && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `HTTP ${input.httpStatus} error from server.`;
    return {
      ok: false,
      error: message,
      debug,
      data: parsed,
    };
  }

  if (parsed.ok === false) {
    const message =
      "error" in parsed && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : "Apply failed.";
    return {
      ok: false,
      error: message,
      debug,
      data: parsed,
    };
  }

  return { ok: true, data: parsed, debug };
}

export async function postLiveScoresJson<T extends { ok?: boolean }>(
  url: string,
  body: unknown,
): Promise<LiveScoresHttpOutcome<T>> {
  const started = performance.now();
  let httpStatus = 0;
  let contentType: string | null = null;
  let bodyText = "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    httpStatus = res.status;
    contentType = res.headers.get("content-type");
    bodyText = await res.text();
  } catch (e) {
    const elapsedMs = Math.round(performance.now() - started);
    const message = e instanceof Error ? e.message : "Network request failed.";
    return {
      ok: false,
      error: `Network error calling ${url}: ${message}`,
      debug: {
        url,
        httpStatus: 0,
        contentType: null,
        elapsedMs,
        bodySnippet: "",
        parseError: message,
      },
    };
  }

  return parseLiveScoresResponseBody<T>({
    url,
    httpStatus,
    contentType,
    bodyText,
    elapsedMs: Math.round(performance.now() - started),
  });
}

export function formatHttpDebugLine(debug: LiveScoresHttpDebug): string {
  return [
    `HTTP ${debug.httpStatus || "—"}`,
    debug.contentType ? `content-type: ${debug.contentType}` : "content-type: (missing)",
    `${debug.elapsedMs}ms`,
    debug.bodySnippet ? `body: ${debug.bodySnippet}` : "body: (empty)",
    debug.parseError ? `parse: ${debug.parseError}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildStepAImpactLines(input: {
  editionName: string;
  editionCode: string;
}): string[] {
  return [
    `Reads completed match scores on live edition “${input.editionName}” (${input.editionCode}).`,
    "Writes score/card changes and rebuilds official knockout results.",
    "Pool standings are not recalculated until Step B.",
    "Simulation editions and simulation pools are not touched.",
  ];
}
