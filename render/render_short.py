#!/usr/bin/env python3
"""
Local visual renderer for 30-second Indian spiritual Shorts.

Produces the look of viral mythological storytelling shorts: a cinematic
illustration held under a slow Ken Burns push, with bold phrase-by-phrase
captions burned in for the majority of viewers who watch on mute.

    # simplest: audio + text, background generated
    python render/render_short.py --audio narration.mp3 --text "your script"

    # with your own artwork
    python render/render_short.py --audio narration.mp3 --text-file script.txt \
        --image assets/backgrounds/krishna.jpg

    # fetch a background from Pexels (free key in PEXELS_API_KEY)
    python render/render_short.py --audio narration.mp3 --text-file script.txt \
        --query "ancient indian temple painting"

    # pull everything straight from the engine's Supabase queue
    python render/render_short.py --id 6f1c...  --out short.mp4

Design rules this file follows:
  * Nothing is hardcoded. Resolution, fps, colours, fonts, zoom, caption size
    and safe margins all come from CLI flags or environment variables, with
    sane defaults. Fonts are discovered per-platform rather than assumed.
  * It degrades instead of failing. No Pexels key, no image, no bundled font:
    each has a fallback, so the script always produces a video.
  * Caption timing uses the same character-weighted algorithm as the Node
    renderer, so local and CI output stay in sync.

Zero cost: MoviePy, Pillow, NumPy and (optionally) the free Pexels API.
"""

from __future__ import annotations

import argparse
import os
import platform
import random
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    from dotenv import load_dotenv

    load_dotenv(".env.local")
    load_dotenv()
except ImportError:  # dotenv is a convenience, not a requirement
    pass

from moviepy import (
    AudioArrayClip,
    AudioFileClip,
    CompositeVideoClip,
    ImageClip,
    VideoClip,
    concatenate_audioclips,
)


# ---------------------------------------------------------------------------
# MoviePy 1.x / 2.x compatibility
#
# MoviePy 2 renamed every setter from set_* to with_*. Rather than pin a
# version and break on the other, resolve the method by name once.
# ---------------------------------------------------------------------------
def _call(clip, new_name: str, old_name: str, *args, **kwargs):
    method = getattr(clip, new_name, None) or getattr(clip, old_name, None)
    if method is None:
        raise AttributeError(f"Clip has neither {new_name} nor {old_name}")
    return method(*args, **kwargs)


def with_start(clip, value):
    return _call(clip, "with_start", "set_start", value)


def with_duration(clip, value):
    return _call(clip, "with_duration", "set_duration", value)


def with_position(clip, value):
    return _call(clip, "with_position", "set_position", value)


def with_audio(clip, value):
    return _call(clip, "with_audio", "set_audio", value)


# ---------------------------------------------------------------------------
# Configuration — every value overridable, none baked in
# ---------------------------------------------------------------------------
def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class RenderConfig:
    width: int = env_int("VIDEO_WIDTH", 1080)
    height: int = env_int("VIDEO_HEIGHT", 1920)
    fps: int = env_int("VIDEO_FPS", 30)

    # Ken Burns: how far the push travels over the whole clip.
    zoom_end: float = env_float("KEN_BURNS_ZOOM", 1.18)

    # Captions
    caption_font_size: int = env_int("CAPTION_FONT_SIZE", 74)
    caption_stroke: int = env_int("CAPTION_STROKE", 8)
    caption_margin_x: int = env_int("CAPTION_MARGIN_X", 90)
    # Distance from the bottom edge. Kept clear of the Shorts UI overlay.
    caption_bottom: int = env_int("CAPTION_BOTTOM", 420)
    words_per_cue: int = env_int("CAPTION_WORDS_PER_CUE", 4)

    # Legibility treatment applied to the background
    background_blur: float = env_float("BACKGROUND_BLUR", 3.0)
    background_dim: float = env_float("BACKGROUND_DIM", 0.55)

    tail_seconds: float = env_float("VIDEO_TAIL_SECONDS", 0.6)
    fade_seconds: float = env_float("VIDEO_FADE_SECONDS", 0.5)

    font_path: str = os.environ.get("FONT_PATH", "")
    crf: int = env_int("VIDEO_CRF", 21)


# ---------------------------------------------------------------------------
# Fonts — discovered, never assumed
# ---------------------------------------------------------------------------
FONT_CANDIDATES: dict[str, Sequence[str]] = {
    "Windows": (
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\calibrib.ttf",
        r"C:\Windows\Fonts\impact.ttf",
    ),
    "Darwin": (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ),
    "Linux": (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    ),
}


def load_font(config: RenderConfig, size: int) -> ImageFont.FreeTypeFont:
    """First usable bold font: explicit override, then platform defaults."""
    candidates: list[str] = []
    if config.font_path:
        candidates.append(config.font_path)
    candidates.extend(FONT_CANDIDATES.get(platform.system(), ()))
    # Every platform's list, in case of an unusual container image.
    for paths in FONT_CANDIDATES.values():
        candidates.extend(paths)

    for path in candidates:
        if path and Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue

    print(
        "  ! No TrueType font found. Falling back to PIL's bitmap font, which "
        "will look poor. Set FONT_PATH to a .ttf to fix this.",
        file=sys.stderr,
    )
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Background acquisition
# ---------------------------------------------------------------------------
def fetch_pexels_image(query: str, config: RenderConfig) -> Image.Image | None:
    """
    Pull a vertical photo from Pexels. Free API key, generous quota.
    Returns None on any problem so the caller can fall back.
    """
    key = os.environ.get("PEXELS_API_KEY", "").strip()
    if not key:
        return None

    try:
        response = requests.get(
            "https://api.pexels.com/v1/search",
            headers={"Authorization": key},
            params={"query": query, "orientation": "portrait", "per_page": 15},
            timeout=20,
        )
        response.raise_for_status()
        photos = response.json().get("photos", [])
        if not photos:
            print(f"  ! Pexels had nothing for '{query}'.")
            return None

        photo = random.choice(photos)
        src = photo["src"].get("portrait") or photo["src"]["original"]
        print(f"  background: Pexels photo by {photo.get('photographer', 'unknown')}")

        image_bytes = requests.get(src, timeout=30)
        image_bytes.raise_for_status()
        from io import BytesIO

        return Image.open(BytesIO(image_bytes.content)).convert("RGB")
    except Exception as error:  # noqa: BLE001 - any failure means fall back
        print(f"  ! Pexels fetch failed ({error}); using a generated background.")
        return None


def generate_background(config: RenderConfig, seed: str = "") -> Image.Image:
    """
    A devotional-toned vertical gradient with soft light blooms.

    This is the zero-asset path: it needs no network, no API key and no image
    files, so the renderer always works out of the box.
    """
    rng = random.Random(seed or None)
    width, height = config.width, config.height

    # Kept deliberately mid-to-bright: this image receives no dimming (see
    # prepare_background), so it must carry the frame on its own.
    palettes = [
        ((38, 20, 66), (196, 92, 58)),   # indigo night into ember
        ((24, 38, 78), (214, 148, 58)),  # deep blue into brass
        ((52, 20, 48), (208, 96, 72)),   # aubergine into terracotta
        ((18, 46, 58), (198, 152, 62)),  # teal into gold
        ((46, 24, 30), (222, 130, 60)),  # maroon into saffron
    ]
    top, bottom = palettes[rng.randrange(len(palettes))]

    # Vertical gradient, built as a small array and scaled up (fast).
    ramp = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    column = (np.array(top, np.float32) * (1 - ramp)) + (np.array(bottom, np.float32) * ramp)
    canvas = np.repeat(column[:, None, :], width, axis=1).astype(np.uint8)
    image = Image.fromarray(canvas)

    # A few blurred blooms give it depth so it does not read as a flat gradient.
    glow = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for _ in range(rng.randint(4, 6)):
        radius = rng.randint(width // 4, width // 2)
        cx = rng.randint(0, width)
        cy = rng.randint(0, height)
        warmth = (rng.randint(180, 255), rng.randint(120, 190), rng.randint(60, 120))
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=warmth)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=width // 5))

    # Screen-style blend so the blooms add light rather than replacing it.
    base = np.asarray(image, np.float32)
    light = np.asarray(glow, np.float32)
    combined = 255 - ((255 - base) * (255 - light * 0.55) / 255)
    return Image.fromarray(np.clip(combined, 0, 255).astype(np.uint8))


def prepare_background(
    image: Image.Image, config: RenderConfig, treat: bool = True
) -> Image.Image:
    """
    Cover-crop to the target aspect at the maximum zoom size, then optionally
    apply the legibility treatment. Doing this once means the per-frame work is
    only a crop and a resize.

    `treat` exists because the blur-and-dim pass is for busy photographs, where
    detail behind the captions destroys contrast. A generated gradient is
    already flat, and dimming it a second time produces a nearly black frame —
    so that path passes treat=False.
    """
    target_w = int(config.width * config.zoom_end)
    target_h = int(config.height * config.zoom_end)

    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.LANCZOS,
    )

    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    cropped = resized.crop((left, top, left + target_w, top + target_h))

    if not treat:
        return cropped.convert("RGB")

    if config.background_blur > 0:
        cropped = cropped.filter(ImageFilter.GaussianBlur(config.background_blur))
    if config.background_dim > 0:
        overlay = Image.new("RGB", cropped.size, (0, 0, 0))
        cropped = Image.blend(cropped, overlay, min(0.9, config.background_dim))

    return cropped.convert("RGB")


# ---------------------------------------------------------------------------
# Ken Burns
# ---------------------------------------------------------------------------
def ken_burns_clip(
    background: Image.Image, duration: float, config: RenderConfig
) -> VideoClip:
    """
    A slow zoom that eases out, so the motion is most visible early and
    settles by the end rather than accelerating into the cut.
    """
    source = np.asarray(background)
    src_h, src_w = source.shape[:2]
    out_w, out_h = config.width, config.height

    # Drift the crop centre slightly as well; a pure zoom looks mechanical.
    drift_x = random.uniform(-0.02, 0.02)
    drift_y = random.uniform(-0.02, 0.02)

    def make_frame(t: float) -> np.ndarray:
        progress = min(1.0, max(0.0, t / duration if duration else 0.0))
        eased = 1 - (1 - progress) ** 2  # ease-out quadratic

        # zoom 1.0 -> zoom_end means the visible crop shrinks over time.
        zoom = 1.0 + (config.zoom_end - 1.0) * eased
        crop_w = int(src_w / zoom)
        crop_h = int(src_h / zoom)

        centre_x = src_w / 2 + drift_x * src_w * eased
        centre_y = src_h / 2 + drift_y * src_h * eased
        left = int(np.clip(centre_x - crop_w / 2, 0, src_w - crop_w))
        top = int(np.clip(centre_y - crop_h / 2, 0, src_h - crop_h))

        window = source[top : top + crop_h, left : left + crop_w]
        return np.asarray(
            Image.fromarray(window).resize((out_w, out_h), Image.BILINEAR)
        )

    # Positional first arg works on both MoviePy 1.x (make_frame) and 2.x
    # (frame_function).
    return VideoClip(make_frame, duration=duration)


# ---------------------------------------------------------------------------
# Captions
# ---------------------------------------------------------------------------
@dataclass
class Cue:
    start: float
    end: float
    text: str


def build_cues(script: str, total_seconds: float, config: RenderConfig) -> list[Cue]:
    """
    Group the script into short phrases and share the audio duration between
    them by character count, so a long phrase holds the screen longer.

    Identical to the algorithm in scripts/render-and-publish.ts.
    """
    words = script.split()
    if not words:
        return []

    groups: list[list[str]] = []
    current: list[str] = []
    for word in words:
        current.append(word)
        ends_clause = bool(re.search(r"[.!?,;:]$", word))
        if len(current) >= config.words_per_cue or (ends_clause and len(current) >= 3):
            groups.append(current)
            current = []
    if current:
        # Never leave a single orphan word on screen.
        if len(current) == 1 and groups:
            groups[-1].extend(current)
        else:
            groups.append(current)

    weights = [len(" ".join(group)) for group in groups]
    total_weight = sum(weights) or 1

    cues: list[Cue] = []
    elapsed = 0.0
    for group, weight in zip(groups, weights):
        share = (weight / total_weight) * total_seconds
        cues.append(Cue(elapsed, min(elapsed + share, total_seconds), " ".join(group)))
        elapsed += share
    return cues


def render_caption(text: str, config: RenderConfig) -> np.ndarray:
    """
    Draw one caption as an RGBA array: heavy weight, thick dark outline, plus a
    soft shadow. High contrast survives any background, which is the whole job.
    """
    font = load_font(config, config.caption_font_size)
    max_width = config.width - 2 * config.caption_margin_x

    # Wrap by measuring, not by guessing a character count.
    words = text.split()
    lines: list[str] = []
    line = ""
    scratch = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    for word in words:
        candidate = f"{line} {word}".strip()
        width = scratch.textbbox((0, 0), candidate, font=font)[2]
        if width > max_width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)

    line_height = int(config.caption_font_size * 1.3)
    padding = config.caption_stroke * 2 + 12
    height = line_height * len(lines) + padding * 2

    image = Image.new("RGBA", (config.width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    for index, content in enumerate(lines):
        y = padding + index * line_height
        bbox = draw.textbbox((0, 0), content, font=font)
        x = (config.width - (bbox[2] - bbox[0])) // 2

        # Shadow first, then the stroked text over it.
        draw.text(
            (x + 4, y + 5),
            content,
            font=font,
            fill=(0, 0, 0, 150),
        )
        draw.text(
            (x, y),
            content,
            font=font,
            fill=(255, 255, 255, 255),
            stroke_width=config.caption_stroke,
            stroke_fill=(0, 0, 0, 235),
        )

    return np.asarray(image)


def caption_clips(cues: Iterable[Cue], config: RenderConfig) -> list[ImageClip]:
    clips: list[ImageClip] = []
    for cue in cues:
        duration = max(0.2, cue.end - cue.start)
        array = render_caption(cue.text, config)
        clip = ImageClip(array, transparent=True)
        clip = with_position(
            with_duration(with_start(clip, cue.start), duration),
            ("center", config.height - config.caption_bottom),
        )
        clips.append(clip)
    return clips


# ---------------------------------------------------------------------------
# Supabase (optional --id mode) — plain REST, no extra dependency
# ---------------------------------------------------------------------------
def fetch_row(video_id: str) -> dict:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit(
            "--id needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "in the environment (or .env.local)."
        )

    response = requests.get(
        f"{url}/rest/v1/spiritual_videos",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        params={"id": f"eq.{video_id}", "select": "*", "limit": 1},
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        raise SystemExit(f"No video with id {video_id}.")
    return rows[0]


def pad_audio_with_silence(audio, seconds: float):
    """
    Extend the soundtrack with digital silence.

    The video runs slightly longer than the speech so it can fade out on a
    held frame. MoviePy reads the audio across the whole composite duration,
    so without this padding it raises when it seeks past the last sample.
    """
    if seconds <= 0:
        return audio

    rate = int(getattr(audio, "fps", 44100) or 44100)
    channels = int(getattr(audio, "nchannels", 2) or 2)
    samples = np.zeros((max(1, int(rate * seconds)), channels), dtype=np.float32)
    return concatenate_audioclips([audio, AudioArrayClip(samples, fps=rate)])


def download(url: str, destination: Path) -> Path:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    destination.write_bytes(response.content)
    return destination


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render a 30-second spiritual Short from audio + text."
    )
    parser.add_argument("--audio", help="Path to the voiceover .mp3")
    parser.add_argument("--text", help="The script text")
    parser.add_argument("--text-file", help="File containing the script text")
    parser.add_argument("--image", help="Background image; omit to generate one")
    parser.add_argument("--query", help="Pexels search query for a background")
    parser.add_argument("--id", help="Render this spiritual_videos row from Supabase")
    parser.add_argument("--out", default="short.mp4", help="Output path")
    parser.add_argument("--footer", default="", help="Small caption at the very bottom")
    args = parser.parse_args()

    config = RenderConfig()
    workdir = Path("tmp-render-py")
    workdir.mkdir(exist_ok=True)

    # ---- resolve inputs ----
    audio_path = args.audio
    script_text = args.text
    footer = args.footer

    if args.text_file:
        script_text = Path(args.text_file).read_text(encoding="utf-8")

    if args.id:
        row = fetch_row(args.id)
        script_text = script_text or row["script_body"]
        footer = footer or " · ".join(
            part for part in (row.get("scripture"), row.get("reference")) if part
        )
        if not audio_path:
            print(f"  downloading audio for \"{row['title']}\"")
            audio_path = str(download(row["audio_url"], workdir / "narration.mp3"))
        if not args.query and not args.image:
            # Derive a search query from the row rather than hardcoding one.
            args.query = f"{row.get('scripture', 'indian mythology')} painting art"

    if not audio_path or not script_text:
        parser.error("Provide --audio and --text/--text-file, or --id.")

    # ---- audio decides the length of everything ----
    audio = AudioFileClip(audio_path)
    speech_seconds = float(audio.duration)
    duration = round(speech_seconds + config.tail_seconds, 2)
    print(f"  audio {speech_seconds:.2f}s -> video {duration:.2f}s")

    # ---- background ----
    source_image: Image.Image | None = None
    if args.image:
        source_image = Image.open(args.image).convert("RGB")
        print(f"  background: {args.image}")
    elif args.query:
        source_image = fetch_pexels_image(args.query, config)

    is_photograph = source_image is not None
    if source_image is None:
        source_image = generate_background(config, seed=script_text[:64])
        print("  background: generated gradient")

    background = prepare_background(source_image, config, treat=is_photograph)

    # ---- compose ----
    base = ken_burns_clip(background, duration, config)
    cues = build_cues(script_text, speech_seconds, config)
    print(f"  {len(cues)} caption cues")

    layers: list = [base, *caption_clips(cues, config)]

    if footer:
        footer_config = RenderConfig(
            **{**config.__dict__, "caption_font_size": 34, "caption_stroke": 4}
        )
        footer_clip = ImageClip(render_caption(footer, footer_config), transparent=True)
        layers.append(
            with_position(
                with_duration(footer_clip, duration),
                ("center", config.height - 150),
            )
        )

    soundtrack = pad_audio_with_silence(audio, duration - speech_seconds)

    video = CompositeVideoClip(layers, size=(config.width, config.height))
    video = with_duration(with_audio(video, soundtrack), duration)

    output = Path(args.out)
    print("  encoding…")
    video.write_videofile(
        str(output),
        fps=config.fps,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="160k",
        preset="medium",
        ffmpeg_params=[
            "-crf", str(config.crf),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ],
        logger=None,
    )

    video.close()
    audio.close()
    size_mb = output.stat().st_size / 1024 / 1024
    print(f"  done: {output} ({size_mb:.2f} MB, {config.width}x{config.height})")


if __name__ == "__main__":
    main()
