# Backgrounds

File art under the folder for the god the episode is about:

```
assets/backgrounds/shiva/      vishnu/     krishna/    rama/
                   devi/       ganesha/    hanuman/    brahma/
                   surya/      narasimha/  kartikeya/  yama/
                   indra/      sage/       general/
```

**1080x1920**, `.jpg` / `.png` / `.webp`. Several per folder is better than one
— the renderer picks at random, so a single file means every Shiva episode
looks identical.

The model names the deity for each episode and the renderer looks here. Fallback
order, per video:

1. `assets/backgrounds/<deity>/` — art of the right god
2. loose files in `assets/backgrounds/` — generic, when nothing is filed for that god
3. an FFmpeg-generated animated gradient — no god at all

Right now the tree is empty, so every video is (3). The folder names are a
closed list in `src/lib/render/deity.ts`; a name the model returns is mapped
onto one of them and never used as a path directly.

## What to put in them

Each generated script also carries a `scene_prompt` — one sentence describing
the image that episode wants, written for a photorealistic CGI render. That is
the prompt to hand to whatever makes the art.

Sources that cost nothing: Raja Ravi Varma's paintings are public domain, and
Wikimedia Commons has a great deal more. Anything generated, keep out of the
cartoon register — the channel is meant to look like a film, not an
illustration.
