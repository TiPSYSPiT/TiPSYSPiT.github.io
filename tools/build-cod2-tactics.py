"""Builds the S&D data of the tactics board (maps tab, CoD2 section).

    python tools/build-cod2-tactics.py --cod2 C:\\Games\\CoD2 --zpam C:\\path\\to\\zpam3 --cod2demo C:\\path\\to\\cod2-demo

Python 3.10+, standard library only. Writes js/cod2/tactics-data.js
(window.COD2_SD) and prints a summary with the checks below.

Only CoD2 sources; nothing from CoD4.
stock CoD2 1.3, main/iw_*.iwd
  mp/CoD2maps.arena           the stock maps
  maps/mp/<map>.d3dbsp        "IBSP" version 4: lump 37 the entity string, lump 35 the models
                              (48 bytes: mins, maxs, ...; "*N" in an entity is model N)
    mp_sd_spawn_attacker / mp_sd_spawn_defender
                              the S&D spawn points: origin, angles (pitch yaw roll; yaw 0 = +x,
                              counter-clockwise, x east and y north)
    targetname "bombzone"     the bomb sites: script_label A / B, script_bombmode_original; a
                              trigger_use_touch brush model, its bounds relative to the origin
  maps/mp/gametypes/sd.gsc    spawns by team: game["attackers"] at mp_sd_spawn_attacker, the
                              other team at mp_sd_spawn_defender; original bomb mode: the two
                              bombzones with script_bombmode_original and script_label A / B
  maps/mp/<map>.gsc           game["allies"], ["axis"], ["attackers"], ["defenders"]
zPAM                          maps/mp/gametypes/sd.gsc: the same entities; "allies" always spawn
                              at the attacker spawns (the same as stock on every stock map).
                              maps/mp/<map>.radar: the radar calibration, checked below.

The overhead images of the maps tab cover the world rectangles in js/cod2/maps-data.js
(map.world, from the cod2-demo export): image (u, v) = ((x - minX) / (maxX - minX),
(maxY - y) / (maxY - minY)); the radar's rectangle is checked against zPAM's .radar values with
CoD2x's radar.cpp (x = wx * s + offX, y = 100 - wy * s + offY on the 100 x 100 radar; the map
image offset moves the image and the entities alike).
"""

import argparse
import glob
import json
import os
import re
import struct
import zipfile


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


def bsp(data):
	"""(entities, models) of a CoD2 d3dbsp."""
	if data[:4] != b"IBSP" or struct.unpack_from("<I", data, 4)[0] != 4:
		raise ValueError("not a CoD2 BSP (IBSP version 4)")
	lumps = [struct.unpack_from("<II", data, 8 + i * 8) for i in range(39)]

	def lump(i):
		n, o = lumps[i]
		return data[o:o + n]

	ents = []
	for block in re.findall(r"\{([^{}]*)\}", lump(37).decode("latin-1")):
		e = dict(re.findall(r'"([^"]*)"\s+"([^"]*)"', block))
		if e:
			ents.append(e)
	md = lump(35)
	models = [struct.unpack_from("<6f", md, i * 48) for i in range(len(md) // 48)]
	return ents, models


def vec(text):
	return [float(v) for v in text.split()]


def r1(v):
	v = round(v, 1)
	return int(v) if v == int(v) else v


def backgrounds(cod2demo):
	text = open(os.path.join(cod2demo, "assets", "maps", "backgrounds.js"), encoding="utf-8").read()
	key = "Object.assign(C2.maps.BACKGROUNDS,"
	obj, _ = json.JSONDecoder().raw_decode(text[text.index(key) + len(key):].lstrip())
	return obj


def radar_rect(path):
	"""The world rectangle of zPAM's radar image from its .radar file (CoD2x radar.cpp)."""
	words = open(path, encoding="latin-1").read().split()
	v = dict(zip(words[0::2], words[1::2]))
	s = float(v["cg_hudRadarEntityScale"])
	ox = float(v.get("cg_hudRadarEntityOffsetX", 0))
	oy = float(v.get("cg_hudRadarEntityOffsetY", 0))
	return [-ox / s, oy / s, (100 - ox) / s, (100 + oy) / s]


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--cod2", required=True, help="CoD2 1.3 install (main/)")
	ap.add_argument("--zpam", required=True, help="zPAM (zpam3) source checkout")
	ap.add_argument("--cod2demo", required=True, help="cod2-demo checkout (assets/maps/backgrounds.js)")
	root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
	ap.add_argument("--out", default=os.path.join(root, "js", "cod2", "tactics-data.js"))
	args = ap.parse_args()

	iwds = Iwds(args.cod2)
	text, arena_iwd = iwds.find("mp/CoD2maps.arena")
	ids = re.findall(r'map\s+"(\w+)"', text.decode("latin-1"))
	world = backgrounds(args.cod2demo)

	out = {}
	notes = []
	for mid in ids:
		gsc, gsc_iwd = iwds.find("maps/mp/%s.gsc" % mid)
		sides = dict(re.findall(r'game\["(allies|axis|attackers|defenders)"\]\s*=\s*"(\w+)"', gsc.decode("latin-1")))
		# sd.gsc's defaults where the map script sets nothing.
		for k, d in (("allies", "american"), ("axis", "german"), ("attackers", "allies"), ("defenders", "axis")):
			sides.setdefault(k, d)

		data, bsp_iwd = iwds.find("maps/mp/%s.d3dbsp" % mid)
		ents, models = bsp(data)
		spawns = {}
		for role in ("attacker", "defender"):
			spawns[role] = []
			for e in ents:
				if e.get("classname") == "mp_sd_spawn_" + role:
					o = vec(e["origin"])
					yaw = vec(e["angles"])[1] if "angles" in e else float(e.get("angle", 0))
					spawns[role].append([r1(o[0]), r1(o[1]), r1(o[2]), r1(yaw)])
			if not spawns[role]:
				raise SystemExit("%s: no mp_sd_spawn_%s" % (mid, role))

		sites = []
		for e in ents:
			if e.get("targetname") != "bombzone" or "script_bombmode_original" not in e:
				continue
			label = e.get("script_label", "").upper()
			o = vec(e["origin"])
			site = {"label": label, "origin": [r1(v) for v in o]}
			if e.get("model", "").startswith("*") and "angles" not in e:
				m = models[int(e["model"][1:])]
				site["rect"] = [r1(o[0] + m[0]), r1(o[1] + m[1]), r1(o[0] + m[3]), r1(o[1] + m[4])]
			elif e.get("model", "").startswith("*"):
				notes.append("%s: site %s is turned (angles %s); no area" % (mid, label, e["angles"]))
			sites.append(site)
		sites.sort(key=lambda s: s["label"])
		if [s["label"] for s in sites] != ["A", "B"]:
			raise SystemExit("%s: bomb sites %s, not A and B" % (mid, [s["label"] for s in sites]))

		entry = {
			"allies": sides["allies"], "axis": sides["axis"],
			"attackers": sides["attackers"], "defenders": sides["defenders"],
			"spawns": spawns, "sites": sites,
			"proof": ["%s:maps/mp/%s.d3dbsp (entities: mp_sd_spawn_attacker, mp_sd_spawn_defender, bombzone)" % (bsp_iwd, mid),
				"%s:maps/mp/%s.gsc" % (gsc_iwd, mid)]
		}
		out[mid] = entry

		# Checks: every point inside the top-down image; the radar rectangle against zPAM's .radar.
		bg = world.get(mid, {})
		td = bg.get("topdown", {}).get("rect")
		pts = [p[:2] for r in spawns.values() for p in r] + [s["origin"][:2] for s in sites]
		if td:
			outside = [p for p in pts if not (td[0] <= p[0] <= td[2] and td[1] <= p[1] <= td[3])]
			if outside:
				notes.append("%s: %d points outside the top-down image" % (mid, len(outside)))
		else:
			notes.append("%s: no top-down rectangle" % mid)
		rf = os.path.join(args.zpam, "source", "maps", "mp", mid + ".radar")
		if os.path.isfile(rf):
			mine = radar_rect(rf)
			theirs = bg.get("radar", {}).get("rect")
			if not theirs or max(abs(a - b) for a, b in zip(mine, theirs)) > 0.05:
				notes.append("%s: radar rectangle %s differs from cod2-demo %s" % (mid, mine, theirs))

	with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
		fh.write("/*\n * CoD2 Search and Destroy data per stock map for the tactics board. Generated by\n"
			" * tools/build-cod2-tactics.py; do not edit by hand.\n *\n"
			" * World units (x east, y north). spawns.attacker / .defender: [x, y, z, yaw] of\n"
			" * mp_sd_spawn_attacker / _defender (yaw in degrees, 0 = +x, counter-clockwise);\n"
			" * game[\"attackers\"] spawns at the attacker spawns. sites: the bomb zones A and B\n"
			" * (origin, rect [minX, minY, maxX, maxY] of the trigger). allies / axis / attackers /\n"
			" * defenders: the map script's game[...] values. proof: where it comes from (not shown).\n */\n")
		fh.write("window.COD2_SD = ")
		json.dump(out, fh, ensure_ascii=False, indent="\t")
		fh.write(";\n")

	for mid in ids:
		e = out[mid]
		print("%-16s %s/%s attack: %-6s spawns %2d att / %2d def, sites %s" % (mid, e["allies"], e["axis"], e["attackers"],
			len(e["spawns"]["attacker"]), len(e["spawns"]["defender"]),
			", ".join("%s%s" % (s["label"], "" if "rect" in s else " (no area)") for s in e["sites"])))
	print("notes: %s" % ("; ".join(notes) if notes else "none"))
	print("written: %s" % os.path.normpath(args.out))


if __name__ == "__main__":
	main()
