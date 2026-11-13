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

The tabs, in order: name generator, chat generator, config checker, server
config, maps, dvars, rcon, demos, FAQ. Everything comes from the CoD2 1.3 game,
CoD2x and zPAM themselves; nothing from CoD4.

### name generator

Type a name with color codes (`^1clan^2.^1tag ^4player`) and see it the way
the game draws it, in CoD2's own font with its drop shadow; copy the
`seta name "…"` line.

- One button per color, `^1`–`^9`: it inserts the code at the cursor or colors
  the selection. `^8` and `^9` are the team colors (allies, axis) and change per
  map; pick the allies side to see theirs. Random colors per letter or word,
  and presets to start from.
- The preview and the command show the name as the server stores it: the
  client drops `"` `;` `\` and turns `%` into `.`, the server removes `^0`,
  leading spaces, more than 3 spaces in a row and a trailing `^`, keeps at most
  31 bytes (each `^X` counts 2) and turns a name with nothing visible into
  `UnnamedPlayer`. The counter shows the bytes; a warning says what changed and
  why, including zPAM's rules for empty names and `[{…}]`. The colors show on
  the scoreboard; chat and the name above a player show it without them, in
  the team color.
- Colors, team colors, rules and font come from the 1.3 game itself (renderer,
  scoreboard script, `normalFont` and its texture) and zPAM.

### chat generator

Colored `say` / `say_team` messages as binds, previewed the way the chat shows
them.

- One row per message: bind key (checked against the game's key names, empty
  for a plain chat line), `say` or `say_team`, the text with its byte counter.
  The palette and the random colors work on the message being edited; the
  output is one `bind F5 "say …"` line per message.
- The preview is the chat line the others see, in the game's font: the name in
  the team color, `(Dead)` and `(Allies)` / `(Axis)` where they apply, the text
  white for `say` and cyan for `say_team`, wrapped after 90 characters like the
  game does.
- `"` and `;` are left out (they would end the bind or the command), `//` or
  `/*` ends the message (a comment), `%` becomes `.`, spaces in a row become
  one, and the server keeps at most 149 bytes; each comes with a warning.

### config checker

Paste a config or load a `.cfg` (it is only read in the browser) and see what
the game does with every line.

- Syntax errors (open quotes, `set` without a value, bind keys that do not
  exist), unknown dvars and commands with a "did you mean", values the game
  rejects (out of range, not a number, not one of the choices), read-only and
  write-protected dvars, cheat protected ones (orange: no effect without
  `sv_cheats 1`), what zPAM and CoD2x set or lock, duplicates (only values the
  game takes count) and latched dvars that change after a restart.
- A summary with a count per kind that filters the list, a search, the line
  number of each finding to jump to it.
- The config with the problem lines commented out (`// [reason]`), to copy or
  download; unknown dvars stay, since a mod may use them.
- The rules are the engine's (how it sets a dvar, reads numbers and enum
  values, splits a line), the commands are every command the game registers
  (`js/cod2/config-data.js`, built by `tools/build-cod2-config.py`).

### server config

A form that writes a `server.cfg` for a zPAM server, with comments.

- Server info, passwords, downloads, network, CoD2x and logging, with the
  game's defaults and ranges and zPAM's recommended values. Passwords are never
  filled in: they start as `CHANGE_ME`, with a warning while they are.
- Number fields only put numbers into the config: a value outside the dvar's
  range or something that is not a number is marked and warned about while
  typing, and set to the nearest allowed value (or the last good one) when the
  field is left. `;` and `\` are left out of server info values such as
  `sv_hostname`, which the game drops anyway (`Info_SetValueForKey`).
  `sv_hideServerIp` only works with the CoD2x 1.4.6.9 test build.
- `pam_mode` from gametype, mode, score and options, with what each part means
  and the list of settings it sets at every map start, read from zPAM's rules
  files; fields the mode overwrites are marked. For `pub` the match settings of
  the gametype are part of the form.
- The map rotation: stock maps and zPAM's map pack, a gametype per map, ordered
  by drag and drop or the arrow buttons; `sv_mapRotation` and `map_rotate` in
  the output. Warnings for maps zPAM replaces with a `_fix` version, a
  `pam_mode` a gametype does not take, and more.
- Copy or download the `server.cfg`; nothing is stored or sent.
- `js/cod2/server-data.js` is built by `tools/build-cod2-server.py` from zPAM.

### maps

The 15 stock maps as cards: loading screen, name, internal name to copy,
gametypes (the ones zPAM adds marked). Search and a gametype filter.

- The detail view has the large loading screen, the allies and axis nations,
  who attacks in Search and Destroy (on every stock map the allies), the
  `/rcon map` command (and the zPAM `_fix` version's), the map from above (a
  top-down render, and zPAM's radar where it has one) and what zPAM changes:
  the `_fix` version it switches to, the gametypes it adds, the kill triggers
  it can remove, British instead of Russians.
- **Tactics** in the detail view opens a drawing board on the map from above,
  for presenting a tactic: arrows (straight, bent, dashed), pen, line,
  rectangle, ellipse, filled area, text, players numbered 1–5 per side, smoke
  and frag grenades with throw paths, view cones (80°, `cg_fov`'s default), a
  laser pointer and an eraser; colors, width, opacity, undo / redo.
  - The sides are the game's: "Allies – British" (the map's nation) and
    "Axis – German", in the scoreboard colors, with who attacks in S&D. A
    grenade shows the HUD icon of the thrower's nation (M2 Frag Grenade, MK1
    Frag Grenade, RGD-33 Stick Grenade, Stielhandgranate; CoD2 has no flash
    or stun grenade).
  - A frag's ring is its real 256-unit damage radius, and a scale bar shows game
    units; both come from the world area each image covers.
  - Phases (add, copy, rename, reorder, delete, ← →, onion skin, play),
    fullscreen, hidden toolbars and a cursor highlight for screen sharing.
    Every phase exports as PNG (`mp_toujane_tactics_phase1.png`), with the
    scale bar if it is shown. Nothing is saved: the drawing is gone when the
    board closes. Mouse, pen and touch (`js/cod2/tactics.js`).
- `tools/build-cod2-maps.py` (needs Pillow) builds `js/cod2/maps-data.js` and
  the images in `assets/cod2/maps/`: the loading screens from the game's
  `.iwi` files, zPAM's radar images, and the top-down renders of the CoD2 demo
  viewer's map export, with the world area each covers. It reads the sides from
  each map's script. For the tactics board it also writes one script per map
  in `js/cod2/maps/` with the images as data URLs (a canvas that draws an
  image loaded from `file://` can not be exported, one from a data URL can),
  and `js/cod2/grenades-data.js`: each nation's frag and smoke grenade with its
  English name, radius and HUD icon, from the game's weapon files.

### dvars

Every CoD2 dvar from the stock 1.3 game, CoD2x and zPAM, plus the dvars only
the CoD2rev server has (1267 in all), searchable by name or description,
sortable by name, with filters for the protection and for each source. Columns: name, default, min, max, type, description, source.
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
- CoD2rev is a reverse-engineered CoD2 dedicated server with CoD2x support. Its
  registrations count as its own source: a dvar only it has is listed with the
  source "CoD2rev server", and where it differs from the game, it is noted. Its
  flags never count as proof for the game; the config checker treats a dvar only
  CoD2rev has as unknown.
- `tools/build-cod2-dvars.py` builds both files from a CoD2 install, the CoD2x
  source, the zPAM source and (optional) the CoD2rev server source.

### rcon

An rcon reference for stock CoD2 1.3, CoD2x and zPAM, built like the CoD4 one:
a copy button on every command, which copies it as `/rcon <command>`, with
placeholders in square brackets. Searchable by command or description, with
filters for the source and the category.

- A short guide on top: `rcon_password` on the server, then `/rcon login`,
  `/rcon <command>`, `/rcon host` and `/rcon logout`.
- 66 commands (41 stock, 7 CoD2x, 18 zPAM) in players, chat, maps, match, bots,
  server and debug, each with syntax, a description and an example. Two that
  are easy to get wrong: `kick` also bans for `sv_kickBanTime` seconds (only
  `onlykick` and `clientkick` don't), and `say` / `tell` exist only on a
  dedicated server.
- The gametypes and maps, stock and zPAM's map pack, one copy button each;
  the parts of `pam_mode` and zPAM's examples.
- zPAM's 48 server settings from its in-game rcon menu, with a warning: in its
  match modes they go back to the rules' value at the next map.
- Every command is proven by the CoD2 sources themselves: its registration in
  the 1.3 executable (CoD2x's decompile, checked against the executable) and
  the Mac build's named handlers, CoD2x's source, or zPAM's scripts and README.
  Nothing from CoD4, CoD4x or Promod. The proofs are in the data, not shown.
- `tools/build-cod2-rcon.py` builds `js/cod2/rcon-data.js` from a CoD2 install,
  the CoD2x source and the zPAM source; it stops if a command can't be proven.

### demos

A link to the [CoD2 demo viewer](https://tipsyspit.github.io/cod2-demo/), a separate
tool that replays a CoD2 demo in the browser, top-down in 2D or in the real map in 3D.

### FAQ

Short answers: which tab is for what, how to use a line in game, where the
config is, why name colors are gone in chat, what `^8` and `^9` show, why a
setting does not stick, and how to set up a zPAM server.

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
js/cod2/ui.js           the copy buttons of the CoD2 tabs
js/cod2/dvars.js        the dvars tab
js/cod2/dvars-data.js   the dvar list (dvars-proof.json: its proofs, not loaded)
js/cod2/rcon.js         the rcon tab
js/cod2/rcon-data.js    the rcon commands, with their proofs
js/cod2/text.js         colored text in the game's font, the color palette and the
                        editing helpers, shared by the name and chat generators
js/cod2/namegen.js      the name generator
js/cod2/chatgen.js      the chat generator
js/cod2/name-data.js    colors, team colors, name and chat rules, key names and the
                        game font
js/cod2/configcheck.js  the config checker
js/cod2/config-data.js  every console command of the game and CoD2x
js/cod2/serverconfig.js the server config
js/cod2/server-data.js  what each zPAM pam_mode sets, zPAM's example values
js/cod2/maps.js         the maps tab
js/cod2/maps-data.js    the stock maps and what zPAM changes on them
js/cod2/tactics.js      the tactics board of the maps tab
js/cod2/grenades-data.js
                        each nation's grenades and HUD icons, for the board
js/cod2/maps/           one script per map with its overhead images for the board,
                        loaded when the board opens that map
assets/cod4/            icons/cod4.ico and cod4.png (browser tab and game switcher,
                        from the CoD4 demo viewer), scoreboard/preview-bg.png
assets/cod2/            icons/cod2.ico and cod2.png (from the CoD2 demo viewer),
                        maps/: loading screens, top-down renders and zPAM radars
tools/                  build-cod4-dvars.py rebuilds js/cod4/dvars-data.js from
                        CoD4, CoD4x and Promod X; build-minimap.py rebuilds
                        js/cod4/minimap/ from a CoD4 install and cod4-ff (needs
                        Pillow). For CoD2, from CoD2, CoD2x and zPAM:
                        build-cod2-dvars.py, build-cod2-rcon.py,
                        build-cod2-names.py, build-cod2-config.py,
                        build-cod2-server.py and build-cod2-maps.py (needs
                        Pillow and the cod2-demo map export) rebuild the
                        js/cod2/*-data.js files and assets/cod2/maps/
```

To rebuild the CoD2 data (Python 3.10+, run from the project root):

```
python tools/build-cod2-dvars.py  --cod2 <CoD2> --cod2x <CoD2x> --zpam <zpam3> --cod2rev <cod2rev-server>
python tools/build-cod2-rcon.py   --cod2 <CoD2> --cod2x <CoD2x> --zpam <zpam3>
python tools/build-cod2-names.py  --cod2 <CoD2> --cod2x <CoD2x> --zpam <zpam3>
python tools/build-cod2-config.py --cod2 <CoD2> --cod2x <CoD2x>
python tools/build-cod2-server.py --zpam <zpam3>
python tools/build-cod2-maps.py   --cod2 <CoD2> --zpam <zpam3> --cod2demo <cod2-demo>
```

`js/cod4/killfeed-icons.js` is built by `embed-icons.pl`, which is kept outside this
repository.

## Credits

- © 2013, A dude on Tek-9.org — original config checker
- © 2013–2021, [jNizM](https://github.com/jNizM)
- © 2021–2026, [TiPSY](https://github.com/TiPSYSPiT)
