"""Builds the data and images of the "maps" tab of the CoD2 section.

    python tools/build-cod2-maps.py --cod2 C:\\Games\\CoD2 --zpam C:\\path\\to\\zpam3 --cod2demo C:\\path\\to\\cod2-demo

Python 3.10+ with Pillow. Writes js/cod2/maps-data.js (window.COD2_MAPS), the
images in assets/cod2/maps/ and, for the tactics board, one script per map in
js/cod2/maps/ with its overhead images as data URLs; and prints a summary.

Only CoD2 sources; nothing from CoD4.
stock CoD2 1.3
  main/iw_*.iwd      mp/CoD2maps.arena (the maps and their names),
                     maps/mp/<map>.gsc (the sides), images/loadscreen_<map>.iwi (DXT1).
zPAM                source/maps/mp/<map>.gsc: kill triggers it can remove and
                     the switch from Russians to British; gametypes/global/pam.gsc:
                     the _fix versions it switches to; maps/mp/<map>.radar and
                     source/images/radar_<map>.iwi: its radar image (DXT3).
cod2-demo           maps3d/<map>/topdown.webp: the map rendered from above by the
                     CoD2 demo viewer's export, from the game's own map files;
                     assets/maps/backgrounds.js: the world rectangle [minX, minY,
                     maxX, maxY] each top-down and radar image covers (the scale
                     of the tactics board).

Grenades (js/cod2/grenades-data.js): weapons/mp/frag_grenade_<nation>_mp and
smoke_grenade_<nation>_mp (displayName, hudIcon, explosionRadius, fuseTime),
the hudIcon material's image (images/<name>.iwi) and its English name from
localized_english_*.iwd localizedstrings/weapon.str.

The loadscreen is a square texture the game stretches to 4:3, so it is
written at 4:3 here too. The radar image keeps the orientation of the top-down
render; zPAM's HUD turns it by the angle in its .radar file.
"""

import argparse
import base64
import glob
import io
import json
import os
import re
import struct
import zipfile

from PIL import Image

LOADSCREEN = [(1024, 768, "loadscreen"), (480, 360, "loadscreen-small")]
OVERHEAD = 768
BOARD = 1024        # the tactics board's images, sharper for a full screen
QUALITY = 80


def data_url(im):
	"""A WebP data URL: the tactics board draws it into a canvas, and a data URL keeps
	that canvas exportable on file://, where every file counts as another origin."""
	buf = io.BytesIO()
	im.save(buf, "WEBP", quality=QUALITY, method=6)
	return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def iwi_image(data):
	"""A version 5 .iwi (DXT1/3/5) as a Pillow image, through a DDS header."""
	if data[:3] != b"IWi" or data[3] != 5:
		raise ValueError("not a version 5 iwi")
	w, h = struct.unpack_from("<HH", data, 6)
	fmt = data[4]
	four = { 0x0B: b"DXT1", 0x0C: b"DXT3", 0x0D: b"DXT5" }[fmt]
	size = w * h // 2 if fmt == 0x0B else w * h
	mip0 = data[len(data) - size:]
	pf = struct.pack("<II4sIIIII", 32, 4, four, 0, 0, 0, 0, 0)
	head = b"DDS " + struct.pack("<IIIIIII", 124, 0x81007, h, w, size, 0, 1) + b"\0" * 44 + pf + struct.pack("<IIIII", 0x1000, 0, 0, 0, 0)
	im = Image.open(io.BytesIO(head + mip0))
	im.load()
	return im


def arena(text):
	maps = []
	for m in re.finditer(r"\{(.*?)\}", text, re.S):
		fields = dict(re.findall(r'(\w+)\s+"([^"]*)"', m.group(1)))
		if "map" in fields:
			maps.append((fields, text.count("\n", 0, m.start()) + 1))
	return maps


class Iwds:
	"""The game's .iwd files; a later file wins, as in the game."""

	def __init__(self, cod2):
		self.files = [zipfile.ZipFile(p) for p in sorted(glob.glob(os.path.join(cod2, "main", "iw_*.iwd")))]

	def find(self, member):
		for z in reversed(self.files):
			try:
				return z.read(member), os.path.basename(z.filename)
			except KeyError:
				continue
		return None, None


def weapon_file(data):
	r"""A weapons/mp/ file: WEAPONFILE\key\value\..."""
	t = data.decode("latin-1").split("\\")
	return dict(zip(t[1::2], t[2::2]))


def png_url(im):
	buf = io.BytesIO()
	im.save(buf, "PNG", optimize=True)
	return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def localized(cod2, file):
	"""REFERENCE -> (English text, iwd, line) of localizedstrings/<file> in the English iwds."""
	out = {}
	for p in sorted(glob.glob(os.path.join(cod2, "main", "localized_english_iw*.iwd"))):
		z = zipfile.ZipFile(p)
		try:
			text = z.read("localizedstrings/" + file).decode("latin-1")
		except KeyError:
			continue
		for m in re.finditer(r'REFERENCE\s+(\S+)\s*\n\s*LANG_ENGLISH\s+"([^"]*)"', text):
			out[m.group(1)] = (m.group(2), os.path.basename(p), text.count("\n", 0, m.start()) + 1)
	return out


def grenades(iwds, cod2):
	"""Frag and smoke grenade of each nation: English name, HUD icon, radius, fuse."""
	strings = localized(cod2, "weapon.str")
	out = {"icons": {}}
	for kind in ("frag", "smoke"):
		out[kind] = {}
		for nation in ("american", "british", "russian", "german"):
			member = "weapons/mp/%s_grenade_%s_mp" % (kind, nation)
			data, iwd = iwds.find(member)
			if data is None:
				raise SystemExit("no " + member)
			w = weapon_file(data)
			ref = w["displayName"].split("WEAPON_", 1)[1]
			if ref not in strings:
				raise SystemExit("no English name for " + w["displayName"])
			name, str_iwd, str_line = strings[ref]
			material = w["hudIcon"]
			mat, mat_iwd = iwds.find("materials/" + material)
			if mat is None:
				raise SystemExit("no material " + material)
			words = [x.decode() for x in re.findall(rb"[ -~]{3,}", mat)]
			image = words[words.index("colorMap") - 1]
			iwi, iwi_iwd = iwds.find("images/%s.iwi" % image)
			out[kind][nation] = {
				"name": name,
				"icon": image,
				"radius": float(w.get("explosionRadius", 0)),
				"fuse": float(w.get("fuseTime", 0)),
				"proof": ["%s:%s" % (iwd, member), "%s:localizedstrings/weapon.str:%d" % (str_iwd, str_line),
					"%s:materials/%s" % (mat_iwd, material), "%s:images/%s.iwi" % (iwi_iwd, image)]
			}
			if image not in out["icons"]:
				out["icons"][image] = png_url(iwi_image(iwi).convert("RGBA"))
	return out


def backgrounds(cod2demo):
	"""cod2-demo's world rectangles of the top-down and radar images, per map."""
	text = open(os.path.join(cod2demo, "assets", "maps", "backgrounds.js"), encoding="utf-8").read()
	key = "Object.assign(C2.maps.BACKGROUNDS,"
	rest = text[text.index(key) + len(key):]
	obj, _ = json.JSONDecoder().raw_decode(rest.lstrip())
	return obj


def save_webp(im, path):
	im.save(path, "WEBP", quality=QUALITY, method=6)
	return os.path.getsize(path)


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--cod2", required=True, help="CoD2 1.3 install (main/)")
	ap.add_argument("--zpam", required=True, help="zPAM (zpam3) source checkout")
	ap.add_argument("--cod2demo", required=True, help="cod2-demo checkout (maps3d/<map>/topdown.webp)")
	root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
	ap.add_argument("--out", default=os.path.join(root, "js", "cod2", "maps-data.js"))
	ap.add_argument("--images", default=os.path.join(root, "assets", "cod2", "maps"))
	ap.add_argument("--scripts", default=os.path.join(root, "js", "cod2", "maps"))
	ap.add_argument("--grenades", default=os.path.join(root, "js", "cod2", "grenades-data.js"))
	args = ap.parse_args()
	os.makedirs(args.images, exist_ok=True)
	os.makedirs(args.scripts, exist_ok=True)

	iwds = Iwds(args.cod2)
	text, iwd = iwds.find("mp/CoD2maps.arena")
	stock = arena(text.decode("latin-1"))

	pam = open(os.path.join(args.zpam, "source", "maps", "mp", "gametypes", "global", "pam.gsc"), encoding="latin-1").read().split("\n")
	fixes = {}
	for i, line in enumerate(pam):
		m = re.search(r'level\.mapname == "(\w+)"\) map = "(\w+)"', line)
		if m:
			fixes[m.group(1)] = (m.group(2), "zpam/source/maps/mp/gametypes/global/pam.gsc:%d" % (i + 1))

	world = backgrounds(args.cod2demo)
	maps = []
	total = 0
	for fields, line in stock:
		mid = fields["map"]
		entry = {
			"id": mid,
			"name": fields["longname"],
			"proof": ["%s:mp/CoD2maps.arena:%d" % (iwd, line)]
		}

		# The sides the map script picks: the allies and axis nation and who attacks in S&D.
		gsc, gsc_iwd = iwds.find("maps/mp/%s.gsc" % mid)
		sides = dict(re.findall(r'game\["(allies|axis|attackers|defenders)"\]\s*=\s*"(\w+)"', gsc.decode("latin-1") if gsc else ""))
		if not all(k in sides for k in ("allies", "axis", "attackers", "defenders")):
			raise SystemExit("no sides for " + mid)
		for k in ("allies", "axis", "attackers", "defenders"):
			entry[k] = sides[k]
		entry["proof"].append("%s:maps/mp/%s.gsc" % (gsc_iwd, mid))

		# zPAM.
		zp = {}
		if mid in fixes:
			zp["fix"] = fixes[mid][0]
			zp["fixProof"] = fixes[mid][1]
		zgsc_path = os.path.join(args.zpam, "source", "maps", "mp", mid + ".gsc")
		if os.path.isfile(zgsc_path):
			zgsc = open(zgsc_path, encoding="latin-1").read()
			n = len(re.findall(r"level\.killtriggers\[\d+\]\s*=\s*spawnstruct\(\)", zgsc))
			if n:
				zp["killtriggers"] = n
			if "scr_replace_russian" in zgsc:
				zp["replaceRussian"] = True
			zp["scriptProof"] = "zpam/source/maps/mp/%s.gsc" % mid
		entry["zpam"] = zp

		# Images.
		images = {}
		data, ls_iwd = iwds.find("images/loadscreen_%s.iwi" % mid)
		if data is None:
			raise SystemExit("no loadscreen for " + mid)
		im = iwi_image(data).convert("RGB")
		for w, h, name in LOADSCREEN:
			file = "%s-%s.webp" % (mid, name)
			total += save_webp(im.resize((w, h), Image.LANCZOS), os.path.join(args.images, file))
			images[name] = file
		entry["proof"].append("%s:images/loadscreen_%s.iwi" % (ls_iwd, mid))

		board = {}
		topdown = os.path.join(args.cod2demo, "maps3d", mid, "topdown.webp")
		if os.path.isfile(topdown):
			file = "%s-topdown.webp" % mid
			source = Image.open(topdown).convert("RGB")
			im = source.copy()
			im.thumbnail((OVERHEAD, OVERHEAD), Image.LANCZOS)
			total += save_webp(im, os.path.join(args.images, file))
			images["topdown"] = file
			im = source.copy()
			im.thumbnail((BOARD, BOARD), Image.LANCZOS)
			board["topdown"] = data_url(im)
			entry["proof"].append("cod2-demo/maps3d/%s/topdown.webp" % mid)
			if "topdown" in world.get(mid, {}):
				entry.setdefault("world", {})["topdown"] = world[mid]["topdown"]["rect"]

		radar_file = os.path.join(args.zpam, "source", "maps", "mp", mid + ".radar")
		if os.path.isfile(radar_file):
			words = open(radar_file, encoding="latin-1").read().split()
			settings = dict(zip(words[0::2], words[1::2]))
			image = settings.get("cg_hudRadarMapImage")
			rotation = int(settings.get("cg_hudRadarMapImageRotation", "0"))
			iwi = os.path.join(args.zpam, "source", "images", image + ".iwi")
			if image and os.path.isfile(iwi):
				# Unturned: the radar's calibration maps the image onto the world axes like the
				# top-down render (CoD2x radar.cpp); the rotation only turns zPAM's HUD.
				source = iwi_image(open(iwi, "rb").read()).convert("RGBA")
				im = source.copy()
				im.thumbnail((OVERHEAD, OVERHEAD), Image.LANCZOS)
				file = "%s-radar.webp" % mid
				total += save_webp(im, os.path.join(args.images, file))
				images["radar"] = file
				im = source.copy()
				im.thumbnail((BOARD, BOARD), Image.LANCZOS)
				board["radar"] = data_url(im)
				entry["radarRotation"] = rotation
				entry["proof"].append("zpam/source/maps/mp/%s.radar, zpam/source/images/%s.iwi" % (mid, image))
				if "radar" in world.get(mid, {}):
					entry.setdefault("world", {})["radar"] = world[mid]["radar"]["rect"]
		entry["images"] = images
		if "world" in entry:
			entry["proof"].append("cod2-demo/assets/maps/backgrounds.js (%s)" % mid)
		if board:
			# One script per map, loaded by the tactics board when it opens that map.
			script = os.path.join(args.scripts, mid + ".js")
			with open(script, "w", encoding="utf-8", newline="\n") as fh:
				fh.write("/* %s for the tactics board of the maps tab. Generated by tools/build-cod2-maps.py. */\n" % mid)
				fh.write("(window.COD2_MAP_IMAGES = window.COD2_MAP_IMAGES || {})[%s] = " % json.dumps(mid))
				json.dump(board, fh)
				fh.write(";\n")
			entry["board"] = "js/cod2/maps/%s.js" % mid
			total += os.path.getsize(script)
		maps.append(entry)

	maps.sort(key=lambda m: m["name"])
	with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
		fh.write("/*\n * CoD2 stock multiplayer maps for the maps tab. Generated by tools/build-cod2-maps.py;\n"
			" * do not edit by hand.\n *\n * images: file names in assets/cod2/maps/; zpam: what zPAM changes (fix: the\n"
			" * version it switches to, killtriggers it can remove, replaceRussian); allies/axis:\n"
			" * the nations; attackers/defenders: the S&D roles (\"allies\" or \"axis\"); world: the world\n"
			" * rectangle [minX, minY, maxX, maxY] each overhead image covers; proof: where it comes\n"
			" * from (not shown).\n */\n")
		fh.write("window.COD2_MAPS = ")
		json.dump(maps, fh, ensure_ascii=False, indent="\t")
		fh.write(";\n")

	nades = grenades(iwds, args.cod2)
	with open(args.grenades, "w", encoding="utf-8", newline="\n") as fh:
		fh.write("/*\n * CoD2 grenades of each nation for the tactics board. Generated by tools/build-cod2-maps.py;\n"
			" * do not edit by hand. frag/smoke[nation]: English name, icon (key of icons: the HUD icon\n"
			" * as a PNG data URL), radius (explosionRadius, units), fuse (fuseTime, s), proof (not shown).\n */\n")
		fh.write("window.COD2_GRENADES = ")
		json.dump(nades, fh, ensure_ascii=False, indent="\t")
		fh.write(";\n")
	total += os.path.getsize(args.grenades)

	print("maps: %d (%s)" % (len(maps), ", ".join(m["id"] for m in maps)))
	print("sides: %s" % ", ".join("%s %s/%s attack %s" % (m["id"], m["allies"], m["axis"], m["attackers"]) for m in maps))
	print("world rects: %d maps (%d radar)" % (sum(1 for m in maps if "world" in m), sum(1 for m in maps if "radar" in m.get("world", {}))))
	for k in ("frag", "smoke"):
		print("%s: %s" % (k, ", ".join("%s=%s (%s, r %g)" % (n, v["name"], v["icon"], v["radius"]) for n, v in nades[k].items())))
	print("top-down: %d, radar: %d" % (sum(1 for m in maps if "topdown" in m["images"]), sum(1 for m in maps if "radar" in m["images"])))
	print("images: %.1f MB in %s" % (total / 1048576.0, os.path.normpath(args.images)))


if __name__ == "__main__":
	main()
