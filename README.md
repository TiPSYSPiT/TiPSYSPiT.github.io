# CoD4 Tools

A small set of browser tools for Call of Duty 4 / Promod, all on one page.
Nothing to install and nothing to set up — open `index.html` and it works.
Everything runs locally in your browser; no config is ever uploaded.

Live at <https://tipsyspit.github.io>.

## Tabs

### config checker

Paste a config or load a `.cfg` file, and it flags the lines that leagues and
match servers usually disallow.

- Forbidden DVAR names are marked red, forbidden contents in binds and values
  orange.
- Flagged lines are highlighted right in the text, with line numbers beside it.
- Every finding has **Jump to this line** and **Remove this line**.
- **Load .cfg** opens a local file, **Copy** puts the config on the clipboard,
  **Download** saves it as `config_mp.cfg`.

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

### rcon commands

A Promod rcon reference with a copy button on every command: login and server
commands, promod modes with their syntax and examples, game modes, match control,
and all 21 maps.

### dvars

All 1196 CoD4 DVARs with their in-game descriptions, sorted by name and
searchable by name or description.

## Files

```
index.html      the page
css/style.css   styling, light and dark
js/             one file per tab, plus the tab switching
```

## Credits

- © 2013, A dude on Tek-9.org — original config checker
- © 2013–2021, [jNizM](https://github.com/jNizM)
- © 2021–2026, [TiPSY](https://github.com/TiPSYSPiT)
