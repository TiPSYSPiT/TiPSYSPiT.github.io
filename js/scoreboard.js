/*
 * Scoreboard generator.
 *
 * The preview follows cg_scoreboard_mp.cpp: the board is centred with
 * (screen - cg_scoreboardWidth) / 2 and (480 - cg_scoreboardHeight) / 2, the
 * usable list is cg_scoreboardWidth - 18 wide, and the columns are fixed
 * fractions of that. Rows are the team colour at half the fade alpha, which is
 * why the alpha you type into g_ScoresColor_* never shows up.
 *
 * ^0 to ^7 come from g_color_table, ^8 is your own team colour and ^9 the
 * enemy one, both taken from g_TeamColor_*, not from g_ScoresColor_*.
 */
(function ()
{
	"use strict";

	var HINT_RESET_MS = 3000;

	// cg_scoreboard_mp.cpp: columnInfo / columnInfoWithPing
	var COLUMNS_PLAIN = [
		{ type: "rank", w: 0.07 }, { type: "status", w: 0.05 },
		{ type: "name", w: 0.43, align: 0 }, { type: "talk", w: 0.05 },
		{ type: "score", w: 0.1, head: "Score", align: 2 },
		{ type: "kills", w: 0.1, head: "Kills", align: 2 },
		{ type: "assists", w: 0.1, head: "Assists", align: 2 },
		{ type: "deaths", w: 0.1, head: "Deaths", align: 2 }
	];

	var COLUMNS_PING = [
		{ type: "rank", w: 0.05 }, { type: "status", w: 0.05 },
		{ type: "name", w: 0.35, align: 0 }, { type: "talk", w: 0.05 },
		{ type: "score", w: 0.1, head: "Score", align: 2 },
		{ type: "kills", w: 0.1, head: "Kills", align: 2 },
		{ type: "assists", w: 0.1, head: "Assists", align: 2 },
		{ type: "deaths", w: 0.1, head: "Deaths", align: 2 },
		{ type: "ping", w: 0.1, head: "Ping", align: 2 }
	];

	// cl_cgame_mp.cpp: g_color_table
	var CODE_COLORS = [
		[0, 0, 0], [1, 0.36, 0.36], [0, 1, 0], [1, 1, 0],
		[0, 0, 1], [0, 1, 1], [1, 0.36, 1], [1, 1, 1]
	];

	var SAMPLE = {
		allies: [["alpha", 104, 19, 3, 10, 42], ["bravo", 103, 20, 1, 7, 73],
			["charlie", 81, 15, 2, 7, 32], ["delta", 79, 14, 2, 10, 24],
			["echo", 34, 5, 1, 6, 38]],
		axis: [["foxtrot", 91, 17, 0, 15, 28], ["golf", 38, 7, 1, 14, 28],
			["hotel", 36, 6, 1, 14, 21], ["india", 33, 6, 0, 14, 23],
			["juliet", 20, 4, 0, 16, 26]]
	};

	var ME = 3;   // which row of your own team is you

	var ROW_FONT = 11;   // rows, banners and the footer all draw at a fixed 0.35 scale

	// CG_BackdropLeft measures against the virtual screen, which is
	// aspectRatio * 480 wide. The backdrop is a real screenshot, so its own
	// aspect ratio is the screen the board is placed on. Read from the image
	// once it loads; until then, assume the 16:9 most people play on.
	var bgAspect = 16 / 9;

	function virtualWidth() { return bgAspect * 480; }

	var MY_TEAM = "allies";   // the team the preview puts you on

	// Ready-made colour sets. Each one writes the dvars listed in PRESET_PARTS.
	var PRESETS = [
		{ name: "My Original Color",
			allies: "0.847 0.992 0.576 1", alliesTitle: "0.847 0.992 0.576 1",
			axis: "0.561 0.655 0.843 1", axisTitle: "0.561 0.655 0.843 1",
			mine: "0.3 0.3 0.3 1" },
		{ name: "Green and black",
			allies: "0.502 1 0 1", alliesTitle: "0.502 1 0 1",
			axis: "0 0 0 0", axisTitle: "0 0 0 0",
			mine: "0 0 0 1" },
		{ name: "Blue and green",
			allies: "0.383 0.793 1 1", alliesTitle: "0.383 0.793 1 1",
			axis: "0.602 1 0 1", axisTitle: "0.602 1 0 1",
			mine: "0 0 0 1" },
		{ name: "Pink and grey",
			allies: "1 0 0.703 1", alliesTitle: "1 0 0.703 1",
			axis: "0.473 0.473 0.473 1", axisTitle: "0.473 0.473 0.473 1",
			mine: "0 0 0 1" },
		{ name: "Green and grey",
			allies: "0.496 0.781 0.332 1", alliesTitle: "0.496 0.781 0.332 1",
			axis: "0.711 0.711 0.711 1", axisTitle: "0.711 0.711 0.711 1",
			mine: "0 0 0 0" },
		{ name: "Blue and black",
			allies: "0 0.55 1 1", alliesTitle: "0 0.55 1 1",
			axis: "0 0 0 1", axisTitle: "0 0 0 1",
			mine: "0.255 0.255 0.255 1" },
		{ name: "LA Lakers",
			allies: "0.438 0.113 1 1", alliesTitle: "0.89 1 0.184 1",
			axis: "0.438 0.113 1 1", axisTitle: "0.89 1 0.184 1",
			mine: "0.89 1 0.184 1" },
		{ name: "RedOrange and DarkDenim",
			allies: "1 0.371 0.145 1", alliesTitle: "0.672 1 0.102 1",
			axis: "0.211 0.277 0.402 1", axisTitle: "0.199 0.211 0.313 1",
			mine: "0 0 0 0" }
	];

	// The title colours are g_TeamColor_*, which is what ^8 and ^9 resolve to in
	// the team names, so they are set apart from the row colours.
	var PRESET_PARTS = [
		{ key: "allies", label: "Allies row", dvars: ["g_ScoresColor_Allies"] },
		{ key: "axis", label: "Axis row", dvars: ["g_ScoresColor_Axis"] },
		{ key: "mine", label: "MyColor", dvars: ["cg_scoreboardMyColor"] },
		{ key: "alliesTitle", label: "Allies title", dvars: ["g_TeamColor_Allies"] },
		{ key: "axisTitle", label: "Axis title", dvars: ["g_TeamColor_Axis"] }
	];

	// Stand-ins for the g_TeamIcon_* materials, which live in the game files.
	// Fixed markup, so it is safe to hand these to innerHTML.
	var TEAM_ICONS = {
		allies: '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">' +
			'<path d="M32 12 l2.6 5.3 5.8 .8 -4.2 4.1 1 5.8 -5.2 -2.7 -5.2 2.7 1 -5.8 -4.2 -4.1 5.8 -.8 Z"/>' +
			'<path d="M32 32 l3.4 3.6 -3.4 12.4 -3.4 -12.4 Z"/>' +
			'<path d="M29.6 33.6 L8 29.4 l0 5.2 20 6.4 Z"/>' +
			'<path d="M34.4 33.6 L56 29.4 l0 5.2 -20 6.4 Z"/></svg>',
		axis: '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">' +
			'<path d="M32 10 l2.6 5.3 5.8 .8 -4.2 4.1 1 5.8 -5.2 -2.7 -5.2 2.7 1 -5.8 -4.2 -4.1 5.8 -.8 Z"/>' +
			'<path d="M13 50 L45 24 l3.2 3.6 -32 26 Z"/>' +
			'<path d="M51 50 L19 24 l-3.2 3.6 32 26 Z"/></svg>'
	};

	var FIELDS = [
		{ group: "Teams", dvar: "g_TeamName_Allies", kind: "text", def: "^8ATTACK^7", label: "Allies name" },
		{ group: "Teams", dvar: "g_TeamName_Axis", kind: "text", def: "^9DEFENCE^7", label: "Axis name" },
		{ group: "Teams", dvar: "g_ScoresColor_Allies", kind: "color", def: "0.847 0.992 0.576 1", label: "Allies row" },
		{ group: "Teams", dvar: "g_ScoresColor_Axis", kind: "color", def: "0.561 0.655 0.843 1", label: "Axis row" },
		{ group: "Teams", dvar: "g_ScoresColor_Spectator", kind: "color", def: "1 0 0.2 0.5", label: "Spectator row" },
		{ group: "Teams", dvar: "g_ScoresColor_Free", kind: "color", def: "1 1 0.6 0.5", label: "Free row" },
		{ group: "Teams", dvar: "cg_scoreboardMyColor", kind: "color", def: "0.3 0.3 0.3 1", label: "Your own text" },
		{ group: "Teams", dvar: "g_TeamColor_Allies", kind: "color", def: "0.847 0.992 0.576 1", label: "Allies ^8 / ^9" },
		{ group: "Teams", dvar: "g_TeamColor_Axis", kind: "color", def: "0.561 0.655 0.843 1", label: "Axis ^8 / ^9" },

		{ group: "Layout", dvar: "cg_scoreboardWidth", kind: "num", def: 400, min: 200, max: 640, step: 5, label: "Scoreboard Width" },
		{ group: "Layout", dvar: "cg_scoreboardHeight", kind: "num", def: 485, min: 200, max: 600, step: 5, label: "Scoreboard Height" },
		{ group: "Layout", dvar: "cg_scoreboardItemHeight", kind: "num", def: 15, min: 8, max: 40, step: 1, label: "Scoreboard Item Height" },
		{ group: "Layout", dvar: "cg_scoreboardBannerHeight", kind: "num", def: 25, min: 10, max: 60, step: 1, label: "Scoreboard Banner Height" },
		{ group: "Layout", dvar: "cg_scoreboardHeaderFontScale", kind: "num", def: 0.2, min: 0.1, max: 0.6, step: 0.01, label: "Scoreboard Header Font Scale" },
		{ group: "Layout", dvar: "cg_scoreboardFont", kind: "num", def: 0, min: 0, max: 6, step: 1, label: "Scoreboard Font" },
		{ group: "Layout", dvar: "cg_scoreboardScrollStep", kind: "num", def: 3, min: 1, max: 8, step: 1, label: "Scoreboard Scroll Step" },
		{ group: "Layout", dvar: "cg_scoreboardTextOffset", kind: "num", def: 0.5, min: 0, max: 4, step: 0.1, label: "Scoreboard Text Offset" },
		{ group: "Layout", dvar: "cg_scoreboardRankFontScale", kind: "num", def: 0.1, min: 0, max: 1, step: 0.05, label: "Scoreboard Rank Font Scale" },

		{ group: "Ping", dvar: "cg_scoreboardPingText", kind: "bool", def: 1, label: "Ping Text" },
		{ group: "Ping", dvar: "cg_scoreboardPingGraph", kind: "bool", def: 0, label: "Ping Graph" },
		{ group: "Ping", dvar: "cg_ScoresPing_MaxBars", kind: "num", def: 5, min: 1, max: 10, step: 1, label: "Ping MaxBars" },
		{ group: "Ping", dvar: "cg_ScoresPing_Interval", kind: "num", def: 25, min: 1, max: 500, step: 1, label: "Ping Interval" },
		{ group: "Ping", dvar: "cg_scoreboardPingHeight", kind: "num", def: 0.7, min: 0.1, max: 1, step: 0.01, label: "Ping Height" },
		{ group: "Ping", dvar: "cg_scoreboardPingWidth", kind: "num", def: 0.036, min: 0.01, max: 0.2, step: 0.002, label: "Ping Width" },
		{ group: "Ping", dvar: "cg_ScoresPing_HighColor", kind: "color", def: "0.8 0 0 1", label: "Ping HighColor" },
		{ group: "Ping", dvar: "cg_ScoresPing_MedColor", kind: "color", def: "0.8 0.8 0 1", label: "Ping MedColor" },
		{ group: "Ping", dvar: "cg_ScoresPing_LowColor", kind: "color", def: "0 0.75 0 1", label: "Ping LowColor" },
		{ group: "Ping", dvar: "cg_ScoresPing_BgColor", kind: "color", def: "0 0 0 0", label: "Ping BgColor" }
	];

	// these are DVAR_TEMP and the mod resets them, so they go into the bind
	var IN_BIND = ["g_TeamName_Allies", "g_TeamName_Axis", "g_ScoresColor_Allies",
		"g_ScoresColor_Axis", "g_ScoresColor_Spectator", "g_ScoresColor_Free"];

	var state = {};
	var controlsBox = null, screenBox = null, previewBox = null, hint = null;
	var outBind = null, outBoard = null, outTeams = null;
	var ladderBox = null, presetsBox = null, previewWatcher = null;
	var defaultHint = "", hintTimer = null;

	/* ---------- helpers ---------- */

	function setHint(message, isError)
	{
		if (hint === null) { return; }
		window.clearTimeout(hintTimer);
		hint.textContent = message;
		hint.classList.toggle("is-error", isError === true);
		hintTimer = window.setTimeout(function ()
		{
			hint.textContent = defaultHint;
			hint.classList.remove("is-error");
		}, HINT_RESET_MS);
	}

	function fmt(n)
	{
		var s = Number(n).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		return s === "" || s === "-0" ? "0" : s;
	}

	function parseRgba(raw)
	{
		var parts = String(raw).trim().split(/[\s,]+/).map(Number);
		if (parts.length < 3 || parts.some(isNaN)) { return [1, 1, 1, 1]; }
		if (parts.length === 3) { parts.push(1); }
		return parts.slice(0, 4).map(function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; });
	}

	function toHex(rgba)
	{
		var out = "#";
		for (var i = 0; i < 3; i++)
		{
			var c = Math.round(rgba[i] * 255).toString(16);
			out += c.length === 1 ? "0" + c : c;
		}
		return out;
	}

	function hexToRgba(hex, alpha)
	{
		var v = parseInt(hex.slice(1), 16);
		return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, alpha];
	}

	function css(rgba, alphaOverride)
	{
		var a = alphaOverride === undefined ? rgba[3] : alphaOverride;
		return "rgba(" + Math.round(rgba[0] * 255) + "," + Math.round(rgba[1] * 255) +
			"," + Math.round(rgba[2] * 255) + "," + a + ")";
	}

	function col(dvar) { return parseRgba(state[dvar]); }
	function num(dvar) { return Number(state[dvar]); }

	// ^0..^7 from the colour table, ^8 own team, ^9 enemy team. Anything else white.
	function colorCodeRgb(digit, myTeam)
	{
		if (digit < 8) { return CODE_COLORS[digit].concat([1]); }
		var mine = myTeam === "allies" ? col("g_TeamColor_Allies") : col("g_TeamColor_Axis");
		var theirs = myTeam === "allies" ? col("g_TeamColor_Axis") : col("g_TeamColor_Allies");
		if (digit === 8) { return [mine[0], mine[1], mine[2], 1]; }
		if (digit === 9) { return [theirs[0], theirs[1], theirs[2], 1]; }
		return [1, 1, 1, 1];
	}

	// Splits "^7promod^9LIVE" into coloured spans.
	function colorCodedSpans(text, startColor, myTeam)
	{
		var out = [];
		var current = startColor;
		var buffer = "";
		for (var i = 0; i < text.length; i++)
		{
			if (text.charAt(i) === "^" && i + 1 < text.length && /[0-9]/.test(text.charAt(i + 1)))
			{
				if (buffer !== "") { out.push({ text: buffer, color: current }); buffer = ""; }
				current = colorCodeRgb(Number(text.charAt(i + 1)), myTeam);
				i++;
				continue;
			}
			buffer += text.charAt(i);
		}
		if (buffer !== "") { out.push({ text: buffer, color: current }); }
		return out;
	}

	function el(tag, className, text)
	{
		var node = document.createElement(tag);
		if (className) { node.className = className; }
		if (text !== undefined) { node.textContent = text; }
		return node;
	}

	/* ---------- preview ---------- */

	function place(node, x, y, w, h)
	{
		node.style.left = x + "px";
		node.style.top = y + "px";
		if (w !== undefined) { node.style.width = w + "px"; }
		if (h !== undefined) { node.style.height = h + "px"; }
		return node;
	}

	// The game measures every string before it places it. A canvas measures the
	// same way and, unlike the DOM, still answers while the panel is hidden.
	var measure = null, fontStack = null;

	function previewFont()
	{
		if (fontStack === null)
		{
			var probe = el("div", "sb-text");
			probe.style.visibility = "hidden";
			document.body.appendChild(probe);
			fontStack = window.getComputedStyle(probe).fontFamily || "sans-serif";
			document.body.removeChild(probe);
		}
		return fontStack;
	}

	function measureWith(font, text)
	{
		if (measure === null) { measure = document.createElement("canvas").getContext("2d"); }
		measure.font = font;
		return measure.measureText(text).width;
	}

	function textWidth(text, size)
	{
		return measureWith(size + "px " + previewFont(), text);
	}

	function spanWidth(spans, size)
	{
		var total = 0;
		for (var i = 0; i < spans.length; i++) { total += textWidth(spans[i].text, size); }
		return total;
	}

	// UI_DrawText is handed the text baseline, so the box is built around it.
	// CalcXAdj: align 0 is left, 1 centred, 2 right with 4 units of padding.
	function drawText(parent, spans, x, baseline, w, align, size)
	{
		var box = el("div", "sb-text");
		place(box, x, baseline - size * 0.95, align === 2 ? w - 4 : w, size * 1.2);
		box.style.fontSize = size + "px";
		box.style.lineHeight = size * 1.2 + "px";
		box.style.textAlign = align === 2 ? "right" : (align === 1 ? "center" : "left");
		for (var i = 0; i < spans.length; i++)
		{
			var s = el("span", null, spans[i].text);
			s.style.color = css(spans[i].color);
			box.appendChild(s);
		}
		parent.appendChild(box);
		return box;
	}

	// DrawListString drops the baseline by (textHeight + itemHeight) * cg_scoreboardTextOffset
	function cellBaseline(y, rowH, size)
	{
		return y + (size * 0.72 + rowH) * num("cg_scoreboardTextOffset");
	}

	function maxBars() { return Math.max(1, Math.round(num("cg_ScoresPing_MaxBars"))); }
	function pingInterval() { return Math.max(1, Math.round(num("cg_ScoresPing_Interval"))); }

	// One bar drops per full interval, and the count is clamped at 1, never 0.
	function pingBarCount(ping)
	{
		return Math.max(1, maxBars() - Math.floor(ping / pingInterval()));
	}

	// Every bar in a row shares one colour: many bars lerp towards LowColor,
	// few towards HighColor. maxBars / 2 is an integer division in the engine.
	function pingBarColor(bars)
	{
		var half = Math.floor(maxBars() / 2);
		var start, end, lerp;
		if (bars >= half)
		{
			start = col("cg_ScoresPing_MedColor"); end = col("cg_ScoresPing_LowColor");
			lerp = half === 0 ? 1 : (bars - half) / half;   // the engine divides by zero here
		}
		else
		{
			start = col("cg_ScoresPing_HighColor"); end = col("cg_ScoresPing_MedColor");
			lerp = half === 0 ? 0 : bars / half;
		}
		var c = [0, 0, 0, 1];   // not clamped, so full bars can overshoot past LowColor
		for (var k = 0; k < 4; k++) { c[k] = start[k] + (end[k] - start[k]) * lerp; }
		return c;
	}

	// CG_DrawClientPing draws to the right of the list, 8 units past its edge.
	function drawPingBars(parent, ping, x, y, maxWidth, maxHeight)
	{
		var count = maxBars();

		var bg = el("div", "sb-rect");
		place(bg, x + 8 - 1, y, maxWidth + 2, maxHeight);
		bg.style.background = css(col("cg_ScoresPing_BgColor"));
		parent.appendChild(bg);

		var bars = pingBarCount(ping);
		var c = pingBarColor(bars);
		var bw = Math.max(1, maxWidth / count - 1);
		var bx = x + 8;
		for (var i = 1; i <= bars; i++)
		{
			var bh = maxHeight * num("cg_scoreboardPingHeight") * i / count;
			var bar = el("div", "sb-rect");
			place(bar, bx, y + maxHeight - bh, bw, bh);
			bar.style.background = css(c);
			parent.appendChild(bar);
			bx += bw + 1;
		}
	}

	/* ---------- ping ladder ---------- */

	// Shows what every ping range turns into, for the values currently set.
	function renderPingLadder()
	{
		if (ladderBox === null) { return; }
		ladderBox.innerHTML = "";

		var count = maxBars();
		var interval = pingInterval();

		for (var bars = count; bars >= 1; bars--)
		{
			var low = (count - bars) * interval;
			var label = bars === 1
				? "from " + low + " ms"
				: low + "–" + (low + interval - 1) + " ms";

			var rowNode = el("div", "sb-step");
			rowNode.appendChild(el("span", "sb-step-ping", label));

			var c = pingBarColor(bars);
			var graph = el("span", "sb-step-bars");
			for (var i = 1; i <= count; i++)
			{
				var bar = el("span", "sb-step-bar");
				bar.style.height = Math.round(100 * i / count) + "%";
				if (i <= bars) { bar.style.background = css(c); }
				graph.appendChild(bar);
			}
			rowNode.appendChild(graph);

			rowNode.appendChild(el("span", "sb-step-value", c.map(fmt).join(" ")));
			ladderBox.appendChild(rowNode);
		}
	}

	function drawRow(parent, cols, listWidth, x, y, rowH, teamColor, player, isMe, myTeam)
	{
		// CG_DrawTeamOfClientScore replaces the alpha you type with the fade
		// alpha, and the row is drawn at half of it. So it is always 0.5.
		var back = el("div", "sb-rect");
		place(back, x, y, listWidth, rowH);
		back.style.background = css(teamColor, 0.5);
		parent.appendChild(back);

		var textColor = isMe ? col("cg_scoreboardMyColor") : [1, 1, 1, 1];
		textColor = [textColor[0], textColor[1], textColor[2], 1];   // its alpha is replaced too

		var baseline = cellBaseline(y, rowH, ROW_FONT);
		var cx = x;
		for (var i = 0; i < cols.length; i++)
		{
			var w = cols[i].w * listWidth;
			var t = cols[i].type;
			if (t === "name")
			{
				drawText(parent, colorCodedSpans(player[0], textColor, myTeam),
					cx, baseline, w, cols[i].align, ROW_FONT);
			}
			else if (t !== "rank" && t !== "status" && t !== "talk")
			{
				var idx = { score: 1, kills: 2, assists: 3, deaths: 4, ping: 5 }[t];
				drawText(parent, [{ text: String(player[idx]), color: textColor }],
					cx, baseline, w, cols[i].align, ROW_FONT);
			}
			cx += w;
		}

		// cx has walked the whole list width, which is where the ping graph starts
		if (state["cg_scoreboardPingGraph"])
		{
			drawPingBars(parent, player[5], cx, y, num("cg_scoreboardPingWidth") * listWidth, rowH);
		}
	}

	function renderPreview()
	{
		if (screenBox === null) { return; }
		screenBox.innerHTML = "";

		var screenWidth = virtualWidth();
		var width = num("cg_scoreboardWidth");
		var height = num("cg_scoreboardHeight");
		var rowH = num("cg_scoreboardItemHeight");
		var bannerH = num("cg_scoreboardBannerHeight");
		var cols = state["cg_scoreboardPingText"] ? COLUMNS_PING : COLUMNS_PLAIN;
		var myTeam = MY_TEAM;

		// CG_BackdropLeft / CG_BackdropTop
		var left = Math.max(0, (screenWidth - width) / 2);
		var top = Math.max(0, (480 - height) / 2);
		var listWidth = width - 6 - 4 - 8;
		var x = left + 3 + 2 + 4;

		var y = top + 3 + 2 + 24 + 1;
		y = y + rowH + 4 + 15;

		// Unscrolled, CG_DrawScoreboard_ScoresList throws away the y the column
		// headers return, so they share their line with the first team banner.
		var headFont = ROW_FONT * 0.85 * (num("cg_scoreboardHeaderFontScale") / 0.35);
		var cx = x;
		for (var i = 0; i < cols.length; i++)
		{
			var w = cols[i].w * listWidth;
			if (cols[i].head)
			{
				drawText(screenBox, [{ text: cols[i].head, color: [1, 1, 1, 1] }],
					cx, y + bannerH, w, 1, headFont);
			}
			cx += w;
		}

		// your own team is drawn first, then the other one
		var teams = [
			{ key: "allies", name: state["g_TeamName_Allies"], color: col("g_ScoresColor_Allies"), rows: SAMPLE.allies },
			{ key: "axis", name: state["g_TeamName_Axis"], color: col("g_ScoresColor_Axis"), rows: SAMPLE.axis }
		];
		if (myTeam === "axis") { teams.reverse(); }

		var bottom = top + height - 3 - 2 - 14 - 1;   // CG_CheckDrawScoreboardLine

		for (var t = 0; t < teams.length; t++)
		{
			if (y + bannerH > bottom) { break; }

			// CG_DrawScoreboard_ListBanner draws no background: only the team
			// icon, the name and the head count.
			var icon = el("div", "sb-icon");
			place(icon, x, y, bannerH, bannerH);
			icon.title = "g_TeamIcon_" + (teams[t].key === "allies" ? "Allies" : "Axis");
			icon.innerHTML = TEAM_ICONS[teams[t].key];   // fixed markup, nothing from the user
			screenBox.appendChild(icon);

			var bx = x + bannerH + 8;
			var spans = colorCodedSpans(teams[t].name, [1, 1, 1, 1], myTeam);
			drawText(screenBox, spans, bx, y + bannerH, listWidth, 0, ROW_FONT);
			drawText(screenBox, [{ text: "( " + teams[t].rows.length + " )", color: [1, 1, 1, 1] }],
				bx + spanWidth(spans, ROW_FONT) + 8, y + bannerH, 60, 0, ROW_FONT);

			y = y + bannerH + 4;
			for (var r = 0; r < teams[t].rows.length; r++)
			{
				if (y + rowH > bottom) { break; }
				drawRow(screenBox, cols, listWidth, x, y, rowH, teams[t].color, teams[t].rows[r],
					teams[t].key === myTeam && r === ME, myTeam);
				y = y + rowH + 4;
			}
			y = y + 4;
		}

		// CG_DrawBackdropServerInfo would put the server name and address along
		// the bottom here. Neither depends on the config, so the preview omits them.

		fitPreview();
	}

	// The virtual screen covers the whole backdrop, so the box keeps the
	// image's aspect ratio and the board lands where the game would put it.
	function fitPreview()
	{
		if (previewBox === null || screenBox === null) { return; }
		screenBox.style.width = virtualWidth() + "px";

		// While the panel is hidden there is nothing to scale against, and
		// scaling by zero would leave the preview invisible. Keep what we have.
		if (previewBox.clientWidth === 0) { return; }

		previewBox.style.height = Math.round(previewBox.clientWidth / bgAspect) + "px";
		screenBox.style.transform = "scale(" + previewBox.clientWidth / virtualWidth() + ")";
	}

	// Ask the backdrop how wide the screen behind the board is.
	function readBackdropAspect()
	{
		if (previewBox === null) { return; }
		var url = /url\(["']?(.*?)["']?\)/.exec(window.getComputedStyle(previewBox).backgroundImage);
		if (url === null) { return; }

		var probe = new window.Image();
		probe.onload = function ()
		{
			if (probe.naturalWidth > 0 && probe.naturalHeight > 0)
			{
				bgAspect = probe.naturalWidth / probe.naturalHeight;
				update();
			}
		};
		probe.src = url[1];
	}

	/* ---------- config output ---------- */

	function valueFor(f)
	{
		if (f.kind === "color") { return parseRgba(state[f.dvar]).map(fmt).join(" "); }
		if (f.kind === "bool") { return state[f.dvar] ? "1" : "0"; }
		if (f.kind === "num") { return fmt(state[f.dvar]); }
		return state[f.dvar];
	}

	function byName(dvar)
	{
		for (var i = 0; i < FIELDS.length; i++)
		{
			if (FIELDS[i].dvar === dvar) { return FIELDS[i]; }
		}
		return null;
	}

	function sortLines(lines)
	{
		return lines.sort(function (a, b)
		{
			var x = a.toLowerCase(), y = b.toLowerCase();
			return x < y ? -1 : x > y ? 1 : 0;
		});
	}

	// The board dvars go in one box and the team dvars in another, because the
	// two are usually pasted into different parts of a config.
	function renderOutput()
	{
		var parts = ["+scores"];
		for (var b = 0; b < IN_BIND.length; b++)
		{
			parts.push(IN_BIND[b] + " " + valueFor(byName(IN_BIND[b])));
		}

		outBind.textContent = 'bind TAB "' + parts.join(";") + '"';

		var board = [], teams = [];
		for (var j = 0; j < FIELDS.length; j++)
		{
			var line = "seta " + FIELDS[j].dvar + ' "' + valueFor(FIELDS[j]) + '"';
			if (FIELDS[j].dvar.indexOf("cg_") === 0) { board.push(line); }
			else { teams.push(line); }
		}

		outBoard.textContent = sortLines(board).join("\n");
		outTeams.textContent = sortLines(teams).join("\n");
	}

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
			var ok = false;
			try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
			document.body.removeChild(helper);
			if (ok) { resolve(); } else { reject(new Error("copy rejected")); }
		});
	}

	/* ---------- controls ---------- */

	function update()
	{
		renderPreview();
		renderPingLadder();
		renderOutput();
		markActivePreset();
	}

	/* ---------- colour presets ---------- */

	// The three dvars a preset touches all ignore the alpha you give them: rows
	// are drawn at a fixed half, and the two text colours take the fade alpha.
	// So the swatches show the colour opaque, and the exact value sits beside it.
	function presetSwatch(part, value)
	{
		var cell = el("div", "sb-part");
		cell.title = part.label + " " + value;   // the exact numbers, on hover
		var dot = el("span", "sb-swatch");
		dot.style.background = css(parseRgba(value), 1);
		cell.appendChild(dot);
		cell.appendChild(el("span", "sb-part-label", part.label));
		return cell;
	}

	function presetMatchesState(preset)
	{
		for (var i = 0; i < PRESET_PARTS.length; i++)
		{
			var wanted = parseRgba(preset[PRESET_PARTS[i].key]).join(" ");
			for (var d = 0; d < PRESET_PARTS[i].dvars.length; d++)
			{
				if (parseRgba(state[PRESET_PARTS[i].dvars[d]]).join(" ") !== wanted) { return false; }
			}
		}
		return true;
	}

	function markActivePreset()
	{
		if (presetsBox === null) { return; }
		var rows = presetsBox.querySelectorAll(".sb-preset");
		for (var i = 0; i < rows.length; i++)
		{
			var on = presetMatchesState(PRESETS[i]);
			rows[i].classList.toggle("is-active", on);
			rows[i].setAttribute("aria-pressed", on ? "true" : "false");
		}
	}

	function applyPreset(preset)
	{
		for (var i = 0; i < PRESET_PARTS.length; i++)
		{
			var value = preset[PRESET_PARTS[i].key];
			for (var d = 0; d < PRESET_PARTS[i].dvars.length; d++)
			{
				state[PRESET_PARTS[i].dvars[d]] = value;
			}
		}
		buildControls();   // the colour fields have to show the new values
		update();
		setHint(preset.name + " applied.");
	}

	function buildPresets()
	{
		if (presetsBox === null) { return; }
		presetsBox.innerHTML = "";

		for (var i = 0; i < PRESETS.length; i++)
		{
			var preset = PRESETS[i];
			var row = el("button", "sb-preset");
			row.type = "button";
			row.setAttribute("aria-pressed", "false");
			row.appendChild(el("span", "sb-preset-name", preset.name));

			for (var p = 0; p < PRESET_PARTS.length; p++)
			{
				row.appendChild(presetSwatch(PRESET_PARTS[p], preset[PRESET_PARTS[p].key]));
			}

			row.addEventListener("click", (function (chosen)
			{
				return function () { applyPreset(chosen); };
			}(preset)));

			presetsBox.appendChild(row);
		}

		fitPresetNames();
	}

	// The name column is as wide as the longest name, so adding a longer one
	// never makes it wrap. Measured on a canvas, which also answers while the
	// panel is still hidden.
	function fitPresetNames()
	{
		var names = presetsBox.querySelectorAll(".sb-preset-name");
		if (names.length === 0) { return; }

		var style = window.getComputedStyle(names[0]);
		var font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;

		var widest = 0;
		for (var i = 0; i < names.length; i++)
		{
			widest = Math.max(widest, measureWith(font, names[i].textContent));
		}

		presetsBox.style.setProperty("--sb-name-width", Math.ceil(widest) + 4 + "px");
	}

	function makeControl(f)
	{
		var row = el("div", "sb-field");
		var label = el("label", "sb-label", f.label || f.dvar);
		label.title = f.dvar;
		var id = "sb-" + f.dvar;
		label.setAttribute("for", id);
		row.appendChild(label);

		// Built from the live value, not from the default: buildControls also runs
		// after a preset has changed the state, and the fields have to follow.
		var current = state[f.dvar];

		if (f.kind === "color")
		{
			var wrap = el("div", "sb-colorwrap");
			var picker = el("input");
			picker.type = "color"; picker.className = "kf-color"; picker.id = id;
			picker.value = toHex(parseRgba(current));
			picker.setAttribute("aria-label", f.dvar);
			var text = el("input");
			text.type = "text"; text.className = "sb-value"; text.value = current;
			text.id = id + "-value";
			text.spellcheck = false; text.autocomplete = "off";
			text.setAttribute("aria-label", f.dvar + " value");

			picker.addEventListener("input", function ()
			{
				var a = parseRgba(state[f.dvar])[3];
				state[f.dvar] = hexToRgba(picker.value, a).map(fmt).join(" ");
				text.value = state[f.dvar];
				update();
			});
			text.addEventListener("input", function ()
			{
				state[f.dvar] = text.value;
				picker.value = toHex(parseRgba(text.value));
				update();
			});

			wrap.appendChild(picker); wrap.appendChild(text);
			row.appendChild(wrap);
		}
		else if (f.kind === "bool")
		{
			var slot = el("div", "sb-slot");
			var box = el("input");
			box.type = "checkbox"; box.className = "sb-check"; box.id = id;
			box.checked = !!current;
			box.addEventListener("change", function () { state[f.dvar] = box.checked ? 1 : 0; update(); });
			slot.appendChild(box);
			row.appendChild(slot);
		}
		else
		{
			var input = el("input");
			input.type = f.kind === "num" ? "number" : "text";
			input.className = "sb-value"; input.id = id;
			input.value = current;
			if (f.kind === "num") { input.min = f.min; input.max = f.max; input.step = f.step; }
			input.spellcheck = false; input.autocomplete = "off";
			input.addEventListener("input", function () { state[f.dvar] = input.value; update(); });
			row.appendChild(input);
		}

		return row;
	}

	function buildControls()
	{
		controlsBox.innerHTML = "";
		var groups = [];
		for (var i = 0; i < FIELDS.length; i++)
		{
			if (groups.indexOf(FIELDS[i].group) === -1) { groups.push(FIELDS[i].group); }
		}

		for (var g = 0; g < groups.length; g++)
		{
			var card = el("div", "sb-group");
			card.appendChild(el("h2", "rc-title", groups[g]));
			for (var j = 0; j < FIELDS.length; j++)
			{
				if (FIELDS[j].group === groups[g]) { card.appendChild(makeControl(FIELDS[j])); }
			}
			if (groups[g] === "Ping")
			{
				ladderBox = el("div", "sb-ladder");
				ladderBox.id = "sb-ladder";
				card.appendChild(ladderBox);
			}
			controlsBox.appendChild(card);
		}
	}

	function resetState()
	{
		for (var i = 0; i < FIELDS.length; i++) { state[FIELDS[i].dvar] = FIELDS[i].def; }
	}

	function init()
	{
		controlsBox = document.getElementById("sb-controls");
		presetsBox = document.getElementById("sb-presets");
		screenBox = document.getElementById("sb-screen");
		previewBox = document.getElementById("sb-preview");
		outBind = document.getElementById("sb-out-bind");
		outBoard = document.getElementById("sb-out-board");
		outTeams = document.getElementById("sb-out-teams");
		hint = document.getElementById("sb-hint");

		if (controlsBox === null || screenBox === null || outBind === null) { return; }
		if (hint !== null) { defaultHint = hint.textContent; }

		resetState();
		buildControls();
		buildPresets();
		update();
		readBackdropAspect();

		window.addEventListener("resize", fitPreview);

		// The panel starts hidden, so the preview has no width to scale against
		// yet. Refit the moment the tab reveals it. The tablist is the reliable
		// signal here; the observer below only adds later width changes.
		var tabButton = document.getElementById("tab-sb");
		if (tabButton !== null && tabButton.parentNode !== null)
		{
			tabButton.parentNode.addEventListener("click", fitPreview);
			tabButton.parentNode.addEventListener("keyup", fitPreview);
		}

		if (typeof window.ResizeObserver === "function")
		{
			var lastWidth = previewBox.clientWidth;
			previewWatcher = new window.ResizeObserver(function ()
			{
				// fitPreview sets the height, so react to width alone or it loops
				if (previewBox.clientWidth === lastWidth) { return; }
				lastWidth = previewBox.clientWidth;
				fitPreview();
			});
			previewWatcher.observe(previewBox);
		}

		var reset = document.getElementById("sb-reset");
		if (reset !== null)
		{
			reset.addEventListener("click", function ()
			{
				resetState();
				buildControls();
				update();
				setHint("Back to the game defaults.");
			});
		}

		wireCopy("sb-copy-bind", outBind, "Bind line copied.");
		wireCopy("sb-copy-board", outBoard, "Scoreboard lines copied.");
		wireCopy("sb-copy-teams", outTeams, "Team lines copied.");
	}

	function wireCopy(buttonId, source, message)
	{
		var button = document.getElementById(buttonId);
		if (button === null || source === null) { return; }

		button.addEventListener("click", function ()
		{
			copyText(source.textContent).then(function ()
			{
				setHint(message);
			}, function ()
			{
				setHint("Could not copy \u2014 select the text and copy manually.", true);
			});
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
