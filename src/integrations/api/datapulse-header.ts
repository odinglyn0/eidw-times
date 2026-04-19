import { datapulseCreateCollector, datapulseSignSeal } from "./datapulse";

let _collector: ReturnType<typeof datapulseCreateCollector> | null = null;
let _started = false;

export function datapulseStartCollecting(): void {
  if (_started) return;
  _started = true;
  _collector = datapulseCreateCollector();
  _collector.start();
}

export async function datapulseGetSealHeader(): Promise<string | null> {
  if (!_collector) return null;
  try {
    const rawSeal = _collector.getSeal();
    const signed = await datapulseSignSeal(rawSeal);
    return JSON.stringify(signed);
  } catch {
    return null;
  }
}
