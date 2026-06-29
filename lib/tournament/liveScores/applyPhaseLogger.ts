export type ApplyPhaseRecord = {
  phase: string;
  durationMs: number;
  detail?: Record<string, unknown>;
};

export type ApplyPhaseLoggerSnapshot = {
  runId: string;
  phases: ApplyPhaseRecord[];
  totalDurationMs: number;
};

/**
 * Structured timing logger for live-scores apply and official tournament sync.
 */
export class ApplyPhaseLogger {
  readonly runId: string;
  private readonly scope: string;
  private records: ApplyPhaseRecord[] = [];

  constructor(scope: string) {
    this.scope = scope;
    this.runId = `${scope}-${Date.now().toString(36)}`;
  }

  log(phase: string, detail?: Record<string, unknown>): void {
    console.info(`[ashbracket:${this.scope}:${this.runId}] ${phase}`, detail ?? {});
  }

  async time<T>(
    phase: string,
    fn: () => Promise<T>,
    detail?: Record<string, unknown>,
  ): Promise<T> {
    const started = performance.now();
    try {
      return await fn();
    } finally {
      const durationMs = Math.round(performance.now() - started);
      const record: ApplyPhaseRecord = { phase, durationMs, detail };
      this.records.push(record);
      console.info(`[ashbracket:${this.scope}:${this.runId}] ${phase}`, {
        durationMs,
        ...(detail ?? {}),
      });
    }
  }

  snapshot(): ApplyPhaseLoggerSnapshot {
    return {
      runId: this.runId,
      phases: [...this.records],
      totalDurationMs: this.records.reduce((sum, row) => sum + row.durationMs, 0),
    };
  }

  toTechnicalDetails(extra?: Record<string, unknown>): string {
    return JSON.stringify(
      {
        ...this.snapshot(),
        ...(extra ?? {}),
      },
      null,
      2,
    );
  }
}
