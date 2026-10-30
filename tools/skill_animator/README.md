# Skill animator

Renders Median XL skill animations as WebP (the same engine used for the oskill GIFs on wiki.median-xl.com).

## Start

1. Run `start.py` (double-click, or `python\python.exe start.py` from this folder).
   The first time, it installs numpy and Pillow into this folder (needs internet, once).
2. Your browser opens the app at `http://127.0.0.1:8765` (local only).
3. Pick a skill on the left and press Render. WebPs are saved in the `output` folder next to `start.py`.
   **Render all in list** renders every skill currently shown (use the search box to narrow it).
4. Close the console window to quit.

## Settings (right-hand panel)

- **Median XL folder:** where the game is installed. On first run this is taken from
  `tools/tools.local.json` (`d2_game_dir`), falling back to `C:\Games\median-xl`. The app reads the
  sprites and Median's compiled tables (`skills.bin`, `missiles.bin`, …) straight from the game's MPQs,
  so it follows game patches automatically.
- **Skill level, target distance, stand-in enemies, random seed:** the scene being replayed.
  The caster is an amazon (cast then idle) at a fixed screen position; at most one zombie stand-in.
- Camera is static 800x400 so skill area can be compared. The floor is a 1-yard isometric checkerboard.
  Site previews are lossy animated WebP at 600x300, 25 fps.

## What it can and can't show

- Missile skills: launch patterns, novas, rings, chains, falling meteors, rain/line patterns.
- Client visuals: `cltdofunc`, `cltstfunc`, `cltprgfunc`, client missile do/hit,
  ExplosionMissile stand-in, ClientSend mirrors, stand-in shadows (no double-draw),
  AnimSpeed/SubLoop frames, D2 draw modes (add/multiply/alpha).
- Speed: `(Vel + VelLev*lvl/8) * 3/64` subtiles per frame.
- Not covered: summons/morphs, buffs/auras with no missile art, hit-class flashes, screen shake
  (camera is static), sounds. Those show "Nothing to show for this skill" when there is no art.
- Formulas use the skill level you pick; skills referenced by synergy formulas count at the same
  level, and character stats count as 100.

## Publish to the site

After rendering, from this folder run:

```bash
python\python.exe publish_previews.py
```

That copies WebPs to `public/skill-previews/{skill-id}.webp` (matched by display name)
and writes `public/skill-previews/manifest.json` for the skills page.

To re-render every unique skill name and publish:

```bash
python\python.exe render_site_previews.py --force
```

## Files

| File | Role |
| --- | --- |
| `start.py` | launcher |
| `publish_previews.py` | copy WebPs into `public/skill-previews` |
| `python/` | a private copy of Python 3.12 (nothing is installed on your system) |
| `app/server.py` | local web server |
| `app/ui/index.html` | interface |
| `app/engine/` | emulator (`gamedata.py`, `calcvm.py`, `sim.py`, `client.py`, `client_tables.json`, `plugins_a-e.py`, `gfx.py`, `dcc.py`, `mpq.py`, `actor.py`) |
| `extract_client_tables.py` | rebuild `client_tables.json` from a Median XL install |
| `output/` | rendered WebPs (created on first render) |
