import { MetricsLogger } from "../metrics/logger";

export enum SessionState {
  CONNECTED = "CONNECTED",
  LISTENING = "LISTENING",
  TRANSCRIBING = "TRANSCRIBING",
  THINKING = "THINKING",
  SPEAKING = "SPEAKING",
}

export class SessionStateMachine {
  private currentState: SessionState = SessionState.CONNECTED;

  constructor(private logger?: MetricsLogger) {}

  transition(nextState: SessionState) {
    if (this.currentState === nextState) {
      return;
    }
    this.logger?.info("state-transition", {
      from: this.currentState,
      to: nextState,
    });
    this.currentState = nextState;
  }

  get state(): SessionState {
    return this.currentState;
  }
}
