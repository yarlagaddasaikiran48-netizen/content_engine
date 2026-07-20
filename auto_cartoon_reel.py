#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================================
 AUTO CARTOON REEL  —  $0 end-to-end short-form comedy video pipeline
=====================================================================

Pipeline (sequential):
  1. SCRAPE   : Pull a trending Comedy video title from YouTube Data API v3.
  2. SCRIPT   : Ask Groq (Llama 3) for a 30-second slapstick cartoon script.
  3. VOICE    : Render the narration to MP3 with gTTS (free, no key).
  4. RENDER   : Build a 1080x1920 (9:16) MP4 with MoviePy + FFmpeg —
                cartoon-colored background, animated captions, voiceover.
  5. POST     : Publish to Instagram Reels (Meta Graph API) and
                YouTube Shorts (YouTube Data API v3).

---------------------------------------------------------------------
 INSTALL
---------------------------------------------------------------------
  python -m pip install -r requirements.txt

  requirements.txt:
      requests>=2.32
      groq>=0.11
      gTTS>=2.5
      moviepy>=2.1.2
      numpy>=1.26
      google-api-python-client>=2.140
      google-auth-oauthlib>=1.2
      google-auth-httplib2>=0.2

 EXTERNAL DEPENDENCIES
  * FFmpeg  — required by MoviePy for encoding. Nothing extra to install:
      imageio-ffmpeg (pulled in by MoviePy) ships a binary that this script
      falls back to automatically. A system FFmpeg is used instead when
      present on PATH, and is slightly faster:
      Windows : winget install Gyan.FFmpeg      (or: choco install ffmpeg)
      macOS   : brew install ffmpeg
      Linux   : sudo apt install ffmpeg
  * ImageMagick is NOT required (MoviePy 2.x renders text with Pillow).
  * A TrueType font file. Auto-detected; override with FONT_PATH.

---------------------------------------------------------------------
 ENVIRONMENT VARIABLES
---------------------------------------------------------------------
 Required for generation:
   YOUTUBE_API_KEY        YouTube Data API v3 key (Google Cloud Console).
   GROQ_API_KEY           Free key from https://console.groq.com/keys

 Optional generation tuning:
   GROQ_MODEL             default: llama-3.3-70b-versatile
   REGION_CODE            default: US
   FONT_PATH              absolute path to a .ttf file
   OUTPUT_DIR             default: ./output

 Instagram Reels (skipped if unset):
   IG_USER_ID             Instagram *Business/Creator* account ID
   IG_ACCESS_TOKEN        Long-lived Facebook Page access token
   PUBLIC_VIDEO_URL       Publicly reachable https URL of the rendered MP4.
                          Meta downloads the file from this URL — it CANNOT
                          read local disk. Leave unset and set
                          AUTO_UPLOAD_HOST=catbox to auto-upload for free.
   AUTO_UPLOAD_HOST       "catbox" to auto-host the MP4 on catbox.moe (free,
                          public, anonymous). Unset = no auto-upload.

 YouTube Shorts upload (skipped if unset):
   YT_CLIENT_SECRETS      Path to OAuth *desktop app* client_secret.json
   YT_TOKEN_FILE          default: ./token.json (created on first run)
   YT_PRIVACY             public | unlisted | private   (default: public)

 Flags:
   DRY_RUN=1              Generate + render only, skip all publishing.

---------------------------------------------------------------------
 USAGE
---------------------------------------------------------------------
   set GROQ_API_KEY=...        (Windows)   /  export GROQ_API_KEY=...  (unix)
   python auto_cartoon_reel.py

 NOTE ON COST: every service used here has a free tier. Meta and YouTube
 both enforce daily upload quotas — YouTube's default quota allows roughly
 6 uploads/day (1600 units each of a 10,000-unit budget).
=====================================================================
"""

from __future__ import annotations

import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Third-party imports are done lazily inside each step so that a missing
# optional dependency (e.g. Google client libs) does not break the whole run.
# Only `requests` is needed globally.
# ---------------------------------------------------------------------------
try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("Missing dependency: pip install requests")


# ===========================================================================
# CONFIG
# ===========================================================================

VIDEO_W, VIDEO_H = 1080, 1920          # 9:16 vertical
FPS = 30
TARGET_SECONDS = 30                    # hard cap for Shorts/Reels comedy beat
YOUTUBE_COMEDY_CATEGORY_ID = "23"      # YouTube's "Comedy" category

# Saturated, high-contrast "cartoon" palette. One color per spoken beat so the
# background pops on every line — cheap way to fake animation energy.
CARTOON_BG_COLORS = [
    (255, 87, 87),    # tomato red
    (255, 176, 46),   # marigold
    (61, 199, 168),   # mint
    (86, 145, 255),   # comic blue
    (186, 104, 255),  # grape
    (255, 122, 189),  # bubblegum
    (46, 204, 113),   # slime green
]

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\impact.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


@dataclass
class Config:
    """All runtime configuration, resolved once from the environment."""

    youtube_api_key: str = field(default_factory=lambda: os.getenv("YOUTUBE_API_KEY", ""))
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", ""))
    groq_model: str = field(default_factory=lambda: os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"))
    region_code: str = field(default_factory=lambda: os.getenv("REGION_CODE", "US"))
    font_path: str = field(default_factory=lambda: os.getenv("FONT_PATH", ""))
    output_dir: Path = field(default_factory=lambda: Path(os.getenv("OUTPUT_DIR", "output")).resolve())

    ig_user_id: str = field(default_factory=lambda: os.getenv("IG_USER_ID", ""))
    ig_access_token: str = field(default_factory=lambda: os.getenv("IG_ACCESS_TOKEN", ""))
    public_video_url: str = field(default_factory=lambda: os.getenv("PUBLIC_VIDEO_URL", ""))
    auto_upload_host: str = field(default_factory=lambda: os.getenv("AUTO_UPLOAD_HOST", "").lower())

    yt_client_secrets: str = field(default_factory=lambda: os.getenv("YT_CLIENT_SECRETS", ""))
    yt_token_file: str = field(default_factory=lambda: os.getenv("YT_TOKEN_FILE", "token.json"))
    yt_privacy: str = field(default_factory=lambda: os.getenv("YT_PRIVACY", "public"))

    dry_run: bool = field(default_factory=lambda: os.getenv("DRY_RUN", "").strip() in ("1", "true", "yes"))

    def validate(self) -> None:
        """Fail fast on the two keys the generation half genuinely needs."""
        missing = [n for n, v in (("YOUTUBE_API_KEY", self.youtube_api_key),
                                  ("GROQ_API_KEY", self.groq_api_key)) if not v]
        if missing:
            raise SystemExit(
                f"Missing required environment variable(s): {', '.join(missing)}\n"
                "See the docstring at the top of this file for setup instructions."
            )
        self.output_dir.mkdir(parents=True, exist_ok=True)


def log(step: str, message: str) -> None:
    """Uniform, greppable console output."""
    print(f"[{step:<8}] {message}", flush=True)


def ensure_ffmpeg() -> None:
    """
    MoviePy shells out to FFmpeg; verify a usable binary exists before doing
    real work. Prefers a system install on PATH, otherwise falls back to the
    binary bundled with imageio-ffmpeg (a MoviePy dependency), which means a
    plain `pip install -r requirements.txt` is enough on a clean machine.
    """
    exe = shutil.which("ffmpeg")
    source = "system PATH"

    if not exe:
        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            source = "imageio-ffmpeg (bundled)"
            # Tell MoviePy explicitly so it doesn't go looking on PATH itself.
            os.environ.setdefault("FFMPEG_BINARY", exe)
        except Exception:  # noqa: BLE001 - fall through to the install hint
            exe = None

    if not exe:
        raise SystemExit(
            "No FFmpeg binary found.\n"
            "  Easiest  : pip install imageio-ffmpeg\n"
            "  Windows  : winget install Gyan.FFmpeg\n"
            "  macOS    : brew install ffmpeg\n"
            "  Linux    : sudo apt install ffmpeg"
        )

    try:
        subprocess.run([exe, "-version"], capture_output=True, check=True, timeout=30)
    except Exception as exc:  # noqa: BLE001 - surface anything odd about the binary
        raise SystemExit(f"FFmpeg found at {exe} but failed to run: {exc}") from exc

    log("SETUP", f"FFmpeg OK via {source} ({exe})")


def resolve_font(cfg: Config) -> str | None:
    """Return a usable .ttf path, or None to let MoviePy use its default."""
    if cfg.font_path and Path(cfg.font_path).is_file():
        return cfg.font_path
    for candidate in FONT_CANDIDATES:
        if Path(candidate).is_file():
            return candidate
    log("SETUP", "WARNING: no bold TTF found; falling back to MoviePy's default font. "
                 "Set FONT_PATH for better-looking captions.")
    return None


# ===========================================================================
# STEP 1 — CONTENT SCRAPING (YouTube Data API v3)
# ===========================================================================

def fetch_trending_comedy_topic(cfg: Config) -> str:
    """
    Pull the most-popular Comedy videos for a region and pick one title at
    random (random, not top-1, so repeated daily runs don't all make the same
    video). Falls back to a canned topic if the API is unavailable so the rest
    of the pipeline can still run.

    API cost: 1 quota unit.
    """
    log("SCRAPE", f"Fetching trending Comedy videos for region {cfg.region_code}...")
    params = {
        "part": "snippet",
        "chart": "mostPopular",
        "videoCategoryId": YOUTUBE_COMEDY_CATEGORY_ID,
        "regionCode": cfg.region_code,
        "maxResults": 25,
        "key": cfg.youtube_api_key,
    }
    try:
        resp = requests.get("https://www.googleapis.com/youtube/v3/videos",
                            params=params, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:300]}")

        items = resp.json().get("items", [])
        titles = [i["snippet"]["title"].strip() for i in items if i.get("snippet", {}).get("title")]
        if not titles:
            raise RuntimeError("API returned no Comedy videos for this region.")

        # Prefer mid-length titles: very short ones are low-signal, very long
        # ones are usually clickbait strings that confuse the script model.
        usable = [t for t in titles if 15 <= len(t) <= 90] or titles
        topic = random.choice(usable)
        log("SCRAPE", f"Trending topic selected: {topic!r}")
        return topic

    except Exception as exc:  # noqa: BLE001 - never let scraping kill the run
        fallback = "A cat tries to steal a sandwich and everything goes wrong"
        log("SCRAPE", f"WARNING: {exc}")
        log("SCRAPE", f"Using fallback topic: {fallback!r}")
        return fallback


# ===========================================================================
# STEP 2 — SCRIPT GENERATION (Groq + Llama 3)
# ===========================================================================

SCRIPT_SYSTEM_PROMPT = """You write scripts for viral 30-second slapstick cartoon comedy shorts.

Rules:
- 5 to 7 spoken lines, each 6-14 words. Total spoken time must be UNDER 28 seconds.
- Pure spoken narration only. NO stage directions, NO character names, NO
  parentheticals, NO emojis, NO sound-effect words in brackets.
- Line 1 is a hook. The last line is the punchline.
- Physical, visual, slapstick humor. Family-friendly. No profanity.

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"title": "...", "caption": "...", "hashtags": ["...", "..."], "lines": ["...", "..."]}
- "title"    : YouTube Shorts title, under 90 characters.
- "caption"  : Instagram caption, 1-2 sentences.
- "hashtags" : 5 to 8 tags, no '#' prefix.
- "lines"    : the spoken narration lines, in order."""


def _strip_directions(line: str) -> str:
    """
    Remove anything the model sneaks in that shouldn't be spoken aloud:
    (parentheticals), [brackets], *asterisks*, and "NARRATOR:" prefixes.
    """
    line = re.sub(r"\([^)]*\)", " ", line)
    line = re.sub(r"\[[^\]]*\]", " ", line)
    line = re.sub(r"\*[^*]*\*", " ", line)
    line = re.sub(r"^\s*[A-Z][A-Z \-']{1,24}:\s*", "", line)   # SPEAKER:
    line = re.sub(r"^\s*[-*•]\s*", "", line)               # bullets
    line = re.sub(r"^\s*\d+[.)]\s*", "", line)                  # 1. / 1)
    return re.sub(r"\s+", " ", line).strip()


def _extract_json(raw: str) -> dict[str, Any]:
    """Parse the model's reply, tolerating ```json fences and leading prose."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Last resort: grab the outermost {...} block.
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        raise ValueError(f"Model reply contained no JSON object:\n{raw[:500]}")
    return json.loads(match.group(0))


def generate_script(cfg: Config, topic: str) -> dict[str, Any]:
    """
    Ask Groq's Llama 3 for the comedy script. Returns a normalized dict:
        {"title", "caption", "hashtags": [...], "lines": [...]}
    Retries once on transient failure, then falls back to a built-in script.
    """
    try:
        from groq import Groq
    except ImportError:
        raise SystemExit("Missing dependency: pip install groq")

    client = Groq(api_key=cfg.groq_api_key)
    user_prompt = (
        f"Trending comedy topic: {topic}\n\n"
        "Write the slapstick cartoon short script inspired by this topic. "
        "It must stand alone — a viewer who has never seen the source video "
        "should still get the joke."
    )

    last_error: Exception | None = None
    for attempt in (1, 2):
        try:
            log("SCRIPT", f"Calling Groq model {cfg.groq_model} (attempt {attempt})...")
            completion = client.chat.completions.create(
                model=cfg.groq_model,
                messages=[
                    {"role": "system", "content": SCRIPT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.9,
                max_tokens=800,
                response_format={"type": "json_object"},
            )
            data = _extract_json(completion.choices[0].message.content or "")
            script = _normalize_script(data, topic)
            log("SCRIPT", f"Generated {len(script['lines'])} lines — title: {script['title']!r}")
            for i, line in enumerate(script["lines"], 1):
                log("SCRIPT", f"  {i}. {line}")
            return script
        except Exception as exc:  # noqa: BLE001 - retry then fall back
            last_error = exc
            log("SCRIPT", f"WARNING: Groq call failed: {exc}")
            time.sleep(2)

    log("SCRIPT", f"Falling back to built-in script after error: {last_error}")
    return _normalize_script({}, topic)


def _normalize_script(data: dict[str, Any], topic: str) -> dict[str, Any]:
    """Clean, clamp and backfill whatever the model returned."""
    raw_lines = data.get("lines") or []
    if isinstance(raw_lines, str):                       # model returned a blob
        raw_lines = [ln for ln in raw_lines.splitlines() if ln.strip()]

    lines = [_strip_directions(str(ln)) for ln in raw_lines]
    lines = [ln for ln in lines if len(ln) >= 3][:7]      # cap at 7 beats

    if len(lines) < 3:                                    # emergency fallback
        lines = [
            "Meet Gary. Gary has one job today: carry the cake.",
            "Gary steps on a banana peel he personally left there.",
            "The cake achieves orbit. Gary does not.",
            "It lands perfectly. On the wedding photographer.",
            "Gary is now the wedding photographer.",
        ]

    hashtags = data.get("hashtags") or ["cartoon", "comedy", "funny", "animation", "shorts", "slapstick"]
    hashtags = [re.sub(r"[^A-Za-z0-9_]", "", str(h)).lower() for h in hashtags]
    hashtags = [h for h in hashtags if h][:8]

    title = str(data.get("title") or f"When {topic[:60]} Goes Wrong").strip()[:95]
    caption = str(data.get("caption") or "Cartoon chaos in 30 seconds.").strip()[:1500]

    return {"title": title, "caption": caption, "hashtags": hashtags, "lines": lines}


# ===========================================================================
# STEP 3 — VOICEOVER (gTTS)
# ===========================================================================

def synthesize_voiceover(lines: list[str], out_path: Path) -> Path:
    """
    Render the narration to a single MP3 with gTTS.

    gTTS needs internet but no API key or account — this is the $0 part.
    Lines are joined with a period+space so the engine inserts natural
    comedic pauses between beats.
    """
    try:
        from gtts import gTTS
    except ImportError:
        raise SystemExit("Missing dependency: pip install gTTS")

    narration = " ... ".join(ln.rstrip(".!?") + "." for ln in lines)
    log("VOICE", f"Synthesizing {len(narration)} characters of narration...")

    last_error: Exception | None = None
    for attempt in (1, 2, 3):
        try:
            tts = gTTS(text=narration, lang="en", tld="com", slow=False)
            tts.save(str(out_path))
            if out_path.stat().st_size < 1024:
                raise RuntimeError("gTTS produced a suspiciously small file.")
            log("VOICE", f"Voiceover saved -> {out_path} ({out_path.stat().st_size // 1024} KB)")
            return out_path
        except Exception as exc:  # noqa: BLE001 - gTTS hits transient 429s
            last_error = exc
            log("VOICE", f"WARNING: attempt {attempt} failed: {exc}")
            time.sleep(3 * attempt)

    raise SystemExit(f"Voiceover generation failed after 3 attempts: {last_error}")


# ===========================================================================
# STEP 4 — VIDEO RENDERING (MoviePy + FFmpeg)
# ===========================================================================

def _allocate_timings(lines: list[str], total: float) -> list[tuple[float, float]]:
    """
    Split the audio duration across lines proportionally to character count —
    a good approximation of speech duration, and it keeps captions in sync
    without needing forced alignment.

    Returns a list of (start, end) tuples covering [0, total].
    """
    weights = [max(len(ln), 8) for ln in lines]
    total_weight = sum(weights)
    timings: list[tuple[float, float]] = []
    cursor = 0.0
    for i, w in enumerate(weights):
        # Last line absorbs any rounding drift so captions cover the full audio.
        span = (total - cursor) if i == len(weights) - 1 else total * (w / total_weight)
        timings.append((cursor, cursor + span))
        cursor += span
    return timings


def _fit_caption(text: str, font_path: str | None, max_width: int,
                 max_size: int = 86, min_size: int = 46) -> tuple[str, int]:
    """
    Word-wrap `text` to fit `max_width`, returning (wrapped_text, font_size).

    MoviePy's method="caption" wraps on character boundaries, which splits words
    in half ("GA / RY"). So we measure with Pillow's real font metrics and insert
    our own newlines, then render with method="label".

    Font size steps down until every individual word fits on a line, so a single
    long word can never overflow the frame.
    """
    from PIL import ImageFont

    def load(size: int):
        try:
            return ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default(size)
        except Exception:  # noqa: BLE001 - fall back to Pillow's bitmap default
            return ImageFont.load_default(size)

    words = text.split()
    for size in range(max_size, min_size - 1, -4):
        font = load(size)
        # Reject this size outright if any single word can't fit on its own line.
        if any(font.getlength(w) > max_width for w in words):
            continue

        wrapped: list[str] = []
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if font.getlength(trial) <= max_width or not current:
                current = trial
            else:
                wrapped.append(current)
                current = word
        if current:
            wrapped.append(current)

        # Keep captions to 4 lines max so they stay readable on a phone.
        if len(wrapped) <= 4:
            return "\n".join(wrapped), size

    # Nothing fit cleanly — hard-wrap at the smallest size as a last resort.
    font = load(min_size)
    wrapped, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if font.getlength(trial) <= max_width or not current:
            current = trial
        else:
            wrapped.append(current)
            current = word
    if current:
        wrapped.append(current)
    return "\n".join(wrapped), min_size


def render_video(cfg: Config, lines: list[str], audio_path: Path, out_path: Path) -> Path:
    """
    Compose the 9:16 MP4:
      - a solid cartoon-colored background that changes on every spoken beat
      - a large centered caption per beat with a heavy black outline
      - a small "pop" scale-in on each caption for cartoon bounce
      - the gTTS voiceover as the audio track

    Encoded H.264 / AAC, yuv420p — the profile both Instagram and YouTube want.
    """
    from moviepy import AudioFileClip, ColorClip, CompositeVideoClip, TextClip, concatenate_videoclips

    font = resolve_font(cfg)

    log("RENDER", "Loading voiceover...")
    audio = AudioFileClip(str(audio_path))
    duration = float(audio.duration)

    # Hard-cap at 30s: Reels and Shorts both reward tight pacing, and an
    # over-long gTTS read would otherwise blow the target length.
    if duration > TARGET_SECONDS:
        log("RENDER", f"Voiceover is {duration:.1f}s; trimming to {TARGET_SECONDS}s.")
        audio = audio.subclipped(0, TARGET_SECONDS)
        duration = float(audio.duration)
    log("RENDER", f"Final duration: {duration:.2f}s")

    timings = _allocate_timings(lines, duration)
    palette = random.sample(CARTOON_BG_COLORS, k=min(len(lines), len(CARTOON_BG_COLORS)))

    # --- Background: one colored segment per beat, concatenated -------------
    segments = []
    for i, (start, end) in enumerate(timings):
        color = palette[i % len(palette)]
        segments.append(ColorClip(size=(VIDEO_W, VIDEO_H), color=color)
                        .with_duration(max(end - start, 0.05)))
    background = concatenate_videoclips(segments).with_duration(duration)

    # --- Captions ------------------------------------------------------------
    caption_clips = []
    for i, (line, (start, end)) in enumerate(zip(lines, timings)):
        seg_duration = max(end - start, 0.05)

        # Wrap on word boundaries ourselves; MoviePy's "caption" mode splits
        # words mid-character. Subtract the stroke so the outline stays inside.
        max_text_width = int(VIDEO_W * 0.84) - 2 * 6
        wrapped, font_size = _fit_caption(line.upper(), font, max_text_width)

        text_kwargs: dict[str, Any] = {
            "text": wrapped,
            "font_size": font_size,
            "color": "white",
            "stroke_color": "black",
            "stroke_width": 6,
            "method": "label",
            "text_align": "center",
            "interline": 12,
            # MoviePy sizes the label to the glyph box, which ignores the stroke
            # and descenders — without this padding the last line gets clipped.
            "margin": (14, 28),
        }
        if font:
            text_kwargs["font"] = font

        try:
            txt = TextClip(**text_kwargs)
        except Exception as exc:  # noqa: BLE001 - font/Pillow issues are common
            log("RENDER", f"WARNING: caption {i + 1} failed ({exc}); retrying without custom font.")
            text_kwargs.pop("font", None)
            txt = TextClip(**text_kwargs)

        txt = txt.with_start(start).with_duration(seg_duration).with_position(("center", "center"))

        # Cartoon "pop": scale 0.75 -> 1.0 over the first 180ms of the beat.
        def pop(t: float) -> float:
            return 0.75 + 0.25 * min(t / 0.18, 1.0)

        try:
            txt = txt.resized(pop)
        except Exception:  # noqa: BLE001 - resize is cosmetic; never fail the render
            pass

        caption_clips.append(txt)

    log("RENDER", f"Compositing {len(caption_clips)} caption beats at {VIDEO_W}x{VIDEO_H}...")
    video = CompositeVideoClip([background, *caption_clips], size=(VIDEO_W, VIDEO_H))
    video = video.with_duration(duration).with_audio(audio)

    log("RENDER", f"Encoding -> {out_path} (this is the slow part)...")
    video.write_videofile(
        str(out_path),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="192k",
        bitrate="6000k",
        preset="medium",
        threads=os.cpu_count() or 4,
        temp_audiofile=str(cfg.output_dir / "_temp_audio.m4a"),
        remove_temp=True,
        ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
        logger=None,   # set to "bar" if you want a progress bar
    )

    # Release file handles so Windows doesn't hold locks on the temp files.
    for clip in (video, background, audio, *caption_clips):
        try:
            clip.close()
        except Exception:  # noqa: BLE001
            pass

    size_mb = out_path.stat().st_size / (1024 * 1024)
    log("RENDER", f"Done: {out_path} ({size_mb:.1f} MB)")
    return out_path


# ===========================================================================
# STEP 5a — PUBLIC HOSTING (needed by the Meta Graph API)
# ===========================================================================

def upload_to_public_host(cfg: Config, video_path: Path) -> str | None:
    """
    The Meta Graph API does NOT accept a local file for Reels — it fetches the
    video from a public https URL you supply. If PUBLIC_VIDEO_URL isn't set and
    AUTO_UPLOAD_HOST=catbox, push the file to catbox.moe (free, anonymous).

    Anything uploaded here is PUBLIC. Don't use it for private content.
    """
    if cfg.public_video_url:
        log("HOST", f"Using PUBLIC_VIDEO_URL: {cfg.public_video_url}")
        return cfg.public_video_url

    if cfg.auto_upload_host != "catbox":
        log("HOST", "No PUBLIC_VIDEO_URL and AUTO_UPLOAD_HOST is not 'catbox' — "
                    "skipping public hosting.")
        return None

    log("HOST", "Uploading MP4 to catbox.moe (public, anonymous)...")
    try:
        with video_path.open("rb") as fh:
            resp = requests.post(
                "https://catbox.moe/user/api.php",
                data={"reqtype": "fileupload"},
                files={"fileToUpload": (video_path.name, fh, "video/mp4")},
                timeout=300,
            )
        url = resp.text.strip()
        if resp.status_code != 200 or not url.startswith("http"):
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        log("HOST", f"Hosted at {url}")
        return url
    except Exception as exc:  # noqa: BLE001
        log("HOST", f"ERROR: public upload failed: {exc}")
        return None


# ===========================================================================
# STEP 5b — INSTAGRAM REELS (Meta Graph API)
# ===========================================================================

GRAPH_API_VERSION = "v21.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


def post_to_instagram(cfg: Config, video_url: str, caption: str) -> str | None:
    """
    Three-step Reels publish:
      1. POST /{ig_user_id}/media          -> creation_id (Meta downloads the file)
      2. GET  /{creation_id}?fields=status_code  -> poll until FINISHED
      3. POST /{ig_user_id}/media_publish  -> live media id

    Requires an Instagram Business/Creator account linked to a Facebook Page,
    and a token with instagram_basic + instagram_content_publish +
    pages_read_engagement. Returns the published media ID, or None on failure.
    """
    if not (cfg.ig_user_id and cfg.ig_access_token):
        log("INSTA", "IG_USER_ID / IG_ACCESS_TOKEN not set — skipping Instagram.")
        return None
    if not video_url:
        log("INSTA", "No public video URL available — skipping Instagram. "
                     "Set PUBLIC_VIDEO_URL or AUTO_UPLOAD_HOST=catbox.")
        return None

    try:
        # --- 1. Create the media container ---------------------------------
        log("INSTA", "Creating Reels media container...")
        create = requests.post(
            f"{GRAPH_BASE}/{cfg.ig_user_id}/media",
            data={
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "share_to_feed": "true",
                "access_token": cfg.ig_access_token,
            },
            timeout=120,
        )
        payload = create.json()
        if create.status_code != 200 or "id" not in payload:
            raise RuntimeError(f"container creation failed: {json.dumps(payload)[:400]}")
        creation_id = payload["id"]
        log("INSTA", f"Container created: {creation_id}")

        # --- 2. Poll until Meta finishes downloading + transcoding ----------
        # Reels routinely take 30-90s. Poll for up to 5 minutes.
        deadline = time.time() + 300
        while time.time() < deadline:
            time.sleep(8)
            status = requests.get(
                f"{GRAPH_BASE}/{creation_id}",
                params={"fields": "status_code,status", "access_token": cfg.ig_access_token},
                timeout=60,
            ).json()
            code = status.get("status_code", "UNKNOWN")
            log("INSTA", f"Container status: {code}")
            if code == "FINISHED":
                break
            if code in ("ERROR", "EXPIRED"):
                raise RuntimeError(f"container failed: {json.dumps(status)[:400]}")
        else:
            raise TimeoutError("Container did not reach FINISHED within 5 minutes.")

        # --- 3. Publish -----------------------------------------------------
        log("INSTA", "Publishing Reel...")
        publish = requests.post(
            f"{GRAPH_BASE}/{cfg.ig_user_id}/media_publish",
            data={"creation_id": creation_id, "access_token": cfg.ig_access_token},
            timeout=120,
        )
        result = publish.json()
        if publish.status_code != 200 or "id" not in result:
            raise RuntimeError(f"publish failed: {json.dumps(result)[:400]}")

        media_id = result["id"]
        log("INSTA", f"SUCCESS — Reel published, media id {media_id}")
        return media_id

    except Exception as exc:  # noqa: BLE001 - one platform failing must not
        log("INSTA", f"ERROR: {exc}")        # block the other
        return None


# ===========================================================================
# STEP 5c — YOUTUBE SHORTS (YouTube Data API v3)
# ===========================================================================

YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _get_youtube_client(cfg: Config):
    """
    Build an authenticated YouTube client via OAuth 2.0 installed-app flow.
    First run opens a browser for consent; the refresh token is cached in
    YT_TOKEN_FILE so subsequent runs are fully unattended.
    """
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    token_path = Path(cfg.yt_token_file)
    creds: Credentials | None = None

    if token_path.is_file():
        creds = Credentials.from_authorized_user_file(str(token_path), YT_SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            log("YOUTUBE", "Refreshing expired OAuth token...")
            creds.refresh(Request())
        else:
            if not Path(cfg.yt_client_secrets).is_file():
                raise FileNotFoundError(
                    f"YT_CLIENT_SECRETS not found: {cfg.yt_client_secrets!r}. "
                    "Download an OAuth 'Desktop app' client_secret.json from the "
                    "Google Cloud Console."
                )
            log("YOUTUBE", "Starting browser OAuth consent flow (one time only)...")
            flow = InstalledAppFlow.from_client_secrets_file(cfg.yt_client_secrets, YT_SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        log("YOUTUBE", f"Token cached at {token_path}")

    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def post_to_youtube(cfg: Config, video_path: Path, title: str,
                    description: str, tags: list[str]) -> str | None:
    """
    Resumable upload to YouTube. A vertical video under 60s with #Shorts in the
    title or description is automatically classified as a Short.

    Quota cost: 1600 units per upload (default daily budget is 10,000).
    Returns the video ID, or None on failure.
    """
    if not cfg.yt_client_secrets:
        log("YOUTUBE", "YT_CLIENT_SECRETS not set — skipping YouTube.")
        return None

    try:
        from googleapiclient.errors import HttpError
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        log("YOUTUBE", "Missing dependency: pip install google-api-python-client "
                       "google-auth-oauthlib — skipping YouTube.")
        return None

    try:
        youtube = _get_youtube_client(cfg)

        # "#Shorts" is the signal YouTube uses for classification.
        shorts_title = title if "#shorts" in title.lower() else f"{title} #Shorts"
        body = {
            "snippet": {
                "title": shorts_title[:100],
                "description": f"{description}\n\n#Shorts " + " ".join(f"#{t}" for t in tags),
                "tags": tags[:15],
                "categoryId": YOUTUBE_COMEDY_CATEGORY_ID,
            },
            "status": {
                "privacyStatus": cfg.yt_privacy,
                "selfDeclaredMadeForKids": False,
            },
        }

        media = MediaFileUpload(str(video_path), mimetype="video/mp4",
                                chunksize=4 * 1024 * 1024, resumable=True)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

        log("YOUTUBE", "Uploading (resumable)...")
        response = None
        retries = 0
        while response is None:
            try:
                status, response = request.next_chunk()
                if status:
                    log("YOUTUBE", f"  {int(status.progress() * 100)}% uploaded")
            except HttpError as exc:
                # 5xx are transient; back off and resume the same session.
                if exc.resp.status in (500, 502, 503, 504) and retries < 5:
                    retries += 1
                    wait = 2 ** retries
                    log("YOUTUBE", f"Transient {exc.resp.status}; retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                raise

        video_id = response["id"]
        log("YOUTUBE", f"SUCCESS — https://youtube.com/shorts/{video_id}")
        return video_id

    except Exception as exc:  # noqa: BLE001
        log("YOUTUBE", f"ERROR: {exc}")
        return None


# ===========================================================================
# ORCHESTRATION
# ===========================================================================

def main() -> int:
    print("=" * 70)
    print(" AUTO CARTOON REEL — $0 automated comedy short pipeline")
    print("=" * 70)

    cfg = Config()
    cfg.validate()
    ensure_ffmpeg()

    stamp = time.strftime("%Y%m%d_%H%M%S")
    audio_path = cfg.output_dir / f"voice_{stamp}.mp3"
    video_path = cfg.output_dir / f"reel_{stamp}.mp4"

    # --- 1. Scrape ---------------------------------------------------------
    topic = fetch_trending_comedy_topic(cfg)

    # --- 2. Script ---------------------------------------------------------
    script = generate_script(cfg, topic)

    # --- 3. Voiceover ------------------------------------------------------
    synthesize_voiceover(script["lines"], audio_path)

    # --- 4. Render ---------------------------------------------------------
    render_video(cfg, script["lines"], audio_path, video_path)

    # Persist the metadata alongside the video for auditing / manual reposts.
    meta_path = cfg.output_dir / f"meta_{stamp}.json"
    meta_path.write_text(json.dumps({"topic": topic, **script}, indent=2), encoding="utf-8")
    log("MAIN", f"Metadata saved -> {meta_path}")

    if cfg.dry_run:
        log("MAIN", "DRY_RUN=1 — skipping all publishing. Video is at "
                    f"{video_path}")
        return 0

    # --- 5. Publish --------------------------------------------------------
    ig_caption = script["caption"] + "\n\n" + " ".join(f"#{t}" for t in script["hashtags"])
    public_url = upload_to_public_host(cfg, video_path)

    ig_id = post_to_instagram(cfg, public_url or "", ig_caption)
    yt_id = post_to_youtube(cfg, video_path, script["title"],
                            script["caption"], script["hashtags"])

    # --- Summary -----------------------------------------------------------
    print("\n" + "=" * 70)
    print(" RESULTS")
    print("=" * 70)
    print(f"  Topic     : {topic}")
    print(f"  Video     : {video_path}")
    print(f"  Instagram : {'https://instagram.com/reel/ (media id ' + ig_id + ')' if ig_id else 'NOT POSTED'}")
    print(f"  YouTube   : {'https://youtube.com/shorts/' + yt_id if yt_id else 'NOT POSTED'}")
    print("=" * 70)

    # Non-zero exit if both publish targets were attempted and both failed —
    # useful when running this from cron/Task Scheduler.
    attempted = bool(cfg.ig_user_id or cfg.yt_client_secrets)
    return 0 if (not attempted or ig_id or yt_id) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
        sys.exit(130)
