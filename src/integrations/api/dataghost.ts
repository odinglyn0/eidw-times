export function dataghostUnwrap<T = unknown>(data: unknown): T {
  if (data && typeof data === "object" && "_payload" in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)._payload as T;
  }
  return data as T;
}

export function dataghostHasPhantom(data: unknown): boolean {
  return !!(data && typeof data === "object" && "_phantom" in (data as Record<string, unknown>));
}
