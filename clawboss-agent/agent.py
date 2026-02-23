import os
import json
import logging
import threading
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import AutoSubscribe, JobContext, JobRequest, WorkerOptions, cli, AgentSession, Agent
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import elevenlabs, openai, silero

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clawboss-agent")

OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

# ── Single agent lock ─────────────────────────────────────────────────────────
_active_lock = threading.Lock()
_active_job_id = None

CONSENT_ANNOUNCEMENT = (
    "This session is being recorded and transcribed by an AI assistant. "
    "By continuing, all participants acknowledge and consent to this recording. "
    "You may disconnect at any time if you do not consent. "
    "Please state your name to begin."
)

SYSTEM_PROMPTS = {
    "braindump": (
        "You are ClawBoss, an AI thought capture assistant. "
        "When the session starts, greet the user and ask for their name. "
        "Once they give their name, acknowledge it warmly and invite them to start their brain dump. "
        "Listen actively, ask short clarifying questions to draw out more detail, "
        "and help organize their thoughts. Be encouraging and non-judgmental."
    ),
    "voicenote": (
        "You are ClawBoss, an AI voice note assistant. "
        "When the session starts, greet the user and ask for their name. "
        "Be minimal — stay out of the way unless clarification is needed."
    ),
    "1on1": (
        "You are ClawBoss, an AI meeting assistant. "
        "After the consent announcement, ask each participant to state their name. "
        "Track decisions, action items, and blockers."
    ),
    "conference": (
        "You are ClawBoss, an AI meeting assistant. "
        "After the consent announcement, ask participants to introduce themselves. "
        "Track who said what, decisions, and action items."
    ),
    "interview": (
        "You are ClawBoss, an AI interview assistant. "
        "After the consent announcement, ask the interviewer and candidate to state their names."
    ),
}

CONSENT_MODES = {"1on1", "conference", "interview"}


async def request_fnc(req: JobRequest):
    global _active_job_id
    with _active_lock:
        if _active_job_id is not None:
            logger.info(f"REJECTING job {req.id} — already running {_active_job_id}")
            await req.reject()
            return
        _active_job_id = req.id
        logger.info(f"ACCEPTING job {req.id}")
    await req.accept()


async def entrypoint(ctx: JobContext):
    global _active_job_id

    try:
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        mode = "braindump"
        try:
            metadata = ctx.room.metadata
            if metadata:
                data = json.loads(metadata)
                mode = data.get("mode", "braindump")
        except Exception:
            pass

        logger.info(f"ClawBoss starting | room={ctx.room.name} | mode={mode}")

        system_prompt = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["braindump"])

        session = AgentSession(
            vad=silero.VAD.load(min_speech_duration=0.05, min_silence_duration=0.3),
            stt=openai.STT(api_key=OPENAI_KEY, model="whisper-1"),
            llm=openai.LLM(model="gpt-4o-mini", api_key=OPENAI_KEY),
            tts=elevenlabs.TTS(
                api_key=os.getenv("ELEVENLABS_API_KEY"),
                voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
                model="eleven_turbo_v2_5",
                sync_alignment=False,
            ),
        )

        @session.on("user_speech_committed")
        def on_user_speech(msg):
            logger.info(f"USER SAID: {msg.content}")

        @session.on("agent_speech_committed")
        def on_agent_speech(msg):
            logger.info(f"AGENT SAID: {msg.content}")

        await session.start(
            room=ctx.room,
            agent=Agent(instructions=system_prompt),
            room_options=RoomOptions(
                audio_input=True,
                participant_kinds=[rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD],
            ),
        )

        if mode in CONSENT_MODES:
            await session.say(CONSENT_ANNOUNCEMENT)
        else:
            await session.say("ClawBoss here. What's your name?")

        logger.info(f"ClawBoss session active | mode={mode}")

    finally:
        # Release lock when job ends
        with _active_lock:
            _active_job_id = None
            logger.info("Job ended — agent slot released")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        request_fnc=request_fnc,
        num_idle_processes=0,
    ))
