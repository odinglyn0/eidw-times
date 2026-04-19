interface DataflintChallenge {
  challengeId: string;
  noncePrefix: string;
  difficulty: number;
  timestamp: number;
  hash: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function dataflintSolve(challenge: DataflintChallenge): Promise<string> {
  const { challengeId, noncePrefix, difficulty, timestamp } = challenge;
  const target = "0".repeat(difficulty);
  let counter = 0;
  const batchSize = 5000;

  while (true) {
    const promises: Promise<{ nonce: string; hash: string }>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const nonce = `${noncePrefix}${(counter + i).toString(36)}`;
      const input = `${challengeId}|${nonce}|FINGERPRINT_PLACEHOLDER|${timestamp}`;
      promises.push(
        sha256Hex(input).then((hash) => ({ nonce, hash }))
      );
    }

    const results = await Promise.all(promises);
    for (const { nonce, hash } of results) {
      if (hash.startsWith(target)) {
        return nonce;
      }
    }

    counter += batchSize;

    if (counter > 50_000_000) {
      throw new Error("Dataflint: exceeded max iterations");
    }

    await new Promise((r) => setTimeout(r, 0));
  }
}

export async function dataflintSolveWithFingerprint(
  challenge: DataflintChallenge,
  fingerprint: string
): Promise<string> {
  const { challengeId, noncePrefix, difficulty, timestamp } = challenge;
  const target = "0".repeat(difficulty);
  let counter = 0;
  const batchSize = 2000;

  while (true) {
    for (let i = 0; i < batchSize; i++) {
      const nonce = `${noncePrefix}${(counter + i).toString(36)}`;
      const input = `${challengeId}|${nonce}|${fingerprint}|${timestamp}`;
      const hash = await sha256Hex(input);
      if (hash.startsWith(target)) {
        return nonce;
      }
    }

    counter += batchSize;

    if (counter > 50_000_000) {
      throw new Error("Dataflint: exceeded max iterations");
    }

    await new Promise((r) => setTimeout(r, 0));
  }
}

export type { DataflintChallenge };
