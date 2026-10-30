/*
 * CoD2 name generator: type a name with color codes, see it in the game's own
 * font, get the console line. The data is window.COD2_NAMES from
 * js/cod2/name-data.js (built by tools/build-cod2-names.py).
 *
 * What the game does with a name, mirrored here:
 *   - The client drops " ; \ from userinfo values (Info_SetValueForKey).
 *   - The server cleans the name (ClientCleanName, CoD2MP_s.exe 1.3): leading
 *     spaces go, more than 3 spaces in a row are cut to 3, ^0 is removed, a ^ at
 *     the end is dropped, at most 31 bytes are kept with ^X counting 2, and a
 *     name with nothing left becomes "UnnamedPlayer".
 *   - The renderer treats ^ plus a digit as a color (^7: the default color,
 *     ^8 / ^9: the allies / axis team color); anything else after ^ is text.
 * The shadow (text style 3) is drawn one font pixel down and right; its exact
 * offset in the renderer is not known, so that part is approximate.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var copyText = window.UI.copyText;
	var setHint = function () {};

	var COPIED_RESET_MS = 1500;
	var SCALE = 3;          // preview pixels per font pixel
	var PRESET_SCALE = 1;
	var PAD = 10;
	var RANDOM_CODES = ["1", "2", "3", "4", "5", "6", "7"];
	var STRIPPED = /[";\\]/g;

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
	var atlas = null;
	var tinted = {};
	var allies = null;

	var input = null;
	var canvas = null;
	var plainBox = null;
	var countBox = null;
	var warnBox = null;
	var output = null;
	var alliesBox = null;
	var presetCanvases = [];

	/* ---------- the game's rules ---------- */

	function isDigit(c)
	{
		return c >= "0" && c <= "9";
	}

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

	// The text as the renderer splits it: [{ text, code }] where code is the active ^X or "".
	function segments(name)
	{
		var list = [];
		var code = "";
		var text = "";
		for (var i = 0; i < name.length; i++)
		{
			var c = name.charAt(i);
			var next = name.charAt(i + 1);
			if (c === "^" && isDigit(next))
			{
				if (text !== "")
				{
					list.push({ text: text, code: code });
				}
				text = "";
				code = next;
				i++;
				continue;
			}
			text += c;
		}
		if (text !== "")
		{
			list.push({ text: text, code: code });
		}
		return list;
	}

	function plain(name)
	{
		return segments(name).map(function (s) { return s.text; }).join("");
	}

	function stripCodes(text)
	{
		return text.replace(/\^[0-9]/g, "");
	}

	function rgbOf(code)
	{
		if (code === "8")
		{
			return allies.rgb;
		}
		if (code === "9")
		{
			return data.teams.axis.rgb;
		}
		if (code === "" || code === "7")
		{
			return [255, 255, 255];
		}
		return data.colors[Number(code)].rgb;
	}

	function css(rgb)
	{
		return "rgb(" + rgb.join(",") + ")";
	}

	/* ---------- drawing ---------- */

	function tint(rgb)
	{
		var key = rgb.join(",");
		if (!tinted[key])
		{
			var c = document.createElement("canvas");
			c.width = atlas.width;
			c.height = atlas.height;
			var ctx = c.getContext("2d");
			ctx.drawImage(atlas, 0, 0);
			ctx.globalCompositeOperation = "source-in";
			ctx.fillStyle = "rgb(" + key + ")";
			ctx.fillRect(0, 0, c.width, c.height);
			tinted[key] = c;
		}
		return tinted[key];
	}

	function textWidth(name)
	{
		var w = 0;
		var text = plain(name);
		for (var i = 0; i < text.length; i++)
		{
			var g = font.glyphs[text.charAt(i)];
			w += g ? g[6] : 0;
		}
		return w;
	}

	// Shadow pass, then the colored pass, like the renderer's style 3.
	function draw(target, name, scale)
	{
		var ratio = window.devicePixelRatio || 1;
		var pad = PAD * scale / SCALE;
		var cssW = Math.ceil(textWidth(name) * scale + pad * 2 + scale);
		var cssH = Math.ceil(font.height * scale + 6 * scale + pad * 2);
		target.width = Math.round(cssW * ratio);
		target.height = Math.round(cssH * ratio);
		target.style.width = cssW + "px";
		target.style.aspectRatio = cssW + " / " + cssH;

		var ctx = target.getContext("2d");
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.imageSmoothingEnabled = true;
		var baseline = pad + font.height * scale;
		var parts = segments(name);
		var shadow = tint([0, 0, 0]);

		[true, false].forEach(function (isShadow)
		{
			var x = pad;
			var offset = isShadow ? scale : 0;
			ctx.globalAlpha = isShadow ? 0.75 : 1;
			parts.forEach(function (part)
			{
				var sheet = isShadow ? shadow : tint(rgbOf(part.code));
				for (var i = 0; i < part.text.length; i++)
				{
					var g = font.glyphs[part.text.charAt(i)];
					if (!g)
					{
						continue;
					}
					if (g[2] > 0)
					{
						ctx.drawImage(sheet, g[0], g[1], g[2], g[3],
							x + g[4] * scale + offset, baseline + g[5] * scale + offset, g[7] * scale, g[8] * scale);
					}
					x += g[6] * scale;
				}
			});
		});
		ctx.globalAlpha = 1;
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
		else if (plain(name).trim() === "")
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

		draw(canvas, name, SCALE);
		plainBox.textContent = plain(name);
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

	/* ---------- editing ---------- */

	// The color in effect at a position of the typed text, as the renderer sees it.
	function codeAt(text, index)
	{
		var code = "";
		for (var i = 0; i < index; i++)
		{
			if (text.charAt(i) === "^" && isDigit(text.charAt(i + 1)) && i + 1 < index)
			{
				code = text.charAt(i + 1);
				i++;
			}
		}
		return code;
	}

	// A palette click: insert ^X at the cursor, or color the selection and go back after it.
	function applyCode(code)
	{
		var text = input.value;
		var start = input.selectionStart === null ? text.length : input.selectionStart;
		var end = input.selectionEnd === null ? start : input.selectionEnd;
		var insert = "^" + code;

		if (end > start)
		{
			var rest = text.slice(end);
			var back = codeAt(text, end) || "7";
			var selected = text.slice(start, end);
			insert += selected + (rest !== "" && back !== code ? "^" + back : "");
		}

		input.value = text.slice(0, start) + insert + text.slice(end);
		var caret = start + insert.length;
		input.focus();
		input.setSelectionRange(caret, caret);
		update();
	}

	function pick(previous)
	{
		var code;
		do
		{
			code = RANDOM_CODES[Math.floor(Math.random() * RANDOM_CODES.length)];
		}
		while (code === previous);
		return code;
	}

	function randomize(perLetter)
	{
		var text = stripCodes(input.value);
		var out = "";
		var previous = "";
		var inWord = false;
		for (var i = 0; i < text.length; i++)
		{
			var c = text.charAt(i);
			var startsColor = perLetter ? c !== " " : c !== " " && !inWord;
			if (startsColor)
			{
				previous = pick(previous);
				out += "^" + previous;
			}
			inWord = c !== " ";
			out += c;
		}
		input.value = out;
		update();
	}

	/* ---------- building the panel ---------- */

	function makePalette(box)
	{
		var codes = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
		codes.forEach(function (code)
		{
			var button = el("button", "btn btn-sm n2-code");
			button.type = "button";
			button.setAttribute("data-code", code);
			var swatch = el("span", "n2-swatch");
			button.appendChild(swatch);
			button.appendChild(document.createTextNode("^" + code));
			if (code === "7")
			{
				button.title = "^7: white, the default color";
			}
			else if (code === "8")
			{
				button.title = "^8: the allies team color";
			}
			else if (code === "9")
			{
				button.title = "^9: the axis team color";
			}
			button.setAttribute("aria-label", "Insert ^" + code + (button.title ? " (" + button.title.split(": ")[1] + ")" : ""));
			box.appendChild(button);
		});
		box.addEventListener("mousedown", function (event)
		{
			// Keep the selection in the name field.
			if (event.target.closest && event.target.closest(".n2-code"))
			{
				event.preventDefault();
			}
		});
		box.addEventListener("click", function (event)
		{
			var button = event.target.closest ? event.target.closest(".n2-code") : null;
			if (button !== null)
			{
				applyCode(button.getAttribute("data-code"));
			}
		});
	}

	function paintSwatches()
	{
		[].forEach.call(document.querySelectorAll("#n2-palette .n2-code"), function (button)
		{
			button.querySelector(".n2-swatch").style.backgroundColor = css(rgbOf(button.getAttribute("data-code")));
		});
	}

	function makePresets(box)
	{
		PRESETS.forEach(function (preset)
		{
			var cell = el("div", "rc-cell n2-preset");
			var text = el("div", "rc-item-text");
			var stage = el("div", "n2-stage n2-stage-sm");
			var c = el("canvas", "n2-canvas");
			c.setAttribute("role", "img");
			c.setAttribute("aria-label", plain(preset));
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
		presetCanvases.forEach(function (p) { draw(p.canvas, p.name, PRESET_SCALE); });
	}

	function onCopy(event)
	{
		var button = event.currentTarget;
		copyText(output.textContent).then(function ()
		{
			window.clearTimeout(button.resetTimer);
			button.textContent = "Copied";
			button.classList.add("is-copied");
			button.resetTimer = window.setTimeout(function ()
			{
				button.textContent = "Copy";
				button.classList.remove("is-copied");
			}, COPIED_RESET_MS);
		}, function ()
		{
			setHint("Could not copy — select the line and copy manually.", true);
		});
	}

	function init()
	{
		input = document.getElementById("n2-input");
		if (input === null || !data)
		{
			return;
		}
		canvas = document.getElementById("n2-canvas");
		plainBox = document.getElementById("n2-plain");
		countBox = document.getElementById("n2-count");
		warnBox = document.getElementById("n2-warnings");
		output = document.getElementById("n2-output");
		alliesBox = document.getElementById("n2-allies");
		setHint = window.UI.hint(document.getElementById("n2-hint"));
		font = data.font;
		allies = data.teams.allies[0];

		data.teams.allies.forEach(function (team, i)
		{
			var option = document.createElement("option");
			option.value = String(i);
			option.textContent = team.name;
			alliesBox.appendChild(option);
		});
		alliesBox.addEventListener("change", function ()
		{
			allies = data.teams.allies[Number(alliesBox.value)];
			paintSwatches();
			update();
			drawPresets();
		});

		makePalette(document.getElementById("n2-palette"));
		makePresets(document.getElementById("n2-presets"));
		paintSwatches();

		document.getElementById("n2-random-letters").addEventListener("click", function () { randomize(true); });
		document.getElementById("n2-random-words").addEventListener("click", function () { randomize(false); });
		document.getElementById("n2-strip").addEventListener("click", function ()
		{
			input.value = stripCodes(input.value);
			update();
		});
		document.getElementById("n2-copy").addEventListener("click", onCopy);
		input.addEventListener("input", update);

		atlas = new Image();
		atlas.onload = function ()
		{
			update();
			drawPresets();
		};
		atlas.src = font.atlas;

		// The canvas is sized for the screen's pixel ratio; redraw when that changes.
		window.addEventListener("resize", function ()
		{
			if (atlas.complete)
			{
				update();
				drawPresets();
			}
		});
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
