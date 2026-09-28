/*
 * Killfeed colours: pick a colour per DVAR, or paste the values you already
 * have in your config to see what colour they are.
 *
 * Only the two team colour DVARs are handled here, because those are the ones
 * that decide how the names in the killfeed are tinted.
 *
 * The exact numbers a row holds live in its data-rgba attribute. The colour
 * swatch is only a preview: reading the colour back out of it would round
 * every channel to 8 bit and quietly turn a pasted 0.5 into 0.502.
 */
(function ()
{
	"use strict";

	// Each row shows a short label but always emits the full DVAR name, which
	// is kept in the row's data-dvar attribute.
	var DEFAULT_ROWS = [
		{ dvar: "g_TeamColor_Allies", label: "Allies", rgba: [0.498, 0.655, 1, 1] },
		{ dvar: "g_TeamColor_Axis", label: "Axis", rgba: [1, 0.541, 0.361, 1] }
	];

	// The icons as data URLs, from assets/killfeed-icons.js. They come
	// uncropped, with very different amounts of transparent margin, so each
	// one is measured once and only its visible part is shown (see measureIcon).
	// Data URLs rather than image files because an image loaded from a file://
	// URL cannot be read back from a canvas, and the page must work from disk.
	var ICONS = window.KILLFEED_ICONS || {};

	// Alpha (of 255) a pixel needs to count as visible. Below that it cannot be
	// seen, but a stray one would still widen the box; real antialiased edges
	// sit well above it.
	var ALPHA_THRESHOLD = 4;

	// Promod X weapons (weapons/mp, silencer variants share the icon) and the
	// icon showing the killIcon each weapon file names. The icon keys follow
	// the icon names without the hud_icon_ prefix; where they differ, the icon
	// name is noted.
	var WEAPONS = {
		ak47_mp: { name: "AK-47", icon: "ak47" },
		ak74u_mp: { name: "AK-74u", icon: "akd74u" },                // hud_icon_ak74u
		beretta_mp: { name: "M9 Beretta", icon: "m9beretta" },
		colt45_mp: { name: "M1911 .45", icon: "colt45" },            // hud_icon_colt_45
		deserteagle_mp: { name: "Desert Eagle", icon: "desert_eagle" },
		deserteaglegold_mp: { name: "Gold Desert Eagle", icon: "desert_eagle" },
		g3_mp: { name: "G3", icon: "g3" },
		g36c_mp: { name: "G36C", icon: "g36c_mp" },
		m1014_mp: { name: "M1014", icon: "benelli_m4" },
		m14_mp: { name: "M14", icon: "m14" },
		m16_mp: { name: "M16A4", icon: "m16a4" },                     // hud_icon_m16a4_grenade
		m4_mp: { name: "M4 Carbine", icon: "m4carbine" },
		m40a3_mp: { name: "M40A3", icon: "m40a3" },
		mp44_mp: { name: "MP44", icon: "mp44" },
		mp5_mp: { name: "MP5", icon: "mp5" },
		remington700_mp: { name: "R700", icon: "remington_700" },    // hud_icon_remington700
		usp_mp: { name: "USP .45", icon: "usp_45" },
		uzi_mp: { name: "Mini-Uzi", icon: "mini_uzi" },
		winchester1200_mp: { name: "W1200", icon: "winchester1200" }, // hud_icon_winchester_1200
		frag_grenade_mp: { name: "Frag grenade", icon: "grenade" },  // hud_us_grenade
		smoke_grenade_mp: { name: "Smoke grenade", icon: "grenade" }
		// flash_grenade_mp has an empty killIcon: a flashbang cannot kill
	};

	// Killfeed icons that belong to a way of dying rather than to a weapon.
	var SPECIAL = {
		headshot: { name: "headshot", icon: "headshot" },
		knife: { name: "melee", icon: "knife" },
		car: { name: "car explosion", icon: "car" },
		falling: { name: "fall", icon: "falling" },
		suicide: { name: "suicide", icon: "suicide" }
	};

	// Sample kills for the preview, enough for the highest line count. Each kill
	// is scored by one team against the other, so both colours show up in both
	// positions. A fall or a suicide has no attacker, as in the game.
	var PREVIEW_ROWS = [
		{ attacker: "alpha", victim: "bravo", team: 0, weapon: "ak47_mp", headshot: true },
		{ attacker: "charlie", victim: "delta", team: 1, weapon: "m4_mp" },
		{ attacker: "echo", victim: "foxtrot", team: 0, weapon: "m40a3_mp" },
		{ attacker: "golf", victim: "hotel", team: 1, weapon: "deserteagle_mp" },
		{ attacker: "india", victim: "juliet", team: 0, kind: "knife" },
		{ attacker: "kilo", victim: "lima", team: 1, weapon: "frag_grenade_mp" },
		{ attacker: "mike", victim: "november", team: 0, kind: "car" },
		{ victim: "oscar", team: 1, kind: "falling" },
		{ victim: "papa", team: 0, kind: "suicide" },
		{ attacker: "quebec", victim: "romeo", team: 1, weapon: "mp5_mp" }
	];

	// con_gameMsgWindow0 is the killfeed window. MsgTime is a float with no
	// upper bound in the engine, capped here at 999. The defaults are the
	// engine's own: 5 seconds, 4 lines.
	// LineCount goes up to 10 here, but stock CoD4 registers it as an int from
	// 1 to 9 (cl_console.cpp) and ignores anything outside that: Dvar_SetVariant
	// prints "is not a valid value" and keeps the old value.
	var OPTIONS = {
		msgTime: { dvar: "con_gameMsgWindow0MsgTime", def: 5, min: 0, max: 999, integer: false,
			label: "Display time", unit: "seconds" },
		lineCount: { dvar: "con_gameMsgWindow0LineCount", def: 4, min: 1, max: 10, integer: true,
			label: "Line count", unit: "lines" }
	};

	var HINT_RESET_MS = 3000;

	var rowsBox = null;
	var keyField = null;
	var actionField = null;
	var bindBox = null;
	var cmdsBox = null;
	var feedBox = null;
	var hint = null;
	var defaultHint = "";
	var hintTimer = null;

	// Visible box of each icon by key, filled once by measureIcons. Until it
	// is, the preview stays hidden rather than showing icons that jump.
	var iconBoxes = {};
	var iconsReady = false;

	// Last valid value of each option; a field holding something invalid never
	// reaches the output or the preview.
	var optionValues = { msgTime: OPTIONS.msgTime.def, lineCount: OPTIONS.lineCount.def };
	var optionFields = { msgTime: null, lineCount: null };

	function setHint(message, isError)
	{
		if (hint === null)
		{
			return;
		}

		window.clearTimeout(hintTimer);
		hint.textContent = message;
		hint.classList.toggle("is-error", isError === true);

		hintTimer = window.setTimeout(function ()
		{
			hint.textContent = defaultHint;
			hint.classList.remove("is-error");
		}, HINT_RESET_MS);
	}

	/* ---------- value conversion ---------- */

	// "0.502" rather than "0.502000", and a plain "1" instead of "1.000".
	function formatChannel(value)
	{
		var text = value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		return text === "" || text === "-0" ? "0" : text;
	}

	function formatRgba(rgba)
	{
		return formatChannel(rgba[0]) + " " + formatChannel(rgba[1]) + " " +
			formatChannel(rgba[2]) + " " + formatChannel(rgba[3]);
	}

	// Accepts "0.62 0.506 0.714 1", comma separated values, a quoted group, and
	// a whole config line pasted straight in. Alpha may be left off.
	function parseRgba(raw)
	{
		var quoted = /"([^"]*)"/.exec(raw);
		var body = (quoted !== null ? quoted[1] : String(raw)).trim();
		if (body === "")
		{
			return null;
		}

		var parts = body.split(/[\s,]+/);
		if (parts.length < 3 || parts.length > 4)
		{
			return null;
		}

		var values = [];
		for (var i = 0; i < parts.length; i++)
		{
			var value = Number(parts[i]);
			if (parts[i] === "" || isNaN(value) || value < 0 || value > 1)
			{
				return null;
			}
			values.push(value);
		}

		if (values.length === 3)
		{
			values.push(1);
		}

		return values;
	}

	function toHex(rgba)
	{
		var out = "#";
		for (var i = 0; i < 3; i++)
		{
			var channel = Math.round(rgba[i] * 255).toString(16);
			out += channel.length === 1 ? "0" + channel : channel;
		}
		return out;
	}

	// Accepts "#9e81b6", "9e81b6" and the three digit short form.
	function hexToRgb(hex)
	{
		var match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
		if (match === null)
		{
			return null;
		}

		var digits = match[1];
		if (digits.length === 3)
		{
			digits = digits.charAt(0) + digits.charAt(0) + digits.charAt(1) +
				digits.charAt(1) + digits.charAt(2) + digits.charAt(2);
		}

		var value = parseInt(digits, 16);
		return [
			((value >> 16) & 255) / 255,
			((value >> 8) & 255) / 255,
			(value & 255) / 255
		];
	}

	function readRgba(row)
	{
		return parseRgba(row.getAttribute("data-rgba")) || [0, 0, 0, 1];
	}

	// "skip" names the field the user is typing in, so it is not rewritten
	// under the cursor. Pass null when the change came from somewhere else.
	function writeRgba(row, rgba, skip)
	{
		row.setAttribute("data-rgba", formatRgba(rgba));
		row.querySelector(".kf-color").value = toHex(rgba);

		var value = row.querySelector(".kf-value");
		value.classList.remove("is-invalid");
		if (skip !== "value")
		{
			value.value = formatRgba(rgba);
		}

		var hex = row.querySelector(".kf-hex");
		hex.classList.remove("is-invalid");
		if (skip !== "hex")
		{
			hex.value = toHex(rgba);
		}
	}

	/* ---------- rows ---------- */

	function makeRow(data)
	{
		var row = document.createElement("div");
		row.className = "kf-row";

		var color = document.createElement("input");
		color.type = "color";
		color.className = "kf-color";
		color.setAttribute("aria-label", "Colour");

		var name = document.createElement("input");
		name.type = "text";
		name.className = "kf-dvar";
		name.value = data.label;
		name.readOnly = true;
		name.title = data.dvar;
		name.spellcheck = false;
		name.autocomplete = "off";
		name.setAttribute("aria-label", "DVAR name");
		row.setAttribute("data-dvar", data.dvar);

		var value = document.createElement("input");
		value.type = "text";
		value.className = "kf-value";
		value.placeholder = "0 0 0 1";
		value.spellcheck = false;
		value.autocomplete = "off";
		value.title = "Red, green, blue and alpha from 0 to 1";
		value.setAttribute("aria-label", "Value: red green blue alpha");

		var hex = document.createElement("input");
		hex.type = "text";
		hex.className = "kf-hex";
		hex.placeholder = "#ffffff";
		hex.spellcheck = false;
		hex.autocomplete = "off";
		hex.title = "Hex colour, e.g. #9e81b6";
		hex.setAttribute("aria-label", "Hex colour");

		row.appendChild(color);
		row.appendChild(name);
		row.appendChild(value);
		row.appendChild(hex);

		writeRgba(row, data.rgba, null);
		return row;
	}

	function renderRows(list)
	{
		rowsBox.innerHTML = "";
		for (var i = 0; i < list.length; i++)
		{
			rowsBox.appendChild(makeRow(list[i]));
		}
	}

	// Every named row as { dvar, value } with the value already formatted.
	function collectEntries()
	{
		var rows = rowsBox.querySelectorAll(".kf-row");
		var entries = [];

		for (var i = 0; i < rows.length; i++)
		{
			// The field only shows a short label, so the real name comes from
			// the row itself.
			var dvar = rows[i].getAttribute("data-dvar");
			if (!dvar)
			{
				continue;
			}

			entries.push({ dvar: dvar, value: formatRgba(readRgba(rows[i])) });
		}

		return entries;
	}

	// bind W "+forward; g_TeamColor_Allies 0.498 0.655 1 1; ..."
	// Re-applies the colours on every key press, so a server that resets them
	// does not keep them reset. Clearing the key or the action drops the line.
	function buildBindLine(entries)
	{
		if (keyField === null || actionField === null)
		{
			return null;
		}

		var key = keyField.value.trim();
		var action = actionField.value.trim();
		if (key === "" || action === "")
		{
			return null;
		}

		var parts = [action];
		for (var i = 0; i < entries.length; i++)
		{
			parts.push(entries[i].dvar + " " + entries[i].value);
		}

		return "bind " + key + ' "' + parts.join("; ") + '"';
	}

	// The two killfeed window settings, as config lines of their own.
	function buildCommands()
	{
		return [
			"seta " + OPTIONS.msgTime.dvar + ' "' + formatChannel(optionValues.msgTime) + '"',
			"seta " + OPTIONS.lineCount.dvar + ' "' + optionValues.lineCount + '"'
		].join("\n");
	}

	/* ---------- killfeed options ---------- */

	// A number in range, or null. Line count must be a whole number; the display
	// time may carry decimals, since the dvar is a float.
	function parseOption(key, raw)
	{
		var spec = OPTIONS[key];
		var text = String(raw).trim();
		if (text === "")
		{
			return null;
		}

		var value = Number(text);
		if (!isFinite(value) || value < spec.min || value > spec.max)
		{
			return null;
		}
		if (spec.integer && Math.floor(value) !== value)
		{
			return null;
		}

		return value;
	}

	function onOptionInput(key)
	{
		var field = optionFields[key];
		var value = parseOption(key, field.value);

		if (value === null)
		{
			field.classList.add("is-invalid");
			return;
		}

		field.classList.remove("is-invalid");
		var changedLines = key === "lineCount" && value !== optionValues.lineCount;
		optionValues[key] = value;

		if (changedLines)
		{
			buildPreview();
		}
		renderOutput();
	}

	// Leaving an invalid value behind puts the last good one back and says why.
	function onOptionBlur(key)
	{
		var field = optionFields[key];
		if (!field.classList.contains("is-invalid"))
		{
			return;
		}

		var spec = OPTIONS[key];
		field.classList.remove("is-invalid");
		field.value = spec.integer ? String(optionValues[key]) : formatChannel(optionValues[key]);
		setHint(spec.label + " takes " + (spec.integer ? "a whole number " : "a number ") +
			"from " + spec.min + " to " + spec.max + " " + spec.unit + ". Kept " + field.value + ".", true);
	}

	function resetOptions()
	{
		for (var key in OPTIONS)
		{
			if (OPTIONS.hasOwnProperty(key))
			{
				optionValues[key] = OPTIONS[key].def;
				if (optionFields[key] !== null)
				{
					optionFields[key].value = String(OPTIONS[key].def);
					optionFields[key].classList.remove("is-invalid");
				}
			}
		}
	}

	// textContent, never innerHTML: the bind key and action are free text.
	function fill(box, text, placeholder)
	{
		if (box === null)
		{
			return;
		}

		var empty = text === "";
		box.textContent = empty ? placeholder : text;
		box.classList.toggle("is-empty", empty);
	}

	function renderOutput()
	{
		var bind = buildBindLine(collectEntries());
		fill(bindBox, bind === null ? "" : bind,
			"Enter a bind key and action to generate this line.");
		fill(cmdsBox, buildCommands(), "");
		renderPreview();
	}

	/* ---------- killfeed preview ---------- */

	function cssColor(rgba)
	{
		return "rgba(" + Math.round(rgba[0] * 255) + ", " + Math.round(rgba[1] * 255) +
			", " + Math.round(rgba[2] * 255) + ", " + rgba[3] + ")";
	}

	// The smallest rectangle holding every pixel with alpha above the
	// threshold, in the image's own pixels. An image that cannot be read back
	// keeps its full size, so it still shows, just with its margin.
	function measureIcon(key, canvas)
	{
		var img = new Image();
		img.src = ICONS[key];

		return img.decode().then(function ()
		{
			var width = img.naturalWidth;
			var height = img.naturalHeight;
			var box = { x: 0, y: 0, w: width, h: height, width: width, height: height, img: img };

			var data;
			try
			{
				canvas.width = width;
				canvas.height = height;
				var ctx = canvas.getContext("2d", { willReadFrequently: true });
				ctx.drawImage(img, 0, 0);
				data = ctx.getImageData(0, 0, width, height).data;
			}
			catch (err)
			{
				return box;
			}

			var left = width, top = height, right = -1, bottom = -1;
			for (var y = 0; y < height; y++)
			{
				for (var x = 0; x < width; x++)
				{
					if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD)
					{
						if (x < left) { left = x; }
						if (x > right) { right = x; }
						if (y < top) { top = y; }
						bottom = y;
					}
				}
			}

			if (right !== -1)
			{
				box.x = left;
				box.y = top;
				box.w = right - left + 1;
				box.h = bottom - top + 1;
			}
			return box;
		}, function ()
		{
			return null;
		});
	}

	// Every icon once. They share one canvas, which is safe because each draws
	// and reads back in a single step. The decoded image stays in the cache
	// with its box, so the preview's copies of it are ready the moment they
	// are added and never paint in late.
	function measureIcons()
	{
		var canvas = document.createElement("canvas");
		return Promise.all(Object.keys(ICONS).map(function (key)
		{
			return measureIcon(key, canvas).then(function (box)
			{
				iconBoxes[key] = box;
			});
		}));
	}

	function percent(fraction)
	{
		return (fraction * 100) + "%";
	}

	// A box as tall as the CSS says, in the shape of the icon's visible part,
	// holding the whole image scaled and shifted so only that part shows. It
	// is all in percent of the box, so the one height in the CSS decides the
	// size of every icon.
	function makeIcon(entry)
	{
		var clip = document.createElement("span");
		clip.className = "kf-icon";
		clip.setAttribute("role", "img");
		clip.setAttribute("aria-label", entry.name);

		var box = iconBoxes[entry.icon];
		if (!box)
		{
			return clip;
		}

		clip.style.aspectRatio = box.w + " / " + box.h;

		var img = document.createElement("img");
		img.src = ICONS[entry.icon];
		img.alt = "";
		img.draggable = false;
		img.style.width = percent(box.width / box.w);
		img.style.height = percent(box.height / box.h);
		img.style.left = percent(-box.x / box.w);
		img.style.top = percent(-box.y / box.h);
		clip.appendChild(img);
		return clip;
	}

	function makeNick(name, role)
	{
		var span = document.createElement("span");
		span.className = "kf-nick";
		span.setAttribute("data-role", role);
		span.textContent = name;
		return span;
	}

	// Name - icon - name, as in the game. A headshot shows the headshot icon
	// in place of the weapon, not next to it. A kill with no attacker (a fall,
	// a suicide) is just the icon and the victim.
	function makeLine(kill)
	{
		var line = document.createElement("div");
		line.className = "kf-line";
		line.setAttribute("data-team", String(kill.team));

		if (kill.attacker)
		{
			line.appendChild(makeNick(kill.attacker, "attacker"));
		}

		var icon = kill.headshot ? SPECIAL.headshot
			: (kill.weapon ? WEAPONS[kill.weapon] : SPECIAL[kill.kind]);
		line.appendChild(makeIcon(icon));

		line.appendChild(makeNick(kill.victim, kill.attacker ? "victim" : "self"));
		return line;
	}

	// As many lines as con_gameMsgWindow0LineCount allows.
	function buildPreview()
	{
		if (feedBox === null)
		{
			return;
		}

		feedBox.innerHTML = "";
		feedBox.classList.toggle("is-loading", !iconsReady);

		var count = Math.min(optionValues.lineCount, PREVIEW_ROWS.length);
		for (var i = 0; i < count; i++)
		{
			feedBox.appendChild(makeLine(PREVIEW_ROWS[i]));
		}

		renderPreview();
	}

	// The attacker takes their team's colour and the victim the other one; with
	// no attacker, the victim keeps their own.
	function renderPreview()
	{
		if (feedBox === null || rowsBox === null)
		{
			return;
		}

		var rows = rowsBox.querySelectorAll(".kf-row");
		if (rows.length < 2)
		{
			return;
		}

		var colours = [cssColor(readRgba(rows[0])), cssColor(readRgba(rows[1]))];
		var lines = feedBox.querySelectorAll(".kf-line");

		for (var i = 0; i < lines.length; i++)
		{
			var team = Number(lines[i].getAttribute("data-team"));
			var nicks = lines[i].querySelectorAll(".kf-nick");
			for (var n = 0; n < nicks.length; n++)
			{
				var role = nicks[n].getAttribute("data-role");
				nicks[n].style.color = colours[role === "victim" ? 1 - team : team];
			}
		}
	}

	function onRowInput(event)
	{
		var field = event.target;
		var row = field.parentNode;

		if (field.className === "kf-color")
		{
			var picked = hexToRgb(field.value);
			if (picked !== null)
			{
				writeRgba(row, [picked[0], picked[1], picked[2], readRgba(row)[3]], null);
			}
		}
		else if (field.className.indexOf("kf-value") !== -1)
		{
			var parsed = parseRgba(field.value);
			if (parsed === null)
			{
				// Keep the last good colour so the swatch never flickers mid-typing.
				field.classList.add("is-invalid");
			}
			else
			{
				writeRgba(row, parsed, "value");
			}
		}
		else if (field.className.indexOf("kf-hex") !== -1)
		{
			var typed = hexToRgb(field.value);
			if (typed === null)
			{
				field.classList.add("is-invalid");
			}
			else
			{
				writeRgba(row, [typed[0], typed[1], typed[2], readRgba(row)[3]], "hex");
			}
		}

		renderOutput();
	}

	/* ---------- clipboard ---------- */

	function copyText(text)
	{
		if (navigator.clipboard && navigator.clipboard.writeText)
		{
			return navigator.clipboard.writeText(text);
		}

		return new Promise(function (resolve, reject)
		{
			var helper = document.createElement("textarea");
			helper.value = text;
			helper.setAttribute("readonly", "");
			helper.style.position = "fixed";
			helper.style.top = "-1000px";
			document.body.appendChild(helper);
			helper.select();

			var copied = false;
			try
			{
				copied = document.execCommand("copy");
			}
			catch (err)
			{
				copied = false;
			}

			document.body.removeChild(helper);

			if (copied)
			{
				resolve();
			}
			else
			{
				reject(new Error("copy command rejected"));
			}
		});
	}

	function copyBox(box, label)
	{
		if (box === null || box.classList.contains("is-empty"))
		{
			setHint("Nothing to copy in the " + label + " box yet.", true);
			return;
		}

		var text = box.textContent;
		var count = text.split("\n").length;

		copyText(text).then(function ()
		{
			setHint(label === "bind" ? "Bind line copied." : count + " " + label + " lines copied.");
		}, function ()
		{
			setHint("Could not copy \u2014 select the text and copy manually.", true);
		});
	}

	/* ---------- wiring ---------- */

	function init()
	{
		rowsBox = document.getElementById("kf-rows");
		keyField = document.getElementById("kf-key");
		actionField = document.getElementById("kf-action");
		bindBox = document.getElementById("kf-output-bind");
		cmdsBox = document.getElementById("kf-output-cmds");
		feedBox = document.getElementById("kf-feed");
		hint = document.getElementById("kf-hint");

		if (rowsBox === null || bindBox === null)
		{
			return;
		}

		if (hint !== null)
		{
			defaultHint = hint.textContent;
		}

		optionFields.msgTime = document.getElementById("kf-msgtime");
		optionFields.lineCount = document.getElementById("kf-lines");
		resetOptions();

		renderRows(DEFAULT_ROWS);
		buildPreview();
		renderOutput();

		measureIcons().then(function ()
		{
			iconsReady = true;
			buildPreview();
		});

		rowsBox.addEventListener("input", onRowInput);

		["msgTime", "lineCount"].forEach(function (key)
		{
			var field = optionFields[key];
			if (field === null)
			{
				return;
			}
			field.addEventListener("input", function () { onOptionInput(key); });
			field.addEventListener("blur", function () { onOptionBlur(key); });
		});

		if (keyField !== null)
		{
			keyField.addEventListener("input", renderOutput);
		}
		if (actionField !== null)
		{
			actionField.addEventListener("input", renderOutput);
		}

		// Leaving an unparsable value behind restores the last good numbers.
		rowsBox.addEventListener("focusout", function (event)
		{
			var field = event.target;
			if (field.classList.contains("is-invalid"))
			{
				writeRgba(field.parentNode, readRgba(field.parentNode), null);
			}
		});

		var reset = document.getElementById("kf-reset");
		if (reset !== null)
		{
			reset.addEventListener("click", function ()
			{
				renderRows(DEFAULT_ROWS);
				resetOptions();
				buildPreview();
				renderOutput();
				setHint("Reset to the default DVARs.");
			});
		}

		var copyBind = document.getElementById("kf-copy-bind");
		if (copyBind !== null)
		{
			copyBind.addEventListener("click", function ()
			{
				copyBox(bindBox, "bind");
			});
		}

		var copyCmds = document.getElementById("kf-copy-cmds");
		if (copyCmds !== null)
		{
			copyCmds.addEventListener("click", function ()
			{
				copyBox(cmdsBox, "console");
			});
		}
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
