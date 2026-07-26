/**
 * Polls `probe()` until it resolves true, sleeping `pollIntervalMs` between
 * attempts. Always probes once immediately (before ever checking the
 * timeout), so a `timeoutSeconds: 0` caller still gets exactly one real
 * attempt before failing — the same shape DockerComposeService/LandoService
 * each hand-rolled before this was extracted. MUST throw (never silently
 * give up) once `timeoutSeconds` elapses; `notReadyError` builds that error,
 * left to the caller so the message/hint can stay adapter-specific (e.g.
 * "docker compose logs db" vs "lando logs -s database").
 */
export interface PollUntilReadyOptions {
  probe: () => Promise<boolean>;
  timeoutSeconds: number;
  pollIntervalMs?: number;
  onTick?: (waitedSeconds: number) => void;
  notReadyError: (timeoutSeconds: number) => Error;
}

export async function pollUntilReady({ probe, timeoutSeconds, pollIntervalMs = 2000, onTick, notReadyError }: PollUntilReadyOptions): Promise<void> {
  let waited = 0;
  while (!(await probe())) {
    if (waited >= timeoutSeconds) throw notReadyError(timeoutSeconds);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    waited += pollIntervalMs / 1000;
    onTick?.(waited);
  }
}
