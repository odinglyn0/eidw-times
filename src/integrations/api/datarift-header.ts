import { datariftGenerateTemporal } from "./datarift";

export async function datariftGetTemporalHeader(): Promise<string | null> {
  try {
    const temporal = await datariftGenerateTemporal();
    return JSON.stringify(temporal);
  } catch {
    return null;
  }
}
