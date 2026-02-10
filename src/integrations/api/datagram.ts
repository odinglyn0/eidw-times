import { datacraneFetch } from "./datacrane";

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
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  for (const entry of Object.values(manifest.routes)) {
    const base = `${entry.cookieName}=${encodeURIComponent(entry.cookieValue)};expires=${expDate};path=/`;
    document.cookie = isLocalhost
      ? `${base};SameSite=Lax`
      : `${base};domain=.eidwtimes.xyz;SameSite=None;Secure`;
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
  const qIdx = originalRoute.indexOf("?");
  const pathOnly = qIdx >= 0 ? originalRoute.slice(0, qIdx) : originalRoute;
  const queryString = qIdx >= 0 ? originalRoute.slice(qIdx) : "";

  const manifest = getDatagramManifest();
  if (!manifest) {
    throw new DatagramMissingError("No datagram manifest");
  }

  const entry = manifest.routes[pathOnly] ?? findMatchingRoute(pathOnly, manifest.routes);
  if (!entry) {
    throw new DatagramMissingError(`No datagram route for ${pathOnly}`);
  }

  return {
    url: `https://${manifest.host}/${manifest.fpPrefix}/${entry.path}${queryString}`,
    extraHeaders: {
      "X-Datagram-Cookie": entry.cookieName,
      "X-Datagram-Exp": String(manifest.exp),
      "X-Datagram-RK": manifest.routeKey,
      "X-Datagram-CV": entry.cookieValue,
    },
  };
}

export class DatagramMissingError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "DatagramMissingError";
  }
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
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  const resp = await datacraneFetch(`${apiBase}/api/dgrmV2-fp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fp: fingerprint }),
  });
  if (!resp.ok) throw new Error(`dgrmV2-fp failed: ${resp.status}`);
  return resp.json();
}
