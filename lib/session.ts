export function parseDuration(value: string | undefined, fallback: number) {
  const duration = Number(value);
  return Number.isSafeInteger(duration) && duration > 0 ? duration : fallback;
}

export function getRemainingSeconds(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function getInactivityCountdown(
  elapsedMs: number,
  timeoutMs: number,
  warningMs: number,
  completedScreen = false,
) {
  const warningStartsAt = completedScreen
    ? Math.max(0, timeoutMs - warningMs)
    : timeoutMs;
  if (elapsedMs < warningStartsAt) return null;
  const resetAt = completedScreen ? timeoutMs : timeoutMs + warningMs;
  return Math.max(0, Math.ceil((resetAt - elapsedMs) / 1000));
}

export function createAnonymousSessionId() {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new Error("A secure browser context is required to start a session.");
  }
  return crypto.randomUUID();
}
