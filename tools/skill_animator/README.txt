MXL Skill Animator
==================

Renders Median XL skill animations as GIFs by replaying the game's own skill and missile code
(the same engine used for the oskill GIFs on wiki.median-xl.com).

Start
-----
1. Run start.py (double-click, or python\\python.exe start.py).
   The first time, it installs numpy and Pillow into this folder (needs internet, once).
2. Your browser opens the app (it runs only on your PC, at http://127.0.0.1:8765).
3. Pick a skill on the left and press Render. GIFs are saved in the "output" folder next to start.py.
   "Render all in list" renders every skill currently shown (use the search box to narrow it).
4. Close the black console window to quit.

Settings (right-hand panel)
---------------------------
- Median XL folder: where the game is installed. On first run this is taken from
  tools/tools.local.json (d2_game_dir), falling back to C:\Games\median-xl. The app reads the
  sprites and Median's compiled tables (skills.bin, missiles.bin ...) straight from the game's MPQs,
  so it follows game patches automatically.
- Skill level, target distance, stand-in enemies, random seed: the scene being replayed.
  The caster is an amazon (cast then idle) at a fixed screen position; at most one zombie stand-in.
- Camera is static 800x400 so skill area can be compared. The floor is a 1-yard isometric checkerboard.
  File size default is 250 KB (palette + frame dropping if over the limit).

What it can and can't show
--------------------------
- Missile skills: replayed with ~70 functions ported from D2Game/D2Client/D2Sigma (launch patterns,
  novas, rings, chains, falling meteors, Median's own rain/line patterns...).
- Speed: (Vel + VelLev*lvl/8) * 3/64 subtiles per frame, from the game's missile-creation code.
- Not covered: summons, buffs/auras and skills whose visuals come from client-only code. Those show
  "Nothing to show for this skill".
- Formulas use the skill level you pick; skills referenced by synergy formulas count at the same
  level, and character stats count as 100.

Files
-----
start.py         launcher
python\          a private copy of Python 3.12 (nothing is installed on your system)
app\server.py    the local web server; app\ui\index.html the interface
app\engine\      the emulator: gamedata.py (MPQ + .bin tables), calcvm.py (skill formulas),
                 sim.py (engine core), plugins_a-d.py (ported game functions), gfx.py, dcc.py,
                 mpq.py, actor.py (amazon/zombie sprites)
output\          rendered GIFs (created on first render)
