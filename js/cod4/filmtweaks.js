/*
 * Filmtweaks: the r_filmTweak* dvars and r_gamma, a live preview on five maps,
 * and the seta lines for config_mp.cfg.
 *
 * The preview uses the game's own colour pass, step for step:
 *   R_SetFilmInfo        (gfx_d3d/r_scene.cpp) picks the film values: the
 *                        r_filmTweak* dvars with r_filmUseTweaks 1, the map's
 *                        vision file otherwise; then r_desaturation (cheat
 *                        protected, Promod sets it to 0) turns the
 *                        desaturation d into d * ((1 - d) * r_desaturation + d).
 *   R_UpdateColorManipulation  turns them into three shader constants.
 *   postfx_color         the pixel shader in code_post_gfx_mp.ff (ps_2_0):
 *                        lum = dot(rgb, 0.299 0.587 0.114)
 *                        out = (rgb * w + lum) * (delta * lum + base) + bias
 *                        and the 8 bit render target clamps it to 0..1.
 *   R_CalcGammaRamp      (r_init.cpp) r_gamma: the graphics card's gamma ramp,
 *                        out ^ (1 / r_gamma), fullscreen only.
 * Written out, that is: contrast * ((1 - d) * rgb + d * lum) *
 * (dark + (light - dark) * lum) + brightness + 0.5 - 0.5 * contrast.
 *
 * The map images (assets/cod4/filmtweaks/<map>.js, window.FILMTWEAK_IMAGES) are
 * renders of the maps before any film pass, so the preview grades them once,
 * as the game does. They are plain scripts holding data URLs, so the preview
 * works from disk too and the pixels can be read back.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var copyText = window.UI.copyText;
	var setHint = function () {};

	var IMAGE_DIR = "assets/cod4/filmtweaks/";
	var IMAGE_W = 1280;
	var IMAGE_H = 688;
	var TAB_LINK = "#cod4/filmtweaks";

	// def c0 of postfx_color (float32 values of 0.299, 0.587, 0.114)
	var LUM = [0.298999995, 0.587000012, 0.114];

	// The film of each map's vision file (raw/vision/<map>.vision in
	// common_mp.ff): what a player sees with r_filmUseTweaks 0.
	var MAPS = [
		{ id: "mp_backlot", name: "Backlot", vision: { enable: 1, contrast: 1.471, brightness: 0.198, desat: 0.26,
			invert: 0, light: [1.051, 0.966, 0.821], dark: [0.71, 0.63, 0.56] } },
		{ id: "mp_citystreets", name: "Citystreets", vision: { enable: 1, contrast: 1.205, brightness: 0.123, desat: 0.33,
			invert: 0, light: [1.25, 1.08, 0.71], dark: [0.49, 0.47, 0.465] } },
		{ id: "mp_crash", name: "Crash", vision: { enable: 1, contrast: 1.4, brightness: 0.134, desat: 0.265,
			invert: 0, light: [1.179, 1.086, 1.024], dark: [0.7, 1.0215, 1.265] } },
		{ id: "mp_crossfire", name: "Crossfire", vision: { enable: 1, contrast: 1.55798, brightness: 0.265218,
			desat: 0.45, invert: 0, light: [1.0209, 1.05, 1.11], dark: [1.08003, 1.08, 1.13691] } },
		{ id: "mp_strike", name: "Strike", vision: { enable: 1, contrast: 1.6, brightness: 0.187093, desat: 0.368,
			invert: 0, light: [1.2, 0.942, 0.903], dark: [1.08003, 1.08, 1.13691] } }
	];
	var DEFAULT_MAP = "mp_crash";

	// Defaults and limits are the ones iw3mp.exe registers (R_RegisterDvars);
	// init() checks them against the dvars tab's data (js/cod4/dvars-data.js),
	// which also says which are cheat protected.
	var CHEAT_TIP = "Cheat protected (registered with the cheat flag in stock 1.7): a seta line in your " +
		"config does nothing on a normal server. Promod's server can still set it, see the tag next to it.";
	var PROMOD_USE_TIP = "Promod sets this itself: the server's PROMOD_FILMTWEAK decides the start value, " +
		"and you switch it in the Promod quick menu (2. Film Tweaks: On/Off). Servers may set it through the " +
		"cheat flag; your config may not.";
	var PROMOD_INVERT_TIP = "Promod sets this to 0 and blocks the screen with \"SET R_FILMTWEAKINVERT TO 0\" " +
		"while it is anything else.";
	var GAMMA_TIP = "r_gamma is the graphics card's gamma ramp, not part of the picture: it only works in " +
		"fullscreen, and screenshots and recordings do not show it.";
	var TINT_TIP = "The swatch is the tint's colour; the numbers set its strength, up to 2 per channel. " +
		"Picking a colour keeps the strength of the strongest channel.";

	var BOOLS = {
		useTweaks: { key: "useTweaks", dvar: "r_filmUseTweaks", def: 0, label: "Use tweaks",
			promod: "Promod controlled", promodTip: PROMOD_USE_TIP,
			desc: "1 uses the values below instead of the map's own film colours. 0 shows every map the way " +
				"it ships, whatever the values below say." },
		enable: { key: "enable", dvar: "r_filmTweakEnable", def: 0, label: "Film on", film: true,
			desc: "The film colour pass itself. With tweaks in use and this at 0 the picture gets no colour " +
				"grading at all, not even the map's own." },
		invert: { key: "invert", dvar: "r_filmTweakInvert", def: 0, label: "Invert", film: true,
			promod: "Promod enforced", promodTip: PROMOD_INVERT_TIP,
			desc: "Turns the picture into its negative." }
	};

	var SCALARS = {
		brightness: { key: "brightness", dvar: "r_filmTweakBrightness", def: 0, min: -1, max: 1, step: 0.01,
			label: "Brightness", film: true,
			desc: "Added to every pixel after the contrast: 0.1 lifts the whole picture by a tenth of white." },
		contrast: { key: "contrast", dvar: "r_filmTweakContrast", def: 1.4, min: 0, max: 4, step: 0.01,
			label: "Contrast", film: true,
			desc: "Stretches every colour away from middle grey: 1 leaves it, 2 doubles the distance. The " +
				"game subtracts (contrast - 1) / 2, so raise Brightness with it to keep the picture as bright." },
		desat: { key: "desat", dvar: "r_filmTweakDesaturation", def: 0.2, min: 0, max: 1, step: 0.01,
			label: "Desaturation", film: true,
			desc: "Mixes each colour towards its grey: 0 keeps the colours, 1 is black and white." },
		gamma: { key: "gamma", dvar: "r_gamma", def: 0.8, min: 0.5, max: 3, step: 0.01, label: "Gamma",
			tip: GAMMA_TIP,
			desc: "The Brightness slider of the game's graphics options. Above 1 it brightens the dark and " +
				"middle tones, below 1 it darkens them; 1 leaves the picture as it is." }
	};

	var TINTS = {
		light: { key: "light", dvar: "r_filmTweakLightTint", def: [1.1, 1.05, 0.85], min: 0, max: 2, step: 0.01,
			label: "Light tint", film: true, tip: TINT_TIP,
			desc: "Colour multiplier for the bright parts of the picture: 1 1 1 leaves them, above 1 " +
				"strengthens that channel." },
		dark: { key: "dark", dvar: "r_filmTweakDarkTint", def: [0.7, 0.85, 1], min: 0, max: 2, step: 0.01,
			label: "Dark tint", film: true, tip: TINT_TIP,
			desc: "Colour multiplier for the dark parts. In between, the game blends the two tints by each " +
				"pixel's brightness." }
	};

	// The rows, top to bottom.
	var ROWS = [BOOLS.useTweaks, BOOLS.enable, SCALARS.brightness, SCALARS.contrast, SCALARS.desat,
		TINTS.light, TINTS.dark, BOOLS.invert, SCALARS.gamma];

	// The values one map keeps of its own in the per-map setup: exactly what
	// its bind line writes. The three switches (r_filmUseTweaks,
	// r_filmTweakEnable, r_filmTweakInvert) are the same for every map.
	var PER_MAP_KEYS = ["brightness", "contrast", "dark", "desat", "light", "gamma"];

	var CHANNELS = ["red", "green", "blue"];

	// Presets, in the order of the list: six suggestions that set the film
	// values and leave r_gamma alone, then three examples that set every
	// dvar, r_gamma too. A preset goes to the shown map, or to every map with
	// All maps on; the three switches always go to every map.
	var PRESETS = [
		{ name: "Stock", desc: "Tweaks off: every map with its own film colours.",
			v: { useTweaks: 0, enable: 0, brightness: 0, contrast: 1.4, desat: 0.2, invert: 0,
				light: [1.1, 1.05, 0.85], dark: [0.7, 0.85, 1] } },
		{ name: "Tweak defaults", desc: "Tweaks on with the game's default values: what Promod's Film " +
			"Tweaks: On shows on a config without values of its own.",
			v: { useTweaks: 1, enable: 1, brightness: 0, contrast: 1.4, desat: 0.2, invert: 0,
				light: [1.1, 1.05, 0.85], dark: [0.7, 0.85, 1] } },
		{ name: "Bright & clear", desc: "Brighter, full colours, neutral tints.",
			v: { useTweaks: 1, enable: 1, brightness: 0.17, contrast: 1.25, desat: 0, invert: 0,
				light: [1.05, 1.05, 1.05], dark: [1, 1, 1] } },
		{ name: "High contrast", desc: "Deep shadows and strong highlights, neutral tints.",
			v: { useTweaks: 1, enable: 1, brightness: 0.3, contrast: 1.7, desat: 0, invert: 0,
				light: [1, 1, 1], dark: [1, 1, 1] } },
		{ name: "Cold", desc: "Blue shadows, slightly cool highlights.",
			v: { useTweaks: 1, enable: 1, brightness: 0.2, contrast: 1.45, desat: 0, invert: 0,
				light: [0.95, 1, 1.1], dark: [0.95, 1.08, 1.35] } },
		{ name: "Warm", desc: "Golden light, a little less saturated.",
			v: { useTweaks: 1, enable: 1, brightness: 0.16, contrast: 1.4, desat: 0.1, invert: 0,
				light: [1.15, 1.05, 0.9], dark: [1.2, 1.05, 0.85] } },
		{ name: "Example 1", desc: "Cool highlights, strong contrast, a little brighter.", example: true,
			v: { useTweaks: 1, enable: 1, brightness: 0.18, contrast: 1.8, desat: 0, invert: 0,
				light: [0.55, 0.7, 0.8], dark: [1.55, 1.55, 2], gamma: 1.2 } },
		{ name: "Example 2", desc: "Green highlights, the strongest contrast of the three.", example: true,
			v: { useTweaks: 1, enable: 1, brightness: 0.18, contrast: 1.9, desat: 0, invert: 0,
				light: [0.5, 0.7, 0.5], dark: [1.65, 1.65, 2], gamma: 1.1 } },
		{ name: "Example 3", desc: "Bright and blue, with a low r_gamma.", example: true,
			v: { useTweaks: 1, enable: 1, brightness: 0.3, contrast: 1.5, desat: 0, invert: 0,
				light: [0.45, 0.55, 0.7], dark: [1.6, 1.66, 1.9], gamma: 0.7 } }
	];

	// The bind key of each map in the per-map setup, in map order.
	var DEFAULT_KEYS = ["F1", "F2", "F3", "F4", "F5"];

	/* ---------- state ---------- */

	var values = {};
	var view = { map: DEFAULT_MAP, mode: "single", promod: true, gamma: true, clip: false, split: 0.5 };
	var perMap = null;          // map id -> its own values (PER_MAP_KEYS); set up in init()
	// The per-map setup's "All maps" switch. Off: each map has its own values
	// and its own bind. On: one set of values and one bind for every map;
	// the per-map values stay as they are until it is off again.
	var allMaps = false;
	var allKey = "F1";          // bind key of the one all-maps bind
	var keys = {};              // map id -> bind key of the per-map setup

	var fields = {};            // key -> input or [r, g, b] inputs
	var swatches = {};          // tint key -> colour input
	var switches = {};          // bool key -> switch button
	var dom = {};

	var renderer = null;
	var images = {};            // map id -> decoded Image
	var loading = {};           // map id -> true while its script loads
	var samples = {};           // map id -> Float32Array of a small copy, for the numbers
	var frame = 0;
	var started = false;

	/* ---------- numbers ---------- */

	// "0.18" rather than "0.180000", always with a point (String() never
	// uses the system's decimal comma).
	function fmt(value)
	{
		var v = Math.round(value * 10000) / 10000;
		return String(v === 0 ? 0 : v);
	}

	function clamp(spec, value)
	{
		return Math.min(spec.max, Math.max(spec.min, value));
	}

	function round2(value)
	{
		return Math.round(value * 100) / 100;
	}

	function rangeText(spec)
	{
		return fmt(spec.min) + " – " + fmt(spec.max);
	}

	function defaults()
	{
		var v = {};
		ROWS.forEach(function (spec)
		{
			v[spec.key] = Array.isArray(spec.def) ? spec.def.slice() : spec.def;
		});
		return v;
	}

	// The given keys of a settings object, arrays copied.
	function copyKeys(source, keyList)
	{
		var out = {};
		keyList.forEach(function (key)
		{
			if (source.hasOwnProperty(key))
			{
				out[key] = Array.isArray(source[key]) ? source[key].slice() : source[key];
			}
		});
		return out;
	}

	function allKeys()
	{
		return ROWS.map(function (spec) { return spec.key; });
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
		return null;
	}

	/* ---------- the colour pass ---------- */

	// The settings a map is shown with: in the per-map setup the map's own
	// values and the shared switches, otherwise the one set of values.
	function settingsFor(mapId)
	{
		if (allMaps || perMap === null || !perMap[mapId])
		{
			return values;
		}
		var s = copyKeys(values, allKeys());
		PER_MAP_KEYS.forEach(function (key)
		{
			s[key] = Array.isArray(perMap[mapId][key]) ? perMap[mapId][key].slice() : perMap[mapId][key];
		});
		return s;
	}

	// R_SetFilmInfo: which film the game uses. Promod's server sets
	// r_filmTweakInvert 0 and r_desaturation 0.
	function engineFilm(settings, map, useTweaks)
	{
		var f = useTweaks ? settings : map.vision;
		var invert = f.invert ? 1 : 0;
		if (view.promod && useTweaks)
		{
			invert = 0;
		}
		var rDesat = view.promod ? 0 : 1;
		return {
			enable: f.enable ? 1 : 0,
			contrast: f.contrast,
			brightness: f.brightness,
			desat: f.desat * ((1 - f.desat) * rDesat + f.desat),
			invert: invert,
			light: f.light,
			dark: f.dark
		};
	}

	// R_UpdateColorManipulation: the shader constants. With the film off the
	// shader still runs, with constants that leave the picture as it is.
	function constants(f)
	{
		if (!f.enable)
		{
			return { bias: 0, w: 4095, base: [1 / 4096, 1 / 4096, 1 / 4096], delta: [0, 0, 0] };
		}
		var d = Math.max(f.desat, 1 / 4096);
		var ts = f.contrast * d;
		var tb = f.brightness + 0.5 - f.contrast * 0.5;
		if (f.invert)
		{
			ts = -ts;
			tb += 1;
		}
		return {
			bias: tb,
			w: 1 / d - 1,
			base: [f.dark[0] * ts, f.dark[1] * ts, f.dark[2] * ts],
			delta: [(f.light[0] - f.dark[0]) * ts, (f.light[1] - f.dark[1]) * ts, (f.light[2] - f.dark[2]) * ts]
		};
	}

	// What a map looks like: "after" with the settings, "before" with
	// r_filmUseTweaks 0 (the map's own film).
	function passFor(mapId, before)
	{
		var settings = settingsFor(mapId);
		return passWith(settings, mapById(mapId), before ? false : settings.useTweaks === 1);
	}

	function passWith(settings, map, useTweaks)
	{
		return {
			k: constants(engineFilm(settings, map, useTweaks)),
			gammaExp: view.gamma ? 1 / settings.gamma : 1
		};
	}

	/* ---------- renderers ---------- */

	var VERTEX_SHADER =
		"attribute vec2 a_pos;\n" +
		"varying vec2 v_uv;\n" +
		"void main()\n" +
		"{\n" +
		"\tv_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);\n" +
		"\tgl_Position = vec4(a_pos, 0.0, 1.0);\n" +
		"}\n";

	// postfx_color, then the render target (clamp, 8 bit), then the gamma
	// ramp, then the optional marks for lost detail.
	var FRAGMENT_SHADER =
		"uniform sampler2D u_image;\n" +
		"uniform vec4 u_bias;\n" +
		"uniform vec3 u_base;\n" +
		"uniform vec3 u_delta;\n" +
		"uniform float u_gamma;\n" +
		"uniform float u_clip;\n" +
		"varying vec2 v_uv;\n" +
		"void main()\n" +
		"{\n" +
		"\tvec3 c = texture2D(u_image, v_uv).rgb;\n" +
		"\tfloat lum = dot(c, vec3(0.298999995, 0.587000012, 0.114));\n" +
		"\tvec3 o = (c * u_bias.w + lum) * (u_delta * lum + u_base) + u_bias.xyz;\n" +
		"\tvec3 s = floor(clamp(o, 0.0, 1.0) * 255.0 + 0.5) / 255.0;\n" +
		"\tif (u_gamma != 1.0)\n" +
		"\t{\n" +
		"\t\ts = pow(s, vec3(u_gamma));\n" +
		"\t}\n" +
		"\tif (u_clip > 0.5)\n" +
		"\t{\n" +
		"\t\tfloat hi = max(max(o.r, o.g), o.b);\n" +
		"\t\tif (hi > 1.002)\n" +
		"\t\t{\n" +
		"\t\t\ts = mix(s, vec3(1.0, 0.1, 0.4), 0.72);\n" +
		"\t\t}\n" +
		"\t\telse if (hi < 0.02)\n" +
		"\t\t{\n" +
		"\t\t\ts = mix(s, vec3(0.1, 0.6, 1.0), 0.72);\n" +
		"\t\t}\n" +
		"\t}\n" +
		"\tgl_FragColor = vec4(s, 1.0);\n" +
		"}\n";

	function makeGlRenderer()
	{
		var canvas = document.createElement("canvas");
		var opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
			preserveDrawingBuffer: true };
		var gl = null;
		try
		{
			gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
		}
		catch (err)
		{
			gl = null;
		}
		if (!gl)
		{
			return null;
		}

		var high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
		var precision = high && high.precision > 0 ? "highp" : "mediump";

		function compile(type, source)
		{
			var shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
		}

		var vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
		var fs = compile(gl.FRAGMENT_SHADER, "precision " + precision + " float;\n" + FRAGMENT_SHADER);
		if (vs === null || fs === null)
		{
			return null;
		}
		var program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
		{
			return null;
		}
		gl.useProgram(program);

		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		var pos = gl.getAttribLocation(program, "a_pos");
		gl.enableVertexAttribArray(pos);
		gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

		var u = {};
		["u_image", "u_bias", "u_base", "u_delta", "u_gamma", "u_clip"].forEach(function (name)
		{
			u[name] = gl.getUniformLocation(program, name);
		});
		gl.uniform1i(u.u_image, 0);

		var textures = {};
		canvas.width = IMAGE_W;
		canvas.height = IMAGE_H;

		return {
			canvas: canvas,
			has: function (id) { return textures.hasOwnProperty(id); },
			// From the pixels a 2D canvas decodes, not from the image itself:
			// the GPU's own decode of a webp can be a level off here and there,
			// which a strong contrast multiplies.
			upload: function (id, img)
			{
				var tmp = document.createElement("canvas");
				tmp.width = IMAGE_W;
				tmp.height = IMAGE_H;
				var tctx = tmp.getContext("2d");
				tctx.drawImage(img, 0, 0, IMAGE_W, IMAGE_H);
				var pixels = tctx.getImageData(0, 0, IMAGE_W, IMAGE_H);
				var tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, IMAGE_W, IMAGE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE,
					new Uint8Array(pixels.data.buffer));
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				textures[id] = tex;
			},
			draw: function (id, pass, clip)
			{
				var k = pass.k;
				gl.viewport(0, 0, IMAGE_W, IMAGE_H);
				gl.bindTexture(gl.TEXTURE_2D, textures[id]);
				gl.uniform4f(u.u_bias, k.bias, k.bias, k.bias, k.w);
				gl.uniform3f(u.u_base, k.base[0], k.base[1], k.base[2]);
				gl.uniform3f(u.u_delta, k.delta[0], k.delta[1], k.delta[2]);
				gl.uniform1f(u.u_gamma, pass.gammaExp);
				gl.uniform1f(u.u_clip, clip ? 1 : 0);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				return canvas;
			}
		};
	}

	// Without WebGL the same pass runs per pixel on a half size copy.
	function makeCpuRenderer()
	{
		var W = IMAGE_W / 2;
		var H = IMAGE_H / 2;
		var canvas = document.createElement("canvas");
		canvas.width = W;
		canvas.height = H;
		var ctx = canvas.getContext("2d");
		var sources = {};
		var out = ctx.createImageData(W, H);

		return {
			canvas: canvas,
			has: function (id) { return sources.hasOwnProperty(id); },
			upload: function (id, img)
			{
				var tmp = document.createElement("canvas");
				tmp.width = W;
				tmp.height = H;
				var tctx = tmp.getContext("2d");
				tctx.drawImage(img, 0, 0, W, H);
				sources[id] = tctx.getImageData(0, 0, W, H).data;
			},
			draw: function (id, pass, clip)
			{
				var src = sources[id];
				var dst = out.data;
				var k = pass.k;
				var ramp = new Uint8ClampedArray(256);
				for (var i = 0; i < 256; i++)
				{
					ramp[i] = Math.round(Math.pow(i / 255, pass.gammaExp) * 255);
				}
				var o = [0, 0, 0];
				for (var p = 0; p < src.length; p += 4)
				{
					var r = src[p] / 255;
					var g = src[p + 1] / 255;
					var b = src[p + 2] / 255;
					var lum = r * LUM[0] + g * LUM[1] + b * LUM[2];
					o[0] = (r * k.w + lum) * (k.delta[0] * lum + k.base[0]) + k.bias;
					o[1] = (g * k.w + lum) * (k.delta[1] * lum + k.base[1]) + k.bias;
					o[2] = (b * k.w + lum) * (k.delta[2] * lum + k.base[2]) + k.bias;
					for (var c = 0; c < 3; c++)
					{
						dst[p + c] = ramp[Math.round(Math.min(1, Math.max(0, o[c])) * 255)];
					}
					if (clip)
					{
						var hi = Math.max(o[0], o[1], o[2]);
						var mark = hi > 1.002 ? [255, 26, 102] : (hi < 0.02 ? [26, 153, 255] : null);
						if (mark !== null)
						{
							for (c = 0; c < 3; c++)
							{
								dst[p + c] = dst[p + c] * 0.28 + mark[c] * 0.72;
							}
						}
					}
					dst[p + 3] = 255;
				}
				ctx.putImageData(out, 0, 0);
				return canvas;
			}
		};
	}

	/* ---------- the numbers under the preview ---------- */

	var SAMPLE_W = 160;
	var SAMPLE_H = 86;

	function takeSample(id, img)
	{
		var tmp = document.createElement("canvas");
		tmp.width = SAMPLE_W;
		tmp.height = SAMPLE_H;
		var ctx = tmp.getContext("2d");
		ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
		var data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
		var rgb = new Float32Array(SAMPLE_W * SAMPLE_H * 3);
		for (var i = 0, j = 0; i < data.length; i += 4, j += 3)
		{
			rgb[j] = data[i] / 255;
			rgb[j + 1] = data[i + 1] / 255;
			rgb[j + 2] = data[i + 2] / 255;
		}
		samples[id] = rgb;
	}

	// Share of pixels cut at white and near black, the average brightness
	// and the average of the darkest quarter (where enemies hide), as seen
	// after the gamma ramp.
	function measure(id, pass)
	{
		var rgb = samples[id];
		var k = pass.k;
		var n = rgb.length / 3;
		var lums = new Float32Array(n);
		var cut = 0;
		var black = 0;
		var sum = 0;
		var o = [0, 0, 0];
		for (var i = 0, j = 0; i < n; i++, j += 3)
		{
			var lum = rgb[j] * LUM[0] + rgb[j + 1] * LUM[1] + rgb[j + 2] * LUM[2];
			var hi = -Infinity;
			for (var c = 0; c < 3; c++)
			{
				o[c] = (rgb[j + c] * k.w + lum) * (k.delta[c] * lum + k.base[c]) + k.bias;
				hi = Math.max(hi, o[c]);
				o[c] = Math.pow(Math.min(1, Math.max(0, o[c])), pass.gammaExp);
			}
			if (hi > 1.002)
			{
				cut++;
			}
			else if (hi < 0.02)
			{
				black++;
			}
			lums[i] = o[0] * LUM[0] + o[1] * LUM[1] + o[2] * LUM[2];
			sum += lums[i];
		}
		lums.sort();
		var q = Math.floor(n / 4);
		var low = 0;
		for (i = 0; i < q; i++)
		{
			low += lums[i];
		}
		return { cut: cut / n, black: black / n, mean: sum / n, shadows: low / q };
	}

	function pct(x)
	{
		return (Math.round(x * 1000) / 10).toFixed(1) + "%";
	}

	// The table in the grid's sixth tile: each map with your settings and
	// with its own film.
	function updateSummary()
	{
		MAPS.forEach(function (map)
		{
			var cells = dom.summaryRows[map.id];
			if (!samples[map.id])
			{
				cells.forEach(function (td) { td.textContent = "…"; });
				return;
			}
			var after = measure(map.id, passFor(map.id, false));
			var before = measure(map.id, passFor(map.id, true));
			cells[0].textContent = after.shadows.toFixed(2);
			cells[1].textContent = before.shadows.toFixed(2);
			cells[2].textContent = Math.round(after.cut * 100) + "%";
		});
	}

	function updateNote()
	{
		var id = view.map;
		if (!samples[id])
		{
			dom.note.textContent = "";
			return;
		}
		var before = measure(id, passFor(id, true));
		var after = measure(id, passFor(id, false));
		var name = mapById(id).name;
		dom.note.textContent = name + " with your settings: " + pct(after.cut) + " of the picture cut at white, " +
			pct(after.black) + " near black. Shadows (darkest quarter) " + after.shadows.toFixed(2) +
			", average " + after.mean.toFixed(2) + "; with the map's own film " + before.shadows.toFixed(2) +
			" and " + before.mean.toFixed(2) + " (0 black, 1 white)." +
			(view.clip ? " Marked: pink cut at white, blue near black." : "");
	}

	/* ---------- drawing ---------- */

	function schedule()
	{
		if (frame === 0 && started)
		{
			frame = window.requestAnimationFrame(render);
		}
	}

	function updateStatus()
	{
		var waiting = view.mode === "grid"
			? MAPS.some(function (m) { return !renderer || !renderer.has(m.id); })
			: !renderer || !renderer.has(view.map);
		dom.status.hidden = !waiting;
		dom.status.textContent = renderer === null && started ? "The preview could not start." : "Loading the map…";
	}

	function render()
	{
		frame = 0;
		if (!started || dom.panel.hidden || renderer === null)
		{
			updateStatus();
			return;
		}
		updateStatus();
		if (view.mode === "grid")
		{
			MAPS.forEach(function (map)
			{
				var tile = dom.tiles[map.id];
				if (!renderer.has(map.id))
				{
					return;
				}
				tile.ctx.drawImage(renderer.draw(map.id, passFor(map.id, false), view.clip), 0, 0,
					tile.canvas.width, tile.canvas.height);
			});
			updateSummary();
		}
		else if (renderer.has(view.map))
		{
			var ctx = dom.ctx;
			var W = dom.canvas.width;
			var H = dom.canvas.height;
			if (view.mode === "split")
			{
				ctx.drawImage(renderer.draw(view.map, passFor(view.map, true), view.clip), 0, 0, W, H);
				var x = Math.round(W * view.split);
				ctx.save();
				ctx.beginPath();
				ctx.rect(x, 0, W - x, H);
				ctx.clip();
				ctx.drawImage(renderer.draw(view.map, passFor(view.map, false), view.clip), 0, 0, W, H);
				ctx.restore();
			}
			else
			{
				ctx.drawImage(renderer.draw(view.map, passFor(view.map, false), view.clip), 0, 0, W, H);
			}
		}
		updateNote();
		drawThumbs();
	}

	/* ---------- map images ---------- */

	// A <script> per map, not fetch(): that also works from disk.
	function loadImage(id, then)
	{
		if (images[id] || loading[id])
		{
			if (then)
			{
				then();
			}
			return;
		}
		loading[id] = true;
		var done = function ()
		{
			loading[id] = false;
			schedule();
			if (then)
			{
				then();
			}
		};
		var script = document.createElement("script");
		script.src = IMAGE_DIR + id + ".js";
		script.onload = function ()
		{
			var url = window.FILMTWEAK_IMAGES && window.FILMTWEAK_IMAGES[id];
			if (!url)
			{
				done();
				return;
			}
			var img = new Image();
			img.onload = function ()
			{
				images[id] = img;
				if (renderer !== null)
				{
					renderer.upload(id, img);
				}
				takeSample(id, img);
				done();
			};
			img.onerror = done;
			img.src = url;
		};
		script.onerror = done;
		document.head.appendChild(script);
	}

	// The shown map first, then the others one after another.
	function loadAll()
	{
		var order = [view.map].concat(MAPS.map(function (m) { return m.id; }).filter(function (id)
		{
			return id !== view.map;
		}));
		var next = function ()
		{
			var id = order.shift();
			if (id !== undefined)
			{
				loadImage(id, next);
			}
		};
		next();
	}

	function start()
	{
		if (started)
		{
			return;
		}
		started = true;
		renderer = makeGlRenderer() || makeCpuRenderer();
		loadAll();
		schedule();
	}

	/* ---------- controls ---------- */

	function makeTip(text)
	{
		var tip = el("span", "mm-tip");
		tip.tabIndex = 0;
		tip.setAttribute("role", "img");
		tip.setAttribute("aria-label", text);
		var icon = el("span", "mm-tip-icon", "i");
		icon.setAttribute("aria-hidden", "true");
		var bubble = el("span", "mm-tip-text", text);
		bubble.setAttribute("aria-hidden", "true");
		tip.appendChild(icon);
		tip.appendChild(bubble);
		return tip;
	}

	function makeBadges(spec)
	{
		var wrap = el("span", "mm-badges");
		if (spec.cheat)
		{
			wrap.appendChild(el("span", "mm-badge is-cheat", "cheat protected"));
			wrap.appendChild(makeTip(CHEAT_TIP));
		}
		if (spec.promod)
		{
			wrap.appendChild(el("span", "mm-badge ft-badge-promod", spec.promod));
			wrap.appendChild(makeTip(spec.promodTip));
		}
		return wrap.childNodes.length > 0 ? wrap : null;
	}

	function makeRowShell(spec)
	{
		var row = el("div", "kf-opt mm-opt ft-opt");
		var head = el("span", "mm-opt-head");
		var label = el("label", "kf-opt-label", spec.label);
		label.title = spec.dvar;
		head.appendChild(label);
		if (spec.tip)
		{
			head.appendChild(makeTip(spec.tip));
		}
		row.appendChild(head);
		var desc = el("p", "kf-opt-desc");
		desc.id = "ft-" + spec.key + "-desc";
		desc.appendChild(el("code", "ft-dvar", spec.dvar));
		desc.appendChild(document.createTextNode(" " + spec.desc));
		return { row: row, label: label, desc: desc };
	}

	function makeNumber(id, spec, label, onValue)
	{
		var input = el("input", "kf-value kf-num ft-num");
		input.id = id;
		input.title = spec.dvar + ", " + rangeText(spec);
		input.setAttribute("aria-label", label);
		var stepper = window.Decimal.attach(input, { min: spec.min, max: spec.max, step: spec.step,
			buttons: true, label: label });
		input.addEventListener("input", function ()
		{
			var value = window.Decimal.parse(input.value);
			if (value === null)
			{
				input.classList.add("is-invalid");
				return;
			}
			input.classList.remove("is-invalid");
			onValue(clamp(spec, value));
		});
		input.addEventListener("blur", function ()
		{
			var typed = window.Decimal.parse(input.value);
			if (input.classList.contains("is-invalid") || (typed !== null && clamp(spec, typed) !== typed))
			{
				setHint(label + " takes a number from " + rangeText(spec) + ".", true);
			}
			input.classList.remove("is-invalid");
			refreshFields();
		});
		return { input: input, node: stepper };
	}

	function makeRow(spec)
	{
		var shell = makeRowShell(spec);
		var row = shell.row;

		if (BOOLS[spec.key] === spec)
		{
			var button = el("button", "ft-switch");
			button.type = "button";
			button.id = "ft-" + spec.key;
			button.setAttribute("role", "switch");
			button.setAttribute("aria-describedby", shell.desc.id);
			button.appendChild(el("span", "ft-switch-track"));
			button.appendChild(el("span", "ft-switch-text"));
			button.addEventListener("click", function ()
			{
				values[spec.key] = values[spec.key] ? 0 : 1;
				changed(spec);
			});
			shell.label.htmlFor = button.id;
			switches[spec.key] = button;
			row.appendChild(button);
		}
		else if (TINTS[spec.key] === spec)
		{
			var colour = el("input", "kf-color ft-color");
			colour.type = "color";
			colour.id = "ft-" + spec.key + "-colour";
			colour.setAttribute("aria-label", spec.label + " colour");
			colour.addEventListener("input", function () { pickColour(spec, colour.value); });
			swatches[spec.key] = colour;
			shell.label.htmlFor = colour.id;
			row.appendChild(colour);
			row.appendChild(el("span", "mm-range-hint", rangeText(spec) + " each"));

			var group = el("span", "ft-rgb");
			fields[spec.key] = [];
			CHANNELS.forEach(function (channel, i)
			{
				var part = el("span", "ft-ch");
				var letter = el("span", "ft-ch-label", channel.charAt(0).toUpperCase());
				letter.setAttribute("aria-hidden", "true");
				part.appendChild(letter);
				var num = makeNumber("ft-" + spec.key + "-" + channel, spec, spec.label + " " + channel, function (v)
				{
					values[spec.key][i] = v;
					changed(spec);
				});
				num.input.setAttribute("aria-describedby", shell.desc.id);
				fields[spec.key].push(num.input);
				part.appendChild(num.node);
				group.appendChild(part);
			});
			row.appendChild(group);
		}
		else
		{
			var num1 = makeNumber("ft-" + spec.key, spec, spec.label, function (v)
			{
				values[spec.key] = v;
				changed(spec);
			});
			num1.input.setAttribute("aria-describedby", shell.desc.id + " ft-" + spec.key + "-range");
			shell.label.htmlFor = num1.input.id;
			fields[spec.key] = num1.input;
			row.appendChild(num1.node);
			var range = el("span", "mm-range-hint", rangeText(spec));
			range.id = "ft-" + spec.key + "-range";
			row.appendChild(range);
		}

		var badges = makeBadges(spec);
		if (badges !== null)
		{
			row.appendChild(badges);
		}
		row.appendChild(shell.desc);
		if (spec.key === "desat")
		{
			dom.desatNote = el("p", "kf-opt-desc ft-live");
			row.appendChild(dom.desatNote);
		}
		return row;
	}

	function hex2(v)
	{
		var s = Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16);
		return s.length < 2 ? "0" + s : s;
	}

	// The swatch shows the tint's colour at a strength of at most 1.
	function swatchOf(tint)
	{
		var top = Math.max(1, tint[0], tint[1], tint[2]);
		return "#" + hex2(tint[0] / top) + hex2(tint[1] / top) + hex2(tint[2] / top);
	}

	function pickColour(spec, hex)
	{
		var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
		if (m === null)
		{
			return;
		}
		var tint = values[spec.key];
		var scale = Math.max(1, tint[0], tint[1], tint[2]);
		values[spec.key] = [1, 2, 3].map(function (i)
		{
			return clamp(spec, round2(parseInt(m[i], 16) / 255 * scale));
		});
		changed(spec, true);
	}

	// Every field from the values; the field being typed in keeps its text.
	function refreshFields(skipSwatch)
	{
		ROWS.forEach(function (spec)
		{
			var key = spec.key;
			if (switches[key])
			{
				var on = values[key] === 1;
				switches[key].setAttribute("aria-checked", on ? "true" : "false");
				switches[key].lastChild.textContent = on ? "1 — on" : "0 — off";
			}
			else if (Array.isArray(fields[key]))
			{
				fields[key].forEach(function (input, i)
				{
					if (document.activeElement !== input || window.Decimal.parse(input.value) !== values[key][i])
					{
						input.value = fmt(values[key][i]);
						input.classList.remove("is-invalid");
					}
					window.Decimal.sync(input);
				});
				if (!skipSwatch)
				{
					swatches[key].value = swatchOf(values[key]);
				}
			}
			else if (fields[key])
			{
				var input = fields[key];
				if (document.activeElement !== input || window.Decimal.parse(input.value) !== values[key])
				{
					input.value = fmt(values[key]);
					input.classList.remove("is-invalid");
				}
				window.Decimal.sync(input);
			}
		});
		var d = values.desat;
		dom.desatNote.textContent = view.promod
			? "On Promod (r_desaturation 0) the game uses " + fmt(d) + " × " + fmt(d) + " = " +
				fmt(Math.round(d * d * 10000) / 10000) + "; the preview does too."
			: "";
		dom.desatNote.hidden = !view.promod;
	}

	// A film value changed: with tweaks off it would not show, so they go on.
	function changed(spec, fromPicker)
	{
		if (spec && spec.film && (values.useTweaks !== 1 || values.enable !== 1) && spec !== BOOLS.enable)
		{
			values.useTweaks = 1;
			values.enable = 1;
			setHint("Turned on r_filmUseTweaks and r_filmTweakEnable, so the change shows.");
		}
		storePerMap();
		refreshFields(fromPicker === true);
		update();
	}

	function update()
	{
		renderOutput();
		renderWarnings();
		markPreset();
		schedule();
	}

	function setValues(next)
	{
		ROWS.forEach(function (spec)
		{
			if (next.hasOwnProperty(spec.key))
			{
				values[spec.key] = Array.isArray(next[spec.key]) ? next[spec.key].slice() : next[spec.key];
			}
		});
		storePerMap();
		refreshFields();
		update();
	}

	/* ---------- presets ---------- */

	// Whether the settings b hold every value preset values a set.
	function sameFilm(a, b)
	{
		return Object.keys(a).every(function (key)
		{
			if (Array.isArray(a[key]))
			{
				return a[key].every(function (x, i) { return Math.abs(x - b[key][i]) < 1e-6; });
			}
			return Math.abs(a[key] - b[key]) < 1e-6;
		});
	}

	// Values of a preset outside the game's limits, as "dvar value" texts.
	// None are today; should one be, applying it says which ones were kept
	// within the limits instead of clamping them silently.
	function presetProblems(preset)
	{
		var out = [];
		ROWS.forEach(function (spec)
		{
			var v = preset.v[spec.key];
			if (v === undefined || BOOLS[spec.key] === spec)
			{
				return;
			}
			(Array.isArray(v) ? v : [v]).forEach(function (x)
			{
				if (!(x >= spec.min && x <= spec.max))
				{
					out.push(spec.dvar + " " + (Array.isArray(v) ? vec(v) : fmt(v)));
				}
			});
		});
		return out;
	}

	function applyPreset(preset)
	{
		var next = {};
		ROWS.forEach(function (spec)
		{
			var v = preset.v[spec.key];
			if (v === undefined)
			{
				return;
			}
			if (BOOLS[spec.key] === spec)
			{
				next[spec.key] = v ? 1 : 0;
			}
			else
			{
				next[spec.key] = Array.isArray(v) ? v.map(function (x) { return clamp(spec, x); }) : clamp(spec, v);
			}
		});
		setValues(next);
		var where = allMaps ? " on all maps" : " on " + mapById(view.map).name;
		var problems = presetProblems(preset);
		setHint(preset.name + " applied" + where + "." + (problems.length ? " Outside the game's limits and " +
			"kept within them: " + problems.join(", ") + "." : ""), problems.length > 0);
	}

	function markPreset()
	{
		PRESETS.forEach(function (preset)
		{
			var on = sameFilm(preset.v, values);
			preset.button.classList.toggle("is-active", on);
			preset.button.setAttribute("aria-pressed", on ? "true" : "false");
		});
	}

	// The seta lines a preset writes: all nine for an example, the others
	// leave r_gamma out.
	function presetLines(preset)
	{
		var withGamma = preset.v.hasOwnProperty("gamma");
		return configPairs(preset.v).filter(function (p) { return withGamma || p[0] !== "r_gamma"; }).map(function (p)
		{
			return "seta " + p[0] + " \"" + p[1] + "\"";
		}).join(String.fromCharCode(10));
	}

	// The values a preset sets and a Copy button for its lines. Shown while
	// the pointer is on the thumbnail or on this box, or the keyboard is on
	// the preset or its Copy button; the values are read out with the preset.
	function presetTip(preset, index)
	{
		var v = preset.v;
		var tip = el("div", "ft-thumb-tip");
		tip.setAttribute("role", "group");
		tip.setAttribute("aria-label", preset.name + " values");
		var table = el("span", "ft-tip-rows");
		table.id = "ft-preset-values-" + index;
		var add = function (label, value, tint)
		{
			table.appendChild(el("span", "ft-tip-label", label));
			var cell = el("span", "ft-tip-value");
			if (tint)
			{
				var dot = el("span", "ft-tip-swatch");
				dot.style.backgroundColor = swatchOf(tint);
				dot.setAttribute("aria-hidden", "true");
				cell.appendChild(dot);
			}
			cell.appendChild(document.createTextNode(value));
			table.appendChild(cell);
		};
		add("Use tweaks", String(v.useTweaks));
		add("Film on", String(v.enable));
		add("Brightness", fmt(v.brightness));
		add("Contrast", fmt(v.contrast));
		add("Desaturation", fmt(v.desat));
		add("Light tint", vec(v.light), v.light);
		add("Dark tint", vec(v.dark), v.dark);
		add("Invert", String(v.invert));
		if (v.hasOwnProperty("gamma"))
		{
			add("Gamma", fmt(v.gamma));
		}
		var head = el("span", "ft-tip-head");
		head.appendChild(el("span", "ft-tip-title", preset.name));
		var copy = el("button", "btn btn-sm ft-tip-copy", "Copy");
		copy.type = "button";
		copy.setAttribute("aria-label", "Copy the lines of " + preset.name);
		var reset = 0;
		copy.addEventListener("click", function (event)
		{
			// The finger that held the preset may let go right over Copy: that
			// click only ends the long press.
			var owner = preset.button;
			if (owner && owner.ftLongPressed)
			{
				owner.ftLongPressed = false;
				event.stopPropagation();
				return;
			}
			var text = presetLines(preset);
			copyText(text).then(function ()
			{
				copy.textContent = "Copied";
				window.clearTimeout(reset);
				reset = window.setTimeout(function ()
				{
					copy.textContent = "Copy";
					if (pinned !== null && pinned.contains(copy))
					{
						unpin();
					}
				}, 1500);
				setHint(preset.name + ": " + text.split(String.fromCharCode(10)).length + " config lines copied" +
					(preset.v.hasOwnProperty("gamma") ? "." : " (r_gamma left out)."));
			}, function ()
			{
				setHint("Could not copy — apply the preset and copy the console commands.", true);
			});
		});
		head.appendChild(copy);
		tip.appendChild(head);
		tip.appendChild(table);
		tip.appendChild(el("span", "ft-tip-note", v.useTweaks !== 1 ?
			"With tweaks off the values do not show: every map keeps its own film." :
			(v.hasOwnProperty("gamma") ? "Sets r_gamma too." : "r_gamma stays as you set it.")));
		return tip;
	}

	// The keyboard opens a preset's tooltip: Tab onto the preset shows it,
	// Tab again reaches its Copy button, Escape closes it. A class rather
	// than :has(:focus-visible), which browsers do not always update as the
	// focus moves.
	function wireTipFocus(item)
	{
		var keyboard = function (target)
		{
			try
			{
				return target.matches(":focus-visible");
			}
			catch (err)
			{
				return true;
			}
		};
		item.addEventListener("focusin", function (event)
		{
			item.classList.toggle("is-focus", keyboard(event.target));
		});
		item.addEventListener("focusout", function (event)
		{
			if (!item.contains(event.relatedTarget))
			{
				item.classList.remove("is-focus");
			}
		});
		item.addEventListener("keydown", function (event)
		{
			if (event.key === "Escape" && item.classList.contains("is-focus"))
			{
				item.classList.remove("is-focus");
				event.stopPropagation();
			}
		});
	}

	// Touch screens have no hover: holding a preset opens its tooltip and
	// keeps it open; letting go then does not apply the preset. A tap
	// outside closes it, and so does a copy. A short tap still applies.
	var LONG_PRESS_MS = 350;
	var MOVE_LIMIT = 10;
	var pinned = null;          // the item whose tooltip a long press opened

	function unpin()
	{
		if (pinned !== null)
		{
			pinned.classList.remove("is-pinned");
			pinned = null;
		}
	}

	// A short tick when a long press opens a tooltip. The Vibration API where
	// there is one (Android browsers); Safari has none, but since iOS 18 it
	// ticks when a switch checkbox is toggled through its label, so a hidden
	// one is toggled there. Phones without either simply stay still.
	var VIBRATE_MS = 10;
	var hapticLabel = null;

	function hapticTick()
	{
		if (typeof navigator.vibrate === "function")
		{
			try
			{
				navigator.vibrate(VIBRATE_MS);
			}
			catch (err)
			{
				// no vibration, nothing else changes
			}
			return;
		}
		try
		{
			if (hapticLabel === null)
			{
				hapticLabel = el("label", "ft-haptic");
				hapticLabel.setAttribute("aria-hidden", "true");
				var input = el("input");
				input.type = "checkbox";
				input.setAttribute("switch", "");
				input.tabIndex = -1;
				hapticLabel.appendChild(input);
				document.body.appendChild(hapticLabel);
			}
			hapticLabel.click();
		}
		catch (err)
		{
			// no tick, nothing else changes
		}
	}

	function wireLongPress(item, button)
	{
		var timer = 0;
		var start = null;
		var cancel = function ()
		{
			window.clearTimeout(timer);
			start = null;
		};
		button.addEventListener("pointerdown", function (event)
		{
			if (event.pointerType === "mouse")
			{
				return;
			}
			// a long press that no click followed must not swallow this one
			button.ftLongPressed = false;
			start = [event.clientX, event.clientY];
			window.clearTimeout(timer);
			timer = window.setTimeout(function ()
			{
				start = null;
				unpin();
				item.classList.add("is-pinned");
				pinned = item;
				button.ftLongPressed = true;
				hapticTick();
			}, LONG_PRESS_MS);
		});
		button.addEventListener("pointermove", function (event)
		{
			if (start !== null && Math.abs(event.clientX - start[0]) + Math.abs(event.clientY - start[1]) > MOVE_LIMIT)
			{
				cancel();
			}
		});
		["pointerup", "pointercancel", "pointerleave"].forEach(function (type)
		{
			button.addEventListener(type, cancel);
		});
		// The browser's own long-press menu would cover the tooltip.
		button.addEventListener("contextmenu", function (event)
		{
			if (event.pointerType !== "mouse" && (button.ftLongPressed || start !== null))
			{
				event.preventDefault();
			}
		});
	}

	function buildPresets()
	{
		document.addEventListener("pointerdown", function (event)
		{
			if (pinned !== null && !pinned.contains(event.target))
			{
				unpin();
			}
		}, true);
		document.addEventListener("keydown", function (event)
		{
			if (event.key === "Escape")
			{
				unpin();
			}
		});

		dom.presets.appendChild(el("p", "ft-presets-touch", "Hold a preset to see its values and copy its lines."));

		PRESETS.forEach(function (preset)
		{
			var index = PRESETS.indexOf(preset);
			var item = el("div", "ft-preset-item");
			var button = el("button", "sb-preset ft-preset");
			button.type = "button";
			button.setAttribute("aria-pressed", "false");
			var thumb = el("canvas", "ft-preset-thumb");
			thumb.width = THUMB_W;
			thumb.height = THUMB_H;
			thumb.setAttribute("aria-hidden", "true");
			preset.ctx = thumb.getContext("2d");
			preset.ctx.imageSmoothingQuality = "high";
			var wrap = el("span", "ft-thumb");
			wrap.appendChild(thumb);
			button.setAttribute("aria-describedby", "ft-preset-values-" + index);
			button.appendChild(wrap);
			button.appendChild(el("span", "ft-preset-name", preset.name));
			button.appendChild(el("span", "ft-preset-desc", preset.desc));
			button.addEventListener("click", function ()
			{
				if (button.ftLongPressed)
				{
					button.ftLongPressed = false;
					return;
				}
				// With its tooltip open, a tap on the preset itself (its
				// thumbnail is what the tooltip leaves in view) only closes it.
				if (pinned === item)
				{
					unpin();
					return;
				}
				unpin();
				applyPreset(preset);
			});
			preset.button = button;
			item.appendChild(button);
			var tip = presetTip(preset, index);
			item.appendChild(tip);
			// An open tooltip covers its preset's text on a phone: a tap on it
			// (anywhere but Copy) closes it. The click that ends the long
			// press itself may land here too; that one is let go.
			tip.addEventListener("click", function (event)
			{
				if (button.ftLongPressed)
				{
					button.ftLongPressed = false;
					return;
				}
				if (pinned === item && !event.target.closest(".ft-tip-copy"))
				{
					unpin();
				}
			});
			wireTipFocus(item);
			wireLongPress(item, button);
			dom.presets.appendChild(item);
		});
	}

	// Each preset on the shown map, with its own r_gamma (an example) or the
	// map's (the others), and the switches under the preview. Drawn while the
	// list is open, again only when one of those changes: the presets
	// themselves never do.
	var THUMB_W = 192;
	var THUMB_H = 103;
	var thumbKey = "";

	function drawThumbs()
	{
		var map = mapById(view.map);
		if (!dom.presetsBox.open || renderer === null || !renderer.has(map.id))
		{
			return;
		}
		var key = [map.id, values.gamma, view.promod, view.gamma].join("|");
		if (key === thumbKey)
		{
			return;
		}
		thumbKey = key;
		PRESETS.forEach(function (preset)
		{
			var settings = copyKeys(preset.v, allKeys());
			if (!settings.hasOwnProperty("gamma"))
			{
				settings.gamma = values.gamma;
			}
			var pass = passWith(settings, map, preset.v.useTweaks === 1);
			preset.ctx.drawImage(renderer.draw(map.id, pass, false), 0, 0, THUMB_W, THUMB_H);
		});
	}

	/* ---------- randomize, fine-tune ---------- */

	function rand(lo, hi)
	{
		return lo + Math.random() * (hi - lo);
	}

	// A random look that stays playable: contrast and brightness are drawn
	// together, so the picture does not end up near black or white.
	function randomize()
	{
		var c = round2(rand(1, 2));
		var offset = rand(-0.08, 0.14);
		var tint = function (lo, hi) { return [round2(rand(lo, hi)), round2(rand(lo, hi)), round2(rand(lo, hi))]; };
		setValues({ useTweaks: 1, enable: 1, invert: 0, contrast: c,
			brightness: round2(clamp(SCALARS.brightness, offset - 0.5 + 0.5 * c)),
			desat: round2(rand(0, 0.35)), light: tint(0.85, 1.3), dark: tint(0.75, 1.45) });
		setHint("Random settings.");
	}

	// Small steps around the current settings.
	function fineTune()
	{
		var j = function (spec, value, size) { return clamp(spec, round2(value + rand(-size, size))); };
		setValues({ useTweaks: 1, enable: 1,
			contrast: j(SCALARS.contrast, values.contrast, 0.06),
			brightness: j(SCALARS.brightness, values.brightness, 0.03),
			desat: j(SCALARS.desat, values.desat, 0.04),
			light: values.light.map(function (x) { return j(TINTS.light, x, 0.04); }),
			dark: values.dark.map(function (x) { return j(TINTS.dark, x, 0.04); }) });
		setHint("Fine-tuned around your settings.");
	}

	/* ---------- output ---------- */

	function vec(v)
	{
		return v.map(fmt).join(" ");
	}

	// The order of the game's own config_mp.cfg: by name.
	function configPairs(v)
	{
		return [
			["r_filmTweakBrightness", fmt(v.brightness)],
			["r_filmTweakContrast", fmt(v.contrast)],
			["r_filmTweakDarkTint", vec(v.dark)],
			["r_filmTweakDesaturation", fmt(v.desat)],
			["r_filmTweakEnable", String(v.enable)],
			["r_filmTweakInvert", String(v.invert)],
			["r_filmTweakLightTint", vec(v.light)],
			["r_filmUseTweaks", String(v.useTweaks)],
			["r_gamma", fmt(v.gamma)]
		];
	}

	function renderOutput()
	{
		dom.output.textContent = configPairs(values).map(function (p)
		{
			return "seta " + p[0] + " \"" + p[1] + "\"";
		}).join("\n");
		renderPerMapOutput();
	}

	// One bind per map: its six values and its name in the console, e.g.
	// bind F3 "r_filmTweakBrightness 0.18;...;r_gamma 1.2;echo ^8[Crash^8]^7"
	// No quotes inside: the game joins the words after a dvar name
	// (Dvar_GetCombinedString), so a tint needs none.
	var BIND_ORDER = [["r_filmTweakBrightness", "brightness"], ["r_filmTweakContrast", "contrast"],
		["r_filmTweakDarkTint", "dark"], ["r_filmTweakDesaturation", "desat"],
		["r_filmTweakLightTint", "light"], ["r_gamma", "gamma"]];

	// Whatever goes into a bind can never end it early or split it: no
	// quotes, semicolons or line breaks, single spaces.
	function bindSafe(text)
	{
		return String(text).replace(/["';\r\n\t]/g, "").replace(/ {2,}/g, " ").trim();
	}

	// What the console shows when a bind runs: the name in upper case,
	// spaces as "_", in the colours ^8[^9NAME^8]^7. One function for every
	// map (and the all-maps bind), so a new map needs nothing here.
	var ALL_MAPS_NAME = "All maps";

	function bindLabel(name)
	{
		return "^8[^9" + String(name).toUpperCase().replace(/\s+/g, "_") + "^8]^7";
	}

	function bindLine(settings, key, name)
	{
		var parts = BIND_ORDER.map(function (p)
		{
			var value = settings[p[1]];
			return bindSafe(p[0] + " " + (Array.isArray(value) ? vec(value) : fmt(value)));
		});
		parts.push(bindSafe("echo " + bindLabel(name)));
		return "bind " + bindSafe(key).replace(/ /g, "") + " \"" + parts.join(";") + "\"";
	}

	// Two maps on one key: the later bind replaces the earlier one.
	function duplicateKeys()
	{
		var byKey = {};
		MAPS.forEach(function (map)
		{
			var k = keys[map.id].toLowerCase();
			(byKey[k] = byKey[k] || []).push(map);
		});
		return Object.keys(byKey).filter(function (k) { return byKey[k].length > 1; }).map(function (k)
		{
			return { key: keys[byKey[k][0].id], maps: byKey[k] };
		});
	}

	function renderPerMapOutput()
	{
		if (allMaps)
		{
			dom.permapOutput.textContent = bindLine(values, allKey, ALL_MAPS_NAME);
			dom.permapWarn.hidden = true;
			return;
		}
		dom.permapOutput.textContent = MAPS.map(function (map)
		{
			return bindLine(settingsFor(map.id), keys[map.id], map.name);
		}).join(String.fromCharCode(10));
		var dups = duplicateKeys();
		var dupIds = {};
		dups.forEach(function (d) { d.maps.forEach(function (m) { dupIds[m.id] = true; }); });
		MAPS.forEach(function (map)
		{
			dom.keyFields[map.id].classList.toggle("is-invalid", dupIds[map.id] === true ||
				dom.keyFields[map.id].ftBadKey === true);
		});
		dom.permapWarn.textContent = dups.map(function (d)
		{
			return d.key + " is the key of " + d.maps.map(function (m) { return m.name; }).join(" and ") +
				": only the last of their binds stays. Give each map a key of its own.";
		}).join(" ");
		dom.permapWarn.hidden = dups.length === 0;
	}

	function renderWarnings()
	{
		var list = [];
		if (values.invert === 1 && view.promod)
		{
			list.push(["is-block", "Blocked by Promod: r_filmTweakInvert 1. Promod sets it back to 0 and blocks the " +
				"screen with \"SET R_FILMTWEAKINVERT TO 0\" while it is not. The preview shows it at 0; switch " +
				"Promod off above the preview to see the negative."]);
		}
		if (values.useTweaks === 1 && values.enable === 0)
		{
			list.push(["is-info", "Film off: with r_filmTweakEnable 0 the maps lose their own colour grading too, " +
				"so they look flatter than stock."]);
		}
		if (values.useTweaks === 0)
		{
			list.push(["is-info", "Tweaks off: the preview shows each map with its own film colours. Change a " +
				"value, or switch Use tweaks on, to see yours."]);
		}
		dom.warn.textContent = "";
		list.forEach(function (w)
		{
			dom.warn.appendChild(el("p", "ft-warn-line " + w[0], w[1]));
		});
		dom.warn.hidden = list.length === 0;
	}

	/* ---------- import ---------- */

	var BY_DVAR = {};
	ROWS.forEach(function (spec) { BY_DVAR[spec.dvar.toLowerCase()] = spec; });

	// Lines as they come: seta / set / none, quoted or not, decimal commas,
	// several on a line split by ";", or inside a bind line.
	var IMPORT_RE = /\b(r_filmTweak(?:Brightness|Contrast|DarkTint|Desaturation|Enable|Invert|LightTint)|r_filmUseTweaks|r_gamma)\b[\s"]+([^";\r\n]*)/gi;

	function importText(text)
	{
		var next = {};
		var found = [];
		var bad = [];
		var clamped = [];
		var m;
		IMPORT_RE.lastIndex = 0;
		while ((m = IMPORT_RE.exec(text)) !== null)
		{
			var spec = BY_DVAR[m[1].toLowerCase()];
			var raw = m[2].trim();
			var value = null;
			if (TINTS[spec.key] === spec)
			{
				var parts = raw.replace(/(\d),(?=\d)/g, "$1.").split(/[\s,]+/).filter(Boolean)
					.map(window.Decimal.parse);
				if (parts.length === 3 && parts.every(function (x) { return x !== null; }))
				{
					value = parts.map(function (x) { return clamp(spec, x); });
					if (value.some(function (x, i) { return x !== parts[i]; }))
					{
						clamped.push(spec.dvar);
					}
				}
			}
			else if (BOOLS[spec.key] === spec)
			{
				var b = window.Decimal.parse(raw);
				value = b === null ? null : (b !== 0 ? 1 : 0);
			}
			else
			{
				var n = window.Decimal.parse(raw);
				if (n !== null)
				{
					value = clamp(spec, n);
					if (value !== n)
					{
						clamped.push(spec.dvar);
					}
				}
			}
			if (value === null)
			{
				bad.push(spec.dvar);
				continue;
			}
			next[spec.key] = value;
			if (found.indexOf(spec.dvar) === -1)
			{
				found.push(spec.dvar);
			}
		}
		if (found.length === 0)
		{
			setHint(bad.length ? "No usable value: " + bad.join(", ") + "." :
				"No filmtweak dvars found. Paste lines such as r_filmTweakContrast \"1.8\".", true);
			return false;
		}
		setValues(next);
		var msg = "Imported " + found.length + (found.length === 1 ? " dvar" : " dvars") + ".";
		if (clamped.length)
		{
			msg += " Kept within the game's limits: " + clamped.join(", ") + ".";
		}
		if (bad.length)
		{
			msg += " Not a usable value: " + bad.join(", ") + ".";
		}
		setHint(msg, clamped.length > 0 || bad.length > 0);
		return true;
	}

	/* ---------- link ---------- */

	var SHORT = { useTweaks: "u", enable: "e", brightness: "b", contrast: "c", desat: "d", invert: "i",
		light: "l", dark: "k", gamma: "g" };

	function stateText()
	{
		var parts = ["m=" + view.map.replace(/^mp_/, "")];
		ROWS.forEach(function (spec)
		{
			var v = values[spec.key];
			parts.push(SHORT[spec.key] + "=" + (Array.isArray(v) ? v.map(fmt).join(",") : fmt(v)));
		});
		return parts.join("&");
	}

	// #cod4/filmtweaks/m=crash&b=0.18&... ; the tab bar only reads the part
	// before the second slash.
	function readLink()
	{
		var hash = String(window.location.hash);
		var at = hash.toLowerCase().indexOf(TAB_LINK + "/");
		if (at !== 0)
		{
			return false;
		}
		var text = hash.slice(TAB_LINK.length + 1);
		try
		{
			text = decodeURIComponent(text);
		}
		catch (err)
		{
			return false;
		}
		var next = {};
		var map = null;
		text.split("&").forEach(function (pair)
		{
			var eq = pair.indexOf("=");
			if (eq < 1)
			{
				return;
			}
			var name = pair.slice(0, eq).toLowerCase();
			var raw = pair.slice(eq + 1);
			if (name === "m")
			{
				map = mapById("mp_" + raw.toLowerCase());
				return;
			}
			ROWS.forEach(function (spec)
			{
				if (SHORT[spec.key] !== name)
				{
					return;
				}
				if (TINTS[spec.key] === spec)
				{
					var parts = raw.split(",").map(window.Decimal.parse);
					if (parts.length === 3 && parts.every(function (x) { return x !== null; }))
					{
						next[spec.key] = parts.map(function (x) { return clamp(spec, x); });
					}
				}
				else
				{
					var n = window.Decimal.parse(raw);
					if (n !== null)
					{
						next[spec.key] = BOOLS[spec.key] === spec ? (n !== 0 ? 1 : 0) : clamp(spec, n);
					}
				}
			});
		});
		if (map !== null)
		{
			selectMap(map.id);
		}
		setValues(next);
		return true;
	}

	function copyLink()
	{
		var link = TAB_LINK + "/" + stateText();
		try
		{
			window.history.replaceState(null, "", link);
		}
		catch (err)
		{
			// pages from disk may refuse it; the copied link is what counts
		}
		var url = String(window.location.href).split("#")[0] + link;
		copyText(url).then(function ()
		{
			setHint("Link copied: it opens this tab with these settings and this map.");
		}, function ()
		{
			setHint("Could not copy — the link is in the address bar now.", true);
		});
	}

	/* ---------- per-map setup ---------- */

	// With All maps off, the fields show the shown map's own values; every
	// change is kept for that map.
	function storePerMap()
	{
		if (!allMaps && perMap !== null)
		{
			perMap[view.map] = copyKeys(values, PER_MAP_KEYS);
		}
	}

	function loadPerMap(id)
	{
		PER_MAP_KEYS.forEach(function (key)
		{
			values[key] = Array.isArray(perMap[id][key]) ? perMap[id][key].slice() : perMap[id][key];
		});
	}

	// On: the shown map's values become the values of every map, and further
	// changes go to all of them. Off: each map has its own values again, as
	// they were before.
	function setAllMaps(on)
	{
		if (on && !allMaps)
		{
			storePerMap();
			allMaps = true;
		}
		else if (!on && allMaps)
		{
			allMaps = false;
			loadPerMap(view.map);
			refreshFields();
		}
		dom.allmapsToggle.setAttribute("aria-checked", allMaps ? "true" : "false");
		dom.allmapsState.textContent = allMaps ? "On: one bind, the same values on every map." :
			"Off: one bind per map, each with its own values.";
		dom.permapKeys.hidden = allMaps;
		dom.allmapsKey.hidden = !allMaps;
		update();
	}

	// A key field: one word without quotes or semicolons; anything else
	// keeps the last good key.
	function makeKeyField(labelText, ariaLabel, get, set)
	{
		var label = el("label", "ft-key");
		label.appendChild(el("span", "ft-key-name", labelText));
		var input = el("input", "kf-key");
		input.type = "text";
		input.value = get();
		input.spellcheck = false;
		input.autocomplete = "off";
		input.setAttribute("aria-label", ariaLabel);
		input.title = "A key name as the game writes it: F1, KP_END, MOUSE4, x";
		input.addEventListener("input", function ()
		{
			var key = input.value.trim();
			var ok = /^[^\s"';]+$/.test(key);
			input.ftBadKey = !ok;
			input.classList.toggle("is-invalid", !ok);
			if (ok)
			{
				set(key);
			}
			renderPerMapOutput();
		});
		input.addEventListener("blur", function ()
		{
			if (input.ftBadKey)
			{
				input.ftBadKey = false;
				input.value = get();
				input.classList.remove("is-invalid");
				setHint("A bind key is one word without quotes or semicolons. Kept " + get() + ".", true);
				renderPerMapOutput();
			}
		});
		label.appendChild(input);
		return { label: label, input: input };
	}

	function buildPerMap()
	{
		dom.keyFields = {};
		MAPS.forEach(function (map, i)
		{
			keys[map.id] = DEFAULT_KEYS[i];
			var field = makeKeyField(map.name, "Bind key for " + map.name,
				function () { return keys[map.id]; }, function (key) { keys[map.id] = key; });
			dom.keyFields[map.id] = field.input;
			dom.permapKeys.appendChild(field.label);
		});
		var all = makeKeyField(ALL_MAPS_NAME, "Bind key for all maps",
			function () { return allKey; }, function (key) { allKey = key; });
		dom.allmapsKey.appendChild(all.label);
		dom.allmapsToggle.addEventListener("click", function ()
		{
			setAllMaps(!allMaps);
			setHint(allMaps ? "All maps: changes now go to every map, in one bind." :
				"One bind per map again, each with the values it had.");
		});
	}

	/* ---------- view ---------- */

	function selectMap(id)
	{
		if (mapById(id) === null)
		{
			return;
		}
		storePerMap();
		view.map = id;
		if (!allMaps && perMap !== null && perMap[id])
		{
			loadPerMap(id);
			refreshFields();
			renderOutput();
			renderWarnings();
			markPreset();
		}
		dom.mapButtons.forEach(function (b)
		{
			b.setAttribute("aria-pressed", b.getAttribute("data-map") === id ? "true" : "false");
		});
		dom.presetsMap.textContent = "shown on " + mapById(id).name;
		if (started)
		{
			loadImage(id);
		}
		schedule();
	}

	function setMode(mode)
	{
		view.mode = mode;
		dom.modeButtons.forEach(function (b)
		{
			b.setAttribute("aria-pressed", b.getAttribute("data-mode") === mode ? "true" : "false");
		});
		dom.panel.classList.toggle("ft-is-grid", mode === "grid");
		dom.stage.hidden = mode === "grid";
		dom.grid.hidden = mode !== "grid";
		dom.splitBar.hidden = mode !== "split";
		dom.labels.hidden = mode !== "split";
		dom.stage.classList.toggle("is-split", mode === "split");
		placeSplit();
		schedule();
	}

	function placeSplit()
	{
		var p = (view.split * 100).toFixed(2) + "%";
		dom.splitBar.style.left = p;
		dom.splitBar.setAttribute("aria-valuenow", String(Math.round(view.split * 100)));
	}

	function setSplit(x)
	{
		view.split = Math.min(0.98, Math.max(0.02, x));
		placeSplit();
		schedule();
	}

	function wireSplit()
	{
		var dragging = false;
		var at = function (event)
		{
			var rect = dom.canvas.getBoundingClientRect();
			setSplit((event.clientX - rect.left) / rect.width);
		};
		dom.stage.addEventListener("pointerdown", function (event)
		{
			if (view.mode !== "split" || event.button !== 0)
			{
				return;
			}
			dragging = true;
			dom.stage.setPointerCapture(event.pointerId);
			at(event);
		});
		dom.stage.addEventListener("pointermove", function (event)
		{
			if (dragging)
			{
				at(event);
			}
		});
		["pointerup", "pointercancel"].forEach(function (type)
		{
			dom.stage.addEventListener(type, function () { dragging = false; });
		});
		dom.splitBar.addEventListener("keydown", function (event)
		{
			var step = event.shiftKey ? 0.1 : 0.02;
			if (event.key === "ArrowLeft" || event.key === "ArrowDown")
			{
				setSplit(view.split - step);
			}
			else if (event.key === "ArrowRight" || event.key === "ArrowUp")
			{
				setSplit(view.split + step);
			}
			else if (event.key === "Home")
			{
				setSplit(0);
			}
			else if (event.key === "End")
			{
				setSplit(1);
			}
			else
			{
				return;
			}
			event.preventDefault();
		});
	}

	function makeViewSwitch(button, key)
	{
		var sync = function ()
		{
			button.setAttribute("aria-checked", view[key] ? "true" : "false");
		};
		button.addEventListener("click", function ()
		{
			view[key] = !view[key];
			sync();
			refreshFields();
			renderWarnings();
			schedule();
		});
		sync();
	}

	function buildView()
	{
		dom.mapButtons = [];
		MAPS.forEach(function (map)
		{
			var b = el("button", "ft-map", map.name);
			b.type = "button";
			b.setAttribute("data-map", map.id);
			b.title = map.id;
			b.addEventListener("click", function () { selectMap(map.id); });
			dom.maps.appendChild(b);
			dom.mapButtons.push(b);
		});

		dom.modeButtons = Array.prototype.slice.call(dom.panel.querySelectorAll("[data-mode]"));
		dom.modeButtons.forEach(function (b)
		{
			b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
		});

		dom.tiles = {};
		MAPS.forEach(function (map)
		{
			var tile = el("button", "ft-tile");
			tile.type = "button";
			tile.title = "Open " + map.name;
			var canvas = el("canvas", "ft-tile-canvas");
			canvas.width = IMAGE_W / 2;
			canvas.height = IMAGE_H / 2;
			var ctx = canvas.getContext("2d");
			ctx.imageSmoothingQuality = "high";
			tile.appendChild(canvas);
			tile.appendChild(el("span", "ft-tile-name", map.name));
			tile.addEventListener("click", function ()
			{
				selectMap(map.id);
				setMode("single");
			});
			dom.grid.appendChild(tile);
			dom.tiles[map.id] = { canvas: canvas, ctx: ctx };
		});

		// Under the maps, across the grid: the numbers of all five, a column
		// each, with your settings and with the map's own film.
		var summary = el("div", "ft-summary");
		var table = el("table", "ft-summary-table");
		var caption = el("caption", "ft-summary-title", "Darkest quarter of the picture (0 black, 1 white) and " +
			"how much is cut at white");
		table.appendChild(caption);
		var head = el("tr");
		head.appendChild(el("th", "", ""));
		MAPS.forEach(function (map) { head.appendChild(el("th", "", map.name)); });
		var thead = el("thead");
		thead.appendChild(head);
		table.appendChild(thead);
		var tbody = el("tbody");
		var rows = [["Shadows", ""], ["own film", "ft-summary-own"], ["Cut at white", ""]].map(function (r)
		{
			var tr = el("tr", r[1]);
			tr.appendChild(el("th", "", r[0]));
			tbody.appendChild(tr);
			return tr;
		});
		dom.summaryRows = {};
		MAPS.forEach(function (map)
		{
			dom.summaryRows[map.id] = rows.map(function (tr)
			{
				var td = el("td");
				tr.appendChild(td);
				return td;
			});
		});
		table.appendChild(tbody);
		summary.appendChild(table);
		dom.grid.appendChild(summary);

		dom.canvas.width = IMAGE_W;
		dom.canvas.height = IMAGE_H;
		dom.ctx = dom.canvas.getContext("2d");
		dom.ctx.imageSmoothingQuality = "high";

		makeViewSwitch(document.getElementById("ft-promod"), "promod");
		makeViewSwitch(document.getElementById("ft-showgamma"), "gamma");
		makeViewSwitch(document.getElementById("ft-clip"), "clip");
		wireSplit();
	}

	/* ---------- wiring ---------- */

	// Defaults, limits and the cheat flag from the dvars tab's data.
	function readDvarData()
	{
		var data = {};
		(window.COD4_DVARS || []).forEach(function (e) { data[e.n.toLowerCase()] = e; });
		ROWS.forEach(function (spec)
		{
			var e = data[spec.dvar.toLowerCase()];
			if (!e)
			{
				return;
			}
			spec.cheat = e.c === true;
			if (typeof e.mn === "number" && typeof e.mx === "number")
			{
				spec.min = e.mn;
				spec.max = e.mx;
			}
			if (Array.isArray(spec.def) && typeof e.d === "string")
			{
				var parts = e.d.split(/\s+/).map(Number);
				if (parts.length === 3 && parts.every(isFinite))
				{
					spec.def = parts;
				}
			}
			else if (typeof e.d === "number")
			{
				spec.def = e.d;
			}
		});
	}

	function wireCopy(buttonId, source, what)
	{
		document.getElementById(buttonId).addEventListener("click", function ()
		{
			var text = source().textContent;
			copyText(text).then(function ()
			{
				var n = text.split("\n").length;
				setHint(n + " " + what + (n === 1 ? "" : "s") + " copied.");
			}, function ()
			{
				setHint("Could not copy — select the text and copy it by hand.", true);
			});
		});
	}

	function init()
	{
		var panel = document.getElementById("panel-ft");
		if (panel === null)
		{
			return;
		}
		dom.panel = panel;
		["controls", "presets", "maps", "stage", "canvas", "grid", "status", "note", "output", "warn",
			"split", "labels", "import", "allmaps-toggle", "allmaps-state", "allmaps-key", "permap-keys", "permap-output",
			"permap-warn"]
			.forEach(function (name)
			{
				dom[name.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] =
					document.getElementById("ft-" + name);
			});
		dom.splitBar = dom.split;
		setHint = window.UI.hint(document.getElementById("ft-hint"));

		readDvarData();
		values = defaults();
		// every map starts with the game's defaults of its own
		perMap = {};
		MAPS.forEach(function (map) { perMap[map.id] = copyKeys(values, PER_MAP_KEYS); });
		ROWS.forEach(function (spec) { dom.controls.appendChild(makeRow(spec)); });
		buildPresets();
		dom.presetsBox = dom.presets.parentNode;
		dom.presetsMap = el("span", "ft-presets-map");
		dom.presetsBox.querySelector("summary").appendChild(dom.presetsMap);
		dom.presetsBox.addEventListener("toggle", schedule);
		buildView();
		buildPerMap();

		document.getElementById("ft-reset").addEventListener("click", function ()
		{
			setValues(defaults());
			setHint("Reset to the game's defaults.");
		});
		document.getElementById("ft-random").addEventListener("click", randomize);
		document.getElementById("ft-finetune").addEventListener("click", fineTune);
		document.getElementById("ft-link").addEventListener("click", copyLink);
		document.getElementById("ft-import-go").addEventListener("click", function ()
		{
			importText(dom.import.value);
		});
		wireCopy("ft-copy", function () { return dom.output; }, "config line");
		wireCopy("ft-copy-permap", function () { return dom.permapOutput; }, "bind line");

		selectMap(DEFAULT_MAP);
		setMode("single");
		refreshFields();
		update();
		readLink();

		window.addEventListener("hashchange", function () { readLink(); });

		var tab = document.getElementById("tab-ft");
		var list = tab !== null ? tab.parentNode : null;
		if (list !== null)
		{
			list.addEventListener("tabchange", function ()
			{
				if (!panel.hidden)
				{
					start();
					schedule();
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
