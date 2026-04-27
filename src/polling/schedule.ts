export const TASK_ID = 'com.dmsonly.inbox-poll';

// Backoff steps: 30s → 3m → 10m → 15m → 20m
export const DELAYS_MS = [
  30_000,
  3 * 60_000,
  10 * 60_000,
  15 * 60_000,
  20 * 60_000,
];

export const MAX_STEP = DELAYS_MS.length - 1;
