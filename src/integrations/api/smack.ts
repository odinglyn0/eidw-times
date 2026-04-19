const STREAM_DURATION_MS = 20 * 60 * 1000;
const FRAME_HEADER_SIZE = 16;

let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _readyResolve: (() => void) | null = null;
let _readyPromise: Promise<void> | null = null;
let _btRaw: string = "";
let _btHash: string = "";
let _fingerprint: string = "";
let _wsUrl: string = "";
let _active = false;
let _firstTokenReceived = false;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveDecryptionKey(btHash: string, smackSecret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(smackSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const derived = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(btHash));
  const keyBytes = new Uint8Array(derived).slice(0, 32);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
}

async function decryptSmackToken(
  encrypted: Uint8Array,
  btHash: string,
  decryptKey: CryptoKey
): Promise<string> {
  const nonce = encrypted.slice(0, 12);
  const ciphertext = encrypted.slice(12);
  const aad = new TextEncoder().encode(btHash.slice(0, 16));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad },
    decryptKey,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function setCookie(name: string, value: string, maxAgeSec: number): void {
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname
  );
  const base = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSec}`;
  document.cookie = isLocalhost
    ? `${base};SameSite=Lax`
    : `${base};domain=.eidwtimes.xyz;SameSite=None;Secure`;
}

function getCookieName(): string {
  return `_Smack-${_btHash.slice(0, 16)}`;
}

async function hmacSha256Verify(
  key: string,
  data: Uint8Array,
  expected: Uint8Array
): Promise<boolean> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const sigBytes = new Uint8Array(sig).slice(0, 8);
  if (sigBytes.length !== expected.length) return false;
  let match = true;
  for (let i = 0; i < sigBytes.length; i++) {
    if (sigBytes[i] !== expected[i]) match = false;
  }
  return match;
}

let _decryptKey: CryptoKey | null = null;
let _smackSecret: string = "";

async function processFrame(frame: ArrayBuffer): Promise<void> {
  const raw = new Uint8Array(frame);
  if (raw.length < FRAME_HEADER_SIZE + 10) return;

  const hashCheck = raw.slice(8, 16);
  const compressed = raw.slice(16);

  const valid = await hmacSha256Verify(_btHash, compressed, hashCheck);
  if (!valid) return;

  const encrypted = await decompressGzip(compressed);

  if (!_decryptKey) {
    _decryptKey = await deriveDecryptionKey(_btHash, _smackSecret);
  }

  const token = await decryptSmackToken(encrypted, _btHash, _decryptKey);
  setCookie(getCookieName(), token, 5);

  if (!_firstTokenReceived && _readyResolve) {
    _firstTokenReceived = true;
    _readyResolve();
    _readyResolve = null;
  }
}

let _retryCount = 0;
const MAX_RETRIES = 5;
const BASE_DELAY = 2000;

function connect(): void {
  if (_ws) {
    try {
      _ws.close();
    } catch {}
    _ws = null;
  }

  if (_retryCount >= MAX_RETRIES) {
    _active = false;
    if (_readyResolve) {
      _readyResolve();
      _readyResolve = null;
    }
    return;
  }

  const params = new URLSearchParams({
    _bt: _btRaw,
    _fp: _fingerprint,
  });
  const connUrl = `${_wsUrl}?${params.toString()}`;

  _ws = new WebSocket(connUrl);
  _ws.binaryType = "arraybuffer";

  _ws.onopen = () => {
    _retryCount = 0;
    scheduleReconnect();
  };

  _ws.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      processFrame(event.data).catch(() => {});
    }
  };

  _ws.onclose = (event: CloseEvent) => {
    if (!_active) return;
    if (event.code === 4100) {
      _retryCount = 0;
      reconnect();
      return;
    }
    if (event.code >= 4001 && event.code <= 4003) {
      _active = false;
      if (_readyResolve) {
        _readyResolve();
        _readyResolve = null;
      }
      return;
    }
    _retryCount++;
    const delay = Math.min(BASE_DELAY * Math.pow(2, _retryCount - 1), 30000);
    setTimeout(() => {
      if (_active) connect();
    }, delay);
  };

  _ws.onerror = () => {};
}

function reconnect(): void {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _decryptKey = null;
  connect();
}

function scheduleReconnect(): void {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    if (_active) reconnect();
  }, STREAM_DURATION_MS);
}

export interface SmackInitParams {
  bounceToken: string;
  fingerprint: string;
  wsUrl: string;
  smackSecret: string;
}

export function smackInit(params: SmackInitParams): Promise<void> {
  if (_active && _ws && _ws.readyState <= WebSocket.OPEN) {
    if (_firstTokenReceived) return Promise.resolve();
    if (_readyPromise) return _readyPromise;
    return Promise.resolve();
  }

  if (_ws) {
    try { _ws.close(); } catch {}
    _ws = null;
  }
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  _btRaw = params.bounceToken;
  _fingerprint = params.fingerprint;
  _wsUrl = params.wsUrl;
  _smackSecret = params.smackSecret;
  _active = true;
  _firstTokenReceived = false;
  _decryptKey = null;
  _retryCount = 0;

  _readyPromise = new Promise<void>((resolve) => {
    _readyResolve = resolve;
  });

  sha256Hex(_btRaw).then((hash) => {
    _btHash = hash.slice(0, 32);
    connect();
  });

  return _readyPromise;
}

export function smackReady(): Promise<void> {
  if (_firstTokenReceived) return Promise.resolve();
  if (_readyPromise) return _readyPromise;
  return Promise.resolve();
}

export function smackDestroy(): void {
  _active = false;
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    try {
      _ws.close();
    } catch {}
    _ws = null;
  }
  _readyResolve = null;
  _readyPromise = null;
  _firstTokenReceived = false;
  _decryptKey = null;
  _retryCount = 0;
}

export function smackGetToken(): string | null {
  if (!_btHash) return null;
  const name = getCookieName();
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}
