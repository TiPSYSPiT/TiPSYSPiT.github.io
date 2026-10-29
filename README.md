# CoD4 Tools

A small set of browser tools for Call of Duty 4 / Promod and Call of Duty 2, all on one page.
Nothing to install and nothing to set up — open `index.html` and it works.
Everything runs locally in your browser; no config is ever uploaded.

Live at <https://tipsyspit.github.io>.

## Games and tabs

The page has a section per game, picked with the CoD4 / CoD2 buttons under the
title; each section has its own tabs. The title, the logo and the browser
tab's icon follow the game.

The tabs run top to bottom in a column beside the page by default; the two
buttons at the top right switch them to a row, left to right. The choice is
remembered in your browser.

Every tab has a link of its own: `#cod4/minimap-generator`, `#cod2/demos`.
`#cod2` alone opens the first tab of CoD2; links from before the games existed
(`#killfeed-colors`) still work and lead to the CoD4 tab. Back and forward move
between the tabs and games you visited.

## CoD4

### config checker

Paste a config or load a `.cfg` file, and it flags the lines that leagues and
match servers usually disallow.

- Forbidden DVAR names are marked red, forbidden contents in binds and values
  orange. The name list covers 318 known cheat and cheat-menu names.
- 33 protected client DVARs are never flagged, not even when the name contains a
  banned word.
- Flagged lines are highlighted right in the text, with line numbers beside it.
- Every finding has **Jump to this line** and **Remove this line**.
- **Load .cfg** opens a local file, **Copy** puts the config on the clipboard,
  **Download** saves it as `config_mp.cfg`.

### rcon commands

A Promod rcon reference with a copy button on every command: login and server
commands, promod modes with their syntax and examples, game modes, match control,
and all 21 maps.

### server configuration

Everything a `server.cfg` normally sets, grouped by purpose, with a copy button
per block: identity, slots and passwords, logging, connection limits, anti-cheat,
voice, downloads, one block per gametype and the map rotation. Each setting
carries the default and range the engine actually registers.

### dvars

Every CoD4 dvar from the stock 1.7 game, CoD4x and Promod X (1750), searchable
by name or description, sortable by name, with filters for the protection and
for each source. Columns: name, default, min, max, type, description, source.
A click on a name copies `seta <name> "<default>"`.

- Stock values are the game's own registrations, read from the disassembly of
  the 1.7 executable that CoD4x keeps (`tools/cod4_dasm`), including the dvars
  it registers in loops (`con_gameMsgWindow0`–`3…`, one `bg_shock_volume_…` per
  sound channel). Descriptions are the game's own; where it has none, none is
  shown.
- Each dvar's protection, beside the name; a click on it shows the reason and
  the file and line it comes from:
  - **cheat protected** (tag): registered with the cheat flag (0x80) by stock
    1.7 or by CoD4x; only works with `sv_cheats 1`.
  - **Promod enforced** (tag): no cheat flag, but Promod X blocks the screen
    while it has the wrong value (`ui_mp/hud.menu`).
  - read-only / init only (a small ⓘ): registered with `CVAR_ROM` /
    `CVAR_INIT`.
  - unknown (only a filter): no registration with flags was found, so nothing
    is claimed.
- Where CoD4x registers a different default or range, it is noted under the
  default.
- Every dvar is proven by the CoD4 sources themselves: a registration, a config
  line, a script or menu that uses it, the engine reading or setting it by name,
  or its name in iw3mp.exe. The proofs are in `js/cod4/dvars-proof.json`,
  which the page does not load.
- `tools/build-cod4-dvars.py` builds both files from a CoD4 install, the
  disassembly, the CoD4x client source, the Promod X source and the install's
  fast files as exported by cod4-ff.

The minimap generator takes its cheat protected badges from the same data.

### killfeed colors

Pick your two team colours and get the config line for them.

- Colour picker, `r g b a` value and hex field per team — change any one and the
  others follow.
- You can paste the values you already have in your config to see what colour
  they are.
- A live preview shows how the names look in the killfeed.
- The result is a bind line that re-applies the colours on every key press, which
  helps on servers that reset them:

  ```
  bind W "+forward; g_TeamColor_Allies 0.498 0.655 1 1; g_TeamColor_Axis 1 0.541 0.361 1"
  ```

  Key and action can be changed.

### scoreboard generator

Build your scoreboard and see it before you go in-game.

- Team names, row colours, sizes and the ping display, all in one place.
- The preview updates as you type and follows the game's own layout rules.
- A ping ladder shows what every ping range turns into: how many bars and which
  colour, for the values you have set.
- The output comes in three blocks with a copy button each: the `bind TAB` line
  for the values the mod resets on every team change, the `seta` lines for the
  board and the ping graph, and the `seta` lines for the team names and colours.

### minimap generator

Size the minimap and its icons and see the result on a real map.

- Every compass dvar a player may set and that changes the multiplayer minimap:
  `compassSize`, the player, teammate and objective icon sizes, map rotation,
  and under **Advanced** the opacity and range of far icons, the tickertape
  width and the fade time. Defaults and limits are the engine's.
- The preview draws the compass the way the game does: the game's own frame,
  tickertape, icons and minimap textures, each map's corners, north and compass
  range, S&D spawns and bomb sites. Pick a map, a position and the way you
  face.
- The output is one `seta` line per dvar, with a copy button.

### demos

A link to the [CoD4 demo viewer](https://tipsyspit.github.io/cod4-demo/), a separate
tool that loads a demo file in the browser and lays out what is in it.

### FAQ

Answers to the questions that keep coming up around `config_mp.cfg`, searchable
by question, answer or command. It opens with what to install for the CD version,
the Steam version and FPS Challenge, and the settings answers give both the
config line and the console command, with a copy button on each.


## CoD2

### dvars

Every CoD2 dvar from the stock 1.3 game, CoD2x and zPAM (1243), searchable by
name or description, sortable by name, with filters for the protection and for
each source. Columns: name, default, min, max, type, description, source.
A click on a name copies `seta <name> "<default>"`.

- Each dvar's protection, beside the name; a click on it shows the reason and
  the file and line it comes from:
  - **cheat protected** (tag): registered with the cheat flag (0x80) by stock
    1.3 or by CoD2x; only works with `sv_cheats 1`. Where CoD2x takes the flag
    away (`r_lodScale`) or zPAM resets or sets the dvar, the reason says so.
  - **CoD2x enforced** (tag): while the server sets `g_competitive 1` (zPAM
    does), CoD2x locks it, e.g. `com_maxfps` to 125–250.
  - **set by zPAM** (tag): zPAM sets it once when a player joins; the player can
    change it afterwards.
  - read-only, write-protected (`DVAR_ROM`, `DVAR_NOWRITE`) and zPAM rules
    (always reset to the rules' value) (a small ⓘ).
  - unknown (only a filter): no registration with flags was found.

- Stock values are the game's own registrations: read from the 1.3 executable
  (through CoD2x's decompile of it, checked against the executable itself) and
  from the renderer DLL's machine code. "cheat protected" means the dvar is
  registered with the cheat flag (0x80), read from the registration itself;
  where that is not known, nothing is shown.
- Where CoD2x or zPAM use a different default or range, it is noted under the
  default.
- CoD2 registers its dvars without descriptions, so the descriptions come only
  from CoD2x's and zPAM's own documentation and code comments.
- Every dvar is proven by the CoD2 sources themselves: a registration, a config
  line, a script or menu that uses it, or its name in a CoD2 binary. No CoD4 data
  is used. Not counted as proof: pieces of names a menu macro glues together,
  script code that never runs (comments, `/# #/` blocks, zPAM test functions no
  live code calls), the settings menus of gametypes the game does not ship, and
  on its own a line in the safe-mode, first-start or example server configs.
  The proofs (file and line or offset) are in
  `js/cod2/dvars-proof.json`, which the page does not load.
- `tools/build-cod2-dvars.py` builds both files from a CoD2 install, the CoD2x
  source and the zPAM source.

### demos

A link to the [CoD2 demo viewer](https://tipsyspit.github.io/cod2-demo/), a separate
tool that replays a CoD2 demo in the browser, top-down in 2D or in the real map in 3D.

### FAQ

Not written yet.

## Adding a tool

1. Add its panel to `index.html` (`<section class="panel" id="panel-..." role="tabpanel"
   aria-labelledby="tab-..." tabindex="0" hidden>`).
2. Add an entry to the game's `tabs` in `js/<game>/game.js`: tab id, panel id, label
   and the slug for its link.
3. Put the tool's script in `js/<game>/` and add it to `index.html` after the
   shared scripts, if it has one.

The game switcher, the tab bars and the links are built from the `game.js` files;
a new game is one more folder `js/<game>/` with its `game.js`, loaded after
`js/shared/games.js`, and its icons in `assets/<game>/icons/`.

## Files

The JavaScript is split by game: `js/shared/` holds only what works for any game
and gets everything game-specific as configuration; `js/cod4/` and `js/cod2/`
never refer to each other. All of it loads as plain scripts, shared first.

```
index.html              the page
css/style.css           styling, light and dark
js/shared/games.js      the list of games, filled by each js/<game>/game.js
js/shared/tabs.js       builds the game switcher and tab bars, handles the links
js/shared/tablayout.js  the tab bar's column or row, applied before the page is drawn
js/shared/decimal.js    number fields: decimal point, limits, - and + buttons
js/shared/ui.js         small helpers every tool uses: copy to clipboard, the status
                        line, building elements, escaping HTML
js/shared/dvar-table.js the table of a dvars tab, set up by js/<game>/dvars.js
js/cod4/game.js         CoD4 and its tabs
js/cod4/                one script per tab: checkcfg.js, rcon.js, serverconfig.js,
                        dvars.js, killfeed.js, scoreboard.js, minimap.js, faq.js
js/cod4/dvars-data.js   the dvar list (dvars-proof.json: its proofs, not loaded)
js/cod4/killfeed-icons.js
                        the killfeed icons as data URLs, so they can be measured
                        from disk too
js/cod4/minimap/        minimap data: maps.js and icons.js, and one script per map
                        with its texture, loaded when that map is picked
js/cod2/game.js         CoD2 and its tabs
js/cod2/dvars.js        the dvars tab
js/cod2/dvars-data.js   the dvar list (dvars-proof.json: its proofs, not loaded)
assets/cod4/            icons/cod4.ico and cod4.png (browser tab and game switcher,
                        from the CoD4 demo viewer), scoreboard/preview-bg.png
assets/cod2/            icons/cod2.ico and cod2.png (from the CoD2 demo viewer)
tools/                  build-cod4-dvars.py rebuilds js/cod4/dvars-data.js from
                        CoD4, CoD4x and Promod X; build-minimap.py rebuilds
                        js/cod4/minimap/ from a CoD4 install and cod4-ff (needs
                        Pillow); build-cod2-dvars.py rebuilds js/cod2/dvars-data.js
                        from CoD2, CoD2x and zPAM
```

`js/cod4/killfeed-icons.js` is built by `embed-icons.pl`, which is kept outside this
repository.

## Credits

- © 2013, A dude on Tek-9.org — original config checker
- © 2013–2021, [jNizM](https://github.com/jNizM)
- © 2021–2026, [TiPSY](https://github.com/TiPSYSPiT)
