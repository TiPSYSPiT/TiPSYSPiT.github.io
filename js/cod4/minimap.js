/*
 * Minimap generator: the compass dvars a player may set, a preview that draws
 * the compass the way the game does, and the seta lines for config_mp.cfg.
 *
 * The drawing follows the multiplayer compass in the game source
 * (cg_compass.cpp, cg_compassfriendlies_mp.cpp) and its menu
 * (ui_mp/compass_old.menu): the same rectangles, the same map texture
 * placement and rotation, the same clamping of icons to the map's edge and the
 * same fading of far icons. Everything is in the game's 640x480 virtual
 * screen units, so the sizes compare one to one with what the dvars say.
 *
 * Images and map data come from tools/build-minimap.py:
 *   js/cod4/minimap/icons.js  window.MINIMAP_ICONS (frame, tickertape, icons)
 *   js/cod4/minimap/maps.js   window.MINIMAP_MAPS  (corners, north, range, spawns)
 *   js/cod4/minimap/<map>.js  window.MINIMAP_IMAGES[<map>], loaded on demand
 * All are plain scripts holding data URLs, so the preview works from disk too.
 */
(function ()
{
	"use strict";

	var copyText = window.UI.copyText;
	var setHint = function () {};

	var ICONS = window.MINIMAP_ICONS || {};
	var MAPS = window.MINIMAP_MAPS || [];
	var DEFAULT_MAP = "mp_crash";

	// The dvars that change how the multiplayer compass looks and that a
	// player can set. Defaults and limits are the ones iw3mp.exe registers
	// (CG_CompassRegisterDvars); Infinity where the engine has no upper limit.
	// One exception: compassSize 0 is allowed by the engine but stops the
	// game with "Compass ownerdraw had width or height of 0", so it starts
	// above 0. step is what the - and + buttons add.
	//
	// Width and height of an icon always get the same value: Promod refuses
	// to play with the two different.
	//
	// Whether a dvar is cheat protected (registered with 0x80, needs sv_cheats
	// 1) comes from the dvars tab's data, window.COD4_DVARS: see cheatFlags().
	//
	// Left out on purpose: compassObjectiveArrow*, compassMinRadius,
	// compassMinRange and compassObjectiveDrawLines are registered in
	// multiplayer but only read by the single player compass.
	var PROMOD_EQUAL = "Promod and Promod X require width and height to be equal. Otherwise the " +
		"screen is blocked with a warning.";

	var OPTIONS = [
		{ key: "size", dvars: ["compassSize"], def: 1, min: 0.01, max: Infinity, step: 0.01, label: "Size",
			desc: "Scales the whole compass: the map, its frame and every icon on it." },
		{ key: "player", dvars: ["compassPlayerWidth", "compassPlayerHeight"], def: 18.75, min: 0, max: Infinity,
			step: 0.01, label: "Player icon size", info: PROMOD_EQUAL,
			desc: "Size of your own arrow in the middle of the compass, used for its width and height." },
		{ key: "friendly", dvars: ["compassFriendlyWidth", "compassFriendlyHeight"], def: 18.75, min: 0, max: Infinity,
			step: 0.01, label: "Teammate icon size", info: PROMOD_EQUAL,
			desc: "Size of the teammate arrows, used for their width and height. The game uses the same " +
				"size for the red dots of enemies that fire or show up on radar." },
		{ key: "objective", dvars: ["compassObjectiveWidth", "compassObjectiveHeight"], def: 20, min: 0, max: Infinity,
			step: 0.01, label: "Objective icon size",
			desc: "Size of objective icons such as the bomb sites A and B, used for their width and height." },
		{ key: "rotation", dvars: ["compassRotation"], def: 1, bool: true, label: "Map rotation",
			on: "1 — the map turns, you point up", off: "0 — north stays up, your arrow turns",
			desc: "Whether the map turns with you or stays with north at the top." }
	];

	var ADVANCED = [
		{ key: "objMinAlpha", dvars: ["compassObjectiveMinAlpha"], def: 1, min: 0, max: 1, step: 0.01,
			label: "Far icon opacity",
			desc: "Opacity, from 0 to 1, of objectives and teammates beyond the compass range. They fade " +
				"towards this value until Far icon range and keep it after that." },
		{ key: "objMaxRange", dvars: ["compassObjectiveMaxRange"], def: 2048, min: 0, max: Infinity, step: 1,
			label: "Far icon range",
			desc: "Distance in game units at which far objectives and teammates reach Far icon opacity." },
		{ key: "tapeStretch", dvars: ["compassTickertapeStretch"], def: 0.5, min: 0.01, max: 1, step: 0.01,
			label: "Tickertape",
			desc: "How much of the full circle the heading strip above the map shows: 0.5 is half of it, " +
				"1 the whole of it." },
		{ key: "fade", dvars: ["hud_fade_compass"], def: 0, min: 0, max: 30, step: 1, label: "Fade time",
			desc: "Seconds until the compass fades out, 0 to keep it on screen. The preview fades it too; " +
				"change anything to bring it back." }
	];

	var CHEAT_TIP = "This dvar is cheat protected. It only works on servers/maps with sv_cheats 1 " +
		"(e.g. devmap) and is ignored on normal servers.";

	// Rectangles of ui_mp/compass_old.menu in virtual units. compassSize
	// scales each one's width and height from its own top-left corner
	// (CG_CompassCalcDimensions), which is why the frame drifts off the map a
	// little at large sizes, in game as here.
	var RECT_BACK = { x: -8, y: 12, w: 125, h: 125 };
	var RECT_TAPE_BACK = { x: 6, y: 3, w: 102, h: 14 };
	var RECT_TAPE = { x: 6, y: 6, w: 102, h: 9 };
	var RECT_MAP = { x: 6, y: 18, w: 102, h: 102 };

	// The preview shows the top-left quarter of the 640x480 screen, and more
	// of it once the compass outgrows that.
	var VIEW_W = 320;
	var VIEW_H = 240;

	// CG_FadeHudMenu: once the fade time is up the compass fades over 700 ms.
	var FADE_MS = 700;


	var values = {};
	var fields = {};
	var hint = null;
	var output = null;
	var outputCheat = null;
	var outputCheatBox = null;
	var canvas = null;
	var stage = null;
	var status = null;
	var note = null;
	var mapSelect = null;
	var posSelect = null;
	var facingInput = null;
	var facingOut = null;

	var icons = {};             // material -> decoded Image
	var mapImages = {};         // map id -> decoded Image
	var mapLoading = {};        // map id -> true while its script loads
	var currentMap = null;      // entry of MINIMAP_MAPS
	var scene = null;           // player, teammates, enemies, objectives
	var heading = 0;            // degrees clockwise from the map's north
	var activeSince = 0;        // last change, for hud_fade_compass
	var fadeFrame = 0;
	var started = false;

	/* ---------- hint ---------- */

	/* ---------- options ---------- */

	var SPECS = OPTIONS.concat(ADVANCED);

	// "18.75" rather than "18.750000", "1" rather than "1.0", always with a
	// point (String() never uses the system's decimal comma).
	function formatNumber(value)
	{
		return String(Math.round(value * 10000) / 10000);
	}

	function clampTo(spec, value)
	{
		return Math.min(spec.max, Math.max(spec.min, value));
	}

	// "0.01 \u2013 4", or "\u2265 0" where the engine sets no upper limit.
	function rangeText(spec)
	{
		return isFinite(spec.max) ? formatNumber(spec.min) + " \u2013 " + formatNumber(spec.max)
			: "\u2265 " + formatNumber(spec.min);
	}

	// An info icon whose text shows on hover and on focus (so a tap works too).
	function makeTip(text)
	{
		var tip = document.createElement("span");
		tip.className = "mm-tip";
		tip.tabIndex = 0;
		tip.setAttribute("role", "img");
		tip.setAttribute("aria-label", text);

		var icon = document.createElement("span");
		icon.className = "mm-tip-icon";
		icon.setAttribute("aria-hidden", "true");
		icon.textContent = "i";

		var bubble = document.createElement("span");
		bubble.className = "mm-tip-text";
		bubble.setAttribute("aria-hidden", "true");
		bubble.textContent = text;

		tip.appendChild(icon);
		tip.appendChild(bubble);
		return tip;
	}

	// An option is cheat protected when one of its dvars is registered with
	// the cheat flag, as the dvars tab's data says (js/cod4/dvars-data.js).
	function cheatFlags()
	{
		var cheat = {};
		(window.COD4_DVARS || []).forEach(function (e)
		{
			cheat[e.n.toLowerCase()] = e.c === true;
		});
		OPTIONS.concat(ADVANCED).forEach(function (spec)
		{
			spec.cheat = spec.dvars.some(function (name) { return cheat[name.toLowerCase()] === true; });
		});
	}

	function makeBadge(spec)
	{
		if (spec.cheat !== true)
		{
			return null;
		}
		var wrap = document.createElement("span");
		wrap.className = "mm-badges";

		var badge = document.createElement("span");
		badge.className = "mm-badge is-cheat";
		badge.textContent = "cheat protected";
		wrap.appendChild(badge);
		wrap.appendChild(makeTip(CHEAT_TIP));
		return wrap;
	}

	function makeNumber(spec)
	{
		var input = document.createElement("input");
		input.className = "kf-value kf-num";
		input.id = "mm-" + spec.key;
		input.title = spec.dvars.join(" and ") + ", " + rangeText(spec);
		input.value = formatNumber(spec.def);
		input.setAttribute("aria-label", spec.label);
		var stepper = window.Decimal.attach(input, { min: spec.min, max: spec.max, step: spec.step,
			buttons: true, label: spec.label });
		input.addEventListener("input", function () { onInput(spec); });
		input.addEventListener("blur", function () { onBlur(spec); });
		fields[spec.key] = input;
		return stepper;
	}

	function makeOptionRow(spec)
	{
		var row = document.createElement("div");
		row.className = "kf-opt mm-opt";

		var head = document.createElement("span");
		head.className = "mm-opt-head";

		var label = document.createElement("label");
		label.className = "kf-opt-label";
		label.textContent = spec.label;
		label.title = spec.dvars.join(" / ");
		head.appendChild(label);
		if (spec.info)
		{
			head.appendChild(makeTip(spec.info));
		}

		var desc = document.createElement("p");
		desc.className = "kf-opt-desc";
		desc.id = "mm-" + spec.key + "-desc";
		desc.textContent = spec.desc;

		row.appendChild(head);

		if (spec.bool)
		{
			var select = document.createElement("select");
			select.className = "mm-select";
			select.id = "mm-" + spec.key;
			select.setAttribute("aria-describedby", desc.id);
			[[1, spec.on], [0, spec.off]].forEach(function (choice)
			{
				var option = document.createElement("option");
				option.value = String(choice[0]);
				option.textContent = choice[1];
				select.appendChild(option);
			});
			select.value = String(spec.def);
			select.addEventListener("change", function ()
			{
				values[spec.key] = Number(select.value);
				changed();
			});
			fields[spec.key] = select;
			label.htmlFor = select.id;
			row.appendChild(select);
		}
		else
		{
			var stepper = makeNumber(spec);
			var input = fields[spec.key];
			input.setAttribute("aria-describedby", desc.id + " mm-" + spec.key + "-range");
			label.htmlFor = input.id;
			row.appendChild(stepper);

			var range = document.createElement("span");
			range.className = "mm-range-hint";
			range.id = "mm-" + spec.key + "-range";
			range.textContent = rangeText(spec);
			row.appendChild(range);
		}

		var badge = makeBadge(spec);
		if (badge !== null)
		{
			row.appendChild(badge);
		}

		row.appendChild(desc);
		return row;
	}

	// A number outside the range counts as the nearest end of it right away;
	// the field shows that once you leave it. Anything that is not a number
	// keeps the last good value.
	function onInput(spec)
	{
		var field = fields[spec.key];
		var value = window.Decimal.parse(field.value);
		if (value === null)
		{
			field.classList.add("is-invalid");
			return;
		}
		field.classList.remove("is-invalid");
		values[spec.key] = clampTo(spec, value);
		changed();
	}

	function onBlur(spec)
	{
		var field = fields[spec.key];
		if (field.classList.contains("is-invalid"))
		{
			field.classList.remove("is-invalid");
			field.value = formatNumber(values[spec.key]);
			setHint(spec.label + " takes a number from " + rangeText(spec) + ". Kept " + field.value + ".", true);
			return;
		}

		var typed = window.Decimal.parse(field.value);
		var shown = formatNumber(values[spec.key]);
		if (typed !== null && typed !== values[spec.key])
		{
			setHint(spec.label + " takes " + rangeText(spec) + ". Set to " + shown + ".", true);
		}
		field.value = shown;
	}

	function resetOptions()
	{
		SPECS.forEach(function (spec)
		{
			values[spec.key] = spec.def;
			var field = fields[spec.key];
			if (field)
			{
				field.value = spec.bool ? String(spec.def) : formatNumber(spec.def);
				field.classList.remove("is-invalid");
				window.Decimal.sync(field);
			}
		});
	}

	/* ---------- output ---------- */

	// One line per dvar; an icon size writes its width and its height. Cheat
	// protected dvars go to a block of their own.
	function buildCommands(cheat)
	{
		var lines = [];
		SPECS.forEach(function (spec)
		{
			if ((spec.cheat === true) !== cheat)
			{
				return;
			}
			spec.dvars.forEach(function (dvar)
			{
				lines.push("seta " + dvar + " \"" + formatNumber(values[spec.key]) + "\"");
			});
		});
		return lines.join("\n");
	}

	function renderOutput()
	{
		if (output !== null)
		{
			output.textContent = buildCommands(false);
		}
		if (outputCheat !== null)
		{
			var text = buildCommands(true);
			outputCheat.textContent = text;
			outputCheatBox.hidden = text === "";
		}
	}

	function changed()
	{
		renderOutput();
		wake();
	}

	/* ---------- angles and vectors ---------- */

	function rad(deg)
	{
		return deg * Math.PI / 180;
	}

	function norm360(deg)
	{
		var a = deg % 360;
		return a < 0 ? a + 360 : a;
	}

	function norm180(deg)
	{
		var a = norm360(deg);
		return a > 180 ? a - 360 : a;
	}

	function dist2(a, b)
	{
		var dx = a[0] - b[0];
		var dy = a[1] - b[1];
		return Math.sqrt(dx * dx + dy * dy);
	}

	var DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

	function headingName(deg)
	{
		return DIRECTIONS[Math.round(norm360(deg) / 45) % 8];
	}

	// The game's yaw turns anticlockwise from the world's x axis; the heading
	// here turns clockwise from the map's north, like a compass.
	function yawFromHeading(h)
	{
		return currentMap.northYaw - h;
	}

	function headingFromYaw(yaw)
	{
		return Math.round(norm360(currentMap.northYaw - yaw)) % 360;
	}

	/* ---------- the scene ---------- */

	function centroid(points)
	{
		var x = 0;
		var y = 0;
		points.forEach(function (p) { x += p[0]; y += p[1]; });
		return [x / points.length, y / points.length];
	}

	function nearest(points, to, count, skip)
	{
		return points
			.filter(function (p) { return p !== skip; })
			.map(function (p) { return { p: p, d: dist2(p, to) }; })
			.sort(function (a, b) { return a.d - b.d; })
			.slice(0, count)
			.map(function (e) { return e.p; });
	}

	// Where you stand and who is around you, from the map's own S&D spawns
	// and bomb sites. At a spawn your teammates stand on the spawn points near
	// yours; at a bomb site they are spread around you. One enemy stands
	// on the nearest enemy spawn, which usually lands on the edge of the
	// compass and shows where they come from, another fires close by.
	function buildScene(posKey)
	{
		var map = currentMap;
		var attackers = map.attackers.length ? map.attackers : map.defenders;
		var defenders = map.defenders.length ? map.defenders : map.attackers;
		var team = posKey === "defenders" ? "defenders" : "attackers";
		var own = team === "attackers" ? attackers : defenders;
		var enemy = team === "attackers" ? defenders : attackers;
		var range = map.maxRange;

		var player;
		var yaw;
		var mates;

		if (posKey === "attackers" || posKey === "defenders")
		{
			var start = nearest(own, centroid(own), 1)[0];
			player = [start[0], start[1]];
			yaw = start[2];
			// Spawn points stand shoulder to shoulder; the ones right next to
			// yours would hide your own arrow, so take those a few steps away.
			var apart = own.filter(function (p) { return dist2(p, player) >= range * 0.12; });
			mates = nearest(apart.length >= 4 ? apart : own, player, 4, start).map(function (p)
			{
				return { pos: [p[0], p[1]], yaw: p[2] };
			});
		}
		else
		{
			var site = siteFor(posKey);
			player = site.origin.slice();
			var from = centroid(attackers);
			yaw = Math.atan2(player[1] - from[1], player[0] - from[0]) * 180 / Math.PI;
			mates = [[-0.16, 0.1, 40], [0.2, 0.17, -70], [0.08, -0.26, 160], [-0.3, -0.12, 215]].map(function (o)
			{
				return { pos: [player[0] + o[0] * range, player[1] + o[1] * range], yaw: yaw + o[2] };
			});
		}

		var far = nearest(enemy, player, 1)[0];
		var enemies = [
			[far[0], far[1]],
			[player[0] + 0.24 * range, player[1] - 0.14 * range]
		];

		// sd.gsc: defenders see "defend A", attackers "target A".
		var objectives = map.bombsites.map(function (s)
		{
			var kind = team === "attackers" ? "target" : "defend";
			return { pos: s.origin, icon: "compass_waypoint_" + kind + "_" + s.label };
		});

		return { player: player, yaw: yaw, mates: mates, enemies: enemies, objectives: objectives };
	}

	function siteFor(label)
	{
		var sites = currentMap.bombsites;
		for (var i = 0; i < sites.length; i++)
		{
			if (sites[i].label === label)
			{
				return sites[i];
			}
		}
		return sites[0];
	}

	/* ---------- the compass, as cg_compass.cpp draws it ---------- */

	function scaled(rect)
	{
		var s = values.size;
		return { x: rect.x, y: rect.y, w: rect.w * s, h: rect.h * s };
	}

	// compassRotation 1: the compass looks the way you do; 0: north is up.
	function upVector(viewYaw)
	{
		var yaw = values.rotation ? viewYaw : currentMap.northYaw;
		return [Math.cos(rad(yaw)), Math.sin(rad(yaw))];
	}

	// CG_WorldPosToCompass for the compass on the HUD: the offset from the
	// map rectangle's centre, and the same offset pulled back onto the
	// rectangle's edge when it falls outside.
	function worldToCompass(rect, up, from, to)
	{
		var pix = rect.h / currentMap.maxRange;
		var dx = (to[0] - from[0]) * pix;
		var dy = (to[1] - from[1]) * pix;
		var x = up[1] * dx - up[0] * dy;
		var y = -up[1] * dy - up[0] * dx;

		var cx = x;
		var cy = y;
		var s;
		if (cx > rect.w * 0.5)
		{
			s = rect.w * 0.5 / cx;
			cx *= s;
			cy *= s;
		}
		else if (cx < -rect.w * 0.5)
		{
			s = -(rect.w * 0.5) / cx;
			cx *= s;
			cy *= s;
		}
		if (cy > rect.h * 0.5)
		{
			s = rect.h * 0.5 / cy;
			cx *= s;
			cy *= s;
		}
		else if (cy < -rect.h * 0.5)
		{
			s = -(rect.h * 0.5) / cy;
			cx *= s;
			cy *= s;
		}

		return { x: x, y: y, cx: cx, cy: cy };
	}

	function clamp01(v)
	{
		return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
	}

	// Objectives: full opacity within the compass range, then down to
	// compassObjectiveMinAlpha at compassObjectiveMaxRange
	// (CG_CompassDrawPlayerPointers_MP).
	function objectiveAlpha(d)
	{
		var maxR = currentMap.maxRange;
		var objR = values.objMaxRange;
		if (d <= maxR)
		{
			return 1;
		}
		if (d >= objR)
		{
			return clamp01(values.objMinAlpha);
		}
		var lerp = objR - maxR !== 0 ? (d - maxR) / (objR - maxR) : 0;
		return clamp01(1 - (1 - values.objMinAlpha) * lerp);
	}

	// Teammates: the same idea, written differently in
	// CG_CompassDrawFriendlies; the distance is clamped to the two ranges
	// first. With both ranges equal the game divides by zero; that case is
	// drawn at full opacity here.
	function friendlyAlpha(d)
	{
		var maxR = currentMap.maxRange;
		var objR = values.objMaxRange;
		if (objR === maxR)
		{
			return 1;
		}
		var a = d;
		if (objR >= d)
		{
			if (maxR > a)
			{
				a = maxR;
			}
		}
		else
		{
			a = objR;
		}
		a = (a - maxR) / (objR - maxR);
		return clamp01((values.objMinAlpha - 1) * a + 1);
	}

	// hud_fade_compass through CG_FadeColor: full for the fade time, then
	// down to nothing over the last 700 ms.
	function fadeAlpha(now)
	{
		var total = values.fade * 1000;
		if (total === 0)
		{
			return 1;
		}
		var t = now - activeSince;
		if (t >= total)
		{
			return 0;
		}
		if (total - t < FADE_MS)
		{
			return (total - t) / FADE_MS;
		}
		return 1;
	}

	function drawPic(ctx, img, x, y, w, h, alpha)
	{
		if (!img || w <= 0 || h <= 0 || alpha <= 0)
		{
			return;
		}
		ctx.globalAlpha = alpha;
		ctx.drawImage(img, x, y, w, h);
	}

	// CG_DrawRotatedPic: turned around its centre, clockwise for a positive
	// angle in degrees.
	function drawRotated(ctx, img, x, y, w, h, angle, alpha)
	{
		if (!img || w <= 0 || h <= 0 || alpha <= 0)
		{
			return;
		}
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.translate(x + w / 2, y + h / 2);
		ctx.rotate(rad(angle));
		ctx.drawImage(img, -w / 2, -h / 2, w, h);
		ctx.restore();
	}

	// CG_CompassDrawTickertape: the strip holds the full circle, north at
	// its left edge, and the part shown is centred on your heading.
	function drawTape(ctx, img, rect, viewYaw, alpha)
	{
		if (!img || alpha <= 0)
		{
			return;
		}
		var stretch = values.tapeStretch;
		var center = -(viewYaw - currentMap.northYaw) / 360;
		var left = center - stretch * 0.5;
		var iw = img.naturalWidth;
		var ih = img.naturalHeight;

		ctx.globalAlpha = alpha;
		// The texture repeats: draw it in up to two pieces across the wrap.
		var s0 = left - Math.floor(left);
		var done = 0;
		while (done < stretch - 1e-9)
		{
			var piece = Math.min(stretch - done, 1 - s0);
			ctx.drawImage(img, s0 * iw, 0, piece * iw, ih,
				rect.x + rect.w * (done / stretch), rect.y, rect.w * (piece / stretch), rect.h);
			done += piece;
			s0 = 0;
		}
	}

	// CG_CompassDrawPlayerMap and RB_DrawStretchPicRotateST: the map rectangle
	// shows a square of the texture centred on you, compassMaxRange across,
	// turned by your heading when compassRotation is on.
	function drawMap(ctx, img, rect, viewYaw, alpha)
	{
		var map = currentMap;
		var n = [Math.cos(rad(map.northYaw)), Math.sin(rad(map.northYaw))];
		var east = [n[1], -n[0]];
		var south = [-n[0], -n[1]];
		var toLR = [map.lowerRight[0] - map.upperLeft[0], map.lowerRight[1] - map.upperLeft[1]];
		var worldW = east[0] * toLR[0] + east[1] * toLR[1] || 1000;
		var worldH = south[0] * toLR[0] + south[1] * toLR[1] || 1000;

		var delta = [scene.player[0] - map.upperLeft[0], scene.player[1] - map.upperLeft[1]];
		var cs = (east[0] * delta[0] + east[1] * delta[1]) / worldW;
		var ct = (south[0] * delta[0] + south[1] * delta[1]) / worldH;

		var radius;
		var scaleS;
		var scaleT;
		if (worldH >= worldW)
		{
			radius = map.maxRange * 0.5 / worldH;
			scaleS = worldH / worldW;
			scaleT = 1;
		}
		else
		{
			radius = map.maxRange * 0.5 / worldW;
			scaleS = 1;
			scaleT = worldW / worldH;
		}

		var rotation = values.rotation ? -(viewYaw - map.northYaw) : 0;
		var c = Math.cos(rad(rotation));
		var s = Math.sin(rad(rotation));

		// Texture coordinates: centre + u * a + v * b, with u running right and
		// v down across the rectangle, each from -1 to 1.
		var a = [radius * c * scaleS, radius * s * scaleT];
		var b = [-radius * s * scaleS, radius * c * scaleT];

		// Invert that to place the texture's unit square on the screen.
		var det = a[0] * b[1] - b[0] * a[1];
		var inv = [b[1] / det, -b[0] / det, -a[1] / det, a[0] / det];
		var hw = rect.w / 2;
		var hh = rect.h / 2;
		var m11 = hw * inv[0];
		var m12 = hw * inv[1];
		var m21 = hh * inv[2];
		var m22 = hh * inv[3];
		var cx = rect.x + hw;
		var cy = rect.y + hh;

		ctx.save();
		ctx.beginPath();
		ctx.rect(rect.x, rect.y, rect.w, rect.h);
		ctx.clip();
		ctx.globalAlpha = alpha;
		ctx.transform(m11, m21, m12, m22, cx - (m11 * cs + m12 * ct), cy - (m21 * cs + m22 * ct));
		ctx.drawImage(img, 0, 0, 1, 1);
		ctx.restore();
	}

	function viewSize()
	{
		var s = values.size;
		var right = Math.max(RECT_BACK.x + RECT_BACK.w * s, RECT_MAP.x + RECT_MAP.w * s) + 24;
		var bottom = Math.max(RECT_BACK.y + RECT_BACK.h * s, RECT_MAP.y + RECT_MAP.h * s) + 24;
		var grow = Math.max(1, right / VIEW_W, bottom / VIEW_H);
		return { w: VIEW_W * grow, h: VIEW_H * grow };
	}

	function draw(now)
	{
		if (canvas === null || currentMap === null || scene === null)
		{
			return 1;
		}

		var cssW = canvas.clientWidth;
		if (cssW === 0)
		{
			return 1;
		}
		var view = viewSize();
		var cssH = cssW * view.h / view.w;
		var dpr = window.devicePixelRatio || 1;
		var pxW = Math.round(cssW * dpr);
		var pxH = Math.round(cssH * dpr);
		if (canvas.width !== pxW || canvas.height !== pxH)
		{
			canvas.width = pxW;
			canvas.height = pxH;
		}

		var ctx = canvas.getContext("2d");
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, pxW, pxH);
		var k = pxW / view.w;
		ctx.setTransform(k, 0, 0, k, 0, 0);
		ctx.imageSmoothingEnabled = true;

		var fade = fadeAlpha(now);
		var viewYaw = yawFromHeading(heading);
		var s = values.size;
		var mapRect = scaled(RECT_MAP);
		var up = upVector(viewYaw);
		var cx = mapRect.x + mapRect.w / 2;
		var cy = mapRect.y + mapRect.h / 2;

		// The order of the items in compass_old.menu.
		var back = scaled(RECT_BACK);
		drawPic(ctx, icons.minimap_background, back.x, back.y, back.w, back.h, fade);
		var tapeBack = scaled(RECT_TAPE_BACK);
		drawPic(ctx, icons.minimap_tickertape_background, tapeBack.x, tapeBack.y, tapeBack.w, tapeBack.h, fade);
		drawTape(ctx, icons.minimap_tickertape_mp, scaled(RECT_TAPE), viewYaw, fade);

		var mapImg = mapImages[currentMap.id];
		if (mapImg && fade > 0)
		{
			drawMap(ctx, mapImg, mapRect, viewYaw, fade);
		}

		// Objectives, at their spot or pulled onto the edge.
		var ow = values.objective * s;
		var oh = values.objective * s;
		scene.objectives.forEach(function (obj)
		{
			var p = worldToCompass(mapRect, up, scene.player, obj.pos);
			var alpha = Math.min(objectiveAlpha(dist2(obj.pos, scene.player)), fade);
			drawPic(ctx, icons[obj.icon], cx + p.cx - ow / 2, cy + p.cy - oh / 2, ow, oh, alpha);
		});

		// Teammates, turned the way they look. compassClampIcons is 1 (and
		// cheat protected), so the ones out of range sit on the edge.
		var fw = values.friendly * s;
		var fh = values.friendly * s;
		scene.mates.forEach(function (mate)
		{
			var p = worldToCompass(mapRect, up, scene.player, mate.pos);
			var turn = values.rotation ? viewYaw - mate.yaw : currentMap.northYaw - mate.yaw;
			var alpha = Math.min(friendlyAlpha(dist2(mate.pos, scene.player)), fade);
			drawRotated(ctx, icons.compassping_friendly_mp, cx + p.cx - fw / 2, cy + p.cy - fh / 2, fw, fh,
				norm360(turn), alpha);
		});

		// Enemies: unturned dots in the teammate size.
		scene.enemies.forEach(function (pos)
		{
			var p = worldToCompass(mapRect, up, scene.player, pos);
			drawPic(ctx, icons.compassping_enemy, cx + p.cx - fw / 2, cy + p.cy - fh / 2, fw, fh, fade);
		});

		// You, in the middle; your arrow turns only when the map does not.
		var pw = values.player * s;
		var ph = values.player * s;
		var angle = values.rotation ? 0 : norm180(currentMap.northYaw - viewYaw);
		drawRotated(ctx, icons.compassping_player, cx - pw / 2, cy - ph / 2, pw, ph, angle, fade);

		ctx.globalAlpha = 1;
		return fade;
	}

	// One frame now, and more only while hud_fade_compass is fading it.
	function render()
	{
		window.cancelAnimationFrame(fadeFrame);
		var fade = draw(Date.now());
		if (values.fade > 0 && fade > 0)
		{
			fadeFrame = window.requestAnimationFrame(render);
		}
		updateStatus();
	}

	function wake()
	{
		activeSince = Date.now();
		render();
	}

	/* ---------- status and notes ---------- */

	function updateStatus()
	{
		if (status === null || currentMap === null)
		{
			return;
		}

		var message = "";
		if (!mapImages[currentMap.id])
		{
			message = mapLoading[currentMap.id] ? "Loading " + currentMap.name + "…"
				: "The map image of " + currentMap.name + " could not be loaded.";
		}
		else if (values.fade > 0 && fadeAlpha(Date.now()) === 0)
		{
			message = "Faded out after " + formatNumber(values.fade) + " s. Change anything to show it again.";
		}
		status.textContent = message;
		status.hidden = message === "";
	}

	function updateNote()
	{
		if (note === null || currentMap === null)
		{
			return;
		}
		var team = posSelect !== null && posSelect.value === "defenders" ? "a defender" : "an attacker";
		note.textContent = "Top-left corner of the screen. You play S&D as " + team + "; teammates are " +
			"green, enemies that fire are red. Compass range on " + currentMap.name + ": " +
			formatNumber(currentMap.maxRange) + " units, " + (currentMap.maxRangeSet
				? "set by the map's script." : "the game's default, as the map does not set it.") +
			" compassMaxRange is cheat protected, so it is not in your config.";
	}

	/* ---------- loading ---------- */

	function decode(url)
	{
		var img = new Image();
		img.src = url;
		return img.decode().then(function () { return img; });
	}

	function loadIcons()
	{
		return Promise.all(Object.keys(ICONS).map(function (key)
		{
			return decode(ICONS[key]).then(function (img) { icons[key] = img; }, function () {});
		}));
	}

	// A <script> per map, not fetch(): that also works from disk.
	function loadMapImage(map)
	{
		if (mapImages[map.id] || mapLoading[map.id])
		{
			return;
		}
		mapLoading[map.id] = true;

		var finish = function ()
		{
			mapLoading[map.id] = false;
			if (currentMap === map)
			{
				render();
			}
		};

		var script = document.createElement("script");
		script.src = "js/cod4/minimap/" + map.id + ".js";
		script.onload = function ()
		{
			var url = window.MINIMAP_IMAGES && window.MINIMAP_IMAGES[map.id];
			if (!url)
			{
				finish();
				return;
			}
			decode(url).then(function (img)
			{
				mapImages[map.id] = img;
				finish();
			}, finish);
		};
		script.onerror = finish;
		document.head.appendChild(script);
		updateStatus();
	}

	function mapById(id)
	{
		for (var i = 0; i < MAPS.length; i++)
		{
			if (MAPS[i].id === id)
			{
				return MAPS[i];
			}
		}
		return MAPS[0] || null;
	}

	function setHeading(h)
	{
		heading = Math.round(norm360(h)) % 360;
		if (facingInput !== null)
		{
			facingInput.value = String(heading);
		}
		if (facingOut !== null)
		{
			facingOut.textContent = heading + "° " + headingName(heading);
		}
	}

	function selectScene()
	{
		scene = buildScene(posSelect.value);
		setHeading(headingFromYaw(scene.yaw));
		updateNote();
		wake();
	}

	function selectMap(id)
	{
		currentMap = mapById(id);
		if (currentMap === null)
		{
			return;
		}
		loadMapImage(currentMap);
		selectScene();
	}

	// The textures are large, so nothing loads until the tab is first shown.
	function start()
	{
		if (started)
		{
			return;
		}
		started = true;
		loadIcons().then(function ()
		{
			selectMap(mapSelect.value);
		});
	}

	/* ---------- copy ---------- */

	/* ---------- wiring ---------- */

	function init()
	{
		var panel = document.getElementById("panel-mm");
		var optionsBox = document.getElementById("mm-options");
		var advancedBox = document.getElementById("mm-options-advanced");
		if (panel === null || optionsBox === null)
		{
			return;
		}

		hint = document.getElementById("mm-hint");
		setHint = window.UI.hint(hint);
		output = document.getElementById("mm-output");
		outputCheat = document.getElementById("mm-output-cheat");
		outputCheatBox = document.getElementById("mm-out-cheat");
		canvas = document.getElementById("mm-canvas");
		stage = document.getElementById("mm-stage");
		status = document.getElementById("mm-status");
		note = document.getElementById("mm-note");
		mapSelect = document.getElementById("mm-map");
		posSelect = document.getElementById("mm-pos");
		facingInput = document.getElementById("mm-facing");
		facingOut = document.getElementById("mm-facing-out");

		cheatFlags();
		OPTIONS.forEach(function (opt) { optionsBox.appendChild(makeOptionRow(opt)); });
		ADVANCED.forEach(function (opt) { advancedBox.appendChild(makeOptionRow(opt)); });
		resetOptions();
		renderOutput();

		MAPS.forEach(function (map)
		{
			var option = document.createElement("option");
			option.value = map.id;
			option.textContent = map.name;
			mapSelect.appendChild(option);
		});
		mapSelect.value = mapById(DEFAULT_MAP) ? DEFAULT_MAP : (MAPS[0] ? MAPS[0].id : "");

		mapSelect.addEventListener("change", function () { selectMap(mapSelect.value); });
		posSelect.addEventListener("change", selectScene);
		facingInput.addEventListener("input", function ()
		{
			setHeading(Number(facingInput.value));
			wake();
		});
		canvas.addEventListener("click", wake);

		document.getElementById("mm-reset").addEventListener("click", function ()
		{
			resetOptions();
			changed();
			setHint("Reset to the game's defaults.");
		});

		[["mm-copy", function () { return output; }], ["mm-copy-cheat", function () { return outputCheat; }]]
			.forEach(function (pair)
			{
				var button = document.getElementById(pair[0]);
				if (button === null)
				{
					return;
				}
				button.addEventListener("click", function ()
				{
					var text = pair[1]().textContent;
					copyText(text).then(function ()
					{
						setHint(text.split("\n").length + " console lines copied.");
					}, function ()
					{
						setHint("Could not copy — select the text and copy manually.", true);
					});
				});
			});

		if (window.ResizeObserver)
		{
			new window.ResizeObserver(function () { render(); }).observe(stage);
		}

		var tab = document.getElementById("tab-mm");
		var list = tab !== null ? tab.parentNode : null;
		if (list !== null)
		{
			list.addEventListener("tabchange", function ()
			{
				if (!panel.hidden)
				{
					start();
					render();
				}
			});
		}
		if (!panel.hidden)
		{
			start();
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
