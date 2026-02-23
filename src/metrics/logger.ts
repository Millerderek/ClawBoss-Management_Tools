export class MetricsLogger {
  constructor(public sessionId?: string) {}

  info(message: string, extra?: Record<string, unknown>) {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[metrics][${this.sessionId ?? "anon"}] INFO ${message}${suffix}`);
  }

  warn(message: string, extra?: Record<string, unknown>) {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    console.warn(`[metrics][${this.sessionId ?? "anon"}] WARN ${message}${suffix}`);
  }

  error(message: string, extra?: Record<string, unknown>) {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    console.error(`[metrics][${this.sessionId ?? "anon"}] ERROR ${message}${suffix}`);
  }

  event(name: string, extra?: Record<string, unknown>) {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[metrics][${this.sessionId ?? "anon"}] EVENT ${name}${suffix}`);
  }
}
