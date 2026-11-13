"""Builds the data of the "server config" tab of the CoD2 section.

    python tools/build-cod2-server.py --zpam C:\\path\\to\\zpam3

Python 3.10+, standard library only. Writes js/cod2/server-data.js (or --out):
window.COD2_SERVER, and prints a summary. The dvars themselves come from
js/cod2/dvars-data.js, the gametypes and maps from js/cod2/rcon-data.js.

zPAM only; nothing from CoD4.
  source/maps/mp/gametypes/global/rules.gsc
                     which pam_mode parts each gametype takes
                     (IsValidPAMModeForGametype, IsToggleSubPamMode).
  source/maps/mp/gametypes/rules/<gametype>/*.gsc, score/*.gsc, rules/*.gsc
                     what each mode, score part and option sets:
                     ruleCvarDefault(arr, "name", value); // comment
  zip/main/server.cfg
                     zPAM's example: the values it recommends for a server.
  README.md          the version and the required server settings.
"""

import argparse
import importlib.util
import json
import os
import re

RULES = "source/maps/mp/gametypes/rules"
RULES_GSC = "source/maps/mp/gametypes/global/rules.gsc"
EXAMPLE = "zip/main/server.cfg"
SETTING = re.compile(r'ruleCvarDefault\(arr,\s*"(\w+)",\s*([^)]*?)\);\s*(?://\s*(.*))?$')

# Mode descriptions, as the rcon tab writes them (one source for both).
_spec = importlib.util.spec_from_file_location("rcon", os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-cod2-rcon.py"))
_rcon = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rcon)
TOKEN_DESC = {}
for key, text in _rcon.TOKEN_DESC.items():
	for part in key.split(", "):
		TOKEN_DESC[part] = text
# rules/custom.gsc takes its settings from maps/mp/gametypes/_custom_rules.gsc, empty in zPAM.
TOKEN_DESC["custom"] = "Your own ruleset: the settings in _custom_rules.gsc of an extra .iwd (empty in zPAM itself)."


def read(path):
	with open(path, encoding="latin-1") as fh:
		return fh.read()


def parse_rules(zpam, rel):
	"""The settings a rules file sets: [name, value, comment, condition]."""
	out = []
	condition = None
	depth = 0
	cond_depth = None
	for i, line in enumerate(read(os.path.join(zpam, rel)).split("\n")):
		stripped = line.strip()
		m = re.match(r"if\s*\((.*)\)\s*$", stripped)
		if m:
			condition = m.group(1).strip()
			cond_depth = depth
		depth += line.count("{") - line.count("}")
		if cond_depth is not None and depth <= cond_depth and "}" in line:
			condition = None
			cond_depth = None
		m = SETTING.search(stripped)
		if m and not stripped.startswith("//"):
			value = m.group(2).strip().strip('"')
			if not re.fullmatch(r"-?[\w.]+", value):
				value = None      # computed in the script, e.g. game["overtime_score"] + 4
			out.append([m.group(1), value, (m.group(3) or "").strip(), condition, i + 1])
	return out


def format_string(zpam, rel):
	m = re.search(r'rules_formatString"\]\s*=\s*&"([^"]*)"', read(os.path.join(zpam, rel)))
	return m.group(1) if m else ""


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--zpam", required=True, help="zPAM (zpam3) source checkout")
	ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "cod2",
		"server-data.js"), help="where the data goes (default: js/cod2/server-data.js)")
	args = ap.parse_args()
	z = args.zpam

	rules_gsc = read(os.path.join(z, RULES_GSC))
	toggles = re.search(r"IsToggleSubPamMode\(name\)\s*\{(.*?)\n\}", rules_gsc, re.S).group(1)
	options = [o for o in re.findall(r'case "(\w+)":', toggles) if o != "developer"]
	if not options:
		raise SystemExit("no pam_mode options in " + RULES_GSC)
	valid = re.search(r"IsValidPAMModeForGametype\(gametype, pammode\)\s*\{(.*?)\n\}", rules_gsc, re.S).group(1)

	gametypes = {}
	for gt in sorted(os.listdir(os.path.join(z, RULES))):
		folder = os.path.join(z, RULES, gt)
		if not os.path.isdir(folder) or gt == "strat":
			continue
		if '(gametype == "%s"' % gt not in valid:
			raise SystemExit("gametype %s has rules but is not in IsValidPAMModeForGametype" % gt)
		modes = []
		for f in sorted(os.listdir(folder)):
			if f.endswith(".gsc"):
				rel = "%s/%s/%s" % (RULES, gt, f)
				mode = f[:-4]
				if '"%s"' % mode not in valid:
					raise SystemExit("mode %s of %s is not valid in rules.gsc" % (mode, gt))
				modes.append({ "id": mode, "desc": TOKEN_DESC.get(mode, ""), "format": format_string(z, rel),
					"settings": parse_rules(z, rel), "proof": "zpam/" + rel })
		scores = []
		score_dir = os.path.join(folder, "score")
		for f in sorted(os.listdir(score_dir)) if os.path.isdir(score_dir) else []:
			rel = "%s/%s/score/%s" % (RULES, gt, f)
			score = f[:-4].lstrip("_")
			if '"%s"' % score not in valid:
				raise SystemExit("score %s of %s is not valid in rules.gsc" % (score, gt))
			scores.append({ "id": score, "desc": TOKEN_DESC.get(score, ""), "format": format_string(z, rel),
				"settings": parse_rules(z, rel), "proof": "zpam/" + rel })
		scores.sort(key=lambda s: (re.sub(r"\D", "", s["id"]) == "", int(re.sub(r"\D", "", s["id"]) or 0)))
		gametypes[gt] = { "modes": modes, "scores": scores }

	option_list = []
	for o in options:
		m = re.search(r'case "%s":\s*maps\\mp\\gametypes\\rules\\(\w+)::Load' % o, rules_gsc)
		if not m:
			raise SystemExit("no rules file for option " + o)
		rel = "%s/%s.gsc" % (RULES, m.group(1))
		option_list.append({ "id": o, "desc": TOKEN_DESC.get(o, ""), "settings": parse_rules(z, rel), "proof": "zpam/" + rel })

	# zPAM's example server.cfg: name -> [value, comment, line].
	example = {}
	for i, line in enumerate(read(os.path.join(z, EXAMPLE)).split("\n")):
		m = re.match(r'\s*(?:set|seta)\s+(\w+)\s+(?:"([^"]*)"|(\S+))\s*(?://\s*(.*))?$', line)
		if m:
			example[m.group(1)] = [m.group(2) if m.group(2) is not None else m.group(3), (m.group(4) or "").strip(),
				"zpam/%s:%d" % (EXAMPLE, i + 1)]

	readme = read(os.path.join(z, "README.md"))
	version = re.search(r"zPAM (\d+\.\d+) - zpam\d+\.zip", readme).group(1)
	required = []
	lines = readme.split("\n")
	for needle in ['set fs_game ""', "<b>sv_wwwDownload 1</b>", '<b>sv_wwwBaseURL "http://cod2x.me/zpam"</b>',
			"+set dedicated 2 +set sv_punkbuster 0 +pb_sv_disable +exec server.cfg"]:
		at = [i for i, l in enumerate(lines) if needle in l]
		if not at:
			raise SystemExit("README line not found: " + needle)
		required.append("zpam/README.md:%d" % (at[0] + 1))

	data = {
		"version": version,
		"gametypes": gametypes,
		"options": option_list,
		"example": example,
		"proof": { "valid": "zpam/" + RULES_GSC, "required": required }
	}
	with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
		fh.write("/*\n * zPAM server settings for the server config tab. Generated by tools/build-cod2-server.py;\n"
			" * do not edit by hand.\n *\n * gametypes: per gametype the pam_mode modes and score parts, options: the parts every gametype\n"
			" * takes; settings: [name, value (null: computed in the script), comment, condition, line in proof].\n"
			" * example: zPAM's example server.cfg, name -> [value, comment, proof].\n */\n")
		fh.write("window.COD2_SERVER = ")
		json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
		fh.write(";\n")

	print("zPAM %s: %s" % (version, ", ".join("%s (%s; %s)" % (gt, "/".join(m["id"] for m in g["modes"]),
		"/".join(s["id"] for s in g["scores"])) for gt, g in gametypes.items())))
	print("options: " + ", ".join("%s %d" % (o["id"], len(o["settings"])) for o in option_list))
	print("example settings: %d" % len(example))
	print("wrote " + os.path.normpath(args.out) + " (%d bytes)" % os.path.getsize(args.out))


if __name__ == "__main__":
	main()
