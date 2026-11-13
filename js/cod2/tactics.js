/*
 * CoD2 tactics board: draw on a map's overhead image (maps tab) to present a
 * tactic. Nothing is saved: the drawing is gone when the board closes, the map
 * changes or the page reloads; only the PNG export keeps it.
 *
 * Drawings are kept in map coordinates (0..1 across the image) and sizes in
 * fractions of the image width, so they stay in place and in scale whatever
 * size the board has. The images come from js/cod2/maps/<map>.js as data URLs,
 * so the canvas stays exportable on file:// too.
 *
 * window.COD2_TACTICS.open(map, view, onClose): map from window.COD2_MAPS,
 * view "topdown" or "radar". state(): a copy of the phases, for checks.
 */
window.COD2_TACTICS = (function ()
{
	"use strict";

	var el = window.UI.el;

	var TEAM = { attack: "#ff8a2a", defence: "#3fa3ff" };
	var TEAM_NAME = { attack: "Attack", defence: "Defence" };
	var WIDTH_UNIT = 0.0022;          // line width 1 = 0.22% of the image
	var PLAYER_R = 0.022;
	var SMOKE_R = 0.05;
	var FRAG_R = 0.045;
	var FLASH_R = 0.03;
	var LASER_MS = 1500;
	var PLAY_MS = 2000;
	var HISTORY_MAX = 100;

	// key: the shortcut; icon: an SVG path set drawn with currentColor.
	var TOOLS = [
		{ id: "select", key: "v", label: "Select and move", icon: '<path d="M5 3l11 7-5 1.5L8.5 17z" fill="currentColor"/>' },
		{ id: "arrow", key: "a", label: "Arrow (drag the middle handle to bend it)", icon: '<path d="M3 16L15 4M9 4h6v6" fill="none"/>' },
		{ id: "pen", key: "p", label: "Pen", icon: '<path d="M3 15c3-6 5 2 8-3s3-6 6-8" fill="none"/>' },
		{ id: "line", key: "l", label: "Line", icon: '<path d="M3 17L17 3" fill="none"/>' },
		{ id: "rect", key: "r", label: "Rectangle", icon: '<rect x="3" y="5" width="14" height="10" fill="none"/>' },
		{ id: "ellipse", key: "o", label: "Circle / ellipse", icon: '<ellipse cx="10" cy="10" rx="7" ry="5.5" fill="none"/>' },
		{ id: "area", key: "d", label: "Filled area", icon: '<path d="M4 6l6-3 7 5-3 8-9-1z" fill="currentColor" fill-opacity=".35"/>' },
		{ id: "text", key: "t", label: "Text", icon: '<path d="M4 5h12M10 5v11" fill="none"/>' },
		{ id: "player", key: "m", label: "Player (M again: other team, 1–5: number)", icon: '<circle cx="10" cy="10" r="6.5" fill="none"/><path d="M9 7.5l1.5-1v7" fill="none"/>' },
		{ id: "smoke", key: "s", label: "Smoke (drag from the thrower for a throw path)", icon: '<circle cx="8" cy="11" r="4.5" fill="currentColor" fill-opacity=".45"/><circle cx="12.5" cy="8.5" r="4.5" fill="currentColor" fill-opacity=".45"/>' },
		{ id: "frag", key: "g", label: "Frag grenade (drag for a throw path)", icon: '<circle cx="10" cy="10" r="2.5" fill="currentColor"/><circle cx="10" cy="10" r="7" fill="none" stroke-dasharray="2.5 2"/>' },
		{ id: "flash", key: "b", label: "Flash grenade (drag for a throw path)", icon: '<path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.5 4.5l2.8 2.8M12.7 12.7l2.8 2.8M15.5 4.5l-2.8 2.8M7.3 12.7l-2.8 2.8" fill="none"/>' },
		{ id: "cone", key: "c", label: "View cone (drag to aim)", icon: '<path d="M4 15L16 5M4 15L17 12" fill="none"/><path d="M4 15L16 5Q18 9 17 12z" fill="currentColor" fill-opacity=".3"/>' },
		{ id: "laser", key: "x", label: "Laser pointer (fades, nothing is kept)", icon: '<circle cx="14" cy="6" r="2.5" fill="currentColor"/><path d="M3 17l9-9" fill="none" stroke-dasharray="2 2"/>' },
		{ id: "eraser", key: "e", label: "Eraser", icon: '<path d="M7 16l-3.5-3.5 8-8 6 6-6 6H17" fill="none"/>' }
	];

	var board = null;           // the board's elements, built on the first open
	var map = null;
	var view = "topdown";
	var image = null;           // the background as an Image (for drawing and export)
	var onClose = null;

	var phases = [];
	var current = 0;
	var history = [];
	var future = [];
	var selected = null;        // index into the current phase's objects
	var tool = "arrow";
	var opts = { color: TEAM.attack, width: 4, opacity: 1, dashed: false, team: "attack", number: 1, onion: false, cursor: false };

	var size = 0;               // the drawing's size on screen, CSS pixels
	var drag = null;            // what the pointer is doing
	var draft = null;           // an object being drawn
	var laser = [];             // { x, y, t } of the laser trail
	var pointer = null;         // last pointer position (normalised), for the cursor highlight
	var playTimer = 0;
	var animating = false;
	var confirmAction = null;

	/* ---------- state ---------- */

	function objects()
	{
		return phases[current].objects;
	}

	function snapshot()
	{
		return JSON.stringify({ phases: phases, current: current });
	}

	function restore(text)
	{
		var s = JSON.parse(text);
		phases = s.phases;
		current = Math.min(s.current, phases.length - 1);
		selected = null;
	}

	// Call before every change; undo goes back to this point.
	function remember()
	{
		history.push(snapshot());
		if (history.length > HISTORY_MAX)
		{
			history.shift();
		}
		future = [];
	}

	function undo()
	{
		if (!history.length)
		{
			return;
		}
		future.push(snapshot());
		restore(history.pop());
		refresh();
	}

	function redo()
	{
		if (!future.length)
		{
			return;
		}
		history.push(snapshot());
		restore(future.pop());
		refresh();
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

	// Text width in map units; measured at a large font size, since tiny ones round badly.
	function textWidth(o)
	{
		var ctx = scratchContext();
		ctx.font = "700 " + textSize(o) * 1000 + "px sans-serif";
		return ctx.measureText(o.text).width / 1000;
	}

	// How far p (normalised) is from the object, in normalised units; 0 inside.
	function hitDistance(o, p, ctx)
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
			case "flash":
				var r = o.type === "smoke" ? SMOKE_R : o.type === "frag" ? 0.015 : FLASH_R;
				var d = Math.max(0, dist(p, o.p) - r);
				return o.from ? Math.min(d, segDist(p, o.from, o.p)) : d;
			case "cone":
				var pts = conePoints(o);
				return inPolygon(p, pts) ? 0 : polyDist(p, pts.concat([pts[0]]));
		}
		return Infinity;
	}

	function hitTest(p)
	{
		var list = objects();
		var tolerance = 10 / size;
		var ctx = scratchContext();
		for (var i = list.length - 1; i >= 0; i--)
		{
			var o = list[i];
			if (hitDistance(o, p, ctx) <= tolerance + o.width * WIDTH_UNIT / 2)
			{
				return i;
			}
		}
		return -1;
	}

	var scratch = null;
	// A 1x1 canvas scaled so that text measures in normalised units.
	function scratchContext()
	{
		if (!scratch)
		{
			scratch = document.createElement("canvas").getContext("2d");
		}
		return scratch;
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
			case "flash":
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
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.moveTo(end[0] * S, end[1] * S);
		ctx.lineTo(end[0] * S - Math.cos(angle - 0.45) * head, end[1] * S - Math.sin(angle - 0.45) * head);
		ctx.lineTo(end[0] * S - Math.cos(angle + 0.45) * head, end[1] * S - Math.sin(angle + 0.45) * head);
		ctx.closePath();
		ctx.fill();
	}

	function drawGrenade(ctx, o, S)
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
		else if (o.type === "frag")
		{
			ctx.strokeStyle = o.color;
			ctx.lineWidth = Math.max(2, S * 0.0035);
			ctx.setLineDash([S * 0.01, S * 0.007]);
			ctx.beginPath();
			ctx.arc(x, y, FRAG_R * S, 0, Math.PI * 2);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = o.color;
			ctx.globalAlpha *= 0.15;
			ctx.fill();
			ctx.globalAlpha /= 0.15;
			ctx.fillStyle = "#2c3a22";
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = Math.max(1.5, S * 0.0025);
			ctx.beginPath();
			ctx.arc(x, y, S * 0.011, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		else
		{
			var R = FLASH_R * S;
			ctx.strokeStyle = "#fffbe0";
			ctx.lineWidth = Math.max(2, S * 0.004);
			ctx.lineCap = "round";
			for (var i = 0; i < 8; i++)
			{
				var a = i * Math.PI / 4;
				ctx.beginPath();
				ctx.moveTo(x + Math.cos(a) * R * 0.35, y + Math.sin(a) * R * 0.35);
				ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
				ctx.stroke();
			}
			var g2 = ctx.createRadialGradient(x, y, 0, x, y, R * 0.5);
			g2.addColorStop(0, "#ffffff");
			g2.addColorStop(1, "rgba(255,240,150,0.2)");
			ctx.fillStyle = g2;
			ctx.beginPath();
			ctx.arc(x, y, R * 0.5, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function drawPlayer(ctx, o, S)
	{
		var x = o.p[0] * S;
		var y = o.p[1] * S;
		var r = PLAYER_R * S;
		ctx.fillStyle = TEAM[o.team];
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = Math.max(2, r * 0.16);
		ctx.shadowColor = "rgba(0,0,0,0.6)";
		ctx.shadowBlur = r * 0.4;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;
		ctx.stroke();
		ctx.fillStyle = "#fff";
		ctx.font = "800 " + Math.round(r * 1.25) + "px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(o.n), x, y + r * 0.06);
	}

	function drawObject(ctx, o, S, fade)
	{
		var w = Math.max(1, o.width * WIDTH_UNIT * S);
		ctx.save();
		ctx.globalAlpha = (o.opacity === undefined ? 1 : o.opacity) * (fade || 1);
		ctx.strokeStyle = o.color;
		ctx.fillStyle = o.color;
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
				ctx.stroke();
				break;
			case "pen":
				ctx.setLineDash(dashFor(o, w));
				smoothPath(ctx, o.pts, S);
				ctx.stroke();
				break;
			case "rect":
				ctx.setLineDash(dashFor(o, w));
				ctx.strokeRect(Math.min(o.p0[0], o.p1[0]) * S, Math.min(o.p0[1], o.p1[1]) * S,
					Math.abs(o.p1[0] - o.p0[0]) * S, Math.abs(o.p1[1] - o.p0[1]) * S);
				break;
			case "ellipse":
				ctx.setLineDash(dashFor(o, w));
				ctx.beginPath();
				ctx.ellipse((o.p0[0] + o.p1[0]) / 2 * S, (o.p0[1] + o.p1[1]) / 2 * S,
					Math.abs(o.p1[0] - o.p0[0]) / 2 * S, Math.abs(o.p1[1] - o.p0[1]) / 2 * S, 0, 0, Math.PI * 2);
				ctx.stroke();
				break;
			case "area":
				strokePath(ctx, o.pts, S);
				ctx.closePath();
				ctx.globalAlpha *= 0.35;
				ctx.fill();
				ctx.globalAlpha /= 0.35;
				ctx.lineWidth = Math.max(1, w * 0.5);
				ctx.stroke();
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
				drawPlayer(ctx, o, S);
				break;
			case "smoke":
			case "frag":
			case "flash":
				drawGrenade(ctx, o, S);
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
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(o.p[0] * S, o.p[1] * S, Math.max(3, w * 1.2), 0, Math.PI * 2);
				ctx.fill();
				break;
		}
		ctx.restore();
	}

	// The drawing of a phase (with the one before it faded, for the onion skin).
	function drawPhase(ctx, index, S, onion)
	{
		if (onion && index > 0)
		{
			phases[index - 1].objects.forEach(function (o) { drawObject(ctx, o, S, 0.28); });
		}
		phases[index].objects.forEach(function (o) { drawObject(ctx, o, S); });
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

	function renderMain()
	{
		if (!size)
		{
			return;
		}
		drawPhase(prepare(board.main), current, size, opts.onion);
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
			drawObject(ctx, draft, S);
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
				ctx.arc(h.p[0] * S, h.p[1] * S, 7, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			});
			ctx.restore();
		}

		var now = performance.now();
		laser = laser.filter(function (q) { return now - q.t < LASER_MS; });
		if (laser.length)
		{
			ctx.save();
			ctx.lineCap = "round";
			for (var i = 1; i < laser.length; i++)
			{
				var a = 1 - (now - laser[i].t) / LASER_MS;
				ctx.strokeStyle = "rgba(255,40,40," + a.toFixed(3) + ")";
				ctx.shadowColor = "rgba(255,60,60," + a.toFixed(3) + ")";
				ctx.shadowBlur = 10;
				ctx.lineWidth = Math.max(3, S * 0.006);
				ctx.beginPath();
				ctx.moveTo(laser[i - 1].x * S, laser[i - 1].y * S);
				ctx.lineTo(laser[i].x * S, laser[i].y * S);
				ctx.stroke();
			}
			ctx.restore();
		}

		if (opts.cursor && pointer)
		{
			ctx.save();
			ctx.strokeStyle = "rgba(255,216,74,0.95)";
			ctx.fillStyle = "rgba(255,216,74,0.18)";
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(pointer[0] * S, pointer[1] * S, Math.max(18, S * 0.025), 0, Math.PI * 2);
			ctx.fill();
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
		var r = o.type === "player" ? PLAYER_R : o.type === "smoke" ? SMOKE_R : o.type === "frag" ? FRAG_R : o.type === "flash" ? FLASH_R : 0;
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
		renderToolbar();
	}

	/* ---------- pointer ---------- */

	function toMap(event)
	{
		var r = board.overlay.getBoundingClientRect();
		return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height];
	}

	function style()
	{
		return { color: opts.color, width: opts.width, opacity: opts.opacity, dashed: opts.dashed };
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
		board.overlay.setPointerCapture(event.pointerId);
		var p = toMap(event);
		pointer = p;
		var list = objects();

		switch (tool)
		{
			case "select":
				if (selected !== null && list[selected])
				{
					var hit = handles(list[selected]).filter(function (h) { return dist(h.p, p) * size <= 12; })[0];
					if (hit)
					{
						remember();
						drag = { kind: "handle", key: hit.key };
						break;
					}
				}
				var index = hitTest(p);
				selected = index === -1 ? null : index;
				if (index !== -1)
				{
					remember();
					drag = { kind: "move", last: p, moved: false };
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
				draft = withStyle({ type: "cone", p: p, dir: -Math.PI / 2, spread: Math.PI / 3, len: 0.12 });
				drag = { kind: "draw", start: p };
				break;
			case "smoke":
			case "frag":
			case "flash":
				draft = withStyle({ type: tool, p: p, from: null });
				drag = { kind: "draw", start: p };
				break;
			case "player":
				remember();
				list.push({ type: "player", p: p, team: opts.team, n: opts.number, opacity: 1, width: 0, color: TEAM[opts.team] });
				selected = null;
				opts.number = opts.number % 5 + 1;
				drag = { kind: "place", index: list.length - 1 };
				break;
			case "text":
				drag = { kind: "text", p: p };
				break;
			case "laser":
				laser.push({ x: p[0], y: p[1], t: performance.now() });
				drag = { kind: "laser" };
				break;
			case "eraser":
				remember();
				drag = { kind: "erase", erased: false };
				erase(p);
				break;
		}
		refresh();
	}

	function erase(p)
	{
		var index = hitTest(p);
		if (index !== -1)
		{
			objects().splice(index, 1);
			drag.erased = true;
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
				setHandle(list[selected], drag.key, p);
				renderMain();
				break;
			case "move":
				moveObject(list[selected], p[0] - drag.last[0], p[1] - drag.last[1]);
				drag.last = p;
				drag.moved = true;
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
				else
				{
					// A grenade dragged from the thrower lands where the pointer is let go.
					if (dist(drag.start, p) * size > 12)
					{
						draft.from = drag.start;
						draft.p = p;
					}
				}
				break;
			case "laser":
				laser.push({ x: p[0], y: p[1], t: performance.now() });
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
		if (!drag)
		{
			return;
		}
		var p = toMap(event);
		var d = drag;
		drag = null;
		if (d.kind === "move" && !d.moved || d.kind === "erase" && !d.erased)
		{
			history.pop();      // nothing changed: no undo step
		}
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
		input.style.color = existing ? existing.color : opts.color;
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

	/* ---------- phases ---------- */

	function setPhase(index)
	{
		if (index < 0 || index >= phases.length)
		{
			return;
		}
		current = index;
		selected = null;
		refresh();
	}

	function addPhase(copy)
	{
		remember();
		var base = phases[current];
		var phase = { name: "Phase " + (phases.length + 1), objects: copy ? JSON.parse(JSON.stringify(base.objects)) : [] };
		phases.splice(current + 1, 0, phase);
		current++;
		selected = null;
		refresh();
	}

	function movePhase(step)
	{
		var to = current + step;
		if (to < 0 || to >= phases.length)
		{
			return;
		}
		remember();
		var p = phases.splice(current, 1)[0];
		phases.splice(to, 0, p);
		current = to;
		refresh();
	}

	function deletePhase()
	{
		if (phases.length === 1)
		{
			return;
		}
		var go = function ()
		{
			remember();
			phases.splice(current, 1);
			current = Math.max(0, current - 1);
			selected = null;
			refresh();
		};
		if (objects().length)
		{
			askConfirm("Delete the phase “" + phases[current].name + "” with its drawing?", "Delete", go);
		}
		else
		{
			go();
		}
	}

	function renamePhase()
	{
		var input = board.rename;
		input.value = phases[current].name;
		input.hidden = false;
		board.phaseList.hidden = true;
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
		board.phaseList.hidden = false;
		var name = input.value.trim();
		if (commit && name !== "" && name !== phases[current].name)
		{
			remember();
			phases[current].name = name.slice(0, 40);
		}
		refresh();
	}

	function togglePlay()
	{
		if (playTimer)
		{
			stopPlay();
			return;
		}
		if (phases.length < 2)
		{
			return;
		}
		playTimer = window.setInterval(function () { setPhase((current + 1) % phases.length); }, PLAY_MS);
		renderPhases();
	}

	function stopPlay()
	{
		if (playTimer)
		{
			window.clearInterval(playTimer);
			playTimer = 0;
			renderPhases();
		}
	}

	function renderPhases()
	{
		var list = board.phaseList;
		list.textContent = "";
		phases.forEach(function (phase, i)
		{
			var b = el("button", "btn btn-sm t2-phase" + (i === current ? " is-active" : ""), (i + 1) + ". " + phase.name);
			b.type = "button";
			b.setAttribute("aria-pressed", String(i === current));
			b.title = "Phase " + (i + 1) + " (← / → to switch, double-click to rename)";
			b.addEventListener("click", function () { stopPlay(); setPhase(i); });
			b.addEventListener("dblclick", function () { setPhase(i); renamePhase(); });
			list.appendChild(b);
		});
		board.play.textContent = playTimer ? "Stop" : "Play";
		board.play.setAttribute("aria-pressed", String(!!playTimer));
		board.play.disabled = phases.length < 2;
		board.left.disabled = current === 0;
		board.right.disabled = current === phases.length - 1;
		board.del.disabled = phases.length === 1;
		board.onion.setAttribute("aria-pressed", String(opts.onion));
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

	/* ---------- toolbar ---------- */

	function setTool(id)
	{
		closeTextInput(true);
		tool = id;
		if (id !== "select")
		{
			selected = null;
		}
		if (id === "player")
		{
			opts.color = TEAM[opts.team];
		}
		board.overlay.dataset.tool = id;
		refresh();
	}

	function renderToolbar()
	{
		[].forEach.call(board.tools.querySelectorAll(".t2-tool"), function (b)
		{
			var on = b.getAttribute("data-tool") === tool;
			b.classList.toggle("is-active", on);
			b.setAttribute("aria-pressed", String(on));
		});
		[].forEach.call(board.swatches.children, function (b)
		{
			b.classList.toggle("is-active", b.getAttribute("data-color") === opts.color);
		});
		board.custom.value = /^#[0-9a-f]{6}$/i.test(opts.color) ? opts.color : "#ffffff";
		board.width.value = String(opts.width);
		board.opacity.value = String(Math.round(opts.opacity * 100));
		board.dashed.checked = opts.dashed;
		board.playerBox.hidden = tool !== "player";
		[].forEach.call(board.teams.children, function (b)
		{
			b.classList.toggle("is-active", b.getAttribute("data-team") === opts.team);
		});
		[].forEach.call(board.numbers.children, function (b)
		{
			b.classList.toggle("is-active", Number(b.textContent) === opts.number);
		});
		board.undo.disabled = !history.length;
		board.redo.disabled = !future.length;
		board.cursorBtn.setAttribute("aria-pressed", String(opts.cursor));
	}

	// A change of color, width, opacity or dash applies to the selected object too.
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
		renderToolbar();
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

	/* ---------- export ---------- */

	function exportPhase(index)
	{
		var w = image.naturalWidth;
		var canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = w;
		var ctx = canvas.getContext("2d");
		ctx.fillStyle = "#1d1e1a";
		ctx.fillRect(0, 0, w, w);
		ctx.drawImage(image, 0, 0, w, w);
		drawPhase(ctx, index, w, false);
		var name = map.id + "_tactics_phase" + (index + 1) + ".png";
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

	function exportAll()
	{
		phases.forEach(function (p, i)
		{
			window.setTimeout(function () { exportPhase(i); }, i * 400);
		});
	}

	/* ---------- layout ---------- */

	function layout()
	{
		if (!board || board.root.hidden)
		{
			return;
		}
		var r = board.stage.getBoundingClientRect();
		var s = Math.floor(Math.min(r.width, r.height) - 16);
		if (s < 50)
		{
			return;
		}
		size = s;
		board.mapBox.style.width = s + "px";
		board.mapBox.style.height = s + "px";
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
		board.root.classList.toggle("is-clean");
		window.setTimeout(layout, 0);
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
			setPhase(current + (event.key === "ArrowLeft" ? -1 : 1));
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
			refresh();
			return;
		}
		if (event.key === " ")
		{
			event.preventDefault();
			togglePlay();
			return;
		}
		if (tool === "player" && /^[1-5]$/.test(k))
		{
			opts.number = Number(k);
			renderToolbar();
			return;
		}
		if (k === "f") { toggleFullscreen(); return; }
		if (k === "h") { toggleClean(); return; }
		if (k === "n") { opts.onion = !opts.onion; refresh(); return; }
		if (k === "i") { opts.cursor = !opts.cursor; refresh(); return; }
		if (k === "m" && tool === "player")
		{
			opts.team = opts.team === "attack" ? "defence" : "attack";
			opts.color = TEAM[opts.team];
			renderToolbar();
			return;
		}
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

		// Top bar: title, image, phases, actions.
		var top = el("div", "t2-top");
		var title = el("span", "t2-title");
		top.appendChild(title);
		var views = el("div", "t2-group t2-views");
		top.appendChild(views);

		var phaseBox = el("div", "t2-group t2-phases");
		var phaseList = el("div", "t2-phase-list");
		var rename = el("input", "t2-rename");
		rename.type = "text";
		rename.hidden = true;
		rename.setAttribute("aria-label", "Phase name");
		rename.addEventListener("blur", function () { finishRename(true); });
		phaseBox.appendChild(phaseList);
		phaseBox.appendChild(rename);
		var left = button("t2-icon", "←", "Move phase left", function () { movePhase(-1); });
		var right = button("t2-icon", "→", "Move phase right", function () { movePhase(1); });
		phaseBox.appendChild(button("", "+ Phase", "New empty phase after this one", function () { addPhase(false); }));
		phaseBox.appendChild(button("", "Copy", "New phase with a copy of this one's drawing", function () { addPhase(true); }));
		phaseBox.appendChild(button("", "Rename", "Rename this phase", renamePhase));
		phaseBox.appendChild(left);
		phaseBox.appendChild(right);
		var del = button("", "Delete", "Delete this phase", deletePhase);
		phaseBox.appendChild(del);
		top.appendChild(phaseBox);

		var actions = el("div", "t2-group t2-actions");
		var onion = button("", "Onion", "Show the phase before faded (N)", function () { opts.onion = !opts.onion; refresh(); });
		var play = button("", "Play", "Step through the phases (Space)", togglePlay);
		var cursorBtn = button("", "Cursor", "Highlight the cursor (I)", function () { opts.cursor = !opts.cursor; refresh(); });
		actions.appendChild(onion);
		actions.appendChild(play);
		actions.appendChild(cursorBtn);
		actions.appendChild(button("", "PNG", "Export this phase as PNG", function () { exportPhase(current); }));
		actions.appendChild(button("", "All PNGs", "Export every phase as its own PNG", exportAll));
		var full = button("", "Fullscreen", "Fullscreen (F)", toggleFullscreen);
		if (!document.fullscreenEnabled)
		{
			full.hidden = true;
		}
		actions.appendChild(full);
		actions.appendChild(button("", "Hide bars", "Hide the toolbars (H)", toggleClean));
		actions.appendChild(button("t2-close", "Close", "Close the board; the drawing is not kept", close));
		top.appendChild(actions);
		root.appendChild(top);

		// Tools and options.
		var main = el("div", "t2-main");
		var tools = el("div", "t2-tools");
		var toolGrid = el("div", "t2-tool-grid");
		TOOLS.forEach(function (t)
		{
			var b = el("button", "t2-tool");
			b.type = "button";
			b.setAttribute("data-tool", t.id);
			b.title = t.label + " (" + t.key.toUpperCase() + ")";
			b.setAttribute("aria-label", t.label + ", key " + t.key.toUpperCase());
			b.innerHTML = svg(t.icon);
			b.addEventListener("click", function () { setTool(t.id); });
			toolGrid.appendChild(b);
		});
		tools.appendChild(toolGrid);

		var playerBox = el("div", "t2-options t2-player");
		var teams = el("div", "t2-row");
		["attack", "defence"].forEach(function (team)
		{
			var b = el("button", "btn btn-sm t2-team", TEAM_NAME[team]);
			b.type = "button";
			b.setAttribute("data-team", team);
			b.style.setProperty("--team", TEAM[team]);
			b.addEventListener("click", function () { opts.team = team; opts.color = TEAM[team]; renderToolbar(); });
			teams.appendChild(b);
		});
		var numbers = el("div", "t2-row");
		[1, 2, 3, 4, 5].forEach(function (n)
		{
			var b = el("button", "btn btn-sm t2-num", String(n));
			b.type = "button";
			b.setAttribute("aria-label", "Player number " + n);
			b.addEventListener("click", function () { opts.number = n; renderToolbar(); });
			numbers.appendChild(b);
		});
		playerBox.appendChild(teams);
		playerBox.appendChild(numbers);
		tools.appendChild(playerBox);

		var styleBox = el("div", "t2-options");
		var swatches = el("div", "t2-swatches");
		var codColors = (window.COD2_NAMES ? window.COD2_NAMES.colors : []).filter(function (c) { return /[1-6]/.test(c.code); });
		[TEAM.attack, TEAM.defence, "#ffffff"].concat(codColors.map(function (c)
		{
			return "#" + c.rgb.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
		})).forEach(function (color)
		{
			var b = el("button", "t2-swatch");
			b.type = "button";
			b.style.backgroundColor = color;
			b.setAttribute("data-color", color);
			b.title = color === TEAM.attack ? "Attack" : color === TEAM.defence ? "Defence" : color;
			b.setAttribute("aria-label", "Color " + b.title);
			b.addEventListener("click", function () { applyStyle("color", color); });
			swatches.appendChild(b);
		});
		var custom = el("input", "t2-custom");
		custom.type = "color";
		custom.title = "Own color";
		custom.setAttribute("aria-label", "Own color");
		custom.addEventListener("input", function () { applyStyle("color", custom.value); });
		swatches.appendChild(custom);
		styleBox.appendChild(swatches);

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
			var label = el("label", "t2-field");
			label.appendChild(el("span", null, pair[0]));
			label.appendChild(pair[1]);
			styleBox.appendChild(label);
		});
		tools.appendChild(styleBox);

		var edit = el("div", "t2-row t2-edit");
		var undoBtn = button("", "Undo", "Undo (Ctrl+Z)", undo);
		var redoBtn = button("", "Redo", "Redo (Ctrl+Y)", redo);
		edit.appendChild(undoBtn);
		edit.appendChild(redoBtn);
		edit.appendChild(button("", "Clear", "Clear this phase", function ()
		{
			if (objects().length)
			{
				askConfirm("Clear everything drawn in “" + phases[current].name + "”?", "Clear", function ()
				{
					remember();
					phases[current].objects = [];
					selected = null;
					refresh();
				});
			}
		}));
		tools.appendChild(edit);
		tools.appendChild(el("p", "t2-help", "Drag to draw. Select (V) moves, resizes and bends; Delete removes. " +
			"← → phases, F fullscreen, H hide bars."));
		main.appendChild(tools);

		// The map with its two canvases.
		var stage = el("div", "t2-stage");
		var mapBox = el("div", "t2-map");
		var img = el("img", "t2-image");
		img.alt = "";
		var mainCanvas = el("canvas", "t2-canvas");
		var overlay = el("canvas", "t2-canvas t2-overlay");
		overlay.setAttribute("role", "img");
		overlay.setAttribute("aria-label", "Drawing area");
		var text = el("input", "t2-text");
		text.type = "text";
		text.hidden = true;
		text.setAttribute("aria-label", "Text");
		text.addEventListener("blur", function () { closeTextInput(true); });
		mapBox.appendChild(img);
		mapBox.appendChild(mainCanvas);
		mapBox.appendChild(overlay);
		mapBox.appendChild(text);
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
		main.appendChild(stage);
		root.appendChild(main);

		var show = button("t2-show", "☰", "Show the toolbars (H)", toggleClean);
		root.appendChild(show);

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
		document.addEventListener("keydown", onKey);
		document.addEventListener("fullscreenchange", function () { window.setTimeout(layout, 50); });
		if (window.ResizeObserver)
		{
			new ResizeObserver(layout).observe(stage);
		}
		window.addEventListener("resize", layout);

		document.body.appendChild(root);
		board = {
			root: root, title: title, views: views, phaseList: phaseList, rename: rename, left: left, right: right, del: del,
			onion: onion, play: play, cursorBtn: cursorBtn, tools: toolGrid, playerBox: playerBox, teams: teams, numbers: numbers,
			swatches: swatches, custom: custom, width: width, opacity: opacity, dashed: dashed, undo: undoBtn, redo: redoBtn,
			stage: stage, mapBox: mapBox, img: img, main: mainCanvas, overlay: overlay, text: text,
			confirm: confirm, confirmText: confirmText, confirmYes: confirmYes
		};
	}

	/* ---------- open / close ---------- */

	function setView(v, images)
	{
		view = v;
		image = new Image();
		image.onload = function ()
		{
			board.img.src = image.src;
			layout();
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
					var hasDrawing = phases.some(function (p) { return p.objects.length; });
					var go = function ()
					{
						phases = [{ name: "Setup", objects: [] }];
						current = 0;
						history = [];
						future = [];
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
		onClose = closed || null;
		phases = [{ name: "Setup", objects: [] }];
		current = 0;
		history = [];
		future = [];
		selected = null;
		draft = null;
		drag = null;
		laser = [];
		opts.number = 1;
		board.root.hidden = false;
		board.root.classList.remove("is-clean");
		document.documentElement.classList.add("t2-open");
		board.title.textContent = m.name + " – tactics";
		setTool("arrow");
		loadImages(function (images)
		{
			setView(images[v] ? v : (images.topdown ? "topdown" : "radar"), images);
			refresh();
		});
		refresh();
		board.overlay.focus();
	}

	// Closing throws the drawing away.
	function close()
	{
		stopPlay();
		closeTextInput(false);
		closeConfirm(false);
		if (document.fullscreenElement)
		{
			document.exitFullscreen();
		}
		board.root.hidden = true;
		document.documentElement.classList.remove("t2-open");
		phases = [{ name: "Setup", objects: [] }];
		history = [];
		future = [];
		if (onClose)
		{
			onClose(map);
		}
	}

	// A copy of the drawing, for checks; changing it changes nothing.
	function state()
	{
		return JSON.parse(snapshot());
	}

	return { open: open, state: state };
})();
