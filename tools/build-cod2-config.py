"""Builds the data of the "config checker" tab of the CoD2 section.

    python tools/build-cod2-config.py --cod2 C:\\Games\\CoD2 --cod2x C:\\path\\to\\CoD2x

Python 3.10+, standard library only. Writes js/cod2/config-data.js (or --out):
window.COD2_CONFIG, and prints a summary. The dvars themselves come from
js/cod2/dvars-data.js and the key names from js/cod2/name-data.js.

Only CoD2 and CoD2x are read; nothing from CoD4. A command is listed only if
the Windows 1.3 game has its name as a whole string (CoD2MP_s.exe or the
renderer DLL) or CoD2x registers it.

stock CoD2 1.3
  <cod2x>/src/other/CoD2MP_s.c
                     CoD2x's decompile of CoD2MP_s.exe: the Cmd_AddCommand calls
                     (sub_4212F0), names given by address read from the exe.
  <cod2x>/src/other/Call_of_Duty_2_Multiplayer_MAC_1.3.c
                     the Mac 1.3 build, with names: Cmd_AddCommand (it links the
                     renderer in, so the renderer's commands are there too),
                     CL_AddCgameCommand (commands the client game handles or
                     sends to the server) and the game's ConsoleCommand; and how
                     the engine sets a dvar (Dvar_SetVariant, Dvar_StringToValue,
                     Dvar_StringToEnum, Dvar_IsValidName).
  CoD2MP_s.exe, gfx_d3d_mp_x86_s.dll
                     the check that a name exists on Windows.
CoD2x               Cmd_AddCommand calls in <cod2x>/src.
"""

import argparse
import glob
import json
import os
import re
import struct

WIN = "src/other/CoD2MP_s.c"
MAC = "src/other/Call_of_Duty_2_Multiplayer_MAC_1.3.c"
MAC_LABEL = "Call_of_Duty_2_Multiplayer_MAC_1.3.c"
IMAGE_BASE = 0x400000

# Debug builds of CoD2x only (#ifdef DEBUG), not in a release.
COD2X_DEBUG_ONLY = { "ws", "dvarTestLimit" }


def lines_of(path):
	with open(path, encoding="latin-1") as fh:
		return fh.read().split("\n")


def find_line(lines, label, needle, start=0):
	for i in range(start, len(lines)):
		if needle in lines[i]:
			return i, "%s:%d" % (label, i + 1)
	raise SystemExit("not found in %s: %s" % (label, needle))


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--cod2", required=True, help="CoD2 1.3 install (CoD2MP_s.exe, gfx_d3d_mp_x86_s.dll)")
	ap.add_argument("--cod2x", required=True, help="CoD2x source checkout")
	ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "cod2",
		"config-data.js"), help="where the data goes (default: js/cod2/config-data.js)")
	args = ap.parse_args()

	exe = open(os.path.join(args.cod2, "CoD2MP_s.exe"), "rb").read()
	dll = open(os.path.join(args.cod2, "gfx_d3d_mp_x86_s.dll"), "rb").read()
	win = lines_of(os.path.join(args.cod2x, WIN))
	mac = lines_of(os.path.join(args.cod2x, MAC))

	# Commands are case-insensitive ("screenshotJpeg" is "screenshotJPEG" in the exe).
	exe_lower = exe.lower()
	dll_lower = dll.lower()

	def on_windows(name):
		needle = b"\0" + name.lower().encode("latin-1") + b"\0"
		return needle in exe_lower or needle in dll_lower

	commands = {}

	def add(name, source, proof):
		if name not in commands:
			commands[name] = { "s": source, "p": proof }

	# Windows: sub_4212F0("name", ...) and sub_4212F0(off_XXXXXX, ...).
	for i, line in enumerate(win):
		m = re.search(r'sub_4212F0\("([^"]+)"', line)
		if m:
			add(m.group(1), "stock", "CoD2MP_s.c:%d" % (i + 1))
			continue
		m = re.search(r"sub_4212F0\((?:\(const char \*\)&)?off_([0-9A-F]{6})", line)
		if m:
			off = int(m.group(1), 16) - IMAGE_BASE
			name = exe[off:exe.index(b"\0", off)].decode("latin-1")
			if re.fullmatch(r"[\w+\-]+", name):
				add(name, "stock", "CoD2MP_s.c:%d (CoD2MP_s.exe@0x%x)" % (i + 1, off))

	# Mac: Cmd_AddCommand (engine and renderer), CL_AddCgameCommand, ConsoleCommand.
	skipped = []
	for i, line in enumerate(mac):
		for pattern, kind in ((r'Cmd_AddCommand\([^"]*"([^"]+)"', "stock"), (r'CL_AddCgameCommand\([^"]*"([^"]+)"', "stock")):
			m = re.search(pattern, line)
			if m:
				if on_windows(m.group(1)):
					add(m.group(1), kind, "%s:%d" % (MAC_LABEL, i + 1))
				elif m.group(1) not in commands:
					skipped.append(m.group(1))
		m = re.search(r'\(&ri \+ 63\)\)\("([^"]+)"', line)      # the renderer's Cmd_AddCommand
		if m and on_windows(m.group(1)):
			add(m.group(1), "stock", "%s:%d (renderer)" % (MAC_LABEL, i + 1))

	# The client game's command table in CoD2MP_s.exe: { name, function } pairs from "viewpos" on.
	first = exe.find(b"\0viewpos\0") + 1
	table = exe.find(struct.pack("<I", first + IMAGE_BASE))
	if first <= 0 or table < 0:
		raise SystemExit("cgame command table not found in CoD2MP_s.exe")
	at = table
	while True:
		name_va = struct.unpack_from("<I", exe, at)[0]
		if not IMAGE_BASE < name_va < IMAGE_BASE + len(exe):
			break
		o = name_va - IMAGE_BASE
		name = exe[o:exe.index(b"\0", o)].decode("latin-1")
		if not re.fullmatch(r"[\w+\-]+", name):
			break
		add(name, "stock", "CoD2MP_s.exe@0x%x (cgame command table)" % at)
		at += 8

	c, _ = find_line(mac, MAC_LABEL, "ConsoleCommand/*DEFINITION*/")
	for i in range(c, c + 60):
		m = re.search(r'I_stricmp\(&v14, "([^"]+)"\)', mac[i])
		if m and on_windows(m.group(1)):
			add(m.group(1), "stock", "%s:%d (server)" % (MAC_LABEL, i + 1))

	# CoD2x.
	for path in sorted(glob.glob(os.path.join(args.cod2x, "src", "**", "*.cpp"), recursive=True)):
		rel = os.path.relpath(path, args.cod2x).replace(os.sep, "/")
		if "/other/" in rel:
			continue
		for i, line in enumerate(lines_of(path)):
			m = re.search(r'^\s*Cmd_AddCommand\("([^"]+)"', line)
			if m and m.group(1) not in COD2X_DEBUG_ONLY:
				add(m.group(1), "cod2x", "cod2x/%s:%d" % (rel, i + 1))

	# How the engine sets a dvar, for the checks (proofs only).
	_, set_variant = find_line(mac, MAC_LABEL, "Dvar_SetVariant/*DEFINITION*/")
	_, read_only = find_line(mac, MAC_LABEL, '"%s is read only.\\n"')
	_, write_protected = find_line(mac, MAC_LABEL, '"%s is write protected.\\n"')
	_, cheat = find_line(mac, MAC_LABEL, '"%s is cheat protected.\\n"')
	_, latched = find_line(mac, MAC_LABEL, '"%s will be changed upon restarting.\\n"')
	_, invalid = find_line(mac, MAC_LABEL, "'%s' is not a valid value for dvar '%s'")
	s, _ = find_line(mac, MAC_LABEL, "Dvar_StringToValue/*DEFINITION*/")
	_, as_bool = find_line(mac, MAC_LABEL, "return atoi(a1) != 0;", s)
	_, as_enum = find_line(mac, MAC_LABEL, "Dvar_StringToEnum/*DEFINITION*/")
	_, valid_name = find_line(mac, MAC_LABEL, "Dvar_IsValidName/*DEFINITION*/")
	_, dvar_command = find_line(mac, MAC_LABEL, "Dvar_Command/*DEFINITION*/")

	data = {
		"commands": commands,
		"proof": {
			"setDvar": set_variant, "readOnly": read_only, "writeProtected": write_protected,
			"cheat": cheat, "latched": latched, "invalidValue": invalid, "bool": as_bool,
			"enum": as_enum, "validName": valid_name, "dvarAsCommand": dvar_command
		}
	}
	with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
		fh.write("/*\n * CoD2 console commands for the config checker. Generated by tools/build-cod2-config.py;\n"
			" * do not edit by hand.\n *\n * commands: name -> { s: source (stock / cod2x), p: proof (file:line) }; proof: how the\n"
			" * engine sets a dvar (rejected values, read-only, cheat protected, latched).\n */\n")
		fh.write("window.COD2_CONFIG = ")
		json.dump(data, fh, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
		fh.write(";\n")

	by = {}
	for v in commands.values():
		by[v["s"]] = by.get(v["s"], 0) + 1
	print("commands: %d (%s)" % (len(commands), ", ".join("%s %d" % kv for kv in sorted(by.items()))))
	print("left out (not on Windows): %s" % ", ".join(sorted(set(skipped))))
	print("wrote " + os.path.normpath(args.out))


if __name__ == "__main__":
	main()
