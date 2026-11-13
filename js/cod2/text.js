/*
 * CoD2 colored text, shared by the name and chat generators: how the renderer
 * reads ^ codes, drawing in the game's own font (window.COD2_NAMES.font), the
 * color palette and the editing helpers.
 *
 * The renderer treats ^ plus a digit as a color (^7: the default color, ^8 / ^9:
 * the allies / axis team color); anything else after ^ is drawn as text. Text
 * is drawn with style 3: a black shadow, then the colored glyphs. The shadow's
 * exact offset in the renderer is not known; one font pixel is used.
 */
window.COD2_TEXT = (function ()
{
	"use strict";

	var el = window.UI.el;
	var data = window.COD2_NAMES;
	var PAD = 10;
	var RANDOM_CODES = ["1", "2", "3", "4", "5", "6", "7"];
	var COPIED_RESET_MS = 1500;

	var atlas = null;
	var tinted = {};
	var waiting = [];

	function isDigit(c)
	{
		return c >= "0" && c <= "9";
	}

	// The text as the renderer splits it: [{ text, code }] where code is the active ^X or "".
	function segments(text)
	{
		var list = [];
		var code = "";
		var run = "";
		for (var i = 0; i < text.length; i++)
		{
			var c = text.charAt(i);
			if (c === "^" && isDigit(text.charAt(i + 1)))
			{
				if (run !== "")
				{
					list.push({ text: run, code: code });
				}
				run = "";
				code = text.charAt(i + 1);
				i++;
				continue;
			}
			run += c;
		}
		if (run !== "")
		{
			list.push({ text: run, code: code });
		}
		return list;
	}

	function plain(text)
	{
		return segments(text).map(function (s) { return s.text; }).join("");
	}

	function stripCodes(text)
	{
		return text.replace(/\^[0-9]/g, "");
	}

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
	function applyCode(input, code)
	{
		var text = input.value;
		var start = input.selectionStart === null ? text.length : input.selectionStart;
		var end = input.selectionEnd === null ? start : input.selectionEnd;
		var insert = "^" + code;

		if (end > start)
		{
			var rest = text.slice(end);
			var back = codeAt(text, end) || "7";
			insert += text.slice(start, end) + (rest !== "" && back !== code ? "^" + back : "");
		}

		input.value = text.slice(0, start) + insert + text.slice(end);
		var caret = start + insert.length;
		input.focus();
		input.setSelectionRange(caret, caret);
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

	// A new color for every letter, or for every word.
	function randomColors(text, perLetter)
	{
		text = stripCodes(text);
		var out = "";
		var previous = "";
		var inWord = false;
		for (var i = 0; i < text.length; i++)
		{
			var c = text.charAt(i);
			if (perLetter ? c !== " " : c !== " " && !inWord)
			{
				previous = pick(previous);
				out += "^" + previous;
			}
			inWord = c !== " ";
			out += c;
		}
		return out;
	}

	// rgb of a code; allies is the team that ^8 shows (one of data.teams.allies).
	function rgbOf(code, allies)
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

	// Calls back once the font image is loaded (at once if it is).
	function ready(callback)
	{
		if (atlas === null)
		{
			atlas = new Image();
			atlas.onload = function ()
			{
				waiting.forEach(function (f) { f(); });
				waiting = [];
			};
			atlas.src = data.font.atlas;
		}
		if (atlas.complete && atlas.naturalWidth > 0)
		{
			callback();
		}
		else
		{
			waiting.push(callback);
		}
	}

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

	function textWidth(text)
	{
		var w = 0;
		var visible = plain(text);
		for (var i = 0; i < visible.length; i++)
		{
			var g = data.font.glyphs[visible.charAt(i)];
			w += g ? g[6] : 0;
		}
		return w;
	}

	// Draws lines of colored text into a canvas sized to fit. allies: the team ^8 shows.
	function draw(target, lines, scale, allies)
	{
		if (atlas === null || !atlas.complete || atlas.naturalWidth === 0)
		{
			return;     // ready() draws once the font image is there
		}
		var font = data.font;
		var ratio = window.devicePixelRatio || 1;
		var pad = PAD * scale / 3;
		var lineHeight = (font.height + 3) * scale;
		var widest = 0;
		lines.forEach(function (line) { widest = Math.max(widest, textWidth(line)); });
		var cssW = Math.ceil(widest * scale + pad * 2 + scale);
		var cssH = Math.ceil(lines.length * lineHeight + 3 * scale + pad * 2);
		target.width = Math.round(cssW * ratio);
		target.height = Math.round(cssH * ratio);
		target.style.width = cssW + "px";
		target.style.aspectRatio = cssW + " / " + cssH;

		var ctx = target.getContext("2d");
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.imageSmoothingEnabled = true;
		var shadow = tint([0, 0, 0]);

		lines.forEach(function (line, row)
		{
			var baseline = pad + font.height * scale + row * lineHeight;
			var parts = segments(line);
			[true, false].forEach(function (isShadow)
			{
				var x = pad;
				var offset = isShadow ? scale : 0;
				ctx.globalAlpha = isShadow ? 0.75 : 1;
				parts.forEach(function (part)
				{
					var sheet = isShadow ? shadow : tint(rgbOf(part.code, allies));
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
		});
		ctx.globalAlpha = 1;
	}

	/* ---------- controls ---------- */

	// One button per color; onCode(code) runs on a click. The field keeps its selection.
	function makePalette(box, onCode)
	{
		["1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach(function (code)
		{
			var button = el("button", "btn btn-sm n2-code");
			button.type = "button";
			button.setAttribute("data-code", code);
			button.appendChild(el("span", "n2-swatch"));
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
				onCode(button.getAttribute("data-code"));
			}
		});
	}

	function paintSwatches(box, allies)
	{
		[].forEach.call(box.querySelectorAll(".n2-code"), function (button)
		{
			button.querySelector(".n2-swatch").style.backgroundColor = css(rgbOf(button.getAttribute("data-code"), allies));
		});
	}

	// The allies side picker: fills the select and calls onChange(team).
	function makeAlliesPicker(select, onChange)
	{
		data.teams.allies.forEach(function (team, i)
		{
			var option = document.createElement("option");
			option.value = String(i);
			option.textContent = team.name;
			select.appendChild(option);
		});
		select.addEventListener("change", function ()
		{
			onChange(data.teams.allies[Number(select.value)]);
		});
		return data.teams.allies[0];
	}

	// A copy button that confirms on itself; getText() gives what to copy.
	function copyButton(button, getText, setHint)
	{
		button.addEventListener("click", function ()
		{
			window.UI.copyText(getText()).then(function ()
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
				setHint("Could not copy — select the text and copy manually.", true);
			});
		});
	}

	return {
		isDigit: isDigit,
		segments: segments,
		plain: plain,
		stripCodes: stripCodes,
		codeAt: codeAt,
		applyCode: applyCode,
		randomColors: randomColors,
		rgbOf: rgbOf,
		ready: ready,
		draw: draw,
		makePalette: makePalette,
		paintSwatches: paintSwatches,
		makeAlliesPicker: makeAlliesPicker,
		copyButton: copyButton
	};
})();
