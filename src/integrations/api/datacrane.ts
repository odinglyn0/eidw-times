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

export async function datacraneFetch(url: string, init?: RequestInit): Promise<Response> {
  const out = { ...init };
  const h = { ...((init?.headers as Record<string, string>) || {}) };
  if (init?.body && typeof init.body === "string") {
    const compressed = await datacraneCompress(init.body);
    out.body = compressed;
    h["X-Datacrane"] = "1";
    h["Content-Type"] = "application/octet-stream";
  }
  out.headers = h;
  const raw = await fetch(url, out);
  return datacraneDecompress(raw);
}
