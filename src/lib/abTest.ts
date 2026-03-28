import crypto from "node:crypto";

export type AbGroup = "A" | "B";

/**
 * Stable AB assignment by anon_id hash.
 */
export function assignAbGroup(anonId: string): AbGroup {
  const hash = crypto.createHash("sha256").update(anonId).digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;
  return bucket < 50 ? "A" : "B";
}
