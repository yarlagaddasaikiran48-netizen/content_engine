"""
The smallest thing that works: voiceover + background -> MP4, exactly as long
as the audio.

    python render/minimal_example.py narration.mp3 background.jpg out.mp4

The background may be an image or a video; both are handled. If it is a video
it is looped and trimmed, if it is an image it is held. Either way the audio
is the single source of truth for duration.
"""

import sys

from moviepy import AudioFileClip, ImageClip, VideoFileClip

audio_file, background_file, output_file = sys.argv[1], sys.argv[2], sys.argv[3]

audio = AudioFileClip(audio_file)

if background_file.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
    # Loop the clip if it is shorter than the narration, then cut to length.
    background = VideoFileClip(background_file).looped(duration=audio.duration)
else:
    background = ImageClip(background_file).with_duration(audio.duration)

video = (
    background.resized(height=1920)      # fill a 9:16 frame
    .cropped(x_center=background.w / 2, width=1080)
    .with_audio(audio)
    .with_duration(audio.duration)       # audio is the source of truth
)

video.write_videofile(
    output_file,
    fps=30,
    codec="libx264",
    audio_codec="aac",
    ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
)
