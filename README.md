# Luther Voice Gateway

Streaming Twilio Media Streams into a full STT → LLM → TTS loop with barge-in-aware pacing, built on Express + WebSockets.

## Architecture

- `/twilio/incoming` responds to Twilio with TwiML that immediately opens a `<Stream>` to the gateway and optionally plays a short greeting.
- `wss://.../twilio/stream` accepts Twilio Media Stream connections, authenticates them with a shared token, and dispatches each caller to a `TwilioSession` state machine.
- Each session lives through LISTENING → TRANSCRIBING → THINKING → SPEAKING states, streaming audio chunks through the configured STT/LLM/TTS adapters.
- Barge-in detection watches inbound audio while the gateway is speaking. When a caller speaks, it aborts the LLM/TTS work and returns to listening.

## Features

- μ-law ↔ PCM conversion + optional resampling to match provider sample rates.
- Configurable thresholds for VAD and frame pacing (default 20 ms frames, 8 kHz audio).
- Provider adapter factory (mock implementations shipped; Google/OpenAI-ready hooks included).
- Observability hooks emit console metrics per call (state transitions, barge-ins, timings).

## Environment variables

| Key | Description | Default/Notes |
| --- | --- | --- |
| `PORT` | HTTP + WebSocket service port | `9000` |
| `TWILIO_INCOMING_PATH` | TwiML endpoint path | `/twilio/incoming` |
| `TWILIO_STREAM_PATH` | WebSocket path Twilio streams to | `/twilio/stream` |
| `TWILIO_STREAM_TOKEN` | Shared secret (`<Stream>` parameter `token`) | `luther-secret` |
| `TWILIO_STREAM_URL` | External wss:// URL returned in TwiML | `wss://localhost:9000/twilio/stream` |
| `TWILIO_GREETING` | Short text to read in `<Say>` | `Hold tight—connecting you to Luther.` |
| `LLM_PROVIDER` | `openai` or `mock` | `openai` (falls back to mock if no key) |
| `OPENAI_API_KEY` | Required for `openai` provider | — |
| `STT_PROVIDER` | `google` or `mock` | `mock` |
| `TTS_PROVIDER` | `google` or `mock` | `mock` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | Required for Google STT/TTS |
| `GOOGLE_TTS_VOICE` | Voice name (e.g., `en-US-Wavenet-F`) | `en-US-Wavenet-F` |
| `AUDIO_SAMPLE_RATE` | Internal PCM sample rate (Hz) | `8000` |
| `VAD_THRESHOLD` | Minimum RMS to consider speech | `200` |
| `SILENCE_FRAMES` | Number of <20 ms frames to wait before ending a turn | `8` |

## Running

```bash
cd voice-gateway
npm install
npm run dev     # iterate via ts-node
npm run build   # emit CommonJS bundle in dist/
npm start       # run compiled server
```

## Twilio configuration

1. Point your voice webhook to `https://{your-host}{TWILIO_INCOMING_PATH}` (e.g., `https://voice.lutherbot.com/twilio/incoming`).
2. The endpoint replies with TwiML that starts a `<Stream>` to `TWILIO_STREAM_URL` and sends the configured `token` parameter.
3. When you set up the `<Stream>`, no STT/TTS/LLM work happens in the webhook. All streaming logic lives in the WebSocket handler.

Example TwiML snippet that the endpoint returns:

```xml
<Response>
  <Start>
    <Stream url="wss://voice.lutherbot.com/twilio/stream" name="luther-session">
      <Parameter name="token" value="your-token" />
    </Stream>
  </Start>
  <Say voice="Polly.Joanna">Connecting you to Luther.</Say>
</Response>
```

## Providers

- **Mock adapters** (default) keep the gateway runnable without credentials. They return deterministic transcripts and generate short test tones.
- **Google STT/TTS** use `@google-cloud/speech` and `@google-cloud/text-to-speech`. Make sure `GOOGLE_APPLICATION_CREDENTIALS` is set.
- **OpenAI LLM** talks to `openai.chat.completions`. Set `OPENAI_API_KEY` and optionally `LLM_MODEL`.

You can mix & match providers by setting `STT_PROVIDER`, `LLM_PROVIDER`, and `TTS_PROVIDER`.

## Observability

- Each session logs state transitions, barge-ins, and provider timings to stdout.
- WebSocket connection details include the Twilio `callSid`/`streamSid` for cross-correlation.

## Next steps

- Add a metrics exporter (Prometheus / Honeycomb) if you need long-term call tracking.
- Replace mock providers with your preferred streaming STT/LLM/TTS once you have API keys.
- Optionally front the gateway with Cloudflare Tunnel or a TLS terminator so Twilio can reach it securely.
