import dotenv from "dotenv";

// In development we rely on project `.env` as the source of truth.
// IMPORTANT: With ESM, static imports are evaluated before module body, so dotenv
// must run before importing `server.ts` (which imports auth/store modules).
dotenv.config({ override: true });

// Use .js specifier for tsc compatibility; tsx will resolve to TS source in dev.
await import("./server.js");

