interface DatariftTemporal {
  perf: number;
  epoch: number;
  mono: number;
  seq: number;
  sig: string;
}

let _epochKey: string | null = null;
let _fingerprint: string | null = null;
let _sequence = 0;
let _monoBase = 0;

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function datariftInit(epochKey: string, fingerprint: string): void {
  _epochKey = epochKey;
  _fingerprint = fingerprint;
  _sequence = 0;
  _monoBase = performance.now();
}

export async function datariftGenerateTemporal(): Promise<DatariftTemporal> {
  _sequence++;

  const temporal: Omit<DatariftTemporal, "sig"> = {
    perf: parseFloat(performance.now().toFixed(3)),
    epoch: Date.now(),
    mono: parseFloat((performance.now() - _monoBase).toFixed(3)),
    seq: _sequence,
  };

  if (!_epochKey || !_fingerprint) {
    return { ...temporal, sig: "" };
  }

  const payload = { ...temporal };
  const canonical = JSON.stringify(
    Object.keys(payload)
      .sort()
      .reduce((obj: Record<string, unknown>, key) => {
        obj[key] = (payload as Record<string, unknown>)[key];
        return obj;
      }, {})
  );

  const sig = await hmacSha256Hex(_epochKey, `rift|${_fingerprint}|${canonical}`);
  return { ...temporal, sig };
}

export type { DatariftTemporal };
