/*
 * CoD2 name generator: type a name with color codes, see it in the game's own
 * font, get the console line. The data is window.COD2_NAMES from
 * js/cod2/name-data.js (built by tools/build-cod2-names.py); drawing and the
 * palette are js/cod2/text.js.
 *
 * What the game does with a name, mirrored here:
 *   - The client drops " ; \ from userinfo values (Info_SetValueForKey), and
 *     reliable commands turn % into . (MSG_WriteReliableCommandToBuffer).
 *   - The server cleans the name (ClientCleanName, CoD2MP_s.exe 1.3): leading
 *     spaces go, more than 3 spaces in a row are cut to 3, ^0 is removed, a ^ at
 *     the end is dropped, at most 31 bytes are kept with ^X counting 2, and a
 *     name with nothing left becomes "UnnamedPlayer".
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var T = window.COD2_TEXT;
	var setHint = function () {};

	var SCALE = 3;          // preview pixels per font pixel
	var PRESET_SCALE = 1;

	var PRESETS = [
		"^1clan^2.^1tag ^4playername",
		"^3[^7TAG^3] ^7Player",
		"^4TAG^7|^5Player",
		"^2-=^7TAG^2=- ^7Player",
		"^1x^7Name^1x",
		"^5Tag^3*^7Player"
	];

	var data = window.COD2_NAMES;
	var font = null;
	var allies = null;

	var input = null;
	var canvas = null;
	var palette = null;
	var plainBox = null;
	var countBox = null;
	var warnBox = null;
	var output = null;
	var presetCanvases = [];

	/* ---------- the game's rules ---------- */

	// The client side: what userinfo drops, and what the font has no glyph for.
	function clientClean(text, notes)
	{
		var out = "";
		for (var i = 0; i < text.length; i++)
		{
			var c = text.charAt(i);
			if (c === "\"" || c === ";" || c === "\\")
			{
				notes.stripped = true;
				continue;
			}
			if (c === "%")
			{
				notes.percent = true;
				c = ".";
			}
			if (c < " " || !font.glyphs[c])
			{
				notes.unsupported = notes.unsupported || [];
				if (c >= " " && notes.unsupported.indexOf(c) === -1)
				{
					notes.unsupported.push(c);
				}
				continue;
			}
			if (c > "~")
			{
				notes.nonAscii = true;
			}
			out += c;
		}
		return out;
	}

	// ClientCleanName, step for step; cap is the byte limit (31, or Infinity to measure).
	function serverClean(text, cap, notes)
	{
		var out = "";
		var visible = 0;
		var spaces = 0;

		for (var i = 0; i < text.length; i++)
		{
			var c = text.charAt(i);

			if (out === "" && c === " ")
			{
				notes.leading = true;
				continue;
			}

			if (c === "^")
			{
				var next = text.charAt(i + 1);
				if (next === "")
				{
					notes.trailingCaret = true;
					break;
				}
				i++;
				if (next === "0")
				{
					notes.zero = true;
					continue;
				}
				if (out.length > cap - 2)
				{
					notes.cut = true;
					break;
				}
				out += "^" + next;
				continue;
			}

			if (c === " ")
			{
				spaces++;
				if (spaces > 3)
				{
					notes.spaces = true;
					continue;
				}
			}
			else
			{
				spaces = 0;
			}

			if (out.length > cap - 1)
			{
				notes.cut = true;
				break;
			}
			out += c;
			visible++;
		}

		if (out === "" || visible === 0)
		{
			notes.unnamed = true;
			return "UnnamedPlayer";
		}
		return out;
	}

	/* ---------- output ---------- */

	function warnings(notes, needed, name)
	{
		var list = [];
		if (notes.cut)
		{
			list.push("The name needs " + needed + " bytes; the server keeps only the first 31 (each ^X counts 2). The preview shows what is left.");
		}
		if (notes.zero)
		{
			list.push("^0 (black) is removed from names by the server.");
		}
		if (notes.stripped)
		{
			list.push("The game removes \" ; and \\ from names.");
		}
		if (notes.percent)
		{
			list.push("The game turns % into . in names.");
		}
		if (notes.unsupported)
		{
			list.push("Removed: characters the game font does not have" +
				(notes.unsupported.length ? " (" + notes.unsupported.join(" ") + ")" : "") + ".");
		}
		if (notes.nonAscii)
		{
			list.push("Characters outside plain ASCII are in the game font, but the console may not take them; put the line in your config instead.");
		}
		if (notes.leading)
		{
			list.push("Spaces at the start are removed.");
		}
		if (notes.spaces)
		{
			list.push("More than 3 spaces in a row are cut to 3.");
		}
		if (notes.trailingCaret)
		{
			list.push("A ^ at the end is dropped.");
		}
		if (notes.unnamed)
		{
			list.push("Nothing visible is left, so the server names you UnnamedPlayer.");
		}
		else if (T.plain(name).trim() === "")
		{
			list.push("zPAM counts a name of only spaces as empty: a warning first, then a kick.");
		}
		if (/\[\{.+\}\]/.test(name))
		{
			list.push("zPAM replaces [ ] { } with _ in names that contain [{…}].");
		}
		if (/\^[^0-9^]/.test(name))
		{
			list.push("Only ^0 to ^9 are colors in CoD2; ^ followed by anything else shows as text.");
		}
		if (/\^[89]/.test(name))
		{
			list.push("^8 and ^9 are the team colors (allies, axis); they change with the teams of the map.");
		}
		return list;
	}

	function update()
	{
		var notes = {};
		var sent = clientClean(input.value, notes);
		var name = serverClean(sent, data.rules.maxBytes, notes);
		var needed = serverClean(sent, Infinity, {}).length;

		T.draw(canvas, [name], SCALE, allies);
		plainBox.textContent = T.plain(name);
		countBox.textContent = needed + " / " + data.rules.maxBytes + " bytes";
		countBox.classList.toggle("is-over", needed > data.rules.maxBytes);
		output.textContent = "seta name \"" + name + "\"";

		warnBox.textContent = "";
		warnings(notes, needed, name).forEach(function (text)
		{
			warnBox.appendChild(el("li", null, text));
		});
		warnBox.hidden = warnBox.childNodes.length === 0;
	}

	/* ---------- building the panel ---------- */

	function makePresets(box)
	{
		PRESETS.forEach(function (preset)
		{
			var cell = el("div", "rc-cell n2-preset");
			var text = el("div", "rc-item-text");
			var stage = el("div", "n2-stage n2-stage-sm");
			var c = el("canvas", "n2-canvas");
			c.setAttribute("role", "img");
			c.setAttribute("aria-label", T.plain(preset));
			stage.appendChild(c);
			text.appendChild(stage);
			text.appendChild(el("code", "rc-code", preset));
			cell.appendChild(text);

			var button = el("button", "btn btn-sm");
			button.type = "button";
			button.textContent = "Use";
			button.setAttribute("aria-label", "Use " + preset);
			button.addEventListener("click", function ()
			{
				input.value = preset;
				update();
				input.focus();
			});
			cell.appendChild(button);
			box.appendChild(cell);
			presetCanvases.push({ canvas: c, name: preset });
		});
	}

	function drawPresets()
	{
		presetCanvases.forEach(function (p) { T.draw(p.canvas, [p.name], PRESET_SCALE, allies); });
	}

	function redraw()
	{
		update();
		drawPresets();
	}

	function init()
	{
		input = document.getElementById("n2-input");
		if (input === null || !data)
		{
			return;
		}
		canvas = document.getElementById("n2-canvas");
		palette = document.getElementById("n2-palette");
		plainBox = document.getElementById("n2-plain");
		countBox = document.getElementById("n2-count");
		warnBox = document.getElementById("n2-warnings");
		output = document.getElementById("n2-output");
		setHint = window.UI.hint(document.getElementById("n2-hint"));
		font = data.font;

		allies = T.makeAlliesPicker(document.getElementById("n2-allies"), function (team)
		{
			allies = team;
			T.paintSwatches(palette, allies);
			redraw();
		});

		T.makePalette(palette, function (code)
		{
			T.applyCode(input, code);
			update();
		});
		makePresets(document.getElementById("n2-presets"));
		T.paintSwatches(palette, allies);

		document.getElementById("n2-random-letters").addEventListener("click", function ()
		{
			input.value = T.randomColors(input.value, true);
			update();
		});
		document.getElementById("n2-random-words").addEventListener("click", function ()
		{
			input.value = T.randomColors(input.value, false);
			update();
		});
		document.getElementById("n2-strip").addEventListener("click", function ()
		{
			input.value = T.stripCodes(input.value);
			update();
		});
		T.copyButton(document.getElementById("n2-copy"), function () { return output.textContent; },
			function (text, isError) { setHint(text, isError); });
		input.addEventListener("input", update);

		T.ready(redraw);

		// The canvas is sized for the screen's pixel ratio; redraw when that changes.
		window.addEventListener("resize", function () { T.ready(redraw); });
	}

	if (document.readyState === "loading")
	{
		document.addEventListener("DOMContentLoaded", init);
	}
	else
	{
		init();
	}
})();
