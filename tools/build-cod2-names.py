"""Builds the data of the "name generator" tab of the CoD2 section.

    python tools/build-cod2-names.py --cod2 C:\\Games\\CoD2 --cod2x C:\\path\\to\\CoD2x --zpam C:\\path\\to\\zpam3

Python 3.10+, standard library only. Writes js/cod2/name-data.js (or --out):
window.COD2_NAMES, and prints a summary.

Only these three folders are read; nothing from CoD4. Every value is read
from them here, and the build stops if one of them is not where it should be.
The proofs (file and line, or offset) go into the data; the page does not
show them.

stock CoD2 1.3
  gfx_d3d_mp_x86_s.dll
                     the colors of ^0..^7: the renderer's RGBA table, found
                     through the code that reads it (index < 8); the same
                     code sends ^8 and ^9 to two colors set at runtime.
  <cod2x>/src/other/Call_of_Duty_2_Multiplayer_MAC_1.3.c
                     the Mac 1.3 build's decompile, with names: CL_UpdateColor
                     fills ^8 / ^9 from g_TeamColor_Allies / g_TeamColor_Axis;
                     ClientCleanName; Info_SetValueForKey.
  <cod2x>/src/other/CoD2MP_s.c
                     CoD2x's decompile of CoD2MP_s.exe: the name clean-up
                     and its buffer of 32 bytes (31 characters).
  main/iw_07.iwd     maps/mp/gametypes/_scoreboard.gsc: the team colors.
  main/iw_00.iwd     fonts/normalFont: the glyphs (metrics, texture rectangle).
  main/iw_09.iwd     images/gamefonts.iwi: the font texture (DXT5), decoded
                     here and cut down to the glyphs normalFont uses.
zPAM                <zpam>/source/maps/mp/gametypes/_callbacksetup.gsc: what
                     zPAM does with empty names and "[{...}]".
"""

import argparse
import base64
import json
import os
import re
import struct
import zipfile
import zlib

MAC = "src/other/Call_of_Duty_2_Multiplayer_MAC_1.3.c"
WIN = "src/other/CoD2MP_s.c"


def lines_of(path):
	with open(path, encoding="latin-1") as fh:
		return fh.read().split("\n")


def find_line(lines, label, needle, start=0):
	for i in range(start, len(lines)):
		if needle in lines[i]:
			return i, "%s:%d" % (label, i + 1)
	raise SystemExit("not found in %s: %s" % (label, needle))


class PE:
	def __init__(self, data):
		self.data = data
		pe = struct.unpack_from("<I", data, 0x3C)[0]
		count = struct.unpack_from("<H", data, pe + 6)[0]
		opt = struct.unpack_from("<H", data, pe + 20)[0]
		self.base = struct.unpack_from("<I", data, pe + 24 + 28)[0]
		self.sections = []
		for k in range(count):
			o = pe + 24 + opt + 40 * k
			vsize, va, rsize, raw = struct.unpack_from("<IIII", data, o + 8)
			self.sections.append((va, rsize, raw))

	def offset(self, va):
		rva = va - self.base
		for start, size, raw in self.sections:
			if start <= rva < start + size:
				return rva - start + raw
		raise SystemExit("address not in a section: 0x%x" % va)


def palette(cod2):
	"""^0..^7 from the renderer's table. The lookup reads it only below 8:
	    movzx eax, al / cmp eax, 8 / jae / mov eax, [eax*4 + table]
	and past the jump compares the code with '8' and '9'."""
	name = "gfx_d3d_mp_x86_s.dll"
	data = open(os.path.join(cod2, name), "rb").read()
	pe = PE(data)
	m = re.search(rb"\x0f\xb6\xc0\x83\xf8\x08\x73\x0a\x8b\x04\x85(....)\x89\x01\xc3\x0f\xb6\xc2\x83\xe8\x38\x74.\x48\x74", data, re.S)
	if not m:
		raise SystemExit("color lookup not found in " + name)
	table = pe.offset(struct.unpack("<I", m.group(1))[0])
	colors = []
	for i in range(8):
		r, g, b, a = data[table + 4 * i:table + 4 * i + 4]
		colors.append({ "code": str(i), "rgb": [r, g, b], "proof": "%s@0x%x" % (name, table + 4 * i) })
	code_proof = "%s@0x%x" % (name, m.start() + 3)
	return colors, code_proof


def team_colors(cod2, mac_lines):
	"""^8 / ^9: the client hands g_TeamColor_Allies / _Axis to the renderer;
	the stock scoreboard script sets them per map."""
	_, update = find_line(mac_lines, "Call_of_Duty_2_Multiplayer_MAC_1.3.c", "CL_UpdateColor/*DEFINITION*/")
	_, lookup8 = find_line(mac_lines, "Call_of_Duty_2_Multiplayer_MAC_1.3.c", "if ( v14 == 56 )")
	member = "maps/mp/gametypes/_scoreboard.gsc"
	text = zipfile.ZipFile(os.path.join(cod2, "main", "iw_07.iwd")).read(member).decode("latin-1").split("\n")
	allies = []
	axis = None
	case = None
	for i, line in enumerate(text):
		c = re.match(r'\s*(case\s+"(\w+)"|default)\s*:', line)
		if c:
			case = c.group(2) or "russian"
			continue
		m = re.search(r'setcvar\("g_TeamColor_(Allies|Axis)",\s*"([\d. ]+)"\)', line)
		if not m:
			continue
		rgb = [round(float(v) * 255) for v in m.group(2).split()]
		proof = "iw_07.iwd:%s:%d" % (member, i + 1)
		if m.group(1) == "Allies":
			allies.append({ "id": case, "name": case.capitalize(), "rgb": rgb, "proof": proof })
		else:
			axis = { "id": "german", "name": "German", "rgb": rgb, "proof": proof }
	if len(allies) != 3 or axis is None:
		raise SystemExit("team colors not found in " + member)
	return { "allies": allies, "axis": axis, "proof": [update, lookup8] }


def name_rules(cod2x, zpam, mac_lines):
	"""Proofs of the rules js/cod2/namegen.js applies; the build stops if one moved."""
	win = lines_of(os.path.join(cod2x, WIN))
	w, clean = find_line(win, "CoD2MP_s.c", 'strncpy(v10, "UnnamedPlayer", v4 - 1)')
	_, size = find_line(win, "CoD2MP_s.c", "(v1 + 9992, v4, 32)")
	_, zero = find_line(win, "CoD2MP_s.c", "!= 48 )", max(0, w - 60))
	_, mac_clean = find_line(mac_lines, "Call_of_Duty_2_Multiplayer_MAC_1.3.c", "ClientCleanName/*DEFINITION*/")
	_, info = find_line(mac_lines, "Call_of_Duty_2_Multiplayer_MAC_1.3.c", "if ( v9 != 34 && v9 != 59 && v9 != 92 )")
	_, color_index = find_line(mac_lines, "Call_of_Duty_2_Multiplayer_MAC_1.3.c", "ColorIndex/*DEFINITION*/")
	_, name_dvar = find_line(mac_lines, "Call_of_Duty_2_Multiplayer_MAC_1.3.c", '"name", "Unknown Soldier", 0x1003u')
	cb = "source/maps/mp/gametypes/_callbacksetup.gsc"
	zl = lines_of(os.path.join(zpam, cb))
	_, empty = find_line(zl, "zpam/" + cb, 'kicked due to using empty name!')
	_, braces = find_line(zl, "zpam/" + cb, 'Using [{}] in name is not allowed!')
	return {
		"maxBytes": 31,
		"proof": {
			"clean": [clean, mac_clean],
			"maxBytes": size,
			"zeroDropped": zero,
			"stripped": info,
			"colorIndex": color_index,
			"nameDvar": name_dvar,
			"zpamEmpty": empty,
			"zpamBraces": braces
		}
	}


def decode_dxt5(data, w, h):
	"""Alpha of a DXT5 image; the font's color is white throughout."""
	alpha = bytearray(w * h)
	bw = w // 4
	for by in range(h // 4):
		for bx in range(bw):
			o = (by * bw + bx) * 16
			a0, a1 = data[o], data[o + 1]
			if a0 > a1:
				al = [a0, a1] + [((7 - i) * a0 + i * a1) // 7 for i in range(1, 7)]
			else:
				al = [a0, a1] + [((5 - i) * a0 + i * a1) // 5 for i in range(1, 5)] + [0, 255]
			bits = int.from_bytes(data[o + 2:o + 8], "little")
			for i in range(16):
				alpha[(by * 4 + i // 4) * w + bx * 4 + i % 4] = al[(bits >> (3 * i)) & 7]
	return alpha


def png_gray_alpha(w, h, alpha):
	raw = b"".join(b"\0" + bytes(v for a in alpha[y * w:(y + 1) * w] for v in (255, a)) for y in range(h))

	def chunk(kind, body):
		return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

	return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 4, 0, 0, 0))
		+ chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def font(cod2):
	"""normalFont's glyphs, cut out of gamefonts.iwi and packed into a small atlas.
	Per glyph: [atlas x, y, w, h (fractional, as the texture coordinates give them),
	x0, y0 (offset from pen and baseline), advance, pixel width, pixel height]."""
	member = "fonts/normalFont"
	f = zipfile.ZipFile(os.path.join(cod2, "main", "iw_00.iwd")).read(member)
	height, count = struct.unpack_from("<II", f, 4)
	material = f[struct.unpack_from("<I", f, 12)[0]:].split(b"\0")[0].decode()
	if material != "fonts/gamefonts":
		raise SystemExit("unexpected font material: " + material)

	iwi_name = "images/gamefonts.iwi"
	iwi = zipfile.ZipFile(os.path.join(cod2, "main", "iw_09.iwd")).read(iwi_name)
	if iwi[:3] != b"IWi" or iwi[3] != 5 or iwi[4] != 0x0D:
		raise SystemExit("gamefonts.iwi is not a version 5 DXT5 image")
	tw, th = struct.unpack_from("<HH", iwi, 6)
	alpha = decode_dxt5(iwi[len(iwi) - tw * th:], tw, th)

	glyphs = []
	for k in range(count):
		code, x0, y0, dx, pw, ph = struct.unpack_from("<HbbbBB", f, 16 + 24 * k)
		s0, t0, s1, t1 = struct.unpack_from("<4f", f, 16 + 24 * k + 8)
		glyphs.append((code, x0, y0, dx, pw, ph, s0 * tw, t0 * th, s1 * tw, t1 * th))

	# Shelf packing, tallest first; one pixel of the source around each glyph
	# keeps the bilinear filtering at the edges as it is in game.
	width = 256
	rects = []
	for g in glyphs:
		if g[4] == 0 or g[5] == 0:
			rects.append(None)
			continue
		sx, sy = int(g[6]) - 1, int(g[7]) - 1
		ex, ey = int(-(-g[8] // 1)) + 1, int(-(-g[9] // 1)) + 1
		rects.append((sx, sy, ex - sx, ey - sy))
	order = sorted((i for i, r in enumerate(rects) if r), key=lambda i: -rects[i][3])
	place = {}
	x = y = row = 0
	for i in order:
		rw, rh = rects[i][2], rects[i][3]
		if x + rw > width:
			x, y, row = 0, y + row, 0
		place[i] = (x, y)
		x += rw
		row = max(row, rh)
	atlas_h = y + row
	atlas = bytearray(width * atlas_h)
	for i, (px, py) in place.items():
		sx, sy, rw, rh = rects[i]
		for yy in range(rh):
			for xx in range(rw):
				atlas[(py + yy) * width + px + xx] = alpha[(sy + yy) * tw + sx + xx]

	out = {}
	for i, g in enumerate(glyphs):
		code, x0, y0, dx, pw, ph, s0, t0, s1, t1 = g
		try:
			char = bytes([code]).decode("cp1252")
		except UnicodeDecodeError:
			continue
		if i in place:
			px, py = place[i]
			sx, sy = rects[i][0], rects[i][1]
			src = [round(px + s0 - sx, 3), round(py + t0 - sy, 3), round(s1 - s0, 3), round(t1 - t0, 3)]
		else:
			src = [0, 0, 0, 0]
		out[char] = src + [x0, y0, dx, pw, ph]

	return {
		"height": height,
		"glyphs": out,
		"atlas": "data:image/png;base64," + base64.b64encode(png_gray_alpha(width, atlas_h, atlas)).decode(),
		"proof": ["iw_00.iwd:" + member, "iw_09.iwd:" + iwi_name + " (%dx%d DXT5)" % (tw, th)]
	}


HEADER = """/*
 * CoD2 player names: colors, team colors, name rules and the game's normalFont.
 * Generated by tools/build-cod2-names.py; do not edit by hand.
 *
 * colors: ^0..^7 as the renderer draws them; teams: what ^8 (allies) and ^9 (axis)
 * show, set per map by the scoreboard script; rules: limits the name clean-up
 * applies (the logic is in js/cod2/namegen.js); font: glyphs keyed by character
 * (Windows-1252), [x, y, w, h in the atlas, x0, y0, advance, width, height].
 * proof: file:line or file@offset; not shown.
 */
"""


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--cod2", required=True, help="CoD2 1.3 install (gfx_d3d_mp_x86_s.dll, main/)")
	ap.add_argument("--cod2x", required=True, help="CoD2x source checkout")
	ap.add_argument("--zpam", required=True, help="zPAM (zpam3) source checkout")
	ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "cod2",
		"name-data.js"), help="where the data goes (default: js/cod2/name-data.js)")
	args = ap.parse_args()

	mac_lines = lines_of(os.path.join(args.cod2x, MAC))
	colors, lookup = palette(args.cod2)
	data = {
		"colors": colors,
		"colorLookup": lookup,
		"teams": team_colors(args.cod2, mac_lines),
		"rules": name_rules(args.cod2x, args.zpam, mac_lines),
		"font": font(args.cod2)
	}

	with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
		fh.write(HEADER)
		fh.write("window.COD2_NAMES = ")
		json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
		fh.write(";\n")

	print("colors: " + ", ".join("^%s %s" % (c["code"], c["rgb"]) for c in colors))
	print("allies: " + ", ".join("%s %s" % (t["name"], t["rgb"]) for t in data["teams"]["allies"])
		+ "; axis: %s" % data["teams"]["axis"]["rgb"])
	print("glyphs: %d, atlas %d bytes" % (len(data["font"]["glyphs"]), len(data["font"]["atlas"])))
	print("wrote " + os.path.normpath(args.out) + " (%d bytes)" % os.path.getsize(args.out))


if __name__ == "__main__":
	main()
