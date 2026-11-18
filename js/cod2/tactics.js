/*
 * CoD2 tactics board: draw on a map's overhead image (maps tab) to present a
 * tactic. Nothing is saved: the drawing is gone when the board closes, the map
 * changes or the page reloads; only the PNG export keeps it.
 *
 * Two drawing layers, one per side: Allies (the map's nation) and Axis
 * (German). The left toolbar draws on the Allies layer, the right one on the
 * Axis layer; each layer has its own phases, undo / redo and visibility, and
 * everything on it takes the side's scoreboard color (window.COD2_NAMES.teams).
 *
 * Under the drawing, fixed and not editable: the S&D spawns of both sides and
 * the bomb sites A and B (window.COD2_SD, js/cod2/tactics-data.js), placed with
 * the world rectangle of the image (map.world): u = (x - minX) / width,
 * v = (maxY - y) / height. Who attacks comes from the map script
 * (map.attackers). Grenades show the side's HUD icon (window.COD2_GRENADES); a
 * frag shows its real 256-unit radius, the scale bar game units.
 *
 * Drawings are kept in map coordinates (0..1 across the image) and sizes in
 * fractions of the image width, so they stay in place whatever size the board
 * has. The images come from js/cod2/maps/<map>.js as data URLs, so the canvas
 * stays exportable on file:// too.
 *
 * window.COD2_TACTICS.open(map, view, onClose): map from window.COD2_MAPS,
 * view "topdown" or "radar". state(): a copy of both layers, for checks.
 */
window.COD2_TACTICS = (function ()
{
	"use strict";

	var el = window.UI.el;

	var SIDES = ["allies", "axis"];
	var FALLBACK = { allies: [64, 191, 64], axis: [153, 153, 153] };
	var SITE_COLOR = "#ff3b30";
	var WIDTH_UNIT = 0.0022;          // line width 1 = 0.22% of the image
	var PLAYER_R = 0.022;
	var SMOKE_R = 0.05;
	var FRAG_R = 0.045;               // when the image has no world rectangle
	var ICON_R = 0.016;               // a grenade's HUD icon
	var CONE_SPREAD = 80;             // degrees: cg_fov's default
	var SPAWN_PAD = 56;               // units around the spawn points for their zone
	var LASER_MS = 1500;
	var PLAY_MS = 2000;
	var HISTORY_MAX = 100;

	// key: the shortcut; icon: an SVG path set drawn with currentColor.
	var GROUPS = [
		{ name: "Select", tools: [
			{ id: "select", key: "v", label: "Select, move, resize and bend; Delete removes", icon: '<path d="M5 3l11 7-5 1.5L8.5 17z" fill="currentColor"/>' }
		] },
		{ name: "Draw", tools: [
			{ id: "arrow", key: "a", label: "Arrow (select it and drag the middle handle to bend it)", icon: '<path d="M3 16L15 4M9 4h6v6" fill="none"/>' },
			{ id: "pen", key: "p", label: "Pen", icon: '<path d="M3 15c3-6 5 2 8-3s3-6 6-8" fill="none"/>' },
			{ id: "line", key: "l", label: "Line", icon: '<path d="M3 17L17 3" fill="none"/>' },
			{ id: "rect", key: "r", label: "Rectangle", icon: '<rect x="3" y="5" width="14" height="10" fill="none"/>' },
			{ id: "ellipse", key: "o", label: "Circle / ellipse", icon: '<ellipse cx="10" cy="10" rx="7" ry="5.5" fill="none"/>' },
			{ id: "area", key: "d", label: "Filled area", icon: '<path d="M4 6l6-3 7 5-3 8-9-1z" fill="currentColor" fill-opacity=".35"/>' },
			{ id: "text", key: "t", label: "Text (click, type, Enter)", icon: '<path d="M4 5h12M10 5v11" fill="none"/>' }
		] },
		{ name: "Markers", tools: [
			{ id: "player", key: "m", label: "Player 1–5 (keys 1–5 pick the number)", icon: '<circle cx="10" cy="10" r="6.5" fill="none"/><path d="M9 7.5l1.5-1v7" fill="none"/>' },
			{ id: "cone", key: "c", label: "View cone, 80° like cg_fov (drag to aim)", icon: '<path d="M4 15L16 5M4 15L17 12" fill="none"/><path d="M4 15L16 5Q18 9 17 12z" fill="currentColor" fill-opacity=".3"/>' }
		] },
		{ name: "Grenades", tools: [
			{ id: "smoke", key: "s", label: "Smoke grenade (drag from the thrower for a throw path)", icon: '<circle cx="8" cy="11" r="4.5" fill="currentColor" fill-opacity=".45"/><circle cx="12.5" cy="8.5" r="4.5" fill="currentColor" fill-opacity=".45"/>' },
			{ id: "frag", key: "g", label: "Frag grenade, 256-unit radius (drag from the thrower for a throw path)", icon: '<circle cx="10" cy="10" r="2.5" fill="currentColor"/><circle cx="10" cy="10" r="7" fill="none" stroke-dasharray="2.5 2"/>' }
		] },
		{ name: "Erase / point", tools: [
			{ id: "eraser", key: "e", label: "Eraser (only this side's drawing)", icon: '<path d="M7 16l-3.5-3.5 8-8 6 6-6 6H17" fill="none"/>' },
			{ id: "laser", key: "x", label: "Laser pointer (fades, nothing is kept)", icon: '<circle cx="14" cy="6" r="2.5" fill="currentColor"/><path d="M3 17l9-9" fill="none" stroke-dasharray="2 2"/>' }
		] }
	];
	var TOOLS = [].concat.apply([], GROUPS.map(function (g) { return g.tools; }));
	var ICON = {
		eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none"/><circle cx="10" cy="10" r="2.5" fill="currentColor"/>',
		eyeOff: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none"/><path d="M3 17L17 3" fill="none"/>',
		undo: '<path d="M7 5L3 9l4 4M3 9h9a5 5 0 010 10H9" fill="none"/>',
		redo: '<path d="M13 5l4 4-4 4M17 9H8a5 5 0 000 10h3" fill="none"/>',
		clear: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" fill="none"/>',
		style: '<path d="M3 6h8M15 6h2M3 14h2M9 14h8" fill="none"/><circle cx="13" cy="6" r="2" fill="none"/><circle cx="7" cy="14" r="2" fill="none"/>'
	};

	var board = null;           // the board's elements, built on the first open
	var map = null;
	var sd = null;              // window.COD2_SD[map.id]
	var view = "topdown";
	var image = null;           // the background as an Image (for drawing and export)
	var onClose = null;

	// Per side: { phases: [{ name, objects }], current, history, future, visible, number }.
	var layers = null;
	var active = "allies";
	var selected = null;        // index into the active layer's current phase
	var tool = "arrow";
	var opts = { width: 4, opacity: 1, dashed: false, onion: false, cursor: false, scale: true, spawns: true, sites: true, legend: true };
	var icons = {};             // grenade icon name -> Image (data URL, keeps the export canvas clean)
	var helpShown = false;      // the "how to use" card, once per page load

	var size = 0;               // the drawing's size on screen, CSS pixels
	var drag = null;            // what the pointer is doing
	var draft = null;           // an object being drawn
	var laser = [];             // { x, y, t } of the laser trail
	var pointer = null;         // last pointer position (normalised), for the cursor highlight
	var playTimer = 0;
	var playStep = 0;
	var animating = false;
	var confirmAction = null;

	/* ---------- layers and history ---------- */

	function newLayer()
	{
		return { phases: [{ name: "Setup", objects: [] }], current: 0, history: [], future: [], visible: true, number: 1 };
	}

	function layer(side)
	{
		return layers[side || active];
	}

	function objects(side)
	{
		var l = layer(side);
		return l.phases[l.current].objects;
	}

	function snapshot(side)
	{
		var l = layer(side);
		return JSON.stringify({ phases: l.phases, current: l.current });
	}

	function restore(side, text)
	{
		var s = JSON.parse(text);
		var l = layer(side);
		l.phases = s.phases;
		l.current = Math.min(s.current, l.phases.length - 1);
		selected = null;
	}

	// Call before every change of the active layer (or with a snapshot taken
	// earlier, once the change happens); undo goes back to this point.
	function remember(before)
	{
		var l = layer();
		l.history.push(before || snapshot());
		if (l.history.length > HISTORY_MAX)
		{
			l.history.shift();
		}
		l.future = [];
	}

	function undo(side)
	{
		side = side || active;
		var l = layer(side);
		if (!l.history.length)
		{
			return;
		}
		l.future.push(snapshot(side));
		restore(side, l.history.pop());
		refresh();
	}

	function redo(side)
	{
		side = side || active;
		var l = layer(side);
		if (!l.future.length)
		{
			return;
		}
		l.history.push(snapshot(side));
		restore(side, l.future.pop());
		refresh();
	}

	// The active layer is the one whose toolbar was used last; it is always shown.
	function setActive(side)
	{
		if (side !== active)
		{
			closeTextInput(true);
			active = side;
			selected = null;
			draft = null;
		}
		if (!layers[side].visible)
		{
			layers[side].visible = true;
		}
		refresh();
	}

	// show: "allies", "axis" or "both".
	function showLayers(show)
	{
		SIDES.forEach(function (side) { layers[side].visible = show === "both" || show === side; });
		if (!layers[active].visible)
		{
			active = show;
			selected = null;
		}
		refresh();
	}

	function toggleLayer(side)
	{
		var other = side === "allies" ? "axis" : "allies";
		if (layers[side].visible && !layers[other].visible)
		{
			return;     // one layer stays visible
		}
		layers[side].visible = !layers[side].visible;
		if (!layers[active].visible)
		{
			active = other;
			selected = null;
		}
		refresh();
	}

	/* ---------- sides, grenades, scale ---------- */

	function hex(rgb)
	{
		return "#" + rgb.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
	}

	// The nation of a side on this map: { id, name, rgb } from the scoreboard data.
	function nation(side)
	{
		var teams = window.COD2_NAMES && window.COD2_NAMES.teams;
		if (side === "axis")
		{
			return teams && teams.axis.id === map.axis ? teams.axis : { id: map.axis, name: map.axis, rgb: FALLBACK.axis };
		}
		var found = teams ? teams.allies.filter(function (t) { return t.id === map.allies; })[0] : null;
		return found || { id: map.allies, name: map.allies, rgb: FALLBACK.allies };
	}

	function sideColor(side)
	{
		return hex(nation(side).rgb);
	}

	// Dark or light text on the side's color.
	function sideInk(side)
	{
		var c = nation(side).rgb;
		return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 140 ? "#111" : "#fff";
	}

	function sideWord(side)
	{
		var text = window.COD2_NAMES && window.COD2_NAMES.chat ? window.COD2_NAMES.chat.text : {};
		return text[side] || (side === "axis" ? "Axis" : "Allies");
	}

	// "Allies – British", as the game names the side and its nation.
	function sideName(side)
	{
		return sideWord(side) + " – " + nation(side).name;
	}

	// The side's role in S&D on this map.
	function role(side)
	{
		return map.attackers === side ? "attack" : "defense";
	}

	function grenade(kind, side)
	{
		var data = window.COD2_GRENADES;
		return data && data[kind] ? data[kind][nation(side).id] || null : null;
	}

	function iconImage(name)
	{
		var data = window.COD2_GRENADES;
		if (!icons[name] && data && data.icons[name])
		{
			icons[name] = new Image();
			icons[name].onload = function () { renderMain(); };
			icons[name].src = data.icons[name];
		}
		return icons[name] && icons[name].complete && icons[name].naturalWidth ? icons[name] : null;
	}

	function worldRect()
	{
		return map && map.world ? map.world[view] || null : null;
	}

	// Game units across the image (its world rectangle's width), 0 if unknown.
	function worldWidth()
	{
		var r = worldRect();
		return r ? r[2] - r[0] : 0;
	}

	// World (x, y) to map coordinates (0..1), x east and y north.
	function toUV(x, y)
	{
		var r = worldRect();
		return [(x - r[0]) / (r[2] - r[0]), (r[3] - y) / (r[3] - r[1])];
	}

	// A frag's radius in map units: explosionRadius (256) over the image's width in units.
	function fragR(side)
	{
		var w = worldWidth();
		var g = grenade("frag", side);
		return w ? (g ? g.radius : 256) / w : FRAG_R;
	}

	function scaleLength(w)
	{
		var target = w * 0.2;
		var step = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
		return [5, 2, 1].map(function (f) { return f * step; }).filter(function (v) { return v <= target; })[0] || step;
	}

	// A box with a dark background, for the scale bar and the legend.
	function plate(ctx, x, y, w, h)
	{
		ctx.fillStyle = "rgba(0,0,0,0.66)";
		ctx.fillRect(x, y, w, h);
	}

	// A scale bar in game units, bottom left.
	function drawScale(ctx, S)
	{
		var w = worldWidth();
		if (!opts.scale || !w)
		{
			return;
		}
		var units = scaleLength(w);
		var len = units / w * S;
		var fs = Math.max(11, S * 0.02);
		var pad = fs * 0.5;
		var bar = Math.max(4, S * 0.006);
		var x = S * 0.03 + pad;
		var y = S * 0.97 - pad;
		var label = units + " units";
		ctx.save();
		ctx.font = "700 " + fs + "px sans-serif";
		var tw = Math.max(len, ctx.measureText(label).width);
		plate(ctx, x - pad, y - bar - fs * 1.3 - pad, tw + pad * 2, bar + fs * 1.3 + pad * 2);
		for (var i = 0; i < 4; i++)
		{
			ctx.fillStyle = i % 2 ? "#111" : "#fff";
			ctx.fillRect(x + len * i / 4, y - bar, len / 4, bar);
		}
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1;
		ctx.strokeRect(x, y - bar, len, bar);
		ctx.fillStyle = "#fff";
		ctx.textBaseline = "alphabetic";
		ctx.textAlign = "left";
		ctx.fillText(label, x, y - bar - fs * 0.35);
		ctx.restore();
	}

	/* ---------- the fixed overlay: spawns and bomb sites ---------- */

	// Convex hull (monotone chain) of [x, y] points.
	function hull(points)
	{
		var p = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
		if (p.length < 3)
		{
			return p;
		}
		var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
		var lower = [];
		var upper = [];
		p.forEach(function (q)
		{
			while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) { lower.pop(); }
			lower.push(q);
		});
		p.slice().reverse().forEach(function (q)
		{
			while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) { upper.pop(); }
			upper.push(q);
		});
		return lower.slice(0, -1).concat(upper.slice(0, -1));
	}

	// Spawn points in groups (indexes): points closer than SPAWN_GAP units join a
	// group, so a side that spawns in two places (mp_harbor) gets two zones.
	var SPAWN_GAP = 400;
	function spawnGroups(spawns)
	{
		var group = spawns.map(function (s, i) { return i; });
		var find = function (i) { while (group[i] !== i) { i = group[i]; } return i; };
		spawns.forEach(function (a, i)
		{
			spawns.forEach(function (b, j)
			{
				if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < SPAWN_GAP)
				{
					group[find(j)] = find(i);
				}
			});
		});
		var out = {};
		spawns.forEach(function (s, i) { (out[find(i)] = out[find(i)] || []).push(i); });
		return Object.keys(out).map(function (k) { return out[k]; });
	}

	function spawnSide(spawnRole)
	{
		return spawnRole === "attacker" ? sd.attackers : sd.defenders;
	}

	// A spawn group's zone: the hull of its points, widened by SPAWN_PAD, drawn
	// opaque on a scratch canvas and then see-through, so overlaps do not darken.
	function drawSpawnZone(ctx, pts, color, S)
	{
		var h = hull(pts);
		var pad = SPAWN_PAD / worldWidth() * S * 2;
		var edge = Math.max(2, S * 0.0025);
		// shape(z, extra): the widened hull, filled, with extra pixels around it.
		var shape = function (z, extra)
		{
			z.lineJoin = "round";
			z.lineCap = "round";
			z.lineWidth = pad + extra * 2;
			z.beginPath();
			h.forEach(function (q, i) { if (i) { z.lineTo(q[0] * S, q[1] * S); } else { z.moveTo(q[0] * S, q[1] * S); } });
			z.closePath();
			z.fill();
			z.stroke();
		};
		var layerOf = function ()
		{
			var c = document.createElement("canvas");
			c.width = ctx.canvas.width;
			c.height = ctx.canvas.height;
			var z = c.getContext("2d");
			z.setTransform(ctx.getTransform());
			z.fillStyle = color;
			z.strokeStyle = color;
			return { canvas: c, ctx: z };
		};
		var fill = layerOf();
		shape(fill.ctx, 0);
		// The edge: the shape one edge wider, minus the shape; a dark line outside it.
		var ring = layerOf();
		ring.ctx.fillStyle = ring.ctx.strokeStyle = "rgba(0,0,0,0.6)";
		shape(ring.ctx, edge * 2);
		ring.ctx.fillStyle = ring.ctx.strokeStyle = color;
		shape(ring.ctx, edge);
		ring.ctx.globalCompositeOperation = "destination-out";
		shape(ring.ctx, 0);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 0.38;
		ctx.drawImage(fill.canvas, 0, 0);
		ctx.globalAlpha = 1;
		ctx.drawImage(ring.canvas, 0, 0);
		ctx.restore();
	}

	// One spawn point: a triangle pointing where the player faces.
	function drawSpawn(ctx, q, yaw, color, S)
	{
		var r = Math.max(5, S * 0.008);
		var a = -yaw * Math.PI / 180;       // north is up: the image's y runs south
		var x = q[0] * S;
		var y = q[1] * S;
		ctx.beginPath();
		ctx.moveTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5);
		ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
		ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
		ctx.lineWidth = Math.max(1, r * 0.22);
		ctx.strokeStyle = "rgba(0,0,0,0.8)";
		ctx.stroke();
	}

	function label(ctx, text, x, y, fs, color)
	{
		ctx.font = "800 " + fs + "px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = fs * 0.28;
		ctx.strokeStyle = "rgba(0,0,0,0.85)";
		ctx.strokeText(text, x, y);
		ctx.fillStyle = color;
		ctx.fillText(text, x, y);
	}

	function drawFixed(ctx, S)
	{
		if (!sd || !worldRect())
		{
			return;
		}
		ctx.save();
		if (opts.sites)
		{
			sd.sites.forEach(function (site)
			{
				var a = toUV(site.rect[0], site.rect[3]);
				var b = toUV(site.rect[2], site.rect[1]);
				ctx.fillStyle = "rgba(255,59,48,0.2)";
				ctx.fillRect(a[0] * S, a[1] * S, (b[0] - a[0]) * S, (b[1] - a[1]) * S);
				ctx.strokeStyle = SITE_COLOR;
				ctx.lineWidth = Math.max(2, S * 0.003);
				ctx.strokeRect(a[0] * S, a[1] * S, (b[0] - a[0]) * S, (b[1] - a[1]) * S);
				var c = toUV(site.origin[0], site.origin[1]);
				var r = Math.max(10, S * 0.017);
				ctx.beginPath();
				ctx.arc(c[0] * S, c[1] * S, r, 0, Math.PI * 2);
				ctx.fillStyle = SITE_COLOR;
				ctx.fill();
				ctx.lineWidth = Math.max(1.5, r * 0.14);
				ctx.strokeStyle = "#fff";
				ctx.stroke();
				ctx.font = "800 " + r * 1.25 + "px sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillStyle = "#fff";
				ctx.fillText(site.label, c[0] * S, c[1] * S + r * 0.05);
			});
		}
		if (opts.spawns)
		{
			["attacker", "defender"].forEach(function (spawnRole)
			{
				var color = sideColor(spawnSide(spawnRole));
				var pts = sd.spawns[spawnRole].map(function (s) { return toUV(s[0], s[1]); });
				var groups = spawnGroups(sd.spawns[spawnRole]);
				groups.forEach(function (g) { drawSpawnZone(ctx, g.map(function (i) { return pts[i]; }), color, S); });
				sd.spawns[spawnRole].forEach(function (s, i) { drawSpawn(ctx, pts[i], s[3], color, S); });
				// Each zone's name above it.
				var fs = Math.max(10, S * 0.015);
				groups.forEach(function (g)
				{
					var gp = g.map(function (i) { return pts[i]; });
					var top = gp.reduce(function (m, q) { return q[1] < m[1] ? q : m; }, gp[0]);
					var cx = gp.reduce(function (t, q) { return t + q[0]; }, 0) / gp.length;
					label(ctx, spawnRole === "attacker" ? "ATTACK SPAWN" : "DEFENSE SPAWN", cx * S,
						top[1] * S - SPAWN_PAD / worldWidth() * S - fs * 0.8, fs, "#fff");
				});
			});
		}
		ctx.restore();
	}

	// What the markers mean and which nation attacks, top left.
	function drawLegend(ctx, S)
	{
		if (!opts.legend || !sd || !worldRect() || !(opts.spawns || opts.sites))
		{
			return;
		}
		var fs = Math.max(11, S * 0.017);
		var rows = [];
		if (opts.spawns)
		{
			rows.push({ side: sd.attackers, text: "Attack spawn · " + sideName(sd.attackers) });
			rows.push({ side: sd.defenders, text: "Defense spawn · " + sideName(sd.defenders) });
		}
		if (opts.sites)
		{
			rows.push({ site: true, text: "Bomb sites A / B (plant area)" });
		}
		ctx.save();
		ctx.font = "600 " + fs + "px sans-serif";
		var w = Math.max.apply(null, rows.map(function (r) { return ctx.measureText(r.text).width; })) + fs * 2.4;
		var line = fs * 1.6;
		var pad = fs * 0.6;
		var x = S * 0.03;
		var y = S * 0.03;
		plate(ctx, x, y, w + pad * 2, rows.length * line + pad * 2);
		rows.forEach(function (r, i)
		{
			var cy = y + pad + line * (i + 0.5);
			var cx = x + pad + fs * 0.7;
			if (r.site)
			{
				ctx.fillStyle = SITE_COLOR;
				ctx.beginPath();
				ctx.arc(cx, cy, fs * 0.55, 0, Math.PI * 2);
				ctx.fill();
			}
			else
			{
				drawSpawn(ctx, [cx / S, cy / S], 90, sideColor(r.side), S);
			}
			ctx.fillStyle = "#fff";
			ctx.font = "600 " + fs + "px sans-serif";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(r.text, x + pad + fs * 1.8, cy);
		});
		ctx.restore();
	}

	/* ---------- geometry ---------- */

	function dist(a, b)
	{
		return Math.hypot(a[0] - b[0], a[1] - b[1]);
	}

	function segDist(p, a, b)
	{
		var dx = b[0] - a[0];
		var dy = b[1] - a[1];
		var len = dx * dx + dy * dy;
		var t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
		return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
	}

	function polyDist(p, pts)
	{
		var best = Infinity;
		for (var i = 1; i < pts.length; i++)
		{
			best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
		}
		return pts.length === 1 ? dist(p, pts[0]) : best;
	}

	function inPolygon(p, pts)
	{
		var inside = false;
		for (var i = 0, j = pts.length - 1; i < pts.length; j = i++)
		{
			if ((pts[i][1] > p[1]) !== (pts[j][1] > p[1]) &&
				p[0] < (pts[j][0] - pts[i][0]) * (p[1] - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0])
			{
				inside = !inside;
			}
		}
		return inside;
	}

	// The points of a quadratic curve from a over c to b.
	function curvePoints(a, c, b)
	{
		var out = [];
		for (var i = 0; i <= 24; i++)
		{
			var t = i / 24;
			var u = 1 - t;
			out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
		}
		return out;
	}

	function arrowPath(o)
	{
		return o.c ? curvePoints(o.p0, o.c, o.p1) : [o.p0, o.p1];
	}

	function conePoints(o)
	{
		var a = o.dir - o.spread / 2;
		var b = o.dir + o.spread / 2;
		return [o.p, [o.p[0] + Math.cos(a) * o.len, o.p[1] + Math.sin(a) * o.len], [o.p[0] + Math.cos(b) * o.len, o.p[1] + Math.sin(b) * o.len]];
	}

	function textSize(o)
	{
		return 0.022 + o.width * 0.003;
	}

	var scratch = null;
	function scratchContext()
	{
		if (!scratch)
		{
			scratch = document.createElement("canvas").getContext("2d");
		}
		return scratch;
	}

	// Text width in map units; measured at a large font size, since tiny ones round badly.
	function textWidth(o)
	{
		var ctx = scratchContext();
		ctx.font = "700 " + textSize(o) * 1000 + "px sans-serif";
		return ctx.measureText(o.text).width / 1000;
	}

	// How far p (normalised) is from the object, in normalised units; 0 inside.
	function hitDistance(o, p)
	{
		switch (o.type)
		{
			case "arrow":
				return polyDist(p, arrowPath(o));
			case "line":
				return segDist(p, o.p0, o.p1);
			case "pen":
				return polyDist(p, o.pts);
			case "area":
				return inPolygon(p, o.pts) ? 0 : polyDist(p, o.pts.concat([o.pts[0]]));
			case "rect":
				var x0 = Math.min(o.p0[0], o.p1[0]), x1 = Math.max(o.p0[0], o.p1[0]);
				var y0 = Math.min(o.p0[1], o.p1[1]), y1 = Math.max(o.p0[1], o.p1[1]);
				return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1 ? 0 :
					polyDist(p, [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
			case "ellipse":
				var cx = (o.p0[0] + o.p1[0]) / 2, cy = (o.p0[1] + o.p1[1]) / 2;
				var rx = Math.abs(o.p1[0] - o.p0[0]) / 2 || 1e-6, ry = Math.abs(o.p1[1] - o.p0[1]) / 2 || 1e-6;
				var k = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry);
				return k <= 1 ? 0 : (k - 1) * Math.min(rx, ry);
			case "text":
				var w = textWidth(o);
				var h = textSize(o);
				return p[0] >= o.p[0] && p[0] <= o.p[0] + w && p[1] >= o.p[1] - h && p[1] <= o.p[1] + h * 0.3 ? 0 : Infinity;
			case "player":
				return Math.max(0, dist(p, o.p) - PLAYER_R);
			case "smoke":
			case "frag":
				var r = o.type === "smoke" ? SMOKE_R : ICON_R;
				var d = Math.max(0, dist(p, o.p) - r);
				return o.from ? Math.min(d, segDist(p, o.from, o.p)) : d;
			case "cone":
				var pts = conePoints(o);
				return inPolygon(p, pts) ? 0 : polyDist(p, pts.concat([pts[0]]));
		}
		return Infinity;
	}

	// The topmost object of the active layer's current phase under p, or -1.
	function hitTest(p)
	{
		var list = objects();
		var tolerance = 12 / size;
		for (var i = list.length - 1; i >= 0; i--)
		{
			var o = list[i];
			if (hitDistance(o, p) <= tolerance + o.width * WIDTH_UNIT / 2)
			{
				return i;
			}
		}
		return -1;
	}

	function handles(o)
	{
		switch (o.type)
		{
			case "arrow":
				return [{ key: "p0", p: o.p0 }, { key: "p1", p: o.p1 },
					{ key: "c", p: o.c || [(o.p0[0] + o.p1[0]) / 2, (o.p0[1] + o.p1[1]) / 2], bend: true }];
			case "line":
			case "rect":
			case "ellipse":
				return [{ key: "p0", p: o.p0 }, { key: "p1", p: o.p1 }];
			case "cone":
				var pts = conePoints(o);
				return [{ key: "tip", p: [o.p[0] + Math.cos(o.dir) * o.len, o.p[1] + Math.sin(o.dir) * o.len] }, { key: "spread", p: pts[2], bend: true }];
			case "smoke":
			case "frag":
				return o.from ? [{ key: "from", p: o.from }] : [];
		}
		return [];
	}

	function moveObject(o, dx, dy)
	{
		["p", "p0", "p1", "c", "from"].forEach(function (k)
		{
			if (o[k])
			{
				o[k] = [o[k][0] + dx, o[k][1] + dy];
			}
		});
		if (o.pts)
		{
			o.pts = o.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
		}
	}

	function setHandle(o, key, p)
	{
		if (key === "tip")
		{
			o.dir = Math.atan2(p[1] - o.p[1], p[0] - o.p[0]);
			o.len = Math.max(0.02, dist(p, o.p));
		}
		else if (key === "spread")
		{
			var a = Math.atan2(p[1] - o.p[1], p[0] - o.p[0]) - o.dir;
			a = Math.atan2(Math.sin(a), Math.cos(a));
			o.spread = Math.max(0.09, Math.min(Math.PI * 1.6, Math.abs(a) * 2));
		}
		else
		{
			o[key] = p;
		}
	}

	/* ---------- drawing ---------- */

	function dashFor(o, w)
	{
		return o.dashed ? [w * 2.6, w * 2] : [];
	}

	function strokePath(ctx, pts, S)
	{
		ctx.beginPath();
		ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
		for (var i = 1; i < pts.length; i++)
		{
			ctx.lineTo(pts[i][0] * S, pts[i][1] * S);
		}
	}

	// Smooth pen strokes through the midpoints.
	function smoothPath(ctx, pts, S)
	{
		ctx.beginPath();
		ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
		for (var i = 1; i < pts.length - 1; i++)
		{
			var mx = (pts[i][0] + pts[i + 1][0]) / 2;
			var my = (pts[i][1] + pts[i + 1][1]) / 2;
			ctx.quadraticCurveTo(pts[i][0] * S, pts[i][1] * S, mx * S, my * S);
		}
		var last = pts[pts.length - 1];
		ctx.lineTo(last[0] * S, last[1] * S);
	}

	// Stroke the current path with a thin dark edge, so the side colors read on
	// light and dark images alike.
	function edgeStroke(ctx, w)
	{
		ctx.save();
		ctx.strokeStyle = "rgba(0,0,0,0.55)";
		ctx.lineWidth = w + Math.max(2, w * 0.6);
		ctx.stroke();
		ctx.restore();
		ctx.stroke();
	}

	function drawArrow(ctx, o, S, w)
	{
		var path = arrowPath(o);
		var end = path[path.length - 1];
		var before = path[path.length - 2];
		var angle = Math.atan2(end[1] - before[1], end[0] - before[0]);
		var head = Math.max(w * 3.2, S * 0.016);
		// Stop the line where the head starts, so the tip stays sharp.
		var stop = [end[0] - Math.cos(angle) * head * 0.8 / S, end[1] - Math.sin(angle) * head * 0.8 / S];
		var line = path.slice(0, -1).concat([stop]);
		ctx.setLineDash(dashFor(o, w));
		strokePath(ctx, line, S);
		edgeStroke(ctx, w);
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.moveTo(end[0] * S, end[1] * S);
		ctx.lineTo(end[0] * S - Math.cos(angle - 0.45) * head, end[1] * S - Math.sin(angle - 0.45) * head);
		ctx.lineTo(end[0] * S - Math.cos(angle + 0.45) * head, end[1] * S - Math.sin(angle + 0.45) * head);
		ctx.closePath();
		ctx.save();
		ctx.strokeStyle = "rgba(0,0,0,0.55)";
		ctx.lineWidth = Math.max(2, w * 0.6);
		ctx.stroke();
		ctx.restore();
		ctx.fill();
	}

	function drawGrenade(ctx, o, S, side, color)
	{
		var x = o.p[0] * S;
		var y = o.p[1] * S;
		if (o.from)
		{
			ctx.save();
			ctx.strokeStyle = "rgba(255,255,255,0.85)";
			ctx.lineWidth = Math.max(1.5, S * 0.003);
			ctx.setLineDash([S * 0.008, S * 0.007]);
			ctx.beginPath();
			ctx.moveTo(o.from[0] * S, o.from[1] * S);
			ctx.lineTo(x, y);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "rgba(255,255,255,0.85)";
			ctx.beginPath();
			ctx.arc(o.from[0] * S, o.from[1] * S, S * 0.005, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		if (o.type === "smoke")
		{
			var r = SMOKE_R * S;
			[[0, 0, 1], [-0.45, 0.2, 0.7], [0.45, 0.15, 0.72], [0.1, -0.42, 0.68], [-0.2, 0.45, 0.6]].forEach(function (c)
			{
				var g = ctx.createRadialGradient(x + c[0] * r, y + c[1] * r, 0, x + c[0] * r, y + c[1] * r, r * c[2]);
				g.addColorStop(0, "rgba(235,235,230,0.75)");
				g.addColorStop(1, "rgba(200,200,195,0)");
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(x + c[0] * r, y + c[1] * r, r * c[2], 0, Math.PI * 2);
				ctx.fill();
			});
		}
		else
		{
			// The real damage radius, filled lightly.
			ctx.strokeStyle = color;
			ctx.lineWidth = Math.max(2, S * 0.0035);
			ctx.setLineDash([S * 0.01, S * 0.007]);
			ctx.beginPath();
			ctx.arc(x, y, fragR(side) * S, 0, Math.PI * 2);
			edgeStroke(ctx, ctx.lineWidth);
			ctx.setLineDash([]);
			ctx.fillStyle = color;
			ctx.globalAlpha *= 0.15;
			ctx.fill();
			ctx.globalAlpha /= 0.15;
		}
		drawGrenadeIcon(ctx, o, x, y, S, side, color);
	}

	// The side's nation's HUD icon on a disc in the side's color.
	function drawGrenadeIcon(ctx, o, x, y, S, side, color)
	{
		var g = grenade(o.type, side);
		var icon = g ? iconImage(g.icon) : null;
		var r = ICON_R * S * (o.type === "smoke" ? 0.85 : 1);
		ctx.save();
		ctx.globalAlpha = Math.max(ctx.globalAlpha, 0.9);
		ctx.fillStyle = "rgba(20,22,18,0.85)";
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(1.5, S * 0.003);
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		if (icon)
		{
			var s = r * 1.6;
			ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
		}
		ctx.restore();
	}

	function drawPlayer(ctx, o, S, color)
	{
		var x = o.p[0] * S;
		var y = o.p[1] * S;
		var r = PLAYER_R * S;
		ctx.fillStyle = color;
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = Math.max(2, r * 0.16);
		ctx.shadowColor = "rgba(0,0,0,0.6)";
		ctx.shadowBlur = r * 0.4;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;
		ctx.stroke();
		// A thin dark edge outside the white ring, for the light Axis grey on sand.
		ctx.save();
		ctx.strokeStyle = "rgba(0,0,0,0.7)";
		ctx.lineWidth = Math.max(1, r * 0.07);
		ctx.beginPath();
		ctx.arc(x, y, r + Math.max(2, r * 0.16) / 2 + ctx.lineWidth / 2, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = "#fff";
		ctx.font = "800 " + Math.round(r * 1.25) + "px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineWidth = Math.max(1.5, r * 0.14);
		ctx.strokeStyle = "rgba(0,0,0,0.55)";
		ctx.strokeText(String(o.n), x, y + r * 0.06);
		ctx.fillText(String(o.n), x, y + r * 0.06);
	}

	// side: the layer the object is on; it gives the color.
	function drawObject(ctx, o, S, side, fade)
	{
		var color = sideColor(side);
		var w = Math.max(1, o.width * WIDTH_UNIT * S);
		ctx.save();
		ctx.globalAlpha = (o.opacity === undefined ? 1 : o.opacity) * (fade || 1);
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = w;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		switch (o.type)
		{
			case "arrow":
				drawArrow(ctx, o, S, w);
				break;
			case "line":
				ctx.setLineDash(dashFor(o, w));
				strokePath(ctx, [o.p0, o.p1], S);
				edgeStroke(ctx, w);
				break;
			case "pen":
				ctx.setLineDash(dashFor(o, w));
				smoothPath(ctx, o.pts, S);
				edgeStroke(ctx, w);
				break;
			case "rect":
				ctx.setLineDash(dashFor(o, w));
				ctx.beginPath();
				ctx.rect(Math.min(o.p0[0], o.p1[0]) * S, Math.min(o.p0[1], o.p1[1]) * S,
					Math.abs(o.p1[0] - o.p0[0]) * S, Math.abs(o.p1[1] - o.p0[1]) * S);
				edgeStroke(ctx, w);
				break;
			case "ellipse":
				ctx.setLineDash(dashFor(o, w));
				ctx.beginPath();
				ctx.ellipse((o.p0[0] + o.p1[0]) / 2 * S, (o.p0[1] + o.p1[1]) / 2 * S,
					Math.abs(o.p1[0] - o.p0[0]) / 2 * S, Math.abs(o.p1[1] - o.p0[1]) / 2 * S, 0, 0, Math.PI * 2);
				edgeStroke(ctx, w);
				break;
			case "area":
				strokePath(ctx, o.pts, S);
				ctx.closePath();
				ctx.globalAlpha *= 0.35;
				ctx.fill();
				ctx.globalAlpha /= 0.35;
				ctx.lineWidth = Math.max(1, w * 0.5);
				edgeStroke(ctx, ctx.lineWidth);
				break;
			case "text":
				var fs = textSize(o) * S;
				ctx.font = "700 " + fs + "px sans-serif";
				ctx.textBaseline = "alphabetic";
				ctx.lineWidth = fs * 0.2;
				ctx.strokeStyle = "rgba(0,0,0,0.85)";
				ctx.strokeText(o.text, o.p[0] * S, o.p[1] * S);
				ctx.fillText(o.text, o.p[0] * S, o.p[1] * S);
				break;
			case "player":
				drawPlayer(ctx, o, S, color);
				break;
			case "smoke":
			case "frag":
				drawGrenade(ctx, o, S, side, color);
				break;
			case "cone":
				var pts = conePoints(o);
				ctx.beginPath();
				ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
				ctx.lineTo(pts[1][0] * S, pts[1][1] * S);
				ctx.arc(o.p[0] * S, o.p[1] * S, o.len * S, o.dir - o.spread / 2, o.dir + o.spread / 2);
				ctx.closePath();
				ctx.globalAlpha *= 0.22;
				ctx.fill();
				ctx.globalAlpha /= 0.22;
				ctx.lineWidth = Math.max(1, w * 0.6);
				edgeStroke(ctx, ctx.lineWidth);
				ctx.beginPath();
				ctx.arc(o.p[0] * S, o.p[1] * S, Math.max(3, w * 1.2), 0, Math.PI * 2);
				ctx.fill();
				break;
		}
		ctx.restore();
	}

	// The visible layers, each at phase index(side) (with the phase before it
	// faded, for the onion skin). The active layer is drawn last, on top.
	function drawLayers(ctx, S, index, onion)
	{
		var order = active === "allies" ? ["axis", "allies"] : ["allies", "axis"];
		order.forEach(function (side)
		{
			var l = layers[side];
			if (!l.visible)
			{
				return;
			}
			var i = index(side);
			if (onion && i > 0)
			{
				l.phases[i - 1].objects.forEach(function (o) { drawObject(ctx, o, S, side, 0.28); });
			}
			l.phases[i].objects.forEach(function (o) { drawObject(ctx, o, S, side); });
		});
	}

	function currentIndex(side)
	{
		return layers[side].current;
	}

	function prepare(canvas)
	{
		var ratio = window.devicePixelRatio || 1;
		var px = Math.round(size * ratio);
		if (canvas.width !== px || canvas.height !== px)
		{
			canvas.width = px;
			canvas.height = px;
		}
		var ctx = canvas.getContext("2d");
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, size, size);
		return ctx;
	}

	// The spawns and sites: redrawn only when they change (toggles, size, image).
	function renderFixed()
	{
		if (!size || !board)
		{
			return;
		}
		drawFixed(prepare(board.fixed), size);
	}

	function renderMain()
	{
		if (!size)
		{
			return;
		}
		var ctx = prepare(board.main);
		drawLayers(ctx, size, currentIndex, opts.onion);
		drawScale(ctx, size);
		drawLegend(ctx, size);
	}

	function renderOverlay()
	{
		if (!size)
		{
			return;
		}
		var ctx = prepare(board.overlay);
		var S = size;
		if (draft)
		{
			drawObject(ctx, draft, S, active);
		}
		if (selected !== null && objects()[selected])
		{
			var o = objects()[selected];
			ctx.save();
			ctx.strokeStyle = "rgba(255,255,255,0.9)";
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 3]);
			var b = bounds(o);
			ctx.strokeRect(b[0] * S - 6, b[1] * S - 6, (b[2] - b[0]) * S + 12, (b[3] - b[1]) * S + 12);
			ctx.setLineDash([]);
			handles(o).forEach(function (h)
			{
				ctx.fillStyle = h.bend ? "#ffd84a" : "#fff";
				ctx.strokeStyle = "#111";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(h.p[0] * S, h.p[1] * S, 8, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			});
			ctx.restore();
		}

		var now = performance.now();
		laser = laser.filter(function (q) { return now - q.t < LASER_MS; });
		if (laser.length)
		{
			var c = nation(laser[0].side).rgb;
			ctx.save();
			ctx.lineCap = "round";
			for (var i = 1; i < laser.length; i++)
			{
				var a = (1 - (now - laser[i].t) / LASER_MS).toFixed(3);
				ctx.strokeStyle = "rgba(255,255,255," + a + ")";
				ctx.shadowColor = "rgba(" + c.join(",") + "," + a + ")";
				ctx.shadowBlur = 14;
				ctx.lineWidth = Math.max(4, S * 0.007);
				ctx.beginPath();
				ctx.moveTo(laser[i - 1].x * S, laser[i - 1].y * S);
				ctx.lineTo(laser[i].x * S, laser[i].y * S);
				ctx.stroke();
				ctx.strokeStyle = "rgba(" + c.join(",") + "," + a + ")";
				ctx.lineWidth = Math.max(2, S * 0.0035);
				ctx.stroke();
			}
			ctx.restore();
		}

		if (opts.cursor && pointer)
		{
			ctx.save();
			ctx.strokeStyle = sideColor(active);
			ctx.fillStyle = "rgba(255,216,74,0.18)";
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(pointer[0] * S, pointer[1] * S, Math.max(18, S * 0.025), 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.strokeStyle = "rgba(255,216,74,0.95)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.restore();
		}

		if (laser.length && !animating)
		{
			animating = true;
			window.requestAnimationFrame(function ()
			{
				animating = false;
				renderOverlay();
			});
		}
	}

	function bounds(o)
	{
		var pts = [];
		["p", "p0", "p1", "c", "from"].forEach(function (k) { if (o[k]) { pts.push(o[k]); } });
		if (o.pts)
		{
			pts = pts.concat(o.pts);
		}
		if (o.type === "cone")
		{
			pts = pts.concat(conePoints(o));
		}
		var r = o.type === "player" ? PLAYER_R : o.type === "smoke" ? SMOKE_R : o.type === "frag" ? fragR(active) : 0;
		var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		pts.forEach(function (q)
		{
			x0 = Math.min(x0, q[0] - r); y0 = Math.min(y0, q[1] - r);
			x1 = Math.max(x1, q[0] + r); y1 = Math.max(y1, q[1] + r);
		});
		if (o.type === "text")
		{
			x1 = o.p[0] + textWidth(o);
			y0 = o.p[1] - textSize(o);
			y1 = o.p[1] + textSize(o) * 0.3;
		}
		return [x0, y0, x1, y1];
	}

	function refresh()
	{
		renderMain();
		renderOverlay();
		renderPhases();
		renderToolbars();
		renderTop();
	}

	/* ---------- pointer ---------- */

	function toMap(event)
	{
		var r = board.overlay.getBoundingClientRect();
		return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height];
	}

	function style()
	{
		return { width: opts.width, opacity: opts.opacity, dashed: opts.dashed };
	}

	function withStyle(o)
	{
		var s = style();
		Object.keys(s).forEach(function (k) { o[k] = s[k]; });
		return o;
	}

	function onDown(event)
	{
		if (event.button !== undefined && event.button > 0)
		{
			return;
		}
		stopPlay();
		closeTextInput(true);
		closeFlyouts();
		hideHelp();
		board.overlay.setPointerCapture(event.pointerId);
		var p = toMap(event);
		pointer = p;
		var list = objects();

		switch (tool)
		{
			case "select":
				// The undo step is only taken once something really changes (see changed()),
				// so a click that only selects keeps the redo steps.
				if (selected !== null && list[selected])
				{
					var hit = handles(list[selected]).filter(function (h) { return dist(h.p, p) * size <= 14; })[0];
					if (hit)
					{
						drag = { kind: "handle", key: hit.key, before: snapshot(), changed: false };
						break;
					}
				}
				var index = hitTest(p);
				selected = index === -1 ? null : index;
				if (index !== -1)
				{
					drag = { kind: "move", last: p, before: snapshot(), changed: false };
				}
				break;
			case "arrow":
			case "line":
			case "rect":
			case "ellipse":
				draft = withStyle({ type: tool, p0: p, p1: p });
				drag = { kind: "draw" };
				break;
			case "pen":
			case "area":
				draft = withStyle({ type: tool, pts: [p] });
				drag = { kind: "draw" };
				break;
			case "cone":
				draft = withStyle({ type: "cone", p: p, dir: -Math.PI / 2, spread: CONE_SPREAD * Math.PI / 180, len: 0.12 });
				drag = { kind: "draw", start: p };
				break;
			case "smoke":
			case "frag":
				draft = withStyle({ type: tool, p: p, from: null });
				drag = { kind: "draw", start: p };
				break;
			case "player":
				remember();
				var l = layer();
				list.push({ type: "player", p: p, n: l.number, opacity: 1, width: 0 });
				selected = null;
				l.number = l.number % 5 + 1;
				drag = { kind: "place", index: list.length - 1 };
				break;
			case "text":
				drag = { kind: "text", p: p };
				break;
			case "laser":
				laser.push({ x: p[0], y: p[1], t: performance.now(), side: active });
				drag = { kind: "laser" };
				break;
			case "eraser":
				drag = { kind: "erase", before: snapshot(), changed: false };
				erase(p);
				break;
		}
		refresh();
	}

	// The first real change of a drag takes the undo step from before the drag.
	function changed()
	{
		if (!drag.changed)
		{
			drag.changed = true;
			remember(drag.before);
		}
	}

	function erase(p)
	{
		var index = hitTest(p);
		if (index !== -1)
		{
			changed();
			objects().splice(index, 1);
			selected = null;
		}
	}

	function onMove(event)
	{
		var p = toMap(event);
		pointer = p;
		if (!drag)
		{
			if (opts.cursor)
			{
				renderOverlay();
			}
			return;
		}
		var list = objects();
		switch (drag.kind)
		{
			case "handle":
				changed();
				setHandle(list[selected], drag.key, p);
				renderMain();
				break;
			case "move":
				if (p[0] === drag.last[0] && p[1] === drag.last[1])
				{
					break;
				}
				changed();
				moveObject(list[selected], p[0] - drag.last[0], p[1] - drag.last[1]);
				drag.last = p;
				renderMain();
				break;
			case "place":
				list[drag.index].p = p;
				renderMain();
				break;
			case "draw":
				if (draft.pts)
				{
					var last = draft.pts[draft.pts.length - 1];
					if (dist(last, p) * size >= 2)
					{
						draft.pts.push(p);
					}
				}
				else if (draft.type === "cone")
				{
					if (dist(drag.start, p) * size > 6)
					{
						draft.dir = Math.atan2(p[1] - draft.p[1], p[0] - draft.p[0]);
						draft.len = dist(drag.start, p);
					}
				}
				else if (draft.p0)
				{
					draft.p1 = p;
				}
				else if (dist(drag.start, p) * size > 12)
				{
					// A grenade dragged from the thrower lands where the pointer is let go.
					draft.from = drag.start;
					draft.p = p;
				}
				break;
			case "laser":
				laser.push({ x: p[0], y: p[1], t: performance.now(), side: active });
				break;
			case "erase":
				erase(p);
				renderMain();
				break;
		}
		renderOverlay();
	}

	function onUp()
	{
		if (!drag)
		{
			return;
		}
		var d = drag;
		drag = null;
		if (d.kind === "draw" && draft)
		{
			var keep = true;
			if (draft.p0)
			{
				keep = dist(draft.p0, draft.p1) * size > 4;
			}
			else if (draft.pts)
			{
				keep = draft.type === "area" ? draft.pts.length >= 3 : draft.pts.length >= 2;
			}
			if (keep)
			{
				remember();
				objects().push(draft);
			}
			draft = null;
		}
		if (d.kind === "text")
		{
			openTextInput(d.p, null);
		}
		refresh();
	}

	/* ---------- text ---------- */

	function openTextInput(p, index)
	{
		var input = board.text;
		var existing = index !== null ? objects()[index] : null;
		var fs = textSize(existing || withStyle({})) * size;
		input.value = existing ? existing.text : "";
		input.style.left = p[0] * size + "px";
		input.style.top = (p[1] * size - fs) + "px";
		input.style.fontSize = fs + "px";
		input.style.color = sideColor(active);
		input.hidden = false;
		input.dataset.x = p[0];
		input.dataset.y = p[1];
		input.dataset.index = index === null ? "" : String(index);
		input.focus();
	}

	function closeTextInput(commit)
	{
		var input = board.text;
		if (input.hidden)
		{
			return;
		}
		input.hidden = true;
		var text = input.value.trim();
		var index = input.dataset.index;
		if (!commit)
		{
			return;
		}
		if (index !== "")
		{
			var o = objects()[Number(index)];
			if (o && text !== o.text)
			{
				remember();
				if (text === "")
				{
					objects().splice(Number(index), 1);
					selected = null;
				}
				else
				{
					o.text = text;
				}
			}
		}
		else if (text !== "")
		{
			remember();
			objects().push(withStyle({ type: "text", p: [Number(input.dataset.x), Number(input.dataset.y)], text: text }));
		}
		refresh();
	}

	/* ---------- phases (of the active layer) ---------- */

	function setPhase(index, side)
	{
		var l = layer(side);
		if (index < 0 || index >= l.phases.length)
		{
			return;
		}
		l.current = index;
		selected = null;
		refresh();
	}

	function addPhase(copy)
	{
		remember();
		var l = layer();
		var base = l.phases[l.current];
		var phase = { name: "Phase " + (l.phases.length + 1), objects: copy ? JSON.parse(JSON.stringify(base.objects)) : [] };
		l.phases.splice(l.current + 1, 0, phase);
		l.current++;
		selected = null;
		refresh();
	}

	function movePhase(step)
	{
		var l = layer();
		var to = l.current + step;
		if (to < 0 || to >= l.phases.length)
		{
			return;
		}
		remember();
		var p = l.phases.splice(l.current, 1)[0];
		l.phases.splice(to, 0, p);
		l.current = to;
		refresh();
	}

	function deletePhase()
	{
		var l = layer();
		if (l.phases.length === 1)
		{
			return;
		}
		var go = function ()
		{
			remember();
			l.phases.splice(l.current, 1);
			l.current = Math.max(0, l.current - 1);
			selected = null;
			refresh();
		};
		if (objects().length)
		{
			askConfirm("Delete the " + sideWord(active) + " phase “" + l.phases[l.current].name + "” with its drawing?", "Delete", go);
		}
		else
		{
			go();
		}
	}

	function renamePhase()
	{
		var input = board.rename;
		input.value = layer().phases[layer().current].name;
		input.hidden = false;
		input.focus();
		input.select();
	}

	function finishRename(commit)
	{
		var input = board.rename;
		if (input.hidden)
		{
			return;
		}
		input.hidden = true;
		var l = layer();
		var name = input.value.trim();
		if (commit && name !== "" && name !== l.phases[l.current].name)
		{
			remember();
			l.phases[l.current].name = name.slice(0, 40);
		}
		refresh();
	}

	// Play steps the visible layers together: step n shows each layer's phase n
	// (or its last one).
	function stepCount()
	{
		return Math.max.apply(null, SIDES.filter(function (s) { return layers[s].visible; }).map(function (s) { return layers[s].phases.length; }));
	}

	function showStep(step)
	{
		SIDES.forEach(function (s)
		{
			if (layers[s].visible)
			{
				layers[s].current = Math.min(step, layers[s].phases.length - 1);
			}
		});
		selected = null;
		refresh();
	}

	function togglePlay()
	{
		if (playTimer)
		{
			stopPlay();
			return;
		}
		if (stepCount() < 2)
		{
			return;
		}
		playStep = 0;
		showStep(0);
		playTimer = window.setInterval(function ()
		{
			playStep = (playStep + 1) % stepCount();
			showStep(playStep);
		}, PLAY_MS);
		renderTop();
	}

	function stopPlay()
	{
		if (playTimer)
		{
			window.clearInterval(playTimer);
			playTimer = 0;
			renderTop();
		}
	}

	function renderPhases()
	{
		board.phaseRows.forEach(function (row)
		{
			var side = row.side;
			var l = layers[side];
			var on = side === active;
			row.node.classList.toggle("is-active", on);
			row.node.classList.toggle("is-hidden", !l.visible);
			row.list.textContent = "";
			l.phases.forEach(function (phase, i)
			{
				var b = el("button", "btn btn-sm t2-phase" + (i === l.current ? " is-current" : ""), (i + 1) + ". " + phase.name);
				b.type = "button";
				b.setAttribute("aria-pressed", String(i === l.current));
				b.title = sideWord(side) + " phase " + (i + 1) + " (← / → switch, double-click renames)";
				b.addEventListener("click", function () { stopPlay(); setActive(side); setPhase(i, side); });
				b.addEventListener("dblclick", function () { setActive(side); setPhase(i, side); renamePhase(); });
				row.list.appendChild(b);
			});
			row.actions.hidden = !on;
			if (on)
			{
				// The phase buttons act on the active side, so they sit in its row.
				row.actions.appendChild(board.rename);
				board.phaseButtons.forEach(function (b) { row.actions.appendChild(b); });
			}
		});
		var l = layer();
		board.left.disabled = l.current === 0;
		board.right.disabled = l.current === l.phases.length - 1;
		board.del.disabled = l.phases.length === 1;
	}

	/* ---------- confirm (in the page, not a browser dialog) ---------- */

	function askConfirm(text, yes, action)
	{
		confirmAction = action;
		board.confirmText.textContent = text;
		board.confirmYes.textContent = yes;
		board.confirm.hidden = false;
		board.confirmYes.focus();
	}

	function closeConfirm(run)
	{
		board.confirm.hidden = true;
		var action = confirmAction;
		confirmAction = null;
		if (run && action)
		{
			action();
		}
	}

	function clearLayer(side)
	{
		setActive(side);
		var l = layer(side);
		var count = l.phases.reduce(function (n, p) { return n + p.objects.length; }, 0);
		if (!count)
		{
			return;
		}
		askConfirm("Clear everything drawn on the " + sideName(side) + " layer (" + l.phases.length +
			(l.phases.length === 1 ? " phase" : " phases") + ")? The phases stay; Undo brings it back.", "Clear", function ()
		{
			active = side;
			remember();
			l.phases.forEach(function (p) { p.objects = []; });
			selected = null;
			refresh();
		});
	}

	/* ---------- toolbars ---------- */

	function setTool(id, side)
	{
		closeTextInput(true);
		if (side)
		{
			setActive(side);
		}
		tool = id;
		if (id !== "select")
		{
			selected = null;
		}
		board.overlay.dataset.tool = id;
		refresh();
	}

	// A crosshair cursor in the active side's color.
	function cursorFor()
	{
		if (tool === "select")
		{
			return "default";
		}
		var c = sideColor(active);
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
			'<g stroke="#000" stroke-width="3.5" fill="none"><circle cx="12" cy="12" r="5"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></g>' +
			'<g stroke="' + c + '" stroke-width="1.8" fill="none"><circle cx="12" cy="12" r="5"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></g></svg>';
		return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 12 12, crosshair';
	}

	function renderToolbars()
	{
		board.bars.forEach(function (bar)
		{
			var side = bar.side;
			var l = layers[side];
			var on = side === active;
			bar.node.classList.toggle("is-active", on);
			bar.node.classList.toggle("is-hidden", !l.visible);
			[].forEach.call(bar.node.querySelectorAll(".t2-tool"), function (b)
			{
				var pressed = on && b.getAttribute("data-tool") === tool;
				b.classList.toggle("is-active", pressed);
				b.setAttribute("aria-pressed", String(pressed));
			});
			bar.eye.innerHTML = svg(l.visible ? ICON.eye : ICON.eyeOff);
			bar.eye.setAttribute("aria-pressed", String(l.visible));
			bar.eye.title = (l.visible ? "Hide" : "Show") + " the " + sideWord(side) + " layer";
			bar.undo.disabled = !l.history.length;
			bar.redo.disabled = !l.future.length;
			bar.width.value = String(opts.width);
			bar.opacity.value = String(Math.round(opts.opacity * 100));
			bar.dashed.checked = opts.dashed;
			[].forEach.call(bar.numbers.children, function (b)
			{
				b.classList.toggle("is-active", Number(b.textContent) === l.number);
			});
			var g = on && (tool === "smoke" || tool === "frag") ? grenade(tool, side) : null;
			bar.nade.textContent = g ? g.name + (tool === "frag" ? " · " + g.radius + " units radius" : "") : "";
			bar.nade.hidden = !g;
		});
		board.overlay.style.cursor = cursorFor();
	}

	function renderTop()
	{
		var both = layers.allies.visible && layers.axis.visible;
		[].forEach.call(board.show.children, function (b)
		{
			var v = b.getAttribute("data-show");
			b.setAttribute("aria-pressed", String(v === "both" ? both : !both && layers[v].visible));
		});
		[["spawns", board.spawnsBtn], ["sites", board.sitesBtn], ["legend", board.legendBtn], ["scale", board.scaleBtn],
			["onion", board.onion], ["cursor", board.cursorBtn]].forEach(function (pair)
		{
			pair[1].setAttribute("aria-pressed", String(opts[pair[0]]));
		});
		var hasSd = !!(sd && worldRect());
		board.spawnsBtn.disabled = !hasSd;
		board.sitesBtn.disabled = !hasSd;
		board.legendBtn.disabled = !hasSd;
		board.scaleBtn.disabled = !worldWidth();
		board.play.textContent = playTimer ? "Stop" : "Play";
		board.play.setAttribute("aria-pressed", String(!!playTimer));
		board.play.disabled = stepCount() < 2;
		var t = TOOLS.filter(function (x) { return x.id === tool; })[0];
		var l = layer();
		board.status.style.setProperty("--side", sideColor(active));
		board.status.textContent = sideName(active) + " · " + t.label.split(" (")[0].split(",")[0] + " · phase " + (l.current + 1) + "/" + l.phases.length;
	}

	// A change of width, opacity or dash applies to the selected object too.
	function applyStyle(key, value)
	{
		opts[key] = value;
		var o = selected !== null ? objects()[selected] : null;
		if (o && o.type !== "player")
		{
			remember();
			o[key] = value;
			renderMain();
		}
		renderToolbars();
		renderOverlay();
	}

	function svg(paths)
	{
		return '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" stroke="currentColor" stroke-width="1.7" ' +
			'stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";
	}

	function button(cls, text, title, onClick)
	{
		var b = el("button", "btn btn-sm " + cls, text);
		b.type = "button";
		if (title)
		{
			b.title = title;
			b.setAttribute("aria-label", title);
		}
		b.addEventListener("click", onClick);
		return b;
	}

	function iconButton(cls, icon, title, onClick)
	{
		var b = button("t2-icon-btn " + cls, "", title, onClick);
		b.innerHTML = svg(icon);
		return b;
	}

	function closeFlyouts()
	{
		if (board)
		{
			board.bars.forEach(function (bar) { bar.flyout.hidden = true; bar.styleBtn.setAttribute("aria-expanded", "false"); });
		}
	}

	// One side's vertical toolbar: header, tool groups, style, undo / redo / clear.
	function buildBar(side)
	{
		var node = el("aside", "t2-bar t2-bar-" + side);
		node.setAttribute("data-side", side);
		var head = el("div", "t2-bar-head");
		var name = el("button", "t2-bar-name");
		name.type = "button";
		name.appendChild(el("span", "t2-bar-side"));
		name.appendChild(el("span", "t2-bar-role"));
		name.addEventListener("click", function () { setActive(side); });
		var eye = iconButton("t2-eye", ICON.eye, "", function () { toggleLayer(side); });
		head.appendChild(name);
		head.appendChild(eye);
		node.appendChild(head);

		GROUPS.forEach(function (group)
		{
			node.appendChild(el("div", "t2-group-label", group.name));
			var grid = el("div", "t2-tool-grid");
			group.tools.forEach(function (t)
			{
				var b = el("button", "t2-tool");
				b.type = "button";
				b.setAttribute("data-tool", t.id);
				b.addEventListener("click", function () { closeFlyouts(); hideHelp(); setTool(t.id, side); });
				b.innerHTML = svg(t.icon);
				grid.appendChild(b);
			});
			node.appendChild(grid);
		});

		var foot = el("div", "t2-bar-foot");
		var styleBtn = iconButton("t2-style", ICON.style, "Line width, opacity, dashes, player number", function (event)
		{
			event.stopPropagation();
			var open = flyout.hidden;
			closeFlyouts();
			setActive(side);
			flyout.hidden = !open;
			styleBtn.setAttribute("aria-expanded", String(open));
		});
		styleBtn.setAttribute("aria-expanded", "false");
		var undoBtn = iconButton("", ICON.undo, "Undo on this side (Ctrl+Z)", function () { setActive(side); undo(side); });
		var redoBtn = iconButton("", ICON.redo, "Redo on this side (Ctrl+Y)", function () { setActive(side); redo(side); });
		var clearBtn = iconButton("t2-clear", ICON.clear, "Clear this side's layer", function () { clearLayer(side); });
		[styleBtn, undoBtn, redoBtn, clearBtn].forEach(function (b) { foot.appendChild(b); });
		node.appendChild(foot);

		// The style flyout, opening towards the map (placed in the main area by build()).
		var flyout = el("div", "t2-flyout t2-flyout-" + side);
		flyout.hidden = true;
		flyout.addEventListener("click", function (event) { event.stopPropagation(); });
		var width = el("input", "t2-range");
		width.type = "range";
		width.min = "1";
		width.max = "10";
		width.addEventListener("input", function () { applyStyle("width", Number(width.value)); });
		var opacity = el("input", "t2-range");
		opacity.type = "range";
		opacity.min = "15";
		opacity.max = "100";
		opacity.addEventListener("input", function () { applyStyle("opacity", Number(opacity.value) / 100); });
		var dashed = el("input");
		dashed.type = "checkbox";
		dashed.addEventListener("change", function () { applyStyle("dashed", dashed.checked); });
		[["Width", width], ["Opacity", opacity], ["Dashed", dashed]].forEach(function (pair)
		{
			var lab = el("label", "t2-field");
			lab.appendChild(el("span", null, pair[0]));
			lab.appendChild(pair[1]);
			flyout.appendChild(lab);
		});
		flyout.appendChild(el("div", "t2-flyout-label", "Next player number"));
		var numbers = el("div", "t2-numbers");
		[1, 2, 3, 4, 5].forEach(function (n)
		{
			var b = el("button", "btn btn-sm t2-num", String(n));
			b.type = "button";
			b.setAttribute("aria-label", "Next player number " + n);
			b.addEventListener("click", function () { layers[side].number = n; renderToolbars(); });
			numbers.appendChild(b);
		});
		flyout.appendChild(numbers);
		var nade = el("p", "t2-nade");
		nade.hidden = true;
		node.appendChild(nade);

		return { side: side, node: node, name: name, eye: eye, undo: undoBtn, redo: redoBtn, styleBtn: styleBtn, flyout: flyout,
			width: width, opacity: opacity, dashed: dashed, numbers: numbers, nade: nade };
	}

	// Per map: names, roles, colors and tooltips of the two toolbars and phase rows.
	function setupSides()
	{
		board.bars.forEach(function (bar)
		{
			var side = bar.side;
			bar.node.style.setProperty("--side", sideColor(side));
			bar.node.style.setProperty("--side-ink", sideInk(side));
			bar.name.querySelector(".t2-bar-side").textContent = sideName(side);
			bar.name.querySelector(".t2-bar-role").textContent = role(side) === "attack" ? "Attack" : "Defense";
			bar.name.setAttribute("data-short", sideWord(side));
			bar.name.title = sideName(side) + ", " + (role(side) === "attack" ? "attacks" : "defends") + " in S&D: draw on this layer (Q switches)";
			[].forEach.call(bar.node.querySelectorAll(".t2-tool"), function (b)
			{
				var t = TOOLS.filter(function (x) { return x.id === b.getAttribute("data-tool"); })[0];
				b.title = t.label + " – " + sideWord(side) + " (" + t.key.toUpperCase() + ")";
				b.setAttribute("aria-label", t.label + ", " + sideWord(side) + " layer, key " + t.key.toUpperCase());
			});
		});
		board.phaseRows.forEach(function (row)
		{
			row.node.style.setProperty("--side", sideColor(row.side));
			row.label.textContent = sideWord(row.side);
			row.label.title = sideName(row.side) + ": its phases";
		});
	}

	/* ---------- export ---------- */

	function exportImage(index, name)
	{
		var w = image.naturalWidth;
		var canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = w;
		var ctx = canvas.getContext("2d");
		ctx.fillStyle = "#1d1e1a";
		ctx.fillRect(0, 0, w, w);
		ctx.drawImage(image, 0, 0, w, w);
		drawFixed(ctx, w);
		drawLayers(ctx, w, index, false);
		drawScale(ctx, w);
		drawLegend(ctx, w);
		canvas.toBlob(function (blob)
		{
			var url = URL.createObjectURL(blob);
			var a = document.createElement("a");
			a.href = url;
			a.download = name;
			document.body.appendChild(a);
			a.click();
			a.remove();
			window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
		}, "image/png");
		return name;
	}

	// "mp_toujane_tactics_phase2.png"; with one layer shown, its side is in the name.
	function exportName(step)
	{
		var shown = SIDES.filter(function (s) { return layers[s].visible; });
		return map.id + "_tactics" + (shown.length === 1 ? "_" + shown[0] : "") + "_phase" + (step + 1) + ".png";
	}

	// The current view: the visible layers at their current phases.
	function exportCurrent()
	{
		var step = Math.max.apply(null, SIDES.filter(function (s) { return layers[s].visible; }).map(function (s) { return layers[s].current; }));
		return exportImage(currentIndex, exportName(step));
	}

	// One PNG per step, as Play shows them.
	function exportAll()
	{
		for (var step = 0; step < stepCount(); step++)
		{
			(function (n)
			{
				window.setTimeout(function ()
				{
					exportImage(function (side) { return Math.min(n, layers[side].phases.length - 1); }, exportName(n));
				}, n * 400);
			})(step);
		}
	}

	/* ---------- layout ---------- */

	function layout()
	{
		if (!board || board.root.hidden)
		{
			return;
		}
		var r = board.stage.getBoundingClientRect();
		var s = Math.floor(Math.min(r.width, r.height) - 12);
		if (s < 50)
		{
			return;
		}
		size = s;
		board.mapBox.style.width = s + "px";
		board.mapBox.style.height = s + "px";
		renderFixed();
		renderMain();
		renderOverlay();
	}

	function toggleFullscreen()
	{
		if (document.fullscreenElement)
		{
			document.exitFullscreen();
		}
		else if (board.root.requestFullscreen)
		{
			board.root.requestFullscreen().catch(function () {});
		}
	}

	function toggleClean()
	{
		closeFlyouts();
		board.root.classList.toggle("is-clean");
		window.setTimeout(layout, 0);
	}

	function toggleOpt(key)
	{
		opts[key] = !opts[key];
		if (key === "spawns" || key === "sites")
		{
			renderFixed();
		}
		refresh();
	}

	function showHelp()
	{
		board.help.hidden = false;
		helpShown = true;
		board.helpClose.focus();
	}

	function hideHelp()
	{
		if (board && !board.help.hidden)
		{
			board.help.hidden = true;
		}
	}

	/* ---------- keys ---------- */

	function onKey(event)
	{
		if (board.root.hidden)
		{
			return;
		}
		if (event.target.type === "range" && /^Arrow/.test(event.key))
		{
			return;     // the slider's own keys
		}
		var typing = event.target === board.text || event.target === board.rename;
		if (typing)
		{
			if (event.key === "Enter" || event.key === "Escape")
			{
				event.preventDefault();
				if (event.target === board.text)
				{
					closeTextInput(event.key === "Enter");
				}
				else
				{
					finishRename(event.key === "Enter");
				}
			}
			return;
		}
		if (!board.confirm.hidden)
		{
			if (event.key === "Escape")
			{
				closeConfirm(false);
			}
			return;
		}
		if (!board.help.hidden && (event.key === "Escape" || event.key === "Enter"))
		{
			event.preventDefault();
			hideHelp();
			return;
		}
		var k = event.key.toLowerCase();
		var mod = event.ctrlKey || event.metaKey;
		if (mod && k === "z")
		{
			event.preventDefault();
			if (event.shiftKey) { redo(); } else { undo(); }
			return;
		}
		if (mod && k === "y")
		{
			event.preventDefault();
			redo();
			return;
		}
		if (mod || event.altKey)
		{
			return;
		}
		if (event.key === "ArrowLeft" || event.key === "ArrowRight")
		{
			event.preventDefault();
			stopPlay();
			setPhase(layer().current + (event.key === "ArrowLeft" ? -1 : 1));
			return;
		}
		if ((event.key === "Delete" || event.key === "Backspace") && selected !== null)
		{
			event.preventDefault();
			remember();
			objects().splice(selected, 1);
			selected = null;
			refresh();
			return;
		}
		if (event.key === "Escape")
		{
			selected = null;
			draft = null;
			drag = null;
			closeFlyouts();
			refresh();
			return;
		}
		if (event.key === " ")
		{
			event.preventDefault();
			togglePlay();
			return;
		}
		if (event.key === "?")
		{
			showHelp();
			return;
		}
		if (tool === "player" && /^[1-5]$/.test(k))
		{
			layer().number = Number(k);
			renderToolbars();
			return;
		}
		if (k === "q") { setActive(active === "allies" ? "axis" : "allies"); return; }
		if (k === "f") { toggleFullscreen(); return; }
		if (k === "h") { toggleClean(); return; }
		if (k === "n") { toggleOpt("onion"); return; }
		if (k === "i") { toggleOpt("cursor"); return; }
		if (k === "u") { if (worldWidth()) { toggleOpt("scale"); } return; }
		var t = TOOLS.filter(function (x) { return x.key === k; })[0];
		if (t)
		{
			event.preventDefault();
			setTool(t.id);
		}
	}

	/* ---------- building the board ---------- */

	function build()
	{
		var root = el("div", "t2-board");
		root.hidden = true;
		root.setAttribute("role", "dialog");
		root.setAttribute("aria-modal", "true");
		root.setAttribute("aria-label", "Tactics board");

		// Top bar: title, image, layers, overlay, presentation and export.
		var top = el("div", "t2-top");
		var title = el("span", "t2-title");
		top.appendChild(title);
		var status = el("span", "t2-status");
		status.setAttribute("aria-live", "polite");
		top.appendChild(status);

		var viewGroup = el("div", "t2-group");
		var views = el("div", "t2-seg t2-views");
		viewGroup.appendChild(views);
		var show = el("div", "t2-seg");
		show.setAttribute("role", "group");
		show.setAttribute("aria-label", "Layers shown");
		[["allies", "Allies"], ["both", "Both"], ["axis", "Axis"]].forEach(function (pair)
		{
			var b = button("", pair[1], "Show " + (pair[0] === "both" ? "both layers" : "only the " + pair[1] + " layer"), function () { showLayers(pair[0]); });
			b.setAttribute("data-show", pair[0]);
			show.appendChild(b);
		});
		viewGroup.appendChild(show);
		top.appendChild(viewGroup);

		var overlayGroup = el("div", "t2-group");
		var spawnsBtn = button("", "Spawns", "S&D spawns of both sides, with the way they face", function () { toggleOpt("spawns"); });
		var sitesBtn = button("", "Bomb sites", "Bomb sites A and B with their plant area", function () { toggleOpt("sites"); });
		var legendBtn = button("", "Legend", "What the markers mean, and who attacks", function () { toggleOpt("legend"); });
		var scaleBtn = button("", "Scale", "Scale bar in game units (U)", function () { toggleOpt("scale"); });
		[spawnsBtn, sitesBtn, legendBtn, scaleBtn].forEach(function (b) { overlayGroup.appendChild(b); });
		top.appendChild(overlayGroup);

		var actions = el("div", "t2-group t2-actions");
		var onion = button("", "Onion", "Show each layer's phase before, faded (N)", function () { toggleOpt("onion"); });
		var play = button("", "Play", "Step through the phases of the shown layers (Space)", togglePlay);
		var cursorBtn = button("", "Cursor", "Highlight the cursor (I)", function () { toggleOpt("cursor"); });
		actions.appendChild(onion);
		actions.appendChild(play);
		actions.appendChild(cursorBtn);
		actions.appendChild(button("", "PNG", "Export the current view (shown layers, spawns, sites) as PNG", exportCurrent));
		actions.appendChild(button("", "All PNGs", "Export every step of Play as its own PNG", exportAll));
		var full = button("", "Fullscreen", "Fullscreen (F)", toggleFullscreen);
		if (!document.fullscreenEnabled)
		{
			full.hidden = true;
		}
		actions.appendChild(full);
		actions.appendChild(button("", "Hide bars", "Hide all bars, only the map (H)", toggleClean));
		actions.appendChild(button("t2-help-btn", "?", "How to use (?)", showHelp));
		actions.appendChild(button("t2-close", "Close", "Close the board; the drawing is not kept", close));
		top.appendChild(actions);
		root.appendChild(top);

		// Allies toolbar, the map, Axis toolbar.
		var main = el("div", "t2-main");
		var bars = SIDES.map(buildBar);

		var stage = el("div", "t2-stage");
		var mapBox = el("div", "t2-map");
		var img = el("img", "t2-image");
		img.alt = "";
		var fixedCanvas = el("canvas", "t2-canvas t2-fixed");
		var mainCanvas = el("canvas", "t2-canvas");
		var overlay = el("canvas", "t2-canvas t2-overlay");
		overlay.setAttribute("role", "img");
		overlay.setAttribute("aria-label", "Drawing area");
		var text = el("input", "t2-text");
		text.type = "text";
		text.hidden = true;
		text.setAttribute("aria-label", "Text");
		text.addEventListener("blur", function () { closeTextInput(true); });
		[img, fixedCanvas, mainCanvas, overlay, text].forEach(function (n) { mapBox.appendChild(n); });
		stage.appendChild(mapBox);

		var confirm = el("div", "t2-confirm");
		confirm.hidden = true;
		confirm.setAttribute("role", "alertdialog");
		var confirmText = el("span");
		var confirmYes = button("t2-danger", "OK", "", function () { closeConfirm(true); });
		confirm.appendChild(confirmText);
		confirm.appendChild(confirmYes);
		confirm.appendChild(button("", "Cancel", "", function () { closeConfirm(false); }));
		stage.appendChild(confirm);

		// The "how to use" card: on the first open of each page load, not stored.
		var help = el("div", "t2-help");
		help.hidden = true;
		help.setAttribute("role", "dialog");
		help.setAttribute("aria-label", "How to use the tactics board");
		help.appendChild(el("h3", null, "How to use"));
		var ul = el("ul");
		["Left toolbar: draws on the Allies layer. Right toolbar: draws on the Axis layer. Everything takes the side's color.",
			"Pick a tool and drag on the map. Select (V) moves, resizes and bends; Delete removes.",
			"Spawns and bomb sites are fixed; switch them on and off at the top. The legend says who attacks.",
			"Each side has its own phases (bottom), undo / redo and eraser. ← → switch phases, Space plays them.",
			"Keys: Q other side, Ctrl+Z / Ctrl+Y undo / redo, F fullscreen, H only the map, ? this help."].forEach(function (t)
		{
			ul.appendChild(el("li", null, t));
		});
		help.appendChild(ul);
		var helpClose = button("btn-primary", "Got it", "", hideHelp);
		help.appendChild(helpClose);
		stage.appendChild(help);

		main.appendChild(bars[0].node);
		main.appendChild(stage);
		main.appendChild(bars[1].node);
		bars.forEach(function (bar) { main.appendChild(bar.flyout); });
		root.appendChild(main);

		// Phases: one row per side; the buttons act on the active side.
		var phaseBar = el("div", "t2-phases");
		var phaseRows = SIDES.map(function (side)
		{
			var row = el("div", "t2-phase-row");
			var labelBtn = el("button", "t2-phase-side");
			labelBtn.type = "button";
			labelBtn.addEventListener("click", function () { setActive(side); });
			var list = el("div", "t2-phase-list");
			var acts = el("div", "t2-phase-actions");
			row.appendChild(labelBtn);
			row.appendChild(list);
			row.appendChild(acts);
			phaseBar.appendChild(row);
			return { side: side, node: row, label: labelBtn, list: list, actions: acts };
		});
		var rename = el("input", "t2-rename");
		rename.type = "text";
		rename.hidden = true;
		rename.setAttribute("aria-label", "Phase name");
		rename.addEventListener("blur", function () { finishRename(true); });
		var left = button("t2-icon-btn", "←", "Move this phase left", function () { movePhase(-1); });
		var right = button("t2-icon-btn", "→", "Move this phase right", function () { movePhase(1); });
		var del = button("", "Delete", "Delete this phase", deletePhase);
		var phaseButtons = [button("", "+ Phase", "New empty phase after this one", function () { addPhase(false); }),
			button("", "Copy", "New phase with a copy of this one's drawing", function () { addPhase(true); }),
			button("", "Rename", "Rename this phase", renamePhase), left, right, del];
		root.appendChild(phaseBar);

		var showBtn = button("t2-show", "☰", "Show the bars (H)", toggleClean);
		root.appendChild(showBtn);

		overlay.addEventListener("pointerdown", onDown);
		overlay.addEventListener("pointermove", onMove);
		overlay.addEventListener("pointerup", onUp);
		overlay.addEventListener("pointercancel", onUp);
		overlay.addEventListener("pointerleave", function () { if (!drag) { pointer = null; renderOverlay(); } });
		overlay.addEventListener("dblclick", function (event)
		{
			if (tool !== "select")
			{
				return;
			}
			var index = hitTest(toMap(event));
			if (index !== -1 && objects()[index].type === "text")
			{
				openTextInput(objects()[index].p, index);
			}
		});
		root.addEventListener("click", function (event)
		{
			if (!event.target.closest(".t2-flyout") && !event.target.closest(".t2-style"))
			{
				closeFlyouts();
			}
		});
		document.addEventListener("keydown", onKey);
		document.addEventListener("fullscreenchange", function () { window.setTimeout(layout, 50); });
		if (window.ResizeObserver)
		{
			new ResizeObserver(layout).observe(stage);
		}
		window.addEventListener("resize", layout);

		document.body.appendChild(root);
		board = {
			root: root, title: title, status: status, views: views, show: show,
			spawnsBtn: spawnsBtn, sitesBtn: sitesBtn, legendBtn: legendBtn, scaleBtn: scaleBtn,
			onion: onion, play: play, cursorBtn: cursorBtn, bars: bars,
			stage: stage, mapBox: mapBox, img: img, fixed: fixedCanvas, main: mainCanvas, overlay: overlay, text: text,
			confirm: confirm, confirmText: confirmText, confirmYes: confirmYes, help: help, helpClose: helpClose,
			phaseRows: phaseRows, rename: rename, phaseButtons: phaseButtons, left: left, right: right, del: del
		};
	}

	/* ---------- open / close ---------- */

	function resetLayers()
	{
		layers = { allies: newLayer(), axis: newLayer() };
		selected = null;
		draft = null;
		drag = null;
	}

	function setView(v, images)
	{
		view = v;
		image = new Image();
		image.onload = function ()
		{
			board.img.src = image.src;
			layout();
			refresh();
		};
		image.src = images[v];
		board.views.textContent = "";
		if (images.topdown && images.radar)
		{
			[["topdown", "Top-down"], ["radar", "zPAM radar"]].forEach(function (pair)
			{
				var b = button("t2-view", pair[1], "Draw on the " + pair[1].toLowerCase() + " image", function ()
				{
					if (view === pair[0])
					{
						return;
					}
					var hasDrawing = SIDES.some(function (s) { return layers[s].phases.some(function (p) { return p.objects.length; }); });
					var go = function ()
					{
						resetLayers();
						setView(pair[0], images);
						refresh();
					};
					if (hasDrawing)
					{
						askConfirm("The two images are framed differently, so switching starts a new drawing.", "Switch", go);
					}
					else
					{
						go();
					}
				});
				b.setAttribute("aria-pressed", String(view === pair[0]));
				board.views.appendChild(b);
			});
		}
	}

	function loadImages(callback)
	{
		var store = window.COD2_MAP_IMAGES || {};
		if (store[map.id])
		{
			callback(store[map.id]);
			return;
		}
		var script = document.createElement("script");
		script.src = map.board;
		script.onload = function () { callback((window.COD2_MAP_IMAGES || {})[map.id]); };
		script.onerror = function () { board.title.textContent = map.name + " – the map image could not be loaded"; };
		document.head.appendChild(script);
	}

	function open(m, v, closed)
	{
		if (!board)
		{
			build();
		}
		map = m;
		sd = window.COD2_SD ? window.COD2_SD[m.id] || null : null;
		onClose = closed || null;
		resetLayers();
		laser = [];
		active = map.attackers === "axis" ? "axis" : "allies";
		setupSides();
		board.root.hidden = false;
		board.root.classList.remove("is-clean");
		document.documentElement.classList.add("t2-open");
		board.title.textContent = m.name;
		board.help.hidden = true;
		setTool("arrow");
		loadImages(function (images)
		{
			setView(images[v] ? v : (images.topdown ? "topdown" : "radar"), images);
			refresh();
		});
		refresh();
		if (!helpShown)
		{
			showHelp();
		}
		else
		{
			board.overlay.focus();
		}
	}

	// Closing throws the drawing away.
	function close()
	{
		stopPlay();
		closeTextInput(false);
		closeConfirm(false);
		closeFlyouts();
		if (document.fullscreenElement)
		{
			document.exitFullscreen();
		}
		board.root.hidden = true;
		document.documentElement.classList.remove("t2-open");
		resetLayers();
		if (onClose)
		{
			onClose(map);
		}
	}

	// A copy of both layers, for checks; changing it changes nothing.
	function state()
	{
		var out = { active: active, tool: tool, layers: {} };
		SIDES.forEach(function (s)
		{
			var l = layers[s];
			out.layers[s] = JSON.parse(JSON.stringify({ phases: l.phases, current: l.current, visible: l.visible,
				undo: l.history.length, redo: l.future.length }));
		});
		return out;
	}

	return { open: open, state: state };
})();
