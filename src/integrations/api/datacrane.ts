async function datacraneCompress(body: string): Promise<Uint8Array> {
  const blob = new Blob([body]);
  const cs = new CompressionStream("gzip");
  const stream = blob.stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function datacraneDecompress(response: Response): Promise<Response> {
  if (response.headers.get("X-Datacrane") !== "1") return response;
  const ds = new DecompressionStream("gzip");
  const stream = response.body!.pipeThrough(ds);
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: { "Content-Type": "application/json" },
  });
}

const UNPROTECTED_PATHS = [
  "/api/bouncetoken/verify",
  "/api/seo-security-data",
  "/api/current-security-data",
  "/api/dgrmV2-fp",
  "/robots.txt",
  "/llms.txt",
];

function isUnprotectedUrl(url: string): boolean {
  for (const path of UNPROTECTED_PATHS) {
    if (url.endsWith(path) || url.includes(path + "?")) return true;
  }
  return false;
}

async function sendAuthenticatedPreflight(url: string, headers: Record<string, string>): Promise<void> {
  try {
    await fetch(url, {
      method: "OPTIONS",
      headers,
      credentials: "include",
    });
  } catch {
  }
}

export async function datacraneFetch(url: string, init?: RequestInit): Promise<Response> {
  const out = { ...init };
  const h = { ...((init?.headers as Record<string, string>) || {}) };

  const { datapulseGetSealHeader } = await import("./datapulse-header");

  const sealHeader = await datapulseGetSealHeader();
  if (sealHeader) h["X-Datapulse-Seal"] = sealHeader;

  if (init?.body && typeof init.body === "string") {
    const compressed = await datacraneCompress(init.body);
    out.body = compressed;
    h["X-Datacrane"] = "1";
    h["Content-Type"] = "application/octet-stream";
  }
  out.headers = h;

  // Send authenticated OPTIONS preflight for protected routes
  if (!isUnprotectedUrl(url)) {
    await sendAuthenticatedPreflight(url, h);
  }

  const raw = await fetch(url, out);
  return datacraneDecompress(raw);
}
