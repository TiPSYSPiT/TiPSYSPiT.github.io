/*
 * CoD4 filmtweaks: the 360 degree spots of the live preview.
 *
 * Each spot is a cube of six 90 degree views, rendered by the CoD4 demo
 * viewer's 3D map (lightmaps, light grid, sun shadows, fog, sky) from one
 * place on the map, with no film pass. A frame is drawn in two passes, the
 * way the game draws its own: the view into an 8 bit picture first, then
 * the film pass over that picture - the preview's own shaders and
 * constants (filmtweaks.js hands them in), so the colours are the same as
 * in the flat preview.
 *
 * Plain script, no modules: also works from disk (file://).
 */
(function ()
{
	"use strict";

	// A ray per pixel into the cube map, drawn upside down into the frame
	// buffer, so its first row is the picture's top row, as in an image the
	// film pass reads. The cube's faces are stored in WebGL cube map space,
	// which is the world (z up) as (x, z, -y).
	var PANO_VERTEX =
		"attribute vec2 a_pos;\n" +
		"varying vec2 v_ndc;\n" +
		"void main()\n" +
		"{\n" +
		"\tv_ndc = a_pos;\n" +
		"\tgl_Position = vec4(a_pos.x, -a_pos.y, 0.0, 1.0);\n" +
		"}\n";

	var PANO_FRAGMENT =
		"uniform samplerCube u_cube;\n" +
		"uniform vec3 u_f;\n" +
		"uniform vec3 u_r;\n" +
		"uniform vec3 u_u;\n" +
		"uniform vec2 u_tan;\n" +
		"varying vec2 v_ndc;\n" +
		"void main()\n" +
		"{\n" +
		"\tvec3 d = u_f + v_ndc.x * u_tan.x * u_r + v_ndc.y * u_tan.y * u_u;\n" +
		"\tgl_FragColor = vec4(textureCube(u_cube, vec3(d.x, d.z, -d.y)).rgb, 1.0);\n" +
		"}\n";

	// The longest side drawn, so a large screen does not cost more than it shows.
	var MAX_W = 2560;

	function create(filmVertex, filmFragment)
	{
		var canvas = document.createElement("canvas");
		var opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
			preserveDrawingBuffer: true };
		var gl = null;
		var gl2 = false;
		try
		{
			gl = canvas.getContext("webgl2", opts);
			gl2 = gl !== null;
			if (gl === null)
			{
				gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
			}
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

		function program(vertexText, fragmentText, names)
		{
			var compile = function (type, source)
			{
				var shader = gl.createShader(type);
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
			};
			var vs = compile(gl.VERTEX_SHADER, vertexText);
			var fs = compile(gl.FRAGMENT_SHADER, "precision " + precision + " float;\n" + fragmentText);
			if (vs === null || fs === null)
			{
				return null;
			}
			var p = gl.createProgram();
			gl.attachShader(p, vs);
			gl.attachShader(p, fs);
			gl.bindAttribLocation(p, 0, "a_pos");
			gl.linkProgram(p);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS))
			{
				return null;
			}
			var u = { program: p };
			names.forEach(function (name) { u[name] = gl.getUniformLocation(p, name); });
			return u;
		}

		var pano = program(PANO_VERTEX, PANO_FRAGMENT, ["u_cube", "u_f", "u_r", "u_u", "u_tan"]);
		var film = program(filmVertex, filmFragment, ["u_image", "u_bias", "u_base", "u_delta", "u_gamma", "u_clip"]);
		if (pano === null || film === null)
		{
			return null;
		}

		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		// The 8 bit picture between the two passes.
		var picture = gl.createTexture();
		var frameBuffer = gl.createFramebuffer();
		var picW = 0;
		var picH = 0;

		function sizePicture(w, h)
		{
			if (w === picW && h === picH)
			{
				return;
			}
			picW = w;
			picH = h;
			gl.bindTexture(gl.TEXTURE_2D, picture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, picture, 0);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}

		var cubes = {};
		var maxCube = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE) || 0;

		return {
			canvas: canvas,
			maxFace: maxCube,
			has: function (key) { return cubes.hasOwnProperty(key); },
			keys: function () { return Object.keys(cubes); },
			drop: function (key)
			{
				if (cubes[key])
				{
					gl.deleteTexture(cubes[key]);
					delete cubes[key];
				}
			},

			// The six faces at size x size: from the pixels a 2D canvas
			// decodes (as the flat preview does), smaller when asked.
			upload: function (key, faces, size)
			{
				// (an error left from before is not this upload's)
				for (var e = 0; e < 8 && gl.getError() !== gl.NO_ERROR; e++)
				{
					continue;
				}
				var tmp = document.createElement("canvas");
				tmp.width = size;
				tmp.height = size;
				var ctx = tmp.getContext("2d");
				ctx.imageSmoothingQuality = "high";
				var tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
				for (var i = 0; i < 6; i++)
				{
					ctx.drawImage(faces[i], 0, 0, size, size);
					var pixels = ctx.getImageData(0, 0, size, size);
					gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, size, size, 0, gl.RGBA,
						gl.UNSIGNED_BYTE, new Uint8Array(pixels.data.buffer));
				}
				gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				// mipmaps keep a wide view from shimmering; WebGL 1 has them
				// only for power-of-two sizes
				if (gl2 || (size & (size - 1)) === 0)
				{
					gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
					gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
				}
				else
				{
					gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				}
				cubes[key] = tex;
				return gl.getError() === gl.NO_ERROR;
			},

			// The view (yaw, pitch in degrees, z up; fov across) at w x h,
			// then the film pass per part: [{ pass, x0, x1 }] in pixels.
			draw: function (key, cam, w, h, parts, clip)
			{
				if (w > MAX_W)
				{
					h = Math.round(h * MAX_W / w);
					w = MAX_W;
				}
				if (canvas.width !== w || canvas.height !== h)
				{
					canvas.width = w;
					canvas.height = h;
				}
				sizePicture(w, h);
				var yaw = cam.yaw * Math.PI / 180;
				var pitch = cam.pitch * Math.PI / 180;
				var f = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
				var r = [Math.sin(yaw), -Math.cos(yaw), 0];
				var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
				var t = Math.tan(cam.fov * Math.PI / 360);

				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
				gl.viewport(0, 0, w, h);
				gl.useProgram(pano.program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubes[key]);
				gl.uniform1i(pano.u_cube, 0);
				gl.uniform3f(pano.u_f, f[0], f[1], f[2]);
				gl.uniform3f(pano.u_r, r[0], r[1], r[2]);
				gl.uniform3f(pano.u_u, u[0], u[1], u[2]);
				gl.uniform2f(pano.u_tan, t, t * h / w);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.viewport(0, 0, w, h);
				gl.useProgram(film.program);
				gl.bindTexture(gl.TEXTURE_2D, picture);
				gl.uniform1i(film.u_image, 0);
				gl.uniform1f(film.u_clip, clip ? 1 : 0);
				gl.enable(gl.SCISSOR_TEST);
				parts.forEach(function (part)
				{
					var k = part.pass.k;
					var x0 = Math.round(part.x0 * w);
					var x1 = Math.round(part.x1 * w);
					if (x1 <= x0)
					{
						return;
					}
					gl.scissor(x0, 0, x1 - x0, h);
					gl.uniform4f(film.u_bias, k.bias, k.bias, k.bias, k.w);
					gl.uniform3f(film.u_base, k.base[0], k.base[1], k.base[2]);
					gl.uniform3f(film.u_delta, k.delta[0], k.delta[1], k.delta[2]);
					gl.uniform1f(film.u_gamma, part.pass.gammaExp);
					gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				});
				gl.disable(gl.SCISSOR_TEST);
				return canvas;
			}
		};
	}

	window.FilmtweakPano = { create: create };
})();
