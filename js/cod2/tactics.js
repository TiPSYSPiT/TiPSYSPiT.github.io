/*
 * CoD2 tactics board (maps tab): plan and present an S&D round on a map's
 * overhead image. Nothing is saved: the drawing is gone when the board closes,
 * the map changes or the page reloads; only the PNG export keeps it.
 *
 * How it works for the user:
 *   - Each side has a rail at its edge (Allies left, Axis right) with its
 *     players 1–5 and its tools. Drag a player onto the map; click a player for
 *     Route / Smoke / Frag / Look; routes, throws and cones start at the player
 *     and move with it.
 *   - Right-click (long-press on touch) opens a radial menu at the pointer.
 *   - "Start from" builds a plan from the map's spawns and bomb sites.
 *   - The timeline has a track per side; each side has its own phases, undo /
 *     redo and visibility. Play (and Present) steps both together and glides
 *     the players from phase to phase.
 *   - Present hides everything but the map, a small step bar and the laser.
 *   - Wheel / pinch zooms, drag on the empty map (or middle mouse, or Space)
 *     pans; double-click the empty map or 0 resets.
 *
 * Under the drawing, fixed: the S&D spawns of both sides and the bomb sites A
 * and B (window.COD2_SD, js/cod2/tactics-data.js), placed with the world
 * rectangle of the image (map.world): u = (x - minX) / width,
 * v = (maxY - y) / height. Sides, nations and colors: map.allies / axis /
 * attackers and window.COD2_NAMES.teams; grenades: window.COD2_GRENADES (a
 * frag's ring is its real 256-unit radius).
 *
 * Map positions are kept as (u, v) in 0..1 across the image, sizes as
 * fractions of the image width. The images come from js/cod2/maps/<map>.js as
 * data URLs, so the canvas stays exportable on file:// too.
 *
 * window.COD2_TACTICS.open(map, view, onClose); state(): a copy of both
 * layers, for checks; _test: helpers for the browser tests.
 */
window.COD2_TACTICS = (function ()
{
	"use strict";

	var el = window.UI.el;

	var SIDES = ["allies", "axis"];
	var FALLBACK = { allies: [64, 191, 64], axis: [153, 153, 153] };
	var SITE_COLOR = "#ff453a";
	var WIDTH_UNIT = 0.0022;          // line width 1 = 0.22% of the image
	var PLAYER_R = 0.019;
	var SMOKE_R = 0.045;
	var FRAG_R = 0.045;               // when the image has no world rectangle
	var ICON_R = 0.014;
	var CONE_SPREAD = 80;             // degrees: cg_fov's default
	var CONE_LEN = 0.11;
	var SPAWN_PAD = 56;               // units around the spawn points for their zone
	var SPAWN_GAP = 400;              // spawn points closer than this form one zone
	var SNAP_PX = 16;
	var CACHE = 2048;                 // the fixed layer is drawn once at this size
	var ZOOM_MAX = 5;
	var LASER_MS = 1500;
	var PLAY_MS = 2200;
	var GLIDE_MS = 650;
	var LONG_PRESS_MS = 480;
	var HISTORY_MAX = 100;

	// Tools of a rail, in order; key: the number key.
	var TOOLS = [
		{ id: "move", key: "1", label: "Move / select", icon: '<path d="M5 3l11 7-5 1.5L8.5 17z" fill="currentColor"/>' },
		{ id: "route", key: "2", label: "Route (drag from a player and it moves with the player)", icon: '<path d="M3 16c4 0 4-9 9-9h4"/><path d="M13 4l3 3-3 3"/>' },
		{ id: "smoke", key: "3", label: "Smoke (drag from a player: thrown by the player)", icon: '<circle cx="8" cy="11" r="4.5" fill="currentColor" fill-opacity=".4"/><circle cx="12.5" cy="8.5" r="4.5" fill="currentColor" fill-opacity=".4"/>' },
		{ id: "frag", key: "4", label: "Frag grenade, 256-unit radius (drag from a player: thrown by the player)", icon: '<circle cx="10" cy="11.5" r="4"/><path d="M10 7.5V4.5h3M13 4.5l2 2"/>' },
		{ id: "cone", key: "5", label: "Look: an 80° view cone (drag from a player to aim)", icon: '<path d="M4 15L16 5M4 15L17 12"/><path d="M4 15L16 5Q18 9 17 12z" fill="currentColor" fill-opacity=".3"/>' },
		{ id: "pen", key: "6", label: "Pen", icon: '<path d="M3 15c3-6 5 2 8-3s3-6 6-8"/>' },
		{ id: "text", key: "7", label: "Text (click, type, Enter)", icon: '<path d="M4 5h12M10 5v11"/>' },
		{ id: "laser", key: "8", label: "Laser pointer (fades, nothing is kept)", icon: '<circle cx="14" cy="6" r="2.5" fill="currentColor"/><path d="M3 17l9-9" stroke-dasharray="2 2"/>' },
		{ id: "erase", key: "9", label: "Eraser (only this side's drawing)", icon: '<path d="M7 16l-3.5-3.5 8-8 6 6-6 6H17"/>' }
	];
	var ICON = {
		eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.5" fill="currentColor"/>',
		eyeOff: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><path d="M3 17L17 3"/>',
		undo: '<path d="M7 5L3 9l4 4M3 9h9a5 5 0 010 10H9"/>',
		redo: '<path d="M13 5l4 4-4 4M17 9H8a5 5 0 000 10h3"/>',
		clear: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
		play: '<path d="M6 4l10 6-10 6z" fill="currentColor"/>',
		pause: '<path d="M6 4v12M14 4v12" stroke-width="3"/>',
		plus: '<path d="M10 4v12M4 10h12"/>',
		minus: '<path d="M4 10h12"/>',
		close: '<path d="M5 5l10 10M15 5L5 15"/>',
		back: '<path d="M12 4l-6 6 6 6"/>',
		next: '<path d="M8 4l6 6-6 6"/>',
		export: '<path d="M10 3v10M6 9l4 4 4-4M4 16h12"/>',
		present: '<rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 13.5V17"/>',
		help: '<circle cx="10" cy="10" r="7.5"/><path d="M8 8a2 2 0 113 1.7c-.7.4-1 .8-1 1.6M10 14v.2"/>',
		more: '<circle cx="5" cy="10" r="1.3" fill="currentColor"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/><circle cx="15" cy="10" r="1.3" fill="currentColor"/>',
		onion: '<circle cx="8" cy="10" r="5" stroke-dasharray="2 2"/><circle cx="12" cy="10" r="5"/>',
		spawn: '<path d="M10 3l5 12-5-3-5 3z" fill="currentColor" fill-opacity=".5"/>',
		site: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M8 13l2-6 2 6M8.7 11h2.6"/>',
		templates: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
		fullscreen: '<path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/>',
		trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
		dashed: '<path d="M3 10h3M8.5 10h3M14 10h3"/>',
		thin: '<path d="M3 10h14" stroke-width="1"/>',
		thick: '<path d="M3 10h14" stroke-width="4"/>',
		swap: '<path d="M4 7h12l-3-3M16 13H4l3 3"/>',
		zoom: '<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>'
	};
	var PLAYER_ACTIONS = [
		{ id: "route", label: "Route", icon: TOOLS[1].icon },
		{ id: "smoke", label: "Smoke", icon: TOOLS[2].icon },
		{ id: "frag", label: "Frag", icon: TOOLS[3].icon },
		{ id: "cone", label: "Look", icon: TOOLS[4].icon }
	];

	var board = null;           // the board's elements, built on the first open
	var map = null;
	var sd = null;              // window.COD2_SD[map.id]
	var view = "topdown";
	var image = null;           // the background as an Image
	var images = null;          // the map's board images (topdown / radar data URLs)
	var onClose = null;

	// Per side: { phases: [{ name, objects }], current, history, future, visible }.
	var layers = null;
	var active = "allies";
	var tool = "move";
	var selected = null;        // an object of the active layer's current phase
	var pending = null;         // { action, n }: the next click does this for player n
	var placing = 0;            // a roster player waiting for its click on the map
	var opts = { width: 4, spawns: true, sites: true, legend: true, scale: true, onion: true, cursor: false };
	var present = false;
	var nextId = 1;
	var icons = {};             // grenade icon name -> Image
	var coachShown = false;     // the first-open hints, once per page load

	var zoom = { z: 1, cu: 0.5, cv: 0.5 };   // zoom and the map point at the stage's centre
	var stageW = 0;
	var stageH = 0;
	var fixedCache = null;
	var drag = null;            // what the pointer is doing
	var draft = null;           // an object being drawn
	var snapAt = null;          // the snap target shown while dragging
	var laser = [];
	var pointer = null;         // last pointer position (u, v)
	var touches = {};           // active touch pointers, for pinch
	var gesture = null;
	var longPress = 0;
	var longPressed = false;    // the radial opened by a long-press: its finger's click is not a choice
	var swallowUntil = 0;
	var spaceDown = false;
	var spaceUsed = false;      // Space was held to pan: no play on release
	var playTimer = 0;
	var playStep = 0;
	var glide = null;           // { start, from: { side: { n: [u, v] } } }
	var animating = false;
	var confirmAction = null;
	var lastClip = null;        // the last clip clicked, for the double-click rename
	// Markers (players, lines, icons) grow only a little when zooming in: their
	// size is S * sizeK with sizeK = zoom^-0.7 on screen, 1 in the PNG.
	var sizeK = 1;

	/* ---------- layers and history ---------- */

	function newLayer()
	{
		return { phases: [{ name: "Setup", objects: [] }], current: 0, history: [], future: [], visible: true };
	}

	function layer(side)
	{
		return layers[side || active];
	}

	function phase(side, index)
	{
		var l = layer(side);
		return l.phases[index === undefined ? l.current : index];
	}

	function objects(side)
	{
		return phase(side).objects;
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

	// Before every change of a layer (or with a snapshot taken earlier, once the
	// change really happens); undo goes back to this point.
	function remember(side, before)
	{
		var l = layer(side);
		l.history.push(before || snapshot(side));
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
		if (l.history.length)
		{
			l.future.push(snapshot(side));
			restore(side, l.history.pop());
			refresh();
		}
	}

	function redo(side)
	{
		side = side || active;
		var l = layer(side);
		if (l.future.length)
		{
			l.history.push(snapshot(side));
			restore(side, l.future.pop());
			refresh();
		}
	}

	function setActive(side)
	{
		if (side !== active)
		{
			closeTextInput(true);
			active = side;
			selected = null;
			pending = null;
			placing = 0;
			draft = null;
		}
		layers[side].visible = true;
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

	/* ---------- sides, grenades, the world ---------- */

	function hex(rgb)
	{
		return "#" + rgb.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
	}

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

	function sideName(side)
	{
		return sideWord(side) + " – " + nation(side).name;
	}

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

	function worldWidth()
	{
		var r = worldRect();
		return r ? r[2] - r[0] : 0;
	}

	function toUV(x, y)
	{
		var r = worldRect();
		return [(x - r[0]) / (r[2] - r[0]), (r[3] - y) / (r[3] - r[1])];
	}

	function fragR(side)
	{
		var w = worldWidth();
		var g = grenade("frag", side);
		return w ? (g ? g.radius : 256) / w : FRAG_R;
	}

	function hasSd()
	{
		return !!(sd && worldRect());
	}

	/* ---------- the view: zoom and pan ---------- */

	// The map's size and top-left corner on the stage, in CSS pixels.
	function viewBox()
	{
		var base = Math.max(50, Math.min(stageW, stageH) - (present ? 0 : 16));
		var s = base * zoom.z;
		return { s: s, x: stageW / 2 - zoom.cu * s, y: stageH / 2 - zoom.cv * s, base: base };
	}

	function toScreen(p)
	{
		var b = viewBox();
		return [b.x + p[0] * b.s, b.y + p[1] * b.s];
	}

	function fromClient(clientX, clientY)
	{
		var r = board.overlay.getBoundingClientRect();
		var b = viewBox();
		return [(clientX - r.left - b.x) / b.s, (clientY - r.top - b.y) / b.s];
	}

	function clampView()
	{
		zoom.z = Math.max(1, Math.min(ZOOM_MAX, zoom.z));
		sizeK = Math.pow(zoom.z, -0.7);
		if (zoom.z === 1)
		{
			zoom.cu = 0.5;
			zoom.cv = 0.5;
			return;
		}
		var half = 0.5 / zoom.z;
		zoom.cu = Math.max(half * 0.6, Math.min(1 - half * 0.6, zoom.cu));
		zoom.cv = Math.max(half * 0.6, Math.min(1 - half * 0.6, zoom.cv));
	}

	// Zoom by factor k, keeping the stage point (sx, sy) where it is.
	function zoomAt(k, sx, sy)
	{
		var b = viewBox();
		var u = (sx - b.x) / b.s;
		var v = (sy - b.y) / b.s;
		zoom.z = Math.max(1, Math.min(ZOOM_MAX, zoom.z * k));
		var s1 = b.base * zoom.z;
		zoom.cu = (stageW / 2 - (sx - u * s1)) / s1;
		zoom.cv = (stageH / 2 - (sy - v * s1)) / s1;
		clampView();
		renderAll();
		renderZoom();
	}

	function panBy(dx, dy)
	{
		var b = viewBox();
		zoom.cu -= dx / b.s;
		zoom.cv -= dy / b.s;
		clampView();
		renderAll();
	}

	function resetView()
	{
		zoom = { z: 1, cu: 0.5, cv: 0.5 };
		sizeK = 1;
		renderAll();
		renderZoom();
	}

	/* ---------- the fixed layer: image, spawns, bomb sites ---------- */

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

	// Spawn points in groups (indexes): closer than SPAWN_GAP units join a group.
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

	// A spawn group's zone: the widened hull, see-through, with a solid edge.
	function drawSpawnZone(ctx, pts, color, S)
	{
		var h = hull(pts);
		var pad = SPAWN_PAD / worldWidth() * S * 2;
		var edge = Math.max(2, S * 0.0022);
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
		var scratch = function ()
		{
			var c = document.createElement("canvas");
			c.width = ctx.canvas.width;
			c.height = ctx.canvas.height;
			var z = c.getContext("2d");
			z.setTransform(ctx.getTransform());
			z.fillStyle = z.strokeStyle = color;
			return { canvas: c, ctx: z };
		};
		var fill = scratch();
		shape(fill.ctx, 0);
		var ring = scratch();
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

	function drawSpawn(ctx, q, yaw, color, S)
	{
		var r = Math.max(4, S * 0.007);
		var a = -yaw * Math.PI / 180;
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

	function outlinedText(ctx, text, x, y, fs, color, weight)
	{
		ctx.font = (weight || 800) + " " + fs + "px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = fs * 0.3;
		ctx.strokeStyle = "rgba(0,0,0,0.85)";
		ctx.strokeText(text, x, y);
		ctx.fillStyle = color;
		ctx.fillText(text, x, y);
	}

	function drawFixed(ctx, S)
	{
		if (!hasSd())
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
				ctx.fillStyle = "rgba(255,69,58,0.2)";
				ctx.fillRect(a[0] * S, a[1] * S, (b[0] - a[0]) * S, (b[1] - a[1]) * S);
				ctx.strokeStyle = SITE_COLOR;
				ctx.lineWidth = Math.max(2, S * 0.0028);
				ctx.strokeRect(a[0] * S, a[1] * S, (b[0] - a[0]) * S, (b[1] - a[1]) * S);
				var c = toUV(site.origin[0], site.origin[1]);
				var r = Math.max(9, S * 0.016);
				ctx.beginPath();
				ctx.arc(c[0] * S, c[1] * S, r, 0, Math.PI * 2);
				ctx.fillStyle = SITE_COLOR;
				ctx.fill();
				ctx.lineWidth = Math.max(1.5, r * 0.14);
				ctx.strokeStyle = "#fff";
				ctx.stroke();
				ctx.font = "800 " + r * 1.25 + "px system-ui, sans-serif";
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
				var fs = Math.max(10, S * 0.013);
				groups.forEach(function (g)
				{
					var gp = g.map(function (i) { return pts[i]; });
					var top = gp.reduce(function (m, q) { return q[1] < m[1] ? q : m; }, gp[0]);
					var cx = gp.reduce(function (t, q) { return t + q[0]; }, 0) / gp.length;
					outlinedText(ctx, spawnRole === "attacker" ? "ATTACK SPAWN" : "DEFENSE SPAWN", cx * S,
						top[1] * S - SPAWN_PAD / worldWidth() * S - fs * 0.8, fs, "#fff");
				});
			});
		}
		ctx.restore();
	}

	// The image and the fixed overlay, drawn once at CACHE pixels.
	function buildFixed()
	{
		if (!image || !image.naturalWidth)
		{
			fixedCache = null;
			return;
		}
		var c = fixedCache || document.createElement("canvas");
		c.width = CACHE;
		c.height = CACHE;
		var ctx = c.getContext("2d");
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, CACHE, CACHE);
		ctx.drawImage(image, 0, 0, CACHE, CACHE);
		drawFixed(ctx, CACHE);
		fixedCache = c;
	}

	// What the markers mean and which nation attacks (for the PNG; on screen the
	// legend is in the page).
	function drawLegend(ctx, S)
	{
		if (!opts.legend || !hasSd() || !(opts.spawns || opts.sites))
		{
			return;
		}
		var fs = Math.max(11, S * 0.017);
		var rows = [];
		if (opts.spawns)
		{
			rows.push({ side: sd.attackers, text: "Attack · " + sideName(sd.attackers) });
			rows.push({ side: sd.defenders, text: "Defense · " + sideName(sd.defenders) });
		}
		if (opts.sites)
		{
			rows.push({ site: true, text: "Bomb sites A / B" });
		}
		ctx.save();
		ctx.font = "600 " + fs + "px system-ui, sans-serif";
		var w = Math.max.apply(null, rows.map(function (r) { return ctx.measureText(r.text).width; })) + fs * 2.4;
		var line = fs * 1.6;
		var pad = fs * 0.6;
		var x = S * 0.025;
		var y = S * 0.025;
		ctx.fillStyle = "rgba(0,0,0,0.66)";
		ctx.fillRect(x, y, w + pad * 2, rows.length * line + pad * 2);
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
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(r.text, x + pad + fs * 1.8, cy);
		});
		ctx.restore();
	}

	function scaleLength(w)
	{
		var target = w * 0.2;
		var step = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
		return [5, 2, 1].map(function (f) { return f * step; }).filter(function (v) { return v <= target; })[0] || step;
	}

	// A scale bar in game units at the map's bottom left (map coordinates).
	function drawScale(ctx, S)
	{
		var w = worldWidth();
		if (!opts.scale || !w)
		{
			return;
		}
		var units = scaleLength(w);
		var len = units / w * S;
		var fs = Math.max(10, S * 0.017);
		var pad = fs * 0.5;
		var bar = Math.max(4, S * 0.005);
		var x = S * 0.025 + pad;
		var y = S * 0.975 - pad;
		var label = units + " units";
		ctx.save();
		ctx.font = "700 " + fs + "px system-ui, sans-serif";
		var tw = Math.max(len, ctx.measureText(label).width);
		ctx.fillStyle = "rgba(0,0,0,0.6)";
		ctx.fillRect(x - pad, y - bar - fs * 1.3 - pad, tw + pad * 2, bar + fs * 1.3 + pad * 2);
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

	/* ---------- objects: players and what hangs on them ---------- */

	function playerIn(list, n)
	{
		for (var i = 0; i < list.length; i++)
		{
			if (list[i].type === "player" && list[i].n === n)
			{
				return list[i];
			}
		}
		return null;
	}

	// Positions that hang on a player follow it (glide: its animated position).
	function playerPos(list, n, side)
	{
		var pl = playerIn(list, n);
		if (!pl)
		{
			return null;
		}
		return glidePos(side, pl) || pl.p;
	}

	function anchor(o, list, side)
	{
		if (o.type === "arrow")
		{
			return (o.from && playerPos(list, o.from, side)) || o.p0;
		}
		if (o.type === "smoke" || o.type === "frag")
		{
			return (o.fromPlayer && playerPos(list, o.fromPlayer, side)) || o.from;
		}
		if (o.type === "cone")
		{
			return (o.fromPlayer && playerPos(list, o.fromPlayer, side)) || o.p;
		}
		return null;
	}

	// Before a player goes: what hung on it keeps its current place.
	function detach(list, n)
	{
		list.forEach(function (o)
		{
			var a = anchor(o, list);
			if (o.type === "arrow" && o.from === n) { o.p0 = a; delete o.from; }
			if ((o.type === "smoke" || o.type === "frag") && o.fromPlayer === n) { o.from = a; delete o.fromPlayer; }
			if (o.type === "cone" && o.fromPlayer === n) { o.p = a; delete o.fromPlayer; }
		});
	}

	function removeObject(list, o)
	{
		var i = list.indexOf(o);
		if (i === -1)
		{
			return;
		}
		if (o.type === "player")
		{
			detach(list, o.n);
		}
		list.splice(i, 1);
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
		if (pts.length === 1)
		{
			return dist(p, pts[0]);
		}
		var best = Infinity;
		for (var i = 1; i < pts.length; i++)
		{
			best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
		}
		return best;
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

	function arrowPath(o, list, side)
	{
		var a = anchor(o, list, side);
		return o.c ? curvePoints(a, o.c, o.p1) : [a, o.p1];
	}

	function conePoints(o, list, side)
	{
		var p = anchor(o, list, side);
		var a = o.dir - o.spread / 2;
		var b = o.dir + o.spread / 2;
		return [p, [p[0] + Math.cos(a) * o.len, p[1] + Math.sin(a) * o.len], [p[0] + Math.cos(b) * o.len, p[1] + Math.sin(b) * o.len]];
	}

	function textSize(o)
	{
		return 0.02 + (o.width || 4) * 0.003;
	}

	var measure = null;
	function textWidth(o)
	{
		measure = measure || document.createElement("canvas").getContext("2d");
		measure.font = "700 " + textSize(o) * 1000 + "px system-ui, sans-serif";
		return measure.measureText(o.text).width / 1000;
	}

	function hitDistance(o, p, list)
	{
		switch (o.type)
		{
			case "player":
				return Math.max(0, dist(p, o.p) - PLAYER_R * sizeK);
			case "arrow":
				return polyDist(p, arrowPath(o, list));
			case "pen":
				return polyDist(p, o.pts);
			case "text":
				var w = textWidth(o);
				var h = textSize(o);
				return p[0] >= o.p[0] && p[0] <= o.p[0] + w && p[1] >= o.p[1] - h && p[1] <= o.p[1] + h * 0.3 ? 0 : Infinity;
			case "smoke":
			case "frag":
				var d = Math.max(0, dist(p, o.p) - (o.type === "smoke" ? SMOKE_R * 0.7 : ICON_R));
				var from = anchor(o, list);
				return from ? Math.min(d, segDist(p, from, o.p)) : d;
			case "cone":
				var pts = conePoints(o, list);
				return inPolygon(p, pts) ? 0 : polyDist(p, pts.concat([pts[0]]));
		}
		return Infinity;
	}

	// The topmost object of the active layer's current phase under p; players first.
	function hitTest(p, onlyPlayers)
	{
		var list = objects();
		var tol = 10 / viewBox().s;
		var best = null;
		var nearest = null;
		var nearestD = Infinity;
		for (var i = list.length - 1; i >= 0; i--)
		{
			var o = list[i];
			if (onlyPlayers && o.type !== "player")
			{
				continue;
			}
			if (o.type === "player")
			{
				// Players close together: the one nearest to the pointer.
				var d = dist(p, o.p);
				if (d <= PLAYER_R * sizeK + tol && d < nearestD)
				{
					nearest = o;
					nearestD = d;
				}
			}
			else if (!best && hitDistance(o, p, list) <= tol + (o.width || 0) * WIDTH_UNIT / 2)
			{
				best = o;
			}
		}
		return nearest || best;
	}

	function handles(o, list)
	{
		switch (o.type)
		{
			case "arrow":
				var a = anchor(o, list);
				var out = [{ key: "p1", p: o.p1 }, { key: "c", p: o.c || [(a[0] + o.p1[0]) / 2, (a[1] + o.p1[1]) / 2], bend: true }];
				if (!o.from)
				{
					out.unshift({ key: "p0", p: o.p0 });
				}
				return out;
			case "cone":
				var pts = conePoints(o, list);
				var c = pts[0];
				return [{ key: "tip", p: [c[0] + Math.cos(o.dir) * o.len, c[1] + Math.sin(o.dir) * o.len] }, { key: "spread", p: pts[2], bend: true }];
			case "smoke":
			case "frag":
				return o.from && !o.fromPlayer ? [{ key: "from", p: o.from }] : [];
		}
		return [];
	}

	function moveObject(o, dx, dy)
	{
		["p", "p0", "p1", "c", "from"].forEach(function (k)
		{
			if (o[k] && typeof o[k] === "object")
			{
				o[k] = [o[k][0] + dx, o[k][1] + dy];
			}
		});
		if (o.pts)
		{
			o.pts = o.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
		}
	}

	function setHandle(o, key, p, list)
	{
		if (key === "tip")
		{
			var c = anchor(o, list);
			o.dir = Math.atan2(p[1] - c[1], p[0] - c[0]);
			o.len = Math.max(0.02, dist(p, c));
		}
		else if (key === "spread")
		{
			var c2 = anchor(o, list);
			var a = Math.atan2(p[1] - c2[1], p[0] - c2[0]) - o.dir;
			a = Math.atan2(Math.sin(a), Math.cos(a));
			o.spread = Math.max(0.09, Math.min(Math.PI * 1.6, Math.abs(a) * 2));
		}
		else
		{
			o[key] = p;
		}
	}

	// Spawn points and bomb sites near p (within SNAP_PX on screen), or null;
	// not a point another player of the side already stands on.
	function snapTarget(p, self)
	{
		if (!hasSd())
		{
			return null;
		}
		var tol = SNAP_PX / viewBox().s;
		var best = null;
		var bestD = tol;
		var taken = objects().filter(function (o) { return o.type === "player" && o !== self; });
		var test = function (q, kind)
		{
			var d = dist(p, q);
			if (d < bestD && !taken.some(function (o) { return dist(o.p, q) < PLAYER_R * 1.5; }))
			{
				bestD = d;
				best = { p: q, kind: kind };
			}
		};
		if (opts.sites)
		{
			sd.sites.forEach(function (s) { test(toUV(s.origin[0], s.origin[1]), "site " + s.label); });
		}
		if (opts.spawns)
		{
			["attacker", "defender"].forEach(function (r)
			{
				sd.spawns[r].forEach(function (s) { test(toUV(s[0], s[1]), "spawn"); });
			});
		}
		return best;
	}

	function snapped(p, event, self)
	{
		snapAt = event && event.altKey ? null : snapTarget(p, self);
		return snapAt ? snapAt.p.slice() : p;
	}

	/* ---------- drawing objects ---------- */

	function edgeStroke(ctx, w)
	{
		ctx.save();
		ctx.strokeStyle = "rgba(0,0,0,0.55)";
		ctx.lineWidth = w + Math.max(2, w * 0.6);
		ctx.stroke();
		ctx.restore();
		ctx.stroke();
	}

	function drawArrow(ctx, o, S, w, list, side)
	{
		var path = arrowPath(o, list, side);
		var end = path[path.length - 1];
		var before = path[path.length - 2];
		var angle = Math.atan2(end[1] - before[1], end[0] - before[0]);
		var head = Math.max(w * 3.2, S * sizeK * 0.015);
		var stop = [end[0] - Math.cos(angle) * head * 0.8 / S, end[1] - Math.sin(angle) * head * 0.8 / S];
		var pts = path.slice(0, -1).concat([stop]);
		// A route from a player starts at the token's edge.
		if (o.from)
		{
			var a = pts[0];
			var b = pts[1];
			var d = dist(a, b);
			var pr = PLAYER_R * sizeK;
			if (d > pr)
			{
				pts[0] = [a[0] + (b[0] - a[0]) * pr / d, a[1] + (b[1] - a[1]) * pr / d];
			}
		}
		ctx.setLineDash(o.dashed ? [w * 2.6, w * 2] : []);
		ctx.beginPath();
		ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
		pts.slice(1).forEach(function (q) { ctx.lineTo(q[0] * S, q[1] * S); });
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

	function drawGrenade(ctx, o, S, side, color, list)
	{
		var x = o.p[0] * S;
		var y = o.p[1] * S;
		var from = anchor(o, list, side);
		if (from)
		{
			// The throw: a dashed arc from the thrower.
			ctx.save();
			ctx.strokeStyle = "rgba(255,255,255,0.9)";
			ctx.lineWidth = Math.max(1.5, S * sizeK * 0.0025);
			ctx.setLineDash([S * sizeK * 0.008, S * sizeK * 0.007]);
			var mx = (from[0] + o.p[0]) / 2;
			var my = (from[1] + o.p[1]) / 2 - dist(from, o.p) * 0.25;
			ctx.beginPath();
			ctx.moveTo(from[0] * S, from[1] * S);
			ctx.quadraticCurveTo(mx * S, my * S, x, y);
			ctx.stroke();
			ctx.restore();
		}
		if (o.type === "smoke")
		{
			var r = SMOKE_R * S;
			[[0, 0, 1], [-0.45, 0.2, 0.7], [0.45, 0.15, 0.72], [0.1, -0.42, 0.68], [-0.2, 0.45, 0.6]].forEach(function (c)
			{
				var g = ctx.createRadialGradient(x + c[0] * r, y + c[1] * r, 0, x + c[0] * r, y + c[1] * r, r * c[2]);
				g.addColorStop(0, "rgba(238,238,232,0.8)");
				g.addColorStop(1, "rgba(200,200,195,0)");
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(x + c[0] * r, y + c[1] * r, r * c[2], 0, Math.PI * 2);
				ctx.fill();
			});
		}
		else
		{
			ctx.strokeStyle = color;
			ctx.lineWidth = Math.max(2, S * sizeK * 0.0032);
			ctx.setLineDash([S * sizeK * 0.01, S * sizeK * 0.007]);
			ctx.beginPath();
			ctx.arc(x, y, fragR(side) * S, 0, Math.PI * 2);
			edgeStroke(ctx, ctx.lineWidth);
			ctx.setLineDash([]);
			ctx.fillStyle = color;
			ctx.globalAlpha *= 0.15;
			ctx.fill();
			ctx.globalAlpha /= 0.15;
		}
		// The side's HUD icon on a disc.
		var g2 = grenade(o.type, side);
		var icon = g2 ? iconImage(g2.icon) : null;
		var ir = ICON_R * S * sizeK * (o.type === "smoke" ? 0.85 : 1);
		ctx.save();
		ctx.fillStyle = "rgba(20,22,18,0.88)";
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(1.5, S * sizeK * 0.0028);
		ctx.beginPath();
		ctx.arc(x, y, ir, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		if (icon)
		{
			ctx.drawImage(icon, x - ir * 0.8, y - ir * 0.8, ir * 1.6, ir * 1.6);
		}
		ctx.restore();
	}

	function drawPlayer(ctx, p, n, S, color, ink)
	{
		var x = p[0] * S;
		var y = p[1] * S;
		var r = PLAYER_R * S * sizeK;
		ctx.save();
		ctx.shadowColor = "rgba(0,0,0,0.6)";
		ctx.shadowBlur = r * 0.5;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.shadowBlur = 0;
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = Math.max(2, r * 0.15);
		ctx.stroke();
		ctx.strokeStyle = "rgba(0,0,0,0.7)";
		ctx.lineWidth = Math.max(1, r * 0.07);
		ctx.beginPath();
		ctx.arc(x, y, r + Math.max(2, r * 0.15) / 2 + ctx.lineWidth / 2, 0, Math.PI * 2);
		ctx.stroke();
		ctx.font = "800 " + Math.round(r * 1.2) + "px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineWidth = Math.max(1.5, r * 0.14);
		ctx.strokeStyle = ink === "#111" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)";
		ctx.strokeText(String(n), x, y + r * 0.06);
		ctx.fillStyle = ink;
		ctx.fillText(String(n), x, y + r * 0.06);
		ctx.restore();
	}

	function drawObject(ctx, o, S, side, list, alpha)
	{
		var color = sideColor(side);
		var w = Math.max(1.5, (o.width || opts.width) * WIDTH_UNIT * S * sizeK);
		ctx.save();
		ctx.globalAlpha = alpha === undefined ? 1 : alpha;
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = w;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		switch (o.type)
		{
			case "player":
				drawPlayer(ctx, (alpha === undefined && glidePos(side, o)) || o.p, o.n, S, color, sideInk(side));
				break;
			case "arrow":
				drawArrow(ctx, o, S, w, list, side);
				break;
			case "pen":
				ctx.setLineDash(o.dashed ? [w * 2.6, w * 2] : []);
				ctx.beginPath();
				ctx.moveTo(o.pts[0][0] * S, o.pts[0][1] * S);
				for (var i = 1; i < o.pts.length - 1; i++)
				{
					ctx.quadraticCurveTo(o.pts[i][0] * S, o.pts[i][1] * S, (o.pts[i][0] + o.pts[i + 1][0]) / 2 * S, (o.pts[i][1] + o.pts[i + 1][1]) / 2 * S);
				}
				var last = o.pts[o.pts.length - 1];
				ctx.lineTo(last[0] * S, last[1] * S);
				edgeStroke(ctx, w);
				break;
			case "text":
				var fs = textSize(o) * S;
				ctx.font = "700 " + fs + "px system-ui, sans-serif";
				ctx.textBaseline = "alphabetic";
				ctx.lineJoin = "round";
				ctx.lineWidth = fs * 0.22;
				ctx.strokeStyle = "rgba(0,0,0,0.85)";
				ctx.strokeText(o.text, o.p[0] * S, o.p[1] * S);
				ctx.fillStyle = side === "axis" ? "#e6e6e6" : color;
				ctx.fillText(o.text, o.p[0] * S, o.p[1] * S);
				break;
			case "smoke":
			case "frag":
				drawGrenade(ctx, o, S, side, color, list);
				break;
			case "cone":
				var pts = conePoints(o, list, side);
				ctx.beginPath();
				ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
				ctx.lineTo(pts[1][0] * S, pts[1][1] * S);
				ctx.arc(pts[0][0] * S, pts[0][1] * S, o.len * S, o.dir - o.spread / 2, o.dir + o.spread / 2);
				ctx.closePath();
				ctx.globalAlpha *= 0.24;
				ctx.fill();
				ctx.globalAlpha /= 0.24;
				ctx.lineWidth = Math.max(1, w * 0.5);
				edgeStroke(ctx, ctx.lineWidth);
				break;
		}
		ctx.restore();
	}

	// A phase of a side: drawings first, players on top.
	function drawPhase(ctx, S, side, index, alpha)
	{
		var list = phase(side, index).objects;
		var others = list.filter(function (o) { return o.type !== "player"; });
		var players = list.filter(function (o) { return o.type === "player"; });
		var fade = glide ? glideT() : 1;
		others.forEach(function (o) { drawObject(ctx, o, S, side, list, (alpha || 1) * (alpha ? 1 : fade)); });
		players.forEach(function (o) { drawObject(ctx, o, S, side, list, alpha); });
	}

	// The visible layers at index(side); the active layer on top. With the onion
	// skin, each layer's phase before it is faded underneath.
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
				drawPhase(ctx, S, side, i - 1, 0.22);
			}
			drawPhase(ctx, S, side, i);
		});
	}

	/* ---------- glide: players move from phase to phase ---------- */

	function startGlide(prev)
	{
		glide = { start: performance.now(), from: prev };
		animate();
	}

	function glideT()
	{
		var t = Math.min(1, (performance.now() - glide.start) / GLIDE_MS);
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	}

	function glidePos(side, o)
	{
		if (!glide || !side || !glide.from[side] || !glide.from[side][o.n])
		{
			return null;
		}
		var a = glide.from[side][o.n];
		var t = glideT();
		return [a[0] + (o.p[0] - a[0]) * t, a[1] + (o.p[1] - a[1]) * t];
	}

	// The current player positions of the visible layers.
	function playerPositions()
	{
		var out = {};
		SIDES.forEach(function (side)
		{
			out[side] = {};
			objects(side).forEach(function (o) { if (o.type === "player") { out[side][o.n] = o.p.slice(); } });
		});
		return out;
	}

	function animate()
	{
		if (animating)
		{
			return;
		}
		animating = true;
		window.requestAnimationFrame(function frame()
		{
			animating = false;
			if (glide && performance.now() - glide.start > GLIDE_MS)
			{
				glide = null;
			}
			renderMain();
			renderOverlay();
			if (glide || laser.length)
			{
				animate();
			}
		});
	}

	/* ---------- rendering ---------- */

	function prepare(canvas)
	{
		var ratio = window.devicePixelRatio || 1;
		var w = Math.round(stageW * ratio);
		var h = Math.round(stageH * ratio);
		if (canvas.width !== w || canvas.height !== h)
		{
			canvas.width = w;
			canvas.height = h;
		}
		var ctx = canvas.getContext("2d");
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, stageW, stageH);
		return ctx;
	}

	// The map's transform on a stage canvas: map units -> CSS pixels.
	function mapSpace(ctx)
	{
		var b = viewBox();
		ctx.translate(b.x, b.y);
		return b.s;
	}

	function renderBase()
	{
		if (!stageW)
		{
			return;
		}
		var ctx = prepare(board.base);
		if (!fixedCache)
		{
			return;
		}
		var b = viewBox();
		ctx.imageSmoothingQuality = "high";
		ctx.shadowColor = "rgba(0,0,0,0.6)";
		ctx.shadowBlur = present ? 0 : 30;
		ctx.drawImage(fixedCache, b.x, b.y, b.s, b.s);
	}

	function renderMain()
	{
		if (!stageW || !layers)
		{
			return;
		}
		var ctx = prepare(board.main);
		ctx.save();
		sizeK = Math.pow(zoom.z, -0.7);
		var S = mapSpace(ctx);
		drawLayers(ctx, S, function (side) { return layers[side].current; }, opts.onion && !present);
		drawScale(ctx, S);
		ctx.restore();
	}

	function renderOverlay()
	{
		if (!stageW || !layers)
		{
			return;
		}
		var ctx = prepare(board.overlay);
		ctx.save();
		var S = mapSpace(ctx);
		var list = objects();
		if (draft)
		{
			drawObject(ctx, draft, S, active, list.concat(draft.type === "player" ? [] : []));
		}
		if (selected && list.indexOf(selected) !== -1 && !(drag && drag.kind === "move"))
		{
			var bx = bounds(selected, list);
			ctx.save();
			ctx.strokeStyle = "rgba(242,193,78,0.95)";
			ctx.lineWidth = 1.5;
			ctx.setLineDash([5, 4]);
			ctx.strokeRect(bx[0] * S - 6, bx[1] * S - 6, (bx[2] - bx[0]) * S + 12, (bx[3] - bx[1]) * S + 12);
			ctx.setLineDash([]);
			handles(selected, list).forEach(function (h)
			{
				ctx.fillStyle = h.bend ? "#f2c14e" : "#fff";
				ctx.strokeStyle = "#111";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(h.p[0] * S, h.p[1] * S, 8, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			});
			ctx.restore();
		}
		if (pending)
		{
			// A guide line from the player to the pointer.
			var from = playerPos(list, pending.n, active);
			if (from && pointer)
			{
				ctx.save();
				ctx.strokeStyle = sideColor(active);
				ctx.lineWidth = 2;
				ctx.setLineDash([6, 5]);
				ctx.beginPath();
				ctx.moveTo(from[0] * S, from[1] * S);
				ctx.lineTo(pointer[0] * S, pointer[1] * S);
				ctx.stroke();
				ctx.restore();
			}
		}
		if (snapAt)
		{
			ctx.save();
			ctx.strokeStyle = "#f2c14e";
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.arc(snapAt.p[0] * S, snapAt.p[1] * S, 14, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
		var now = performance.now();
		laser = laser.filter(function (q) { return now - q.t < LASER_MS; });
		for (var i = 1; i < laser.length; i++)
		{
			if (laser[i].stroke !== laser[i - 1].stroke)
			{
				continue;
			}
			var a = (1 - (now - laser[i].t) / LASER_MS).toFixed(3);
			var c = nation(laser[i].side).rgb.join(",");
			ctx.save();
			ctx.lineCap = "round";
			ctx.shadowColor = "rgba(" + c + "," + a + ")";
			ctx.shadowBlur = 16;
			ctx.strokeStyle = "rgba(255,255,255," + a + ")";
			ctx.lineWidth = 5;
			ctx.beginPath();
			ctx.moveTo(laser[i - 1].x * S, laser[i - 1].y * S);
			ctx.lineTo(laser[i].x * S, laser[i].y * S);
			ctx.stroke();
			ctx.strokeStyle = "rgba(255,60,50," + a + ")";
			ctx.lineWidth = 2.5;
			ctx.stroke();
			ctx.restore();
		}
		if ((opts.cursor || present) && pointer && !drag)
		{
			ctx.save();
			ctx.strokeStyle = present ? "rgba(255,80,70,0.95)" : sideColor(active);
			ctx.fillStyle = present ? "rgba(255,80,70,0.25)" : "rgba(242,193,78,0.16)";
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.arc(pointer[0] * S, pointer[1] * S, present ? 7 : 18, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();
		if (laser.length)
		{
			animate();
		}
		placeContextBar();
	}

	function renderAll()
	{
		renderBase();
		renderMain();
		renderOverlay();
	}

	function bounds(o, list)
	{
		var pts = [];
		var r = 0;
		switch (o.type)
		{
			case "player":
				pts = [o.p];
				r = PLAYER_R * sizeK;
				break;
			case "arrow":
				pts = arrowPath(o, list);
				break;
			case "pen":
				pts = o.pts;
				break;
			case "text":
				return [o.p[0], o.p[1] - textSize(o), o.p[0] + textWidth(o), o.p[1] + textSize(o) * 0.3];
			case "smoke":
			case "frag":
				pts = [o.p];
				r = o.type === "smoke" ? SMOKE_R : fragR(active);
				var f = anchor(o, list);
				if (f)
				{
					pts = pts.concat([[f[0] + r, f[1] + r], [f[0] - r, f[1] - r]]);
				}
				break;
			case "cone":
				pts = conePoints(o, list);
				break;
		}
		var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		pts.forEach(function (q)
		{
			x0 = Math.min(x0, q[0] - r); y0 = Math.min(y0, q[1] - r);
			x1 = Math.max(x1, q[0] + r); y1 = Math.max(y1, q[1] + r);
		});
		return [x0, y0, x1, y1];
	}

	function refresh()
	{
		renderContextBar();
		renderAll();
		renderRails();
		renderTimeline();
		renderTop();
		renderPresentBar();
		renderHint();
	}

	/* ---------- pointer ---------- */

	function stagePoint(event)
	{
		var r = board.overlay.getBoundingClientRect();
		return [event.clientX - r.left, event.clientY - r.top];
	}

	function onDown(event)
	{
		closeMenus();
		hideRadial();
		hideCoach();
		if (event.pointerType === "touch")
		{
			touches[event.pointerId] = stagePoint(event);
			if (Object.keys(touches).length === 2)
			{
				startGesture();
				return;
			}
		}
		if (event.button === 2)
		{
			return;     // the radial menu opens on contextmenu
		}
		stopPlay();
		closeTextInput(true);
		board.overlay.setPointerCapture(event.pointerId);
		var p = fromClient(event.clientX, event.clientY);
		pointer = p;
		var sp = stagePoint(event);

		// Middle button or Space: pan.
		if (event.button === 1 || spaceDown)
		{
			event.preventDefault();
			spaceUsed = spaceDown;
			drag = { kind: "pan", last: sp };
			return;
		}
		if (event.pointerType !== "mouse")
		{
			window.clearTimeout(longPress);
			longPress = window.setTimeout(function ()
			{
				if (drag && !drag.moved)
				{
					cancelDrag();
					longPressed = true;
					openRadial(sp[0], sp[1], p);
				}
			}, LONG_PRESS_MS);
		}
		if (present)
		{
			laser.push({ x: p[0], y: p[1], t: performance.now(), side: active, stroke: event.pointerId + ":" + performance.now() });
			drag = { kind: "laser", start: sp, stroke: laser[laser.length - 1].stroke };
			animate();
			return;
		}
		var list = objects();
		var hitPlayer = hitTest(p, true);

		// A player action chosen in the context bar or the radial menu.
		if (pending)
		{
			startPending(p, event);
			return;
		}
		if (placing)
		{
			placePlayer(placing, snapped(p, event));
			placing = 0;
			snapAt = null;
			drag = { kind: "none", start: sp };
			refresh();
			return;
		}

		switch (tool)
		{
			case "move":
				if (selected && list.indexOf(selected) !== -1)
				{
					var h = handles(selected, list).filter(function (x) { return dist(x.p, p) * viewBox().s <= 14; })[0];
					if (h)
					{
						drag = { kind: "handle", key: h.key, before: snapshot(), changed: false, start: sp };
						break;
					}
				}
				var hit = hitTest(p);
				selected = hit;
				if (hit)
				{
					drag = { kind: "move", last: p, before: snapshot(), changed: false, start: sp };
				}
				else
				{
					drag = { kind: "pan", last: sp, start: sp, panOnly: zoom.z === 1 };
				}
				break;
			case "route":
				draft = hitPlayer ? { type: "arrow", from: hitPlayer.n, p0: hitPlayer.p.slice(), p1: p, dashed: false, width: opts.width } :
					{ type: "arrow", p0: snapped(p, event), p1: p, dashed: false, width: opts.width };
				drag = { kind: "draw", start: sp };
				break;
			case "smoke":
			case "frag":
				draft = { type: tool, p: p, width: opts.width };
				if (hitPlayer)
				{
					draft.fromPlayer = hitPlayer.n;
				}
				drag = { kind: "draw", start: sp, startP: p };
				break;
			case "cone":
				draft = { type: "cone", p: hitPlayer ? hitPlayer.p.slice() : p, dir: -Math.PI / 2, spread: CONE_SPREAD * Math.PI / 180, len: CONE_LEN, width: opts.width };
				if (hitPlayer)
				{
					draft.fromPlayer = hitPlayer.n;
				}
				drag = { kind: "draw", start: sp };
				break;
			case "pen":
				draft = { type: "pen", pts: [p], width: opts.width, dashed: false };
				drag = { kind: "draw", start: sp };
				break;
			case "text":
				drag = { kind: "text", p: p, start: sp };
				break;
			case "laser":
				laser.push({ x: p[0], y: p[1], t: performance.now(), side: active, stroke: event.pointerId + ":" + performance.now() });
				drag = { kind: "laser", start: sp, stroke: laser[laser.length - 1].stroke };
				animate();
				break;
			case "erase":
				drag = { kind: "erase", before: snapshot(), changed: false, start: sp };
				erase(p);
				break;
		}
		renderAll();
		renderContextBar();
	}

	function changed()
	{
		if (!drag.changed)
		{
			drag.changed = true;
			remember(active, drag.before);
		}
	}

	function cancelDrag()
	{
		if (drag && drag.changed && drag.before)
		{
			restore(active, drag.before);
			layer().history.pop();
		}
		drag = null;
		draft = null;
		snapAt = null;
		renderAll();
	}

	function erase(p)
	{
		var hit = hitTest(p);
		if (hit)
		{
			changed();
			removeObject(objects(), hit);
			if (selected === hit)
			{
				selected = null;
			}
		}
	}

	function onMove(event)
	{
		if (event.pointerType === "touch" && touches[event.pointerId])
		{
			touches[event.pointerId] = stagePoint(event);
			if (gesture)
			{
				moveGesture();
				return;
			}
		}
		var p = fromClient(event.clientX, event.clientY);
		pointer = p;
		var sp = stagePoint(event);
		if (!drag)
		{
			if (pending || opts.cursor || present)
			{
				renderOverlay();
			}
			return;
		}
		if (drag.start && !drag.moved && Math.hypot(sp[0] - drag.start[0], sp[1] - drag.start[1]) > 6)
		{
			drag.moved = true;
			window.clearTimeout(longPress);
		}
		var list = objects();
		switch (drag.kind)
		{
			case "pan":
				if (!drag.panOnly || zoom.z > 1)
				{
					panBy(sp[0] - drag.last[0], sp[1] - drag.last[1]);
				}
				drag.last = sp;
				return;
			case "handle":
				changed();
				setHandle(selected, drag.key, drag.key === "p1" || drag.key === "p0" ? snapped(p, event) : p, list);
				renderMain();
				break;
			case "move":
				if (!drag.moved)
				{
					break;
				}
				changed();
				if (selected.type === "player")
				{
					selected.p = snapped(p, event, selected);
				}
				else
				{
					moveObject(selected, p[0] - drag.last[0], p[1] - drag.last[1]);
				}
				drag.last = p;
				renderMain();
				hideContextBar();
				break;
			case "draw":
				if (draft.type === "pen")
				{
					var last = draft.pts[draft.pts.length - 1];
					if (dist(last, p) * viewBox().s >= 2)
					{
						draft.pts.push(p);
					}
				}
				else if (draft.type === "arrow")
				{
					draft.p1 = snapped(p, event);
				}
				else if (draft.type === "cone")
				{
					if (drag.moved)
					{
						var c = draft.p;
						draft.dir = Math.atan2(p[1] - c[1], p[0] - c[0]);
						draft.len = Math.max(0.03, dist(c, p));
					}
				}
				else if (drag.moved)
				{
					// A grenade lands where the pointer is let go; dragged from empty map,
					// the throw starts where the drag started.
					if (!draft.fromPlayer)
					{
						draft.from = drag.startP;
					}
					draft.p = snapped(p, event);
				}
				break;
			case "laser":
				laser.push({ x: p[0], y: p[1], t: performance.now(), side: active, stroke: drag.stroke });
				break;
			case "erase":
				erase(p);
				renderMain();
				break;
		}
		renderOverlay();
	}

	function onUp(event)
	{
		if (longPressed)
		{
			// The click of this lift lands on the radial under the finger: ignore it.
			longPressed = false;
			swallowUntil = performance.now() + 450;
		}
		if (event.pointerType === "touch")
		{
			delete touches[event.pointerId];
			if (gesture)
			{
				if (!Object.keys(touches).length)
				{
					gesture = null;
				}
				return;
			}
		}
		window.clearTimeout(longPress);
		if (!drag)
		{
			return;
		}
		var d = drag;
		drag = null;
		snapAt = null;
		if (d.kind === "draw" && draft)
		{
			var keep = true;
			if (draft.type === "arrow")
			{
				keep = dist(anchor(draft, objects()), draft.p1) * viewBox().s > 8;
			}
			else if (draft.type === "pen")
			{
				keep = draft.pts.length >= 2;
			}
			else if ((draft.type === "smoke" || draft.type === "frag") && draft.fromPlayer && !d.moved)
			{
				keep = false;   // a click on a player with the grenade tool: nothing thrown yet
			}
			if (keep)
			{
				remember(active);
				draft.id = nextId++;
				objects().push(draft);
				selected = null;    // a click on it shows its bar; it would cover the map here
				setTool("move");
			}
			draft = null;
		}
		if (d.kind === "text")
		{
			openTextInput(d.p, null);
		}
		refresh();
	}

	function onDoubleClick(event)
	{
		if (present || tool !== "move")
		{
			return;
		}
		var p = fromClient(event.clientX, event.clientY);
		var hit = hitTest(p);
		if (hit && hit.type === "text")
		{
			openTextInput(hit.p, hit);
		}
		else if (!hit)
		{
			resetView();
		}
	}

	function onWheel(event)
	{
		event.preventDefault();
		var sp = stagePoint(event);
		var k = Math.exp(-(event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY) * 0.0015);
		zoomAt(k, sp[0], sp[1]);
	}

	/* Two fingers: pinch to zoom, move to pan. */
	function startGesture()
	{
		cancelDrag();
		window.clearTimeout(longPress);
		var t = Object.keys(touches).map(function (k) { return touches[k]; });
		gesture = { d: Math.hypot(t[0][0] - t[1][0], t[0][1] - t[1][1]), mid: [(t[0][0] + t[1][0]) / 2, (t[0][1] + t[1][1]) / 2] };
	}

	function moveGesture()
	{
		var t = Object.keys(touches).map(function (k) { return touches[k]; });
		if (t.length < 2)
		{
			return;
		}
		var d = Math.hypot(t[0][0] - t[1][0], t[0][1] - t[1][1]);
		var mid = [(t[0][0] + t[1][0]) / 2, (t[0][1] + t[1][1]) / 2];
		panBy(mid[0] - gesture.mid[0], mid[1] - gesture.mid[1]);
		if (gesture.d > 10)
		{
			zoomAt(d / gesture.d, mid[0], mid[1]);
		}
		gesture.d = d;
		gesture.mid = mid;
	}

	/* ---------- players ---------- */

	// Put player n of the active side at p, or move it there.
	function placePlayer(n, p)
	{
		remember(active);
		var list = objects();
		var pl = playerIn(list, n);
		if (pl)
		{
			pl.p = p;
		}
		else
		{
			pl = { id: nextId++, type: "player", n: n, p: p };
			list.push(pl);
		}
		// Not selected: its action bar would cover the players next to it; a click shows it.
		selected = null;
		setTool("move");
		hideCoach();
	}

	// A player action: route / smoke / frag / cone for player n; the next click does it.
	function startAction(action, n)
	{
		pending = { action: action, n: n };
		selected = null;
		refresh();
	}

	function startPending(p, event)
	{
		var list = objects();
		var pa = pending;
		pending = null;
		var from = playerIn(list, pa.n);
		if (!from)
		{
			refresh();
			return;
		}
		var q = snapped(p, event);
		if (pa.action === "route")
		{
			draft = { type: "arrow", from: pa.n, p0: from.p.slice(), p1: q, dashed: false, width: opts.width };
		}
		else if (pa.action === "cone")
		{
			draft = { type: "cone", fromPlayer: pa.n, p: from.p.slice(), dir: Math.atan2(p[1] - from.p[1], p[0] - from.p[0]),
				spread: CONE_SPREAD * Math.PI / 180, len: Math.max(0.04, Math.min(0.2, dist(from.p, p))), width: opts.width };
		}
		else
		{
			draft = { type: pa.action, fromPlayer: pa.n, p: q, width: opts.width };
		}
		drag = { kind: "draw", start: stagePoint(event), moved: true, startP: p };
		if (draft.type === "smoke" || draft.type === "frag")
		{
			drag.moved = true;
		}
		renderAll();
	}

	/* ---------- text ---------- */

	function openTextInput(p, existing)
	{
		var input = board.text;
		var sp = toScreen(p);
		var fs = textSize(existing || { width: opts.width }) * viewBox().s;
		input.value = existing ? existing.text : "";
		input.style.left = sp[0] + "px";
		input.style.top = (sp[1] - fs) + "px";
		input.style.fontSize = fs + "px";
		input.style.color = sideColor(active);
		input.hidden = false;
		input.target = existing;
		input.at = p;
		input.focus();
	}

	function closeTextInput(commit)
	{
		var input = board ? board.text : null;
		if (!input || input.hidden)
		{
			return;
		}
		input.hidden = true;
		var text = input.value.trim();
		var o = input.target;
		if (!commit)
		{
			return;
		}
		if (o)
		{
			if (text !== o.text)
			{
				remember(active);
				if (text === "")
				{
					removeObject(objects(), o);
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
			remember(active);
			objects().push({ id: nextId++, type: "text", p: input.at, text: text, width: opts.width });
			setTool("move");
		}
		refresh();
	}

	/* ---------- phases ---------- */

	function setPhase(side, index, animated)
	{
		var l = layer(side);
		if (index < 0 || index >= l.phases.length || index === l.current)
		{
			return;
		}
		var prev = animated ? playerPositions() : null;
		l.current = index;
		selected = null;
		pending = null;
		if (prev)
		{
			startGlide(prev);
		}
		refresh();
	}

	// A new phase after the current one: the players stay where they are (copy:
	// everything is copied).
	function addPhase(side, copy)
	{
		setActive(side);
		remember(side);
		var l = layer(side);
		var base = phase(side).objects;
		var keep = copy ? base : base.filter(function (o) { return o.type === "player"; });
		var clone = JSON.parse(JSON.stringify(keep));
		clone.forEach(function (o) { o.id = nextId++; });
		l.phases.splice(l.current + 1, 0, { name: copy ? phase(side).name + " (copy)" : "Phase " + (l.phases.length + 1), objects: clone });
		l.current++;
		selected = null;
		refresh();
	}

	function movePhase(side, from, to)
	{
		var l = layer(side);
		if (to < 0 || to >= l.phases.length || to === from)
		{
			return;
		}
		remember(side);
		var p = l.phases.splice(from, 1)[0];
		l.phases.splice(to, 0, p);
		l.current = to;
		refresh();
	}

	function deletePhase(side)
	{
		var l = layer(side);
		if (l.phases.length === 1)
		{
			return;
		}
		var go = function ()
		{
			remember(side);
			l.phases.splice(l.current, 1);
			l.current = Math.max(0, l.current - 1);
			selected = null;
			refresh();
		};
		if (phase(side).objects.length)
		{
			askConfirm("Delete the " + sideWord(side) + " phase “" + phase(side).name + "” with its drawing?", "Delete", go);
		}
		else
		{
			go();
		}
	}

	function renamePhase(side, name)
	{
		name = name.trim().slice(0, 32);
		if (name && name !== phase(side).name)
		{
			remember(side);
			phase(side).name = name;
		}
		refresh();
	}

	function stepCount()
	{
		return Math.max.apply(null, SIDES.filter(function (s) { return layers[s].visible; }).map(function (s) { return layers[s].phases.length; }));
	}

	function currentStep()
	{
		return Math.max.apply(null, SIDES.filter(function (s) { return layers[s].visible; }).map(function (s) { return layers[s].current; }));
	}

	// Step n of the visible layers together (a layer stays on its last phase).
	function showStep(step)
	{
		var prev = playerPositions();
		SIDES.forEach(function (s)
		{
			if (layers[s].visible)
			{
				layers[s].current = Math.max(0, Math.min(step, layers[s].phases.length - 1));
			}
		});
		selected = null;
		pending = null;
		startGlide(prev);
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
		playStep = currentStep() >= stepCount() - 1 ? 0 : currentStep() + 1;
		showStep(playStep);
		playTimer = window.setInterval(function ()
		{
			playStep = (playStep + 1) % stepCount();
			showStep(playStep);
		}, PLAY_MS);
		refresh();
	}

	function stopPlay()
	{
		if (playTimer)
		{
			window.clearInterval(playTimer);
			playTimer = 0;
			refresh();
		}
	}

	/* ---------- templates: a start from the spawns and sites ---------- */

	function centroid(pts)
	{
		return [pts.reduce(function (t, q) { return t + q[0]; }, 0) / pts.length, pts.reduce(function (t, q) { return t + q[1]; }, 0) / pts.length];
	}

	function lerp(a, b, t)
	{
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	}

	// Five points around c, radius r (map units).
	function spread(c, r, turn)
	{
		var out = [];
		for (var i = 0; i < 5; i++)
		{
			var a = (turn || 0) + i * Math.PI * 2 / 5;
			out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
		}
		return out;
	}

	// A bent route from a to b (the bend to one side).
	function route(n, b, a, bend)
	{
		var m = lerp(a, b, 0.5);
		var dx = b[0] - a[0];
		var dy = b[1] - a[1];
		return { id: nextId++, type: "arrow", from: n, p0: a.slice(), p1: b, c: [m[0] - dy * (bend || 0), m[1] + dx * (bend || 0)], dashed: false, width: 4 };
	}

	function players(points)
	{
		return points.map(function (p, i) { return { id: nextId++, type: "player", n: i + 1, p: p.slice() }; });
	}

	// The attackers' execute on target site(s): setup at spawn with routes to a
	// staging point and smokes, then the execute onto the site with a frag.
	function attackPlan(sites)
	{
		var spawnPts = sd.spawns.attacker.map(function (s) { return toUV(s[0], s[1]); });
		var spawnC = centroid(spawnPts);
		var defC = centroid(sd.spawns.defender.map(function (s) { return toUV(s[0], s[1]); }));
		var start = spread(spawnC, 0.034, 0.4);
		var stage = [];
		var onSite = [];
		var smokes = [];
		var target = [];
		for (var i = 0; i < 5; i++)
		{
			var site = sites[sites.length > 1 && i >= 3 ? 1 : 0];
			target.push(site);
		}
		sites.forEach(function (site, gi)
		{
			var members = target.map(function (t, i) { return t === site ? i : -1; }).filter(function (i) { return i !== -1; });
			var st = lerp(spawnC, site, 0.6);
			var sp = spread(st, 0.036, gi);
			var os = spread(site, 0.034, 0.6 + gi);
			members.forEach(function (i, k) { stage[i] = sp[k]; onSite[i] = os[k]; });
			// Smokes between the site and the defenders' way in.
			smokes.push({ site: site, p: lerp(site, defC, 0.28), by: members[1 % members.length] + 1 });
		});
		var phase1 = players(start);
		stage.forEach(function (p, i) { phase1.push(route(i + 1, p, start[i], i % 2 ? 0.18 : -0.18)); });
		var phase2 = players(stage);
		onSite.forEach(function (p, i) { phase2.push(route(i + 1, p, stage[i], i % 2 ? 0.15 : -0.12)); });
		smokes.forEach(function (s, k)
		{
			phase2.push({ id: nextId++, type: "smoke", fromPlayer: s.by, p: s.p, width: 4 });
			if (k === 0)
			{
				phase2.push({ id: nextId++, type: "smoke", fromPlayer: (s.by % 5) + 1, p: lerp(s.site, defC, 0.42), width: 4 });
			}
		});
		phase2.push({ id: nextId++, type: "frag", fromPlayer: 1, p: sites[0].slice(), width: 4 });
		var phase3 = players(onSite);
		return [{ name: "Setup", objects: phase1 }, { name: sites.length > 1 ? "Split" : "Smokes, go", objects: phase2 },
			{ name: "Plant", objects: phase3 }];
	}

	// The defenders' default: two on A, two on B, one between, looking at the
	// attackers' way in; with a rotation to the attacked site if there is one.
	function defensePlan(rotateTo)
	{
		var A = toUV(sd.sites[0].origin[0], sd.sites[0].origin[1]);
		var B = toUV(sd.sites[1].origin[0], sd.sites[1].origin[1]);
		var attC = centroid(sd.spawns.attacker.map(function (s) { return toUV(s[0], s[1]); }));
		// Two per site, side by side across the attackers' way in; one between.
		var pair = function (site)
		{
			var dx = attC[0] - site[0];
			var dy = attC[1] - site[1];
			var d = Math.hypot(dx, dy) || 1;
			var f = [site[0] + dx / d * 0.035, site[1] + dy / d * 0.035];
			return [[f[0] - dy / d * 0.04, f[1] + dx / d * 0.04], [f[0] + dy / d * 0.04, f[1] - dx / d * 0.04]];
		};
		var mid = lerp(A, B, 0.5);
		var pa = pair(A);
		var pb = pair(B);
		var pos = [pa[0], pa[1], pb[0], pb[1], lerp(mid, attC, 0.18)];
		var p1 = players(pos);
		pos.forEach(function (p, i)
		{
			var a = Math.atan2(attC[1] - p[1], attC[0] - p[0]);
			p1.push({ id: nextId++, type: "cone", fromPlayer: i + 1, p: p.slice(), dir: a, spread: CONE_SPREAD * Math.PI / 180, len: 0.09, width: 4 });
		});
		var out = [{ name: "Default", objects: p1 }];
		if (rotateTo)
		{
			var away = rotateTo === "A" ? [2, 3] : [0, 1];
			var site = rotateTo === "A" ? A : B;
			var p2 = players(pos);
			var next = pos.map(function (p) { return p.slice(); });
			away.forEach(function (i, k)
			{
				next[i] = lerp(site, p2[i].p, 0.35 + k * 0.1);
				p2.push(route(i + 1, next[i], pos[i], 0.1));
			});
			next[4] = lerp(site, pos[4], 0.4);
			p2.push(route(5, next[4], pos[4], -0.1));
			out.push({ name: "Rotate " + rotateTo, objects: p2 });
			out.push({ name: "Retake", objects: players(next) });
		}
		return out;
	}

	var TEMPLATES = [
		{ id: "a", label: "A execute", desc: "Attack: smokes and a frag, all five onto A" },
		{ id: "b", label: "B execute", desc: "Attack: smokes and a frag, all five onto B" },
		{ id: "split", label: "B split", desc: "Attack: three onto B, two through the other way" },
		{ id: "defense", label: "Default defense", desc: "Defense only: two on A, two on B, one between" },
		{ id: "blank", label: "Blank", desc: "Clear both sides" }
	];

	function applyTemplate(id)
	{
		if (!hasSd())
		{
			return;
		}
		var go = function ()
		{
			var A = toUV(sd.sites[0].origin[0], sd.sites[0].origin[1]);
			var B = toUV(sd.sites[1].origin[0], sd.sites[1].origin[1]);
			var att = sd.attackers;
			var def = sd.defenders;
			var plans = {};
			if (id === "a") { plans[att] = attackPlan([A]); plans[def] = defensePlan("A"); }
			if (id === "b") { plans[att] = attackPlan([B]); plans[def] = defensePlan("B"); }
			if (id === "split") { plans[att] = attackPlan([B, A]); plans[def] = defensePlan("B"); }
			if (id === "defense") { plans[att] = [{ name: "Setup", objects: [] }]; plans[def] = defensePlan(null); }
			if (id === "blank") { plans[att] = [{ name: "Setup", objects: [] }]; plans[def] = [{ name: "Setup", objects: [] }]; }
			SIDES.forEach(function (side)
			{
				remember(side);
				layers[side].phases = plans[side];
				layers[side].current = 0;
				layers[side].visible = true;
			});
			selected = null;
			pending = null;
			active = att;
			setTool("move");
			hideCoach();
			refresh();
		};
		var drawn = SIDES.some(function (s) { return layers[s].phases.some(function (p) { return p.objects.length; }); });
		if (drawn)
		{
			askConfirm("Replace the drawing of both sides with “" + TEMPLATES.filter(function (t) { return t.id === id; })[0].label + "”? Undo on each side brings it back.", "Replace", go);
		}
		else
		{
			go();
		}
	}

	/* ---------- confirm (in the page) ---------- */

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
		if (!l.phases.some(function (p) { return p.objects.length; }))
		{
			return;
		}
		askConfirm("Clear the " + sideName(side) + " side: every phase's players and drawing? Undo brings it back.", "Clear", function ()
		{
			remember(side);
			l.phases.forEach(function (p) { p.objects = []; });
			selected = null;
			refresh();
		});
	}

	/* ---------- tools ---------- */

	function setTool(id, side)
	{
		closeTextInput(true);
		if (side)
		{
			setActive(side);
		}
		tool = id;
		pending = null;
		placing = 0;
		if (id !== "move")
		{
			selected = null;
		}
		refresh();
	}

	function cursorFor()
	{
		if (present)
		{
			return "none";
		}
		if (spaceDown)
		{
			return "grab";
		}
		if (tool === "move" && !pending && !placing)
		{
			return "default";
		}
		var c = sideColor(active);
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
			'<g stroke="#000" stroke-width="3.5" fill="none"><circle cx="12" cy="12" r="5"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></g>' +
			'<g stroke="' + c + '" stroke-width="1.8" fill="none"><circle cx="12" cy="12" r="5"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></g></svg>';
		return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 12 12, crosshair';
	}

	/* ---------- the UI: rails, context bar, radial, timeline, menus ---------- */

	function svg(paths)
	{
		return '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" ' +
			'stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";
	}

	function iconBtn(cls, icon, title, onClick)
	{
		var b = el("button", "t2-ib " + (cls || ""));
		b.type = "button";
		b.innerHTML = svg(icon);
		if (title)
		{
			b.title = title;
			b.setAttribute("aria-label", title);
		}
		if (onClick)
		{
			b.addEventListener("click", onClick);
		}
		return b;
	}

	function textBtn(cls, html, title, onClick)
	{
		var b = el("button", "t2-btn " + (cls || ""));
		b.type = "button";
		b.innerHTML = html;
		if (title)
		{
			b.title = title;
		}
		if (onClick)
		{
			b.addEventListener("click", onClick);
		}
		return b;
	}

	function buildRail(side)
	{
		var node = el("aside", "t2-rail t2-rail-" + side);
		var head = el("div", "t2-rail-head");
		var badge = el("button", "t2-badge");
		badge.type = "button";
		badge.appendChild(el("span", "t2-badge-side"));
		badge.appendChild(el("span", "t2-badge-role"));
		badge.addEventListener("click", function () { setActive(side); });
		var eye = iconBtn("t2-eye", ICON.eye, "", function () { toggleLayer(side); });
		head.appendChild(badge);
		head.appendChild(eye);
		node.appendChild(head);

		node.appendChild(el("div", "t2-cap", "Players"));
		var roster = el("div", "t2-roster");
		for (var n = 1; n <= 5; n++)
		{
			(function (n)
			{
				var t = el("button", "t2-token", String(n));
				t.type = "button";
				t.setAttribute("data-n", String(n));
				t.addEventListener("pointerdown", function (event) { rosterDown(event, side, n, t); });
				t.addEventListener("click", function (event) { event.preventDefault(); });
				t.addEventListener("keydown", function (event)
				{
					if (event.key === "Enter" || event.key === " ")
					{
						event.preventDefault();
						event.stopPropagation();
						rosterClick(side, n);
					}
				});
				roster.appendChild(t);
			})(n);
		}
		node.appendChild(roster);

		node.appendChild(el("div", "t2-cap", "Tools"));
		var tools = el("div", "t2-tools");
		TOOLS.forEach(function (t)
		{
			var b = iconBtn("t2-tool", t.icon, "", function () { closeMenus(); hideRadial(); setTool(t.id, side); });
			b.setAttribute("data-tool", t.id);
			tools.appendChild(b);
		});
		node.appendChild(tools);

		var foot = el("div", "t2-rail-foot");
		var undoBtn = iconBtn("", ICON.undo, "Undo on this side (Ctrl+Z)", function () { setActive(side); undo(side); });
		var redoBtn = iconBtn("", ICON.redo, "Redo on this side (Ctrl+Y)", function () { setActive(side); redo(side); });
		var clearBtn = iconBtn("t2-clear", ICON.trash, "Clear this side (asks first)", function () { clearLayer(side); });
		[undoBtn, redoBtn, clearBtn].forEach(function (b) { foot.appendChild(b); });
		node.appendChild(foot);
		return { side: side, node: node, badge: badge, eye: eye, roster: roster, undo: undoBtn, redo: redoBtn };
	}

	// Roster: drag a player onto the map, or click (placed: select it; not yet:
	// the next click on the map places it).
	function rosterDown(event, side, n, token)
	{
		if (event.button > 0)
		{
			return;
		}
		event.preventDefault();
		closeMenus();
		hideRadial();
		setActive(side);
		var start = [event.clientX, event.clientY];
		var ghost = null;
		var moved = false;
		var move = function (e)
		{
			if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5)
			{
				moved = true;
				ghost = el("div", "t2-ghost", String(n));
				ghost.style.setProperty("--side", sideColor(side));
				ghost.style.color = sideInk(side);
				board.root.appendChild(ghost);
			}
			if (ghost)
			{
				ghost.style.left = e.clientX + "px";
				ghost.style.top = e.clientY + "px";
				var r = board.overlay.getBoundingClientRect();
				var over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
				pointer = fromClient(e.clientX, e.clientY);
				snapAt = over ? snapTarget(pointer, playerIn(objects(side), n)) : null;
				renderOverlay();
			}
		};
		var up = function (e)
		{
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", up);
			if (ghost)
			{
				ghost.remove();
			}
			snapAt = null;
			if (!moved)
			{
				rosterClick(side, n);
				return;
			}
			var r = board.overlay.getBoundingClientRect();
			if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
			{
				var p = fromClient(e.clientX, e.clientY);
				var t = e.altKey ? null : snapTarget(p, playerIn(objects(side), n));
				placePlayer(n, t ? t.p.slice() : p);
			}
			refresh();
		};
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", up);
	}

	function rosterClick(side, n)
	{
		setActive(side);
		var pl = playerIn(objects(side), n);
		if (pl)
		{
			tool = "move";
			selected = pl;
			placing = 0;
		}
		else
		{
			placing = n;
			selected = null;
		}
		pending = null;
		refresh();
	}

	function renderRails()
	{
		board.rails.forEach(function (rail)
		{
			var side = rail.side;
			var l = layers[side];
			var on = side === active;
			rail.node.classList.toggle("is-active", on);
			rail.node.classList.toggle("is-hidden", !l.visible);
			[].forEach.call(rail.node.querySelectorAll(".t2-tool"), function (b)
			{
				var pressed = on && b.getAttribute("data-tool") === tool && !pending && !placing;
				b.classList.toggle("is-on", pressed);
				b.setAttribute("aria-pressed", String(pressed));
			});
			var list = objects(side);
			[].forEach.call(rail.roster.children, function (t)
			{
				var n = Number(t.getAttribute("data-n"));
				var placed = !!playerIn(list, n);
				t.classList.toggle("is-placed", placed);
				t.classList.toggle("is-armed", on && placing === n);
				t.classList.toggle("is-selected", on && selected && selected.type === "player" && selected.n === n);
				t.title = sideWord(side) + " " + n + (placed ? " – on the map: click to select, drag to move" : " – drag onto the map (or click, then click the map; Shift+" + n + " at the pointer)");
			});
			rail.eye.innerHTML = svg(l.visible ? ICON.eye : ICON.eyeOff);
			rail.eye.setAttribute("aria-pressed", String(l.visible));
			rail.eye.title = (l.visible ? "Hide" : "Show") + " the " + sideWord(side) + " side";
			rail.undo.disabled = !l.history.length;
			rail.redo.disabled = !l.future.length;
		});
		board.overlay.style.cursor = cursorFor();
	}

	/* The context bar: actions for the selected object, next to it. */
	function renderContextBar()
	{
		var bar = board.ctx;
		bar.textContent = "";
		var o = selected;
		if (!o || present || objects().indexOf(o) === -1)
		{
			bar.hidden = true;
			return;
		}
		var label = el("span", "t2-ctx-label");
		if (o.type === "player")
		{
			label.textContent = sideWord(active) + " " + o.n;
			bar.appendChild(label);
			PLAYER_ACTIONS.forEach(function (a)
			{
				var b = textBtn("t2-ctx-act", svg(a.icon) + "<span>" + a.label + "</span>", a.label + " for " + sideWord(active) + " " + o.n + ": then click the map", function ()
				{
					startAction(a.id, o.n);
				});
				bar.appendChild(b);
			});
		}
		else
		{
			label.textContent = { arrow: "Route", smoke: "Smoke", frag: "Frag", cone: "Look", pen: "Drawing", text: "Text" }[o.type];
			bar.appendChild(label);
			if (o.type === "arrow" || o.type === "pen")
			{
				var dash = iconBtn("", ICON.dashed, "Dashed", function ()
				{
					remember(active);
					o.dashed = !o.dashed;
					refresh();
				});
				dash.setAttribute("aria-pressed", String(!!o.dashed));
				bar.appendChild(dash);
			}
			if (o.type === "arrow" || o.type === "pen" || o.type === "text")
			{
				bar.appendChild(iconBtn("", ICON.thin, "Thinner / smaller", function () { remember(active); o.width = Math.max(1, (o.width || 4) - 1); refresh(); }));
				bar.appendChild(iconBtn("", ICON.thick, "Thicker / bigger", function () { remember(active); o.width = Math.min(10, (o.width || 4) + 1); refresh(); }));
			}
		}
		bar.appendChild(iconBtn("t2-ctx-del", ICON.trash, "Delete (Del)", function ()
		{
			remember(active);
			removeObject(objects(), o);
			selected = null;
			refresh();
		}));
		bar.hidden = false;
		placeContextBar();
	}

	function placeContextBar()
	{
		var bar = board.ctx;
		if (bar.hidden || !selected)
		{
			return;
		}
		var bx = bounds(selected, objects());
		var a = toScreen([bx[0], bx[1]]);
		var b = toScreen([bx[2], bx[3]]);
		var w = bar.offsetWidth;
		var h = bar.offsetHeight;
		var cx = (a[0] + b[0]) / 2;
		var cy = (a[1] + b[1]) / 2;
		// Below, above, right or left of the object: the first place that covers
		// no player of the shown sides (else below).
		var r = PLAYER_R * sizeK * viewBox().s + 4;
		var tokens = [];
		SIDES.forEach(function (side)
		{
			if (layers[side].visible)
			{
				objects(side).forEach(function (o) { if (o.type === "player" && o !== selected) { tokens.push(toScreen(o.p)); } });
			}
		});
		var clampX = function (x) { return Math.max(6, Math.min(stageW - w - 6, x)); };
		var clampY = function (y) { return Math.max(6, Math.min(stageH - h - 6, y)); };
		var spots = [[clampX(cx - w / 2), b[1] + 12], [clampX(cx - w / 2), a[1] - h - 12], [b[0] + 12, clampY(cy - h / 2)], [a[0] - w - 12, clampY(cy - h / 2)]];
		var fits = function (q)
		{
			if (q[0] < 6 || q[1] < 6 || q[0] + w > stageW - 6 || q[1] + h > stageH - 6)
			{
				return false;
			}
			return !tokens.some(function (t) { return t[0] + r > q[0] && t[0] - r < q[0] + w && t[1] + r > q[1] && t[1] - r < q[1] + h; });
		};
		var spot = spots.filter(fits)[0] || [spots[0][0], clampY(spots[0][1])];
		bar.style.left = spot[0] + "px";
		bar.style.top = spot[1] + "px";
	}

	function hideContextBar()
	{
		board.ctx.hidden = true;
	}

	/* The radial menu at the pointer: tools, or the actions of a player. */
	function openRadial(x, y, p)
	{
		if (present)
		{
			return;
		}
		var radial = board.radial;
		radial.textContent = "";
		var hit = hitTest(p);
		var items;
		var center;
		if (hit && hit.type === "player")
		{
			selected = hit;
			items = PLAYER_ACTIONS.map(function (a) { return { label: a.label, icon: a.icon, run: function () { startAction(a.id, hit.n); } }; })
				.concat([{ label: "Delete", icon: ICON.trash, run: function () { remember(active); removeObject(objects(), hit); selected = null; refresh(); } }]);
			center = { text: sideWord(active) + " " + hit.n };
		}
		else if (hit)
		{
			items = [{ label: "Delete", icon: ICON.trash, run: function () { remember(active); removeObject(objects(), hit); selected = null; refresh(); } },
				{ label: "Select", icon: TOOLS[0].icon, run: function () { setTool("move"); selected = hit; refresh(); } }];
			center = { text: "This" };
		}
		else
		{
			items = TOOLS.map(function (t) { return { label: t.label.split(" (")[0].split(":")[0].split(",")[0], icon: t.icon, key: t.key, tool: t.id, run: function () { setTool(t.id); } }; });
			var other = active === "allies" ? "axis" : "allies";
			center = { text: sideWord(active), sub: "→ " + sideWord(other), run: function () { setActive(other); } };
		}
		radial.style.setProperty("--side", sideColor(active));
		var R = 92;
		items.forEach(function (it, i)
		{
			var a = -Math.PI / 2 + i * Math.PI * 2 / items.length;
			var b = el("button", "t2-wedge" + (it.tool === tool ? " is-on" : ""));
			b.type = "button";
			b.innerHTML = svg(it.icon) + "<span>" + it.label + "</span>" + (it.key ? "<kbd>" + it.key + "</kbd>" : "");
			b.style.left = (120 + Math.cos(a) * R) + "px";
			b.style.top = (120 + Math.sin(a) * R) + "px";
			b.addEventListener("click", function (event)
			{
				event.stopPropagation();
				if (performance.now() < swallowUntil)
				{
					return;
				}
				hideRadial();
				it.run();
			});
			radial.appendChild(b);
		});
		var c = el("button", "t2-radial-center");
		c.type = "button";
		c.innerHTML = "<b>" + center.text + "</b>" + (center.sub ? "<small>" + center.sub + "</small>" : "");
		c.addEventListener("click", function (event)
		{
			event.stopPropagation();
			if (performance.now() < swallowUntil)
			{
				return;
			}
			hideRadial();
			if (center.run)
			{
				center.run();
			}
		});
		radial.appendChild(c);
		radial.style.left = Math.max(120, Math.min(stageW - 120, x)) + "px";
		radial.style.top = Math.max(120, Math.min(stageH - 120, y)) + "px";
		radial.hidden = false;
		renderContextBar();
	}

	function hideRadial()
	{
		if (board && !board.radial.hidden)
		{
			board.radial.hidden = true;
		}
	}

	/* The timeline: a track per side with its phases. */
	function renderTimeline()
	{
		board.tracks.forEach(function (track)
		{
			var side = track.side;
			var l = layers[side];
			track.node.classList.toggle("is-active", side === active);
			track.node.classList.toggle("is-hidden", !l.visible);
			track.label.querySelector(".t2-track-name").textContent = sideWord(side);
			track.label.querySelector(".t2-track-role").textContent = role(side) === "attack" ? "Attack" : "Defense";
			track.clips.textContent = "";
			l.phases.forEach(function (ph, i)
			{
				var clip = el("div", "t2-clip" + (i === l.current ? " is-current" : ""));
				clip.setAttribute("role", "button");
				clip.tabIndex = 0;
				clip.title = sideWord(side) + " phase " + (i + 1) + ": click to show, drag to reorder, double-click to rename";
				clip.appendChild(el("span", "t2-clip-n", String(i + 1)));
				clip.appendChild(el("span", "t2-clip-name", ph.name));
				var count = ph.objects.filter(function (o) { return o.type === "player"; }).length;
				clip.appendChild(el("span", "t2-clip-meta", count + "/5"));
				if (i === l.current)
				{
					var more = iconBtn("t2-clip-more", ICON.more, "Phase menu: rename, duplicate, delete", function (event)
					{
						event.stopPropagation();
						openClipMenu(side, more);
					});
					clip.appendChild(more);
				}
				clip.addEventListener("pointerdown", function (event) { clipDown(event, side, i, clip, track); });
				clip.addEventListener("keydown", function (event)
				{
					if (event.key === "Enter")
					{
						setActive(side);
						setPhase(side, i, true);
					}
				});
				track.clips.appendChild(clip);
			});
			var add = iconBtn("t2-clip-add", ICON.plus, "New " + sideWord(side) + " phase: the players stay where they are", function () { addPhase(side, false); });
			track.clips.appendChild(add);
			track.eye.innerHTML = svg(l.visible ? ICON.eye : ICON.eyeOff);
			track.eye.title = (l.visible ? "Hide" : "Show") + " the " + sideWord(side) + " side";
		});
		board.play.innerHTML = svg(playTimer ? ICON.pause : ICON.play);
		board.play.title = playTimer ? "Stop (Space)" : "Play the phases of both sides (Space)";
		board.play.disabled = stepCount() < 2;
		board.onionBtn.setAttribute("aria-pressed", String(opts.onion));
	}

	// A clip: click shows the phase; drag sideways reorders.
	function clipDown(event, side, index, clip, track)
	{
		if (event.button > 0 || event.target.closest(".t2-clip-more"))
		{
			return;
		}
		var start = event.clientX;
		var moved = false;
		// Where the clips are before the drag moves one.
		var centers = [].map.call(track.clips.querySelectorAll(".t2-clip"), function (c)
		{
			var r = c.getBoundingClientRect();
			return r.left + r.width / 2;
		});
		var move = function (e)
		{
			if (!moved && Math.abs(e.clientX - start) > 8)
			{
				moved = true;
				clip.classList.add("is-dragging");
			}
			if (moved)
			{
				clip.style.transform = "translateX(" + (e.clientX - start) + "px)";
			}
		};
		var up = function (e)
		{
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			clip.style.transform = "";
			clip.classList.remove("is-dragging");
			setActive(side);
			if (!moved)
			{
				// A second click on the current clip renames it (a double-click).
				var now = performance.now();
				var again = lastClip && lastClip.side === side && lastClip.index === index && now - lastClip.t < 450;
				lastClip = { side: side, index: index, t: now };
				stopPlay();
				if (again)
				{
					startRename(side, index);
				}
				else
				{
					setPhase(side, index, true);
				}
				return;
			}
			lastClip = null;
			// The new place: before the first clip whose centre is right of the drop.
			var to = centers.length - 1;
			for (var i = 0; i < centers.length; i++)
			{
				if (e.clientX <= centers[i])
				{
					to = i > index ? i - 1 : i;
					break;
				}
			}
			layers[side].current = index;
			movePhase(side, index, Math.max(0, Math.min(centers.length - 1, to)));
		};
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
	}

	function startRename(side, index)
	{
		setActive(side);
		if (index !== undefined)
		{
			setPhase(side, index);
		}
		var clip = board.tracks.filter(function (t) { return t.side === side; })[0].clips.querySelector(".t2-clip.is-current");
		var nameEl = clip ? clip.querySelector(".t2-clip-name") : null;
		if (!nameEl)
		{
			return;
		}
		var input = el("input", "t2-clip-input");
		input.value = phase(side).name;
		input.setAttribute("aria-label", "Phase name");
		nameEl.replaceWith(input);
		input.focus();
		input.select();
		var done = false;
		var finish = function (commit)
		{
			if (done)
			{
				return;
			}
			done = true;
			if (commit)
			{
				renamePhase(side, input.value);
			}
			else
			{
				refresh();
			}
		};
		input.addEventListener("keydown", function (event)
		{
			event.stopPropagation();
			if (event.key === "Enter") { finish(true); }
			if (event.key === "Escape") { finish(false); }
		});
		input.addEventListener("blur", function () { finish(true); });
		input.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
	}

	function openClipMenu(side, anchorEl)
	{
		var l = layers[side];
		openMenu(anchorEl, [
			{ label: "Rename", run: function () { startRename(side); } },
			{ label: "Duplicate (with the drawing)", run: function () { addPhase(side, true); } },
			{ label: "Move left", disabled: l.current === 0, run: function () { movePhase(side, l.current, l.current - 1); } },
			{ label: "Move right", disabled: l.current === l.phases.length - 1, run: function () { movePhase(side, l.current, l.current + 1); } },
			{ label: "Delete phase", danger: true, disabled: l.phases.length === 1, run: function () { deletePhase(side); } }
		], "up");
	}

	/* Menus (Start from, Export, View). */
	function openMenu(anchorEl, items, dir)
	{
		closeMenus();
		var menu = board.menu;
		menu.textContent = "";
		items.forEach(function (it)
		{
			if (it.sep)
			{
				menu.appendChild(el("div", "t2-menu-sep"));
				return;
			}
			var b = el("button", "t2-menu-item" + (it.danger ? " is-danger" : ""));
			b.type = "button";
			b.disabled = !!it.disabled;
			if (it.check !== undefined)
			{
				b.setAttribute("role", "menuitemcheckbox");
				b.setAttribute("aria-checked", String(!!it.check));
			}
			b.innerHTML = (it.check !== undefined ? '<span class="t2-check">' + (it.check ? "✓" : "") + "</span>" : "") +
				"<span><b>" + it.label + "</b>" + (it.desc ? "<small>" + it.desc + "</small>" : "") + "</span>";
			b.addEventListener("click", function (event)
			{
				event.stopPropagation();
				closeMenus();
				it.run();
			});
			menu.appendChild(b);
		});
		menu.hidden = false;
		var r = anchorEl.getBoundingClientRect();
		var root = board.root.getBoundingClientRect();
		var w = menu.offsetWidth;
		var h = menu.offsetHeight;
		menu.style.left = Math.max(8, Math.min(root.width - w - 8, r.left - root.left)) + "px";
		menu.style.top = (dir === "up" ? Math.max(8, r.top - root.top - h - 6) : r.bottom - root.top + 6) + "px";
	}

	function closeMenus()
	{
		if (board)
		{
			board.menu.hidden = true;
		}
	}

	function toggleOpt(key)
	{
		opts[key] = !opts[key];
		if (key === "spawns" || key === "sites")
		{
			buildFixed();
		}
		refresh();
	}

	function openViewMenu(anchorEl)
	{
		openMenu(anchorEl, [
			{ label: "Legend", desc: "Who attacks, what the markers are", check: opts.legend, run: function () { toggleOpt("legend"); } },
			{ label: "Scale bar", desc: "Game units", check: opts.scale, disabled: !worldWidth(), run: function () { toggleOpt("scale"); } },
			{ label: "Onion skin", desc: "The phase before, faded (N)", check: opts.onion, run: function () { toggleOpt("onion"); } },
			{ label: "Cursor highlight", desc: "For screen sharing (I)", check: opts.cursor, run: function () { toggleOpt("cursor"); } },
			{ sep: true },
			{ label: "Reset zoom", desc: "Double-click the empty map, or 0", run: resetView },
			{ label: "Keyboard shortcuts", desc: "?", run: showKeys }
		]);
	}

	function openStartMenu(anchorEl)
	{
		openMenu(anchorEl, TEMPLATES.map(function (t)
		{
			return { label: t.label, desc: t.desc, disabled: !hasSd() && t.id !== "blank", run: function () { applyTemplate(t.id); } };
		}));
	}

	function openExportMenu(anchorEl)
	{
		openMenu(anchorEl, [
			{ label: "This view as PNG", desc: "The shown sides at their current phase", run: exportCurrent },
			{ label: "Every step as PNG", desc: "One image per step of Play (" + stepCount() + ")", run: exportAll }
		]);
	}

	function renderTop()
	{
		board.title.textContent = map.name;
		board.sub.innerHTML = "";
		if (map.attackers)
		{
			var att = map.attackers;
			var def = att === "allies" ? "axis" : "allies";
			[[att, "attack"], [def, "defend"]].forEach(function (pair, i)
			{
				var s = el("span", "t2-sub-side");
				s.style.setProperty("--side", sideColor(pair[0]));
				s.textContent = sideName(pair[0]) + " " + pair[1];
				if (i)
				{
					board.sub.appendChild(document.createTextNode(" · "));
				}
				board.sub.appendChild(s);
			});
		}
		board.spawnsBtn.setAttribute("aria-pressed", String(opts.spawns));
		board.sitesBtn.setAttribute("aria-pressed", String(opts.sites));
		board.spawnsBtn.disabled = board.sitesBtn.disabled = !hasSd();
		board.startBtn.disabled = !hasSd();
		[].forEach.call(board.views.children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === view)); });
		board.views.hidden = !(images && images.topdown && images.radar);
		board.modeEdit.setAttribute("aria-pressed", String(!present));
		board.modePresent.setAttribute("aria-pressed", String(present));
		// The legend on the map.
		var lg = board.legend;
		lg.textContent = "";
		lg.hidden = !(opts.legend && hasSd() && (opts.spawns || opts.sites));
		if (!lg.hidden)
		{
			if (opts.spawns)
			{
				[[sd.attackers, "Attack"], [sd.defenders, "Defense"]].forEach(function (pair)
				{
					var c = el("span", "t2-legend-item");
					c.innerHTML = '<i class="t2-tri"></i>' + pair[1] + " · " + sideName(pair[0]);
					c.style.setProperty("--side", sideColor(pair[0]));
					lg.appendChild(c);
				});
			}
			if (opts.sites)
			{
				var s2 = el("span", "t2-legend-item");
				s2.innerHTML = '<i class="t2-dot"></i>Bomb sites A / B';
				lg.appendChild(s2);
			}
		}
		renderZoom();
	}

	function renderZoom()
	{
		if (board)
		{
			board.zoomLabel.textContent = Math.round(zoom.z * 100) + "%";
			board.zoomBox.classList.toggle("is-zoomed", zoom.z > 1.001);
		}
	}

	/* Hints: the pending action, the first-open coach marks. */
	function renderHint()
	{
		var h = board.hint;
		var text = "";
		if (pending)
		{
			text = { route: "Click where " + sideWord(active) + " " + pending.n + " goes",
				smoke: "Click where " + sideWord(active) + " " + pending.n + " throws the smoke",
				frag: "Click where " + sideWord(active) + " " + pending.n + " throws the frag",
				cone: "Click where " + sideWord(active) + " " + pending.n + " looks" }[pending.action];
		}
		else if (placing)
		{
			text = "Click the map to place " + sideWord(active) + " " + placing;
		}
		h.hidden = !text || present;
		h.innerHTML = text ? text + ' <span class="t2-kbd">Esc</span> cancels' : "";
		h.style.setProperty("--side", sideColor(active));
	}

	function showCoach()
	{
		board.coach.hidden = false;
		coachShown = true;
	}

	function hideCoach()
	{
		if (board && !board.coach.hidden)
		{
			board.coach.hidden = true;
		}
	}

	function showKeys()
	{
		board.keys.hidden = false;
		board.keysClose.focus();
	}

	function hideKeys()
	{
		board.keys.hidden = true;
	}

	/* ---------- present mode ---------- */

	function setPresent(on)
	{
		present = on;
		closeMenus();
		hideRadial();
		closeTextInput(true);
		selected = null;
		pending = null;
		placing = 0;
		board.root.classList.toggle("is-present", on);
		hideCoach();
		window.setTimeout(layout, 0);
		refresh();
	}

	function renderPresentBar()
	{
		var bar = board.presentBar;
		bar.hidden = !present;
		if (!present)
		{
			return;
		}
		var step = currentStep();
		var total = stepCount();
		board.presentStep.textContent = "Step " + (step + 1) + " / " + total;
		board.presentNames.textContent = SIDES.filter(function (s) { return layers[s].visible; })
			.map(function (s) { return sideWord(s) + ": " + phase(s).name; }).join(" · ");
		board.presentPrev.disabled = step === 0;
		board.presentNext.disabled = step >= total - 1;
		board.presentPlay.innerHTML = svg(playTimer ? ICON.pause : ICON.play);
		board.presentPlay.disabled = total < 2;
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
		var saved = glide;
		var savedK = sizeK;
		glide = null;
		sizeK = 1;
		drawLayers(ctx, w, index, false);
		glide = saved;
		sizeK = savedK;
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

	function exportName(step)
	{
		var shown = SIDES.filter(function (s) { return layers[s].visible; });
		return map.id + "_tactics" + (shown.length === 1 ? "_" + shown[0] : "") + "_phase" + (step + 1) + ".png";
	}

	function exportCurrent()
	{
		return exportImage(function (side) { return layers[side].current; }, exportName(currentStep()));
	}

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
		if (r.width < 50 || r.height < 50)
		{
			return;
		}
		stageW = r.width;
		stageH = r.height;
		clampView();
		renderAll();
		renderContextBar();
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

	/* ---------- keys ---------- */

	function onKey(event)
	{
		if (!board || board.root.hidden)
		{
			return;
		}
		if (event.key === " " && !/^(INPUT|TEXTAREA)$/.test(event.target.tagName))
		{
			// Space: pan while held; a tap plays (on key up). Not a click on a focused button.
			event.preventDefault();
			if (!event.repeat)
			{
				spaceDown = true;
				spaceUsed = false;
			}
			return;
		}
		var typing = /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
		if (typing)
		{
			if (event.target === board.text && (event.key === "Enter" || event.key === "Escape"))
			{
				event.preventDefault();
				closeTextInput(event.key === "Enter");
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
		if (!board.keys.hidden)
		{
			if (event.key === "Escape" || event.key === "?")
			{
				hideKeys();
			}
			return;
		}
		var k = event.key;
		var lower = k.toLowerCase();
		var mod = event.ctrlKey || event.metaKey;
		if (mod && lower === "z")
		{
			event.preventDefault();
			if (event.shiftKey) { redo(); } else { undo(); }
			return;
		}
		if (mod && lower === "y")
		{
			event.preventDefault();
			redo();
			return;
		}
		if (mod || event.altKey)
		{
			return;
		}
		if (k === "Escape")
		{
			if (!board.menu.hidden || !board.radial.hidden)
			{
				closeMenus();
				hideRadial();
				return;
			}
			if (pending || placing || selected || drag || tool !== "move")
			{
				pending = null;
				placing = 0;
				selected = null;
				cancelDrag();
				setTool("move");
				return;
			}
			if (present)
			{
				setPresent(false);
			}
			return;
		}
		if (k === "Tab")
		{
			event.preventDefault();
			setActive(active === "allies" ? "axis" : "allies");
			return;
		}
		if (k === "ArrowLeft" || k === "ArrowRight")
		{
			event.preventDefault();
			stopPlay();
			var d = k === "ArrowLeft" ? -1 : 1;
			if (present)
			{
				showStep(Math.max(0, Math.min(stepCount() - 1, currentStep() + d)));
			}
			else
			{
				setPhase(active, layer().current + d, true);
			}
			return;
		}
		if (k === "?")
		{
			showKeys();
			return;
		}
		if (lower === "p")
		{
			setPresent(!present);
			return;
		}
		if (lower === "f")
		{
			toggleFullscreen();
			return;
		}
		if (k === "0")
		{
			resetView();
			return;
		}
		if (k === "+" || k === "=")
		{
			zoomAt(1.25, stageW / 2, stageH / 2);
			return;
		}
		if (k === "-")
		{
			zoomAt(0.8, stageW / 2, stageH / 2);
			return;
		}
		if (present)
		{
			return;
		}
		if ((k === "Delete" || k === "Backspace") && selected)
		{
			event.preventDefault();
			remember(active);
			removeObject(objects(), selected);
			selected = null;
			refresh();
			return;
		}
		if (lower === "n") { toggleOpt("onion"); return; }
		if (lower === "i") { toggleOpt("cursor"); return; }
		// Shift+1..5: player n at the pointer.
		var digit = /^Digit([1-5])$/.exec(event.code || "");
		if (event.shiftKey && digit && pointer && pointer[0] >= 0 && pointer[0] <= 1 && pointer[1] >= 0 && pointer[1] <= 1)
		{
			event.preventDefault();
			placePlayer(Number(digit[1]), snapped(pointer, event));
			refresh();
			return;
		}
		var t = TOOLS.filter(function (x) { return x.key === k; })[0];
		if (t)
		{
			event.preventDefault();
			setTool(t.id);
		}
	}

	function onKeyUp(event)
	{
		if (event.key === " " && spaceDown)
		{
			event.preventDefault();
			spaceDown = false;
			if (!spaceUsed && board && !board.root.hidden)
			{
				togglePlay();
			}
			if (board)
			{
				board.overlay.style.cursor = cursorFor();
			}
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

		// Top bar.
		var top = el("header", "t2-top");
		var close1 = iconBtn("t2-back", ICON.back, "Back to the map (the drawing is not kept)", close);
		var titles = el("div", "t2-titles");
		var title = el("b", "t2-title");
		var sub = el("span", "t2-sub");
		titles.appendChild(title);
		titles.appendChild(sub);
		var start = textBtn("t2-start", svg(ICON.templates) + "<span>Start from</span>", "Start from a plan built from this map's spawns and bomb sites", function (event) { event.stopPropagation(); openStartMenu(start); });
		var views = el("div", "t2-seg t2-views");
		[["topdown", "Top-down"], ["radar", "Radar"]].forEach(function (pair)
		{
			var b = textBtn("", pair[1], pair[0] === "radar" ? "zPAM's radar image" : "Rendered from the map file", function () { switchView(pair[0]); });
			b.setAttribute("data-view", pair[0]);
			views.appendChild(b);
		});
		var spawnsBtn = textBtn("t2-chip", svg(ICON.spawn) + "<span>Spawns</span>", "S&D spawns of both sides", function () { toggleOpt("spawns"); });
		var sitesBtn = textBtn("t2-chip", svg(ICON.site) + "<span>Sites</span>", "Bomb sites A and B with their plant area", function () { toggleOpt("sites"); });
		var viewMenu = iconBtn("t2-viewmenu", ICON.more, "View: legend, scale, onion skin, cursor, zoom, keys", function (event) { event.stopPropagation(); openViewMenu(viewMenu); });
		var mode = el("div", "t2-seg t2-mode");
		var modeEdit = textBtn("", "Edit", "Edit", function () { setPresent(false); });
		var modePresent = textBtn("", svg(ICON.present) + "<span>Present</span>", "Present: only the map, the steps and the laser (P)", function () { setPresent(true); });
		mode.appendChild(modeEdit);
		mode.appendChild(modePresent);
		var exportBtn = textBtn("t2-export", svg(ICON.export) + "<span>Export</span>", "Save PNGs", function (event) { event.stopPropagation(); openExportMenu(exportBtn); });
		var helpBtn = iconBtn("t2-help-btn", ICON.help, "Keyboard shortcuts (?)", showKeys);
		var closeBtn = iconBtn("t2-close", ICON.close, "Close (the drawing is not kept)", close);
		[close1, titles, start, el("span", "t2-grow"), views, spawnsBtn, sitesBtn, viewMenu, mode, exportBtn, helpBtn, closeBtn].forEach(function (n) { top.appendChild(n); });
		root.appendChild(top);

		// Rails and the stage.
		var rails = SIDES.map(buildRail);
		var stage = el("main", "t2-stage");
		var base = el("canvas", "t2-canvas");
		var main = el("canvas", "t2-canvas");
		var overlay = el("canvas", "t2-canvas t2-overlay");
		overlay.setAttribute("role", "img");
		overlay.setAttribute("aria-label", "Map: drag to draw, right-click or long-press for tools");
		[base, main, overlay].forEach(function (c) { stage.appendChild(c); });
		var legend = el("div", "t2-legend");
		stage.appendChild(legend);
		var zoomBox = el("div", "t2-zoom");
		var zoomOut = iconBtn("", ICON.minus, "Zoom out (-)", function () { zoomAt(0.8, stageW / 2, stageH / 2); });
		var zoomLabel = textBtn("t2-zoom-label", "100%", "Reset zoom (0, or double-click the empty map)", resetView);
		var zoomIn = iconBtn("", ICON.plus, "Zoom in (+, wheel, pinch)", function () { zoomAt(1.25, stageW / 2, stageH / 2); });
		[zoomOut, zoomLabel, zoomIn].forEach(function (n) { zoomBox.appendChild(n); });
		stage.appendChild(zoomBox);
		var text = el("input", "t2-text");
		text.type = "text";
		text.hidden = true;
		text.setAttribute("aria-label", "Text");
		text.addEventListener("blur", function () { closeTextInput(true); });
		stage.appendChild(text);
		var ctxBar = el("div", "t2-ctx");
		ctxBar.hidden = true;
		ctxBar.setAttribute("role", "toolbar");
		stage.appendChild(ctxBar);
		var radial = el("div", "t2-radial");
		radial.hidden = true;
		radial.setAttribute("role", "menu");
		stage.appendChild(radial);
		var hint = el("div", "t2-hint");
		hint.hidden = true;
		hint.setAttribute("aria-live", "polite");
		stage.appendChild(hint);
		var coach = el("div", "t2-coach");
		coach.hidden = true;
		coach.innerHTML = "<ol><li><b>Drag a player</b> from the side bar onto the map.</li>" +
			"<li><b>Click the player</b> for Route, Smoke, Frag or Look.</li>" +
			"<li><b>Right-click</b> (long-press) for every tool; <b>Start from</b> builds a plan.</li></ol>";
		coach.appendChild(iconBtn("t2-coach-close", ICON.close, "Got it", hideCoach));
		stage.appendChild(coach);
		var confirm = el("div", "t2-confirm");
		confirm.hidden = true;
		confirm.setAttribute("role", "alertdialog");
		var confirmText = el("span");
		var confirmYes = textBtn("t2-danger", "OK", "", function () { closeConfirm(true); });
		confirm.appendChild(confirmText);
		confirm.appendChild(confirmYes);
		confirm.appendChild(textBtn("", "Cancel", "", function () { closeConfirm(false); }));
		stage.appendChild(confirm);

		// Present mode's bar.
		var presentBar = el("div", "t2-present");
		presentBar.hidden = true;
		var presentPrev = iconBtn("", ICON.back, "Step back (←)", function () { stopPlay(); showStep(currentStep() - 1); });
		var presentPlay = iconBtn("t2-present-play", ICON.play, "Play (Space)", togglePlay);
		var presentNext = iconBtn("", ICON.next, "Next step (→)", function () { stopPlay(); showStep(currentStep() + 1); });
		var presentInfo = el("div", "t2-present-info");
		var presentStep = el("b");
		var presentNames = el("span");
		presentInfo.appendChild(presentStep);
		presentInfo.appendChild(presentNames);
		var presentFull = iconBtn("", ICON.fullscreen, "Fullscreen (F)", toggleFullscreen);
		if (!document.fullscreenEnabled)
		{
			presentFull.hidden = true;
		}
		var presentExit = textBtn("t2-present-exit", "Edit", "Back to editing (Esc / P)", function () { setPresent(false); });
		[presentPrev, presentPlay, presentNext, presentInfo, presentFull, presentExit].forEach(function (n) { presentBar.appendChild(n); });
		stage.appendChild(presentBar);

		root.appendChild(rails[0].node);
		root.appendChild(stage);
		root.appendChild(rails[1].node);

		// The timeline.
		var time = el("footer", "t2-time");
		var transport = el("div", "t2-transport");
		var play = iconBtn("t2-play", ICON.play, "Play (Space)", togglePlay);
		var onionBtn = iconBtn("t2-onion", ICON.onion, "Onion skin: the phase before, faded (N)", function () { toggleOpt("onion"); });
		var fullBtn = iconBtn("", ICON.fullscreen, "Fullscreen (F)", toggleFullscreen);
		if (!document.fullscreenEnabled)
		{
			fullBtn.hidden = true;
		}
		transport.appendChild(play);
		transport.appendChild(onionBtn);
		transport.appendChild(fullBtn);
		time.appendChild(transport);
		var trackBox = el("div", "t2-tracks");
		var tracks = SIDES.map(function (side)
		{
			var node = el("div", "t2-track t2-track-" + side);
			var label = el("button", "t2-track-label");
			label.type = "button";
			label.innerHTML = '<span class="t2-track-name"></span><span class="t2-track-role"></span>';
			label.addEventListener("click", function () { setActive(side); });
			var eye = iconBtn("t2-track-eye", ICON.eye, "", function () { toggleLayer(side); });
			var clips = el("div", "t2-clips");
			node.appendChild(label);
			node.appendChild(eye);
			node.appendChild(clips);
			trackBox.appendChild(node);
			return { side: side, node: node, label: label, eye: eye, clips: clips };
		});
		time.appendChild(trackBox);
		root.appendChild(time);

		var menu = el("div", "t2-menu");
		menu.hidden = true;
		menu.setAttribute("role", "menu");
		root.appendChild(menu);

		var keys = el("div", "t2-keys");
		keys.hidden = true;
		keys.setAttribute("role", "dialog");
		keys.setAttribute("aria-label", "Keyboard shortcuts");
		var keyRows = [["1 – 9", "Tools: move, route, smoke, frag, look, pen, text, laser, eraser"], ["Shift + 1 – 5", "Player 1 – 5 at the pointer"],
			["Tab", "Switch Allies / Axis"], ["Right-click / long-press", "Tools at the pointer; on a player: its actions"],
			["← →", "Phase of the active side (in Present: the step)"], ["Space", "Play / stop (hold and drag: pan)"],
			["Ctrl+Z / Ctrl+Y", "Undo / redo on the active side"], ["Delete", "Delete the selected object"],
			["Alt while dragging", "No snapping to spawns and sites"], ["Wheel / pinch, 0", "Zoom, reset zoom"], ["+ / -", "Zoom in / out"],
			["N / I", "Onion skin / cursor highlight"], ["P", "Present"], ["F", "Fullscreen"], ["Esc", "Cancel, back to Move, leave Present"], ["?", "This list"]];
		var keyHtml = "<h3>Keyboard</h3><dl>";
		keyRows.forEach(function (r) { keyHtml += "<dt>" + r[0].split(" / ").map(function (x) { return '<span class="t2-kbd">' + x + "</span>"; }).join(" ") + "</dt><dd>" + r[1] + "</dd>"; });
		keys.innerHTML = keyHtml + "</dl>";
		var keysClose = textBtn("t2-primary", "Close", "", hideKeys);
		keys.appendChild(keysClose);
		root.appendChild(keys);

		overlay.addEventListener("pointerdown", onDown);
		overlay.addEventListener("pointermove", onMove);
		overlay.addEventListener("pointerup", onUp);
		overlay.addEventListener("pointercancel", function (event)
		{
			delete touches[event.pointerId];
			gesture = Object.keys(touches).length ? gesture : null;
			if (drag)
			{
				onUp(event);
			}
		});
		overlay.addEventListener("pointerleave", function () { if (!drag) { pointer = null; renderOverlay(); } });
		overlay.addEventListener("dblclick", onDoubleClick);
		overlay.addEventListener("wheel", onWheel, { passive: false });
		overlay.addEventListener("contextmenu", function (event)
		{
			event.preventDefault();
			if (drag && drag.kind !== "none")
			{
				return;
			}
			var sp = stagePoint(event);
			openRadial(sp[0], sp[1], fromClient(event.clientX, event.clientY));
		});
		root.addEventListener("click", function (event)
		{
			if (!event.target.closest(".t2-menu") && !event.target.closest(".t2-radial"))
			{
				closeMenus();
				if (!event.target.closest(".t2-overlay"))
				{
					hideRadial();
				}
			}
		});
		document.addEventListener("keydown", onKey);
		document.addEventListener("keyup", onKeyUp);
		document.addEventListener("fullscreenchange", function () { window.setTimeout(layout, 60); });
		if (window.ResizeObserver)
		{
			new ResizeObserver(layout).observe(stage);
		}
		window.addEventListener("resize", layout);

		document.body.appendChild(root);
		board = {
			root: root, title: title, sub: sub, startBtn: start, views: views, spawnsBtn: spawnsBtn, sitesBtn: sitesBtn,
			modeEdit: modeEdit, modePresent: modePresent, rails: rails, stage: stage, base: base, main: main, overlay: overlay,
			legend: legend, zoomBox: zoomBox, zoomLabel: zoomLabel, text: text, ctx: ctxBar, radial: radial, hint: hint, coach: coach,
			confirm: confirm, confirmText: confirmText, confirmYes: confirmYes, presentBar: presentBar, presentPrev: presentPrev,
			presentPlay: presentPlay, presentNext: presentNext, presentStep: presentStep, presentNames: presentNames,
			play: play, onionBtn: onionBtn, tracks: tracks, menu: menu, keys: keys, keysClose: keysClose
		};
	}

	/* ---------- open / close ---------- */

	function setupSides()
	{
		board.rails.forEach(function (rail)
		{
			var side = rail.side;
			rail.node.style.setProperty("--side", sideColor(side));
			rail.node.style.setProperty("--side-ink", sideInk(side));
			rail.badge.querySelector(".t2-badge-side").textContent = sideWord(side);
			rail.badge.querySelector(".t2-badge-role").textContent = nation(side).name + " · " + (role(side) === "attack" ? "Attack" : "Defense");
			rail.badge.title = sideName(side) + ", " + (role(side) === "attack" ? "attacks" : "defends") + " in S&D: draw for this side (Tab switches)";
			[].forEach.call(rail.node.querySelectorAll(".t2-tool"), function (b)
			{
				var t = TOOLS.filter(function (x) { return x.id === b.getAttribute("data-tool"); })[0];
				b.title = t.label + " – " + sideWord(side) + " (" + t.key + ")";
				b.setAttribute("aria-label", t.label + ", " + sideWord(side) + ", key " + t.key);
			});
			[].forEach.call(rail.roster.children, function (t)
			{
				t.style.setProperty("--side", sideColor(side));
				t.style.color = sideInk(side);
			});
		});
		board.tracks.forEach(function (track)
		{
			track.node.style.setProperty("--side", sideColor(track.side));
		});
	}

	function resetLayers()
	{
		layers = { allies: newLayer(), axis: newLayer() };
		selected = null;
		pending = null;
		placing = 0;
		draft = null;
		drag = null;
		glide = null;
	}

	function loadView(v)
	{
		view = v;
		image = new Image();
		image.onload = function ()
		{
			buildFixed();
			layout();
			refresh();
		};
		image.src = images[v];
	}

	function switchView(v)
	{
		if (v === view || !images || !images[v])
		{
			return;
		}
		var drawn = SIDES.some(function (s) { return layers[s].phases.some(function (p) { return p.objects.length; }); });
		var go = function ()
		{
			resetLayers();
			resetView();
			loadView(v);
			refresh();
		};
		if (drawn)
		{
			askConfirm("The two images are framed differently, so switching starts a new drawing.", "Switch", go);
		}
		else
		{
			go();
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
		present = false;
		board.root.classList.remove("is-present");
		active = map.attackers === "axis" ? "axis" : "allies";
		tool = "move";
		zoom = { z: 1, cu: 0.5, cv: 0.5 };
		fixedCache = null;
		images = null;
		setupSides();
		board.root.hidden = false;
		document.documentElement.classList.add("t2-open");
		board.keys.hidden = true;
		board.confirm.hidden = true;
		layout();
		loadImages(function (imgs)
		{
			images = imgs;
			loadView(imgs[v] ? v : (imgs.topdown ? "topdown" : "radar"));
		});
		refresh();
		if (!coachShown)
		{
			showCoach();
		}
		board.overlay.focus();
	}

	function close()
	{
		stopPlay();
		closeTextInput(false);
		closeConfirm(false);
		closeMenus();
		hideRadial();
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

	function state()
	{
		var out = { active: active, tool: tool, present: present, zoom: Math.round(zoom.z * 100) / 100, layers: {} };
		SIDES.forEach(function (s)
		{
			var l = layers[s];
			out.layers[s] = JSON.parse(JSON.stringify({ phases: l.phases, current: l.current, visible: l.visible,
				undo: l.history.length, redo: l.future.length }));
		});
		return out;
	}

	return {
		open: open,
		state: state,
		// For the browser tests: client coordinates of a map point, and of a player.
		_test: {
			toClient: function (u, v)
			{
				var r = board.overlay.getBoundingClientRect();
				var p = toScreen([u, v]);
				return [r.left + p[0], r.top + p[1]];
			},
			player: function (side, n)
			{
				var pl = playerIn(objects(side), n);
				return pl ? pl.p.slice() : null;
			},
			site: function (label)
			{
				var s = sd.sites.filter(function (x) { return x.label === label; })[0];
				return toUV(s.origin[0], s.origin[1]);
			}
		}
	};
})();
