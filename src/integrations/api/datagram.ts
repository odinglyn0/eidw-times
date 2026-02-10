const STORAGE_KEY = "_dgrm_v2";

export interface DatagramRouteEntry {
  path: string;
  cookieName: string;
  cookieValue: string;
  hsKey: string;
}

export interface DatagramManifest {
  host: string;
  fpPrefix: string;
  routes: Record<string, DatagramRouteEntry>;
  exp: number;
  routeKey: string;
}

export function storeDatagramManifest(manifest: DatagramManifest): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
  } catch { /* quota */ }

  const expDate = new Date(manifest.exp * 1000).toUTCString();
  for (const entry of Object.values(manifest.routes)) {
    document.cookie =
      `${entry.cookieName}=${encodeURIComponent(entry.cookieValue)};` +
      `expires=${expDate};path=/;SameSite=Lax`;
  }
}

export function getDatagramManifest(): DatagramManifest | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const m: DatagramManifest = JSON.parse(raw);
    if (m.exp * 1000 <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

export function resolveDatagramUrl(
  originalRoute: string,
  apiBaseUrl: string
): { url: string; extraHeaders: Record<string, string> } {
  const manifest = getDatagramManifest();
  if (!manifest) {
    return { url: `${apiBaseUrl}${originalRoute}`, extraHeaders: {} };
  }

  const entry = manifest.routes[originalRoute] ?? findMatchingRoute(originalRoute, manifest.routes);
  if (!entry) {
    return { url: `${apiBaseUrl}${originalRoute}`, extraHeaders: {} };
  }

  return {
    url: `https://${manifest.host}/${manifest.fpPrefix}/${entry.path}`,
    extraHeaders: {
      "X-Datagram-Cookie": entry.cookieName,
      "X-Datagram-Exp": String(manifest.exp),
      "X-Datagram-RK": manifest.routeKey,
    },
  };
}

function findMatchingRoute(
  route: string,
  routes: Record<string, DatagramRouteEntry>
): DatagramRouteEntry | null {
  if (routes[route]) return routes[route];
  let bestMatch: DatagramRouteEntry | null = null;
  let bestLen = 0;
  for (const [pattern, entry] of Object.entries(routes)) {
    if (route.startsWith(pattern) && pattern.length > bestLen) {
      bestMatch = entry;
      bestLen = pattern.length;
    }
  }
  return bestMatch;
}

export async function mintDatagram(fingerprint: string): Promise<DatagramManifest> {
  const resp = await fetch("/dgrmV2-fp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fp: fingerprint }),
  });
  if (!resp.ok) throw new Error(`dgrmV2-fp failed: ${resp.status}`);
  return resp.json();
}
