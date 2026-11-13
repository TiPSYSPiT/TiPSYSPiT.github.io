"""Builds the data and images of the "maps" tab of the CoD2 section.

    python tools/build-cod2-maps.py --cod2 C:\\Games\\CoD2 --zpam C:\\path\\to\\zpam3 --cod2demo C:\\path\\to\\cod2-demo

Python 3.10+ with Pillow. Writes js/cod2/maps-data.js (window.COD2_MAPS), the
images in assets/cod2/maps/ and, for the tactics board, one script per map in
js/cod2/maps/ with its overhead images as data URLs; and prints a summary.

Only CoD2 sources; nothing from CoD4.
stock CoD2 1.3
  main/iw_*.iwd      mp/CoD2maps.arena (name, gametypes), maps/mp/<map>.gsc (the
                     allies side), images/loadscreen_<map>.iwi (DXT1).
zPAM                source/mp/CoD2maps.arena: the gametypes zPAM offers per map;
                     source/maps/mp/<map>.gsc: kill triggers it can remove and
                     the switch from Russians to British; gametypes/global/pam.gsc:
                     the _fix versions it switches to; maps/mp/<map>.radar and
                     source/images/radar_<map>.iwi: its radar image (DXT3).
cod2-demo           maps3d/<map>/topdown.webp: the map rendered from above by the
                     CoD2 demo viewer's export, from the game's own map files.

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
	args = ap.parse_args()
	os.makedirs(args.images, exist_ok=True)
	os.makedirs(args.scripts, exist_ok=True)

	iwds = Iwds(args.cod2)
	text, iwd = iwds.find("mp/CoD2maps.arena")
	stock = arena(text.decode("latin-1"))
	zpam_arena = { f["map"]: (f, line) for f, line in arena(open(os.path.join(args.zpam, "source", "mp", "CoD2maps.arena"), encoding="latin-1").read()) }

	pam = open(os.path.join(args.zpam, "source", "maps", "mp", "gametypes", "global", "pam.gsc"), encoding="latin-1").read().split("\n")
	fixes = {}
	for i, line in enumerate(pam):
		m = re.search(r'level\.mapname == "(\w+)"\) map = "(\w+)"', line)
		if m:
			fixes[m.group(1)] = (m.group(2), "zpam/source/maps/mp/gametypes/global/pam.gsc:%d" % (i + 1))

	maps = []
	total = 0
	for fields, line in stock:
		mid = fields["map"]
		entry = {
			"id": mid,
			"name": fields["longname"],
			"gametypes": fields["gametype"].split(),
			"proof": ["%s:mp/CoD2maps.arena:%d" % (iwd, line)]
		}

		# The allies side the map script picks.
		gsc, gsc_iwd = iwds.find("maps/mp/%s.gsc" % mid)
		m = re.search(r'game\["allies"\]\s*=\s*"(\w+)"', gsc.decode("latin-1")) if gsc else None
		if not m:
			raise SystemExit("no allies side for " + mid)
		entry["allies"] = m.group(1)
		entry["proof"].append("%s:maps/mp/%s.gsc" % (gsc_iwd, mid))

		# zPAM.
		zp = {}
		if mid in zpam_arena:
			extra = [g for g in zpam_arena[mid][0]["gametype"].split() if g not in entry["gametypes"]]
			zp["gametypes"] = extra
			zp["gametypesProof"] = "zpam/source/mp/CoD2maps.arena:%d" % zpam_arena[mid][1]
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
		entry["images"] = images
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
			" * do not edit by hand.\n *\n * images: file names in assets/cod2/maps/; zpam: what zPAM changes (gametypes it adds,\n"
			" * fix: the version it switches to, killtriggers it can remove, replaceRussian); proof: where it\n * comes from (not shown).\n */\n")
		fh.write("window.COD2_MAPS = ")
		json.dump(maps, fh, ensure_ascii=False, indent="\t")
		fh.write(";\n")

	print("maps: %d (%s)" % (len(maps), ", ".join(m["id"] for m in maps)))
	print("top-down: %d, radar: %d" % (sum(1 for m in maps if "topdown" in m["images"]), sum(1 for m in maps if "radar" in m["images"])))
	print("images: %.1f MB in %s" % (total / 1048576.0, os.path.normpath(args.images)))


if __name__ == "__main__":
	main()
