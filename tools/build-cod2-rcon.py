"""Builds the rcon command list for the "rcon" tab of the CoD2 section.

    python tools/build-cod2-rcon.py --cod2 C:\\Games\\CoD2 --cod2x C:\\path\\to\\CoD2x --zpam C:\\path\\to\\zpam3

Python 3.10+, standard library only. Writes js/cod2/rcon-data.js (or --out):
window.COD2_RCON, and prints a summary.

Only these three folders are read; nothing from CoD4, CoD4x, Promod or other
games. Every entry is checked against its sources here, and the build stops
if one of them does not hold. The proofs (file and line, or offset in the
executable) go into the data; the page does not show them.

stock CoD2 1.3
  <cod2x>/src/other/CoD2MP_s.c
                     CoD2x's decompile of CoD2MP_s.exe: the Cmd_AddCommand
                     calls (sub_4212F0) and the game's console commands.
  <cod2x>/src/other/Call_of_Duty_2_Multiplayer_MAC_1.3.c
                     the Mac 1.3 build's decompile, which keeps the function
                     names: what each command's handler does and its usage text.
  CoD2MP_s.exe       the command names and usage texts as strings.
  main/iw_07.iwd, main/iw_15.iwd
                     the stock gametypes and maps (mp/CoD2maps.arena).
CoD2x               Cmd_AddCommand calls and usage texts in <cod2x>/src, README.md.
zPAM                registerCvarEx("I", ...): admin switches zPAM never resets;
                     the debug switches its README gives as /rcon commands;
                     the settings of its in-game rcon menu
                     (_menu_rcon_settings.gsc) with their registrations; the
                     pam_mode tables of its README; its gametypes and the maps
                     in <cod2>/main/zpam_maps_v7.iwd.
"""

import argparse
import glob
import json
import os
import re
import sys
import zipfile

WIN = "src/other/CoD2MP_s.c"
MAC = "src/other/Call_of_Duty_2_Multiplayer_MAC_1.3.c"
IMAGE_BASE = 0x400000
# The server's operator commands (SV_AddOperatorCommands); say and tell are
# also registered when the dedicated console opens, earlier in the decompile.
OPERATORS = 'sub_4212F0("killserver"'

SOURCES = [
	{ "id": "stock", "label": "stock CoD2" },
	{ "id": "cod2x", "label": "CoD2x" },
	{ "id": "zpam", "label": "zPAM" }
]

CATEGORIES = [
	{ "id": "players", "label": "Players" },
	{ "id": "chat", "label": "Chat" },
	{ "id": "map", "label": "Maps & gametypes" },
	{ "id": "match", "label": "Match" },
	{ "id": "bots", "label": "Bots" },
	{ "id": "server", "label": "Server" },
	{ "id": "debug", "label": "Debug" },
	{ "id": "settings", "label": "zPAM settings" }
]

SETTINGS_WARNING = ("In zPAM's match modes these settings go back to the rules' value at the next map: "
	"the ones marked \"rules\" always, the others unless pam_mode_custom is 1. "
	"zPAM's in-game rcon menu is the intended way to change them.")


class Sources:
	def __init__(self, cod2, cod2x, zpam):
		self.cod2 = cod2
		self.cod2x = cod2x
		self.zpam = zpam
		self.exe = open(os.path.join(cod2, "CoD2MP_s.exe"), "rb").read()
		self.text = {}

	def lines(self, path):
		if path not in self.text:
			with open(path, encoding="latin-1") as fh:
				self.text[path] = fh.read().split("\n")
		return self.text[path]

	def find(self, path, label, needle, after=None):
		"""Line of the first occurrence of needle (after the line holding `after`)."""
		lines = self.lines(path)
		start = 0
		if after is not None:
			start = self.find_index(path, after) + 1
		for i in range(start, len(lines)):
			if needle in lines[i]:
				return "%s:%d" % (label, i + 1)
		raise SystemExit("not found in %s: %s" % (label, needle))

	def find_index(self, path, needle):
		for i, line in enumerate(self.lines(path)):
			if needle in line:
				return i
		raise SystemExit("not found in %s: %s" % (path, needle))

	def win(self, needle, after=None):
		return self.find(os.path.join(self.cod2x, WIN), "CoD2MP_s.c", needle, after)

	def mac(self, needle):
		return self.find(os.path.join(self.cod2x, MAC), "Call_of_Duty_2_Multiplayer_MAC_1.3.c", needle)

	def handler(self, name):
		return self.mac(name + "/*DEFINITION*/")

	def exe_str(self, s, whole=True):
		"""Offset of s as a string of its own in CoD2MP_s.exe (whole: up to its terminating zero)."""
		needle = b"\0" + s.encode("latin-1") + (b"\0" if whole else b"")
		at = self.exe.find(needle)
		if at < 0:
			raise SystemExit("not in CoD2MP_s.exe: %r" % s)
		return "CoD2MP_s.exe@0x%x" % (at + 1)

	def exe_at(self, va, s):
		"""The decompile names some strings by address: check the string there."""
		off = va - IMAGE_BASE
		if self.exe[off:off + len(s) + 1] != s.encode("latin-1") + b"\0":
			raise SystemExit("CoD2MP_s.exe@0x%x is not %r" % (off, s))
		return "CoD2MP_s.exe@0x%x" % off

	def cod2x_file(self, rel, needle):
		return self.find(os.path.join(self.cod2x, rel), "cod2x/" + rel, needle)

	def zpam_file(self, rel, needle, after=None):
		return self.find(os.path.join(self.zpam, rel), "zpam/" + rel, needle, after)


def stock_cmd(src, name, handler, win=None):
	"""A command the stock server registers: the decompile's registration, the
	Mac build's registration and handler, the name in the executable."""
	proof = [src.win(win or 'sub_4212F0("%s"' % name), src.mac('Cmd_AddCommand(a1, a2, a3, "%s"' % name)]
	if handler:
		proof.append(src.handler(handler))
	proof.append(src.exe_str(name))
	return proof


def game_cmd(src, name):
	"""A command of the game logic's ConsoleCommand (string compares, no registration)."""
	return [src.win('sub_44A670("%s"' % name), src.mac('I_stricmp(&v14, "%s")' % name),
		src.handler("ConsoleCommand"), src.exe_str(name)]


def stock_commands(src):
	usage_name = src.exe_str("Usage: %s <player name>", False)
	usage_num = src.exe_str("Usage: %s <client number>", False)
	kickban = [src.handler("SV_TempBan_f"), src.exe_str("%s (guid %i) was kicked for cheating", False),
		src.win('"sv_kickBanTime"'), src.exe_str("sv_kickBanTime")]
	cod2x_hwid = src.cod2x_file("README.md", "The HWID is used to ban cheaters")
	map_off = src.exe_at(0x5AC1C8, "map")
	say_off = src.exe_at(0x5ABD98, "say")
	set_off = src.exe_at(0x5A8058, "set")
	restart = src.handler("SV_MapRestart")

	return [
		# players
		("kick", "kick [player name]", "Kicks a player by name and bans them for sv_kickBanTime seconds (300 by default).",
			"kick Player", "players", stock_cmd(src, "kick", None) + kickban + [usage_name]),
		("tempBanUser", "tempBanUser [player name]", "Same as kick: kicks a player by name and bans them for sv_kickBanTime seconds.",
			"tempBanUser Player", "players", stock_cmd(src, "tempBanUser", None) + kickban + [usage_name]),
		("tempBanClient", "tempBanClient [client number]", "Kicks the player with this client number (see status) and bans them for sv_kickBanTime seconds.",
			"tempBanClient 3", "players", stock_cmd(src, "tempBanClient", "SV_TempBanNum_f") + [usage_num]),
		("onlykick", "onlykick [player name]", "Kicks a player by name without a ban.",
			"onlykick Player", "players", stock_cmd(src, "onlykick", "SV_Drop_f", 'sub_4212F0("onlykick"') + [usage_name]),
		("clientkick", "clientkick [client number]", "Kicks the player with this client number (see status) without a ban.",
			"clientkick 3", "players", stock_cmd(src, "clientkick", "SV_DropNum_f") + [usage_num]),
		("banUser", "banUser [player name]", "Bans a player by name for good (saved in ban.txt); CoD2x bans by hardware ID.",
			"banUser Player", "players", stock_cmd(src, "banUser", "SV_Ban_f") + [src.exe_str("Usage: banUser <player name>", False), cod2x_hwid]),
		("banClient", "banClient [client number]", "Bans the player with this client number for good (saved in ban.txt); CoD2x bans by hardware ID.",
			"banClient 3", "players", stock_cmd(src, "banClient", "SV_BanNum_f") + [src.exe_str("Usage: banClient <client number>", False), cod2x_hwid]),
		("unbanUser", "unbanUser [player name]", "Lifts a ban, looked up by the player's name in ban.txt.",
			"unbanUser Player", "players", stock_cmd(src, "unbanUser", "SV_Unban_f") + [src.exe_str("Usage: unban <client name>", False)]),
		("addip", "addip [ip-mask]", "Adds an address or a mask such as 192.168.1 to the IP filter list (g_banIPs).",
			"addip 192.168.1", "players", game_cmd(src, "addip") + [src.handler("Svcmd_AddIP_f"), src.exe_str("Usage:  addip <ip-mask>", False), src.exe_str("g_banIPs")]),
		("removeip", "removeip [ip-mask]", "Removes an address or mask from the IP filter list.",
			"removeip 192.168.1", "players", game_cmd(src, "removeip") + [src.handler("Svcmd_RemoveIP_f"), src.exe_str("Usage:  sv removeip <ip-mask>", False)]),
		("listip", "listip", "Prints the IP filter list (the g_banIPs dvar).",
			"listip", "players", game_cmd(src, "listip") + [src.mac('Cbuf_ExecuteText(a1, a2, v9, 1, "g_banIPs\\n")')]),

		# chat
		("say", "say [message]", "Sends a message from the console to all players (dedicated server only).",
			"say Match starts in 5 minutes", "chat", [src.win("sub_4212F0((const char *)&off_5ABD98", after=OPERATORS), say_off,
				src.mac('Cmd_AddCommand(a1, a2, a3, "say"'), src.handler("SV_ConSay_f")]),
		("tell", "tell [client number] [message]", "Sends a message from the console to one player (dedicated server only).",
			"tell 3 Please join a team", "chat", [src.win('sub_4212F0("tell"', after=OPERATORS)] + stock_cmd(src, "tell", "SV_ConTell_f")[1:]),

		# map
		("map", "map [mapname]", "Loads a map with the current gametype and turns cheats off (sv_cheats 0).",
			"map mp_toujane", "map", [src.win("sub_4212F0((const char *)&off_5AC1C8"), map_off,
				src.mac('Cmd_AddCommand(a1, a2, a3, "map"'), src.handler("SV_Map_f")]),
		("devmap", "devmap [mapname]", "Loads a map like map, but with cheats on (sv_cheats 1).",
			"devmap mp_toujane", "map", stock_cmd(src, "devmap", "SV_Map_f") + [src.mac('I_stricmp(v12, "devmap")')]),
		("map_restart", "map_restart", "Reloads the current map completely.",
			"map_restart", "map", stock_cmd(src, "map_restart", "SV_MapRestart_f") + [restart]),
		("fast_restart", "fast_restart", "Restarts the current map without reloading it, unless g_gametype or sv_maxclients changed.",
			"fast_restart", "map", stock_cmd(src, "fast_restart", "SV_FastRestart_f") + [restart]),
		("map_rotate", "map_rotate", "Loads the next map of sv_mapRotation.",
			"map_rotate", "map", stock_cmd(src, "map_rotate", "SV_MapRotate_f") + [src.exe_str("sv_mapRotationCurrent")]),
		("sv_mapRotation", "sv_mapRotation [rotation]", "Sets the map rotation that map_rotate works through.",
			"sv_mapRotation gametype sd map mp_toujane map mp_burgundy", "map",
			[src.win('sub_437CD0(v71, "sv_mapRotation"'), src.exe_str("sv_mapRotation"), src.handler("SV_MapRotate_f")]),
		("g_gametype", "g_gametype [gametype]", "Sets the gametype; it takes effect with the next map, map_rotate or restart.",
			"g_gametype sd", "map", [src.win('sub_437CD0(v0, "g_gametype", 7, 4132)'), src.exe_str("g_gametype"), restart]),

		# server
		("status", "status", "Lists the players: client number, score, ping, GUID, name, address, qport and rate.",
			"status", "server", stock_cmd(src, "status", "SV_Status_f") + [src.exe_str("num score ping guid", False)]),
		("serverinfo", "serverinfo", "Prints the server info settings, the ones server browsers see.",
			"serverinfo", "server", stock_cmd(src, "serverinfo", "SV_Serverinfo_f")),
		("systeminfo", "systeminfo", "Prints the system info settings sent to connecting players.",
			"systeminfo", "server", stock_cmd(src, "systeminfo", "SV_Systeminfo_f")),
		("dumpuser", "dumpuser [player name]", "Prints a player's userinfo.",
			"dumpuser Player", "server", stock_cmd(src, "dumpuser", "SV_DumpUser_f") + [src.exe_str("Usage: info <userid>", False)]),
		("heartbeat", "heartbeat", "Sends a heartbeat to the master server right away.",
			"heartbeat", "server", stock_cmd(src, "heartbeat", "SV_Heartbeat_f")),
		("gameCompleteStatus", "gameCompleteStatus", "Reports the status of the finished game to the master server.",
			"gameCompleteStatus", "server", stock_cmd(src, "gameCompleteStatus", "SV_GameCompleteStatus_f")),
		("killserver", "killserver", "Shuts the running server down without quitting the program.",
			"killserver", "server", stock_cmd(src, "killserver", "SV_KillServer_f")),
		("quit", "quit", "Quits the server program.",
			"quit", "server", stock_cmd(src, "quit", "Com_Quit_f")),
		("exec", "exec [filename]", "Runs a config file from the server's folder.",
			"exec server.cfg", "server", [src.win('sub_4212F0("exec"'), src.handler("Cmd_Exec_f"), src.exe_str("exec")]),
		("set", "set [dvar] [value]", "Sets a dvar, and creates it if it does not exist.",
			"set scr_sd_roundlength 2", "server", [src.win("sub_4212F0(off_5A8058"), set_off,
				src.mac('Cmd_AddCommand(a1, a2, a3, "set"'), src.handler("Dvar_Set_f"), src.exe_str("USAGE: set <variable> <value>", False)]),
		("sets", "sets [dvar] [value]", "Sets a dvar and adds it to the server info that server browsers see.",
			"sets _Admin Player", "server", stock_cmd(src, "sets", "Dvar_SetS_f") + [src.exe_str("USAGE: sets <variable> <value>", False)]),
		("seta", "seta [dvar] [value]", "Sets a dvar and marks it to be saved in the config.",
			"seta sv_hostname My server", "server", stock_cmd(src, "seta", "Dvar_SetA_f") + [src.exe_str("USAGE: seta <variable> <value>", False)]),
		("reset", "reset [dvar]", "Resets a dvar to its default value.",
			"reset g_gametype", "server", stock_cmd(src, "reset", "Dvar_Reset_f") + [src.exe_str("USAGE: reset <variable>", False)]),
		("toggle", "toggle [dvar] [values]", "Switches a dvar between 0 and 1, or steps through the values given.",
			"toggle g_allowVote", "server", stock_cmd(src, "toggle", "Dvar_Toggle_f") + [src.exe_str("USAGE: %s <variable> <optional value sequence>", False)]),
		("vstr", "vstr [dvar]", "Runs the text of a dvar as commands.",
			"vstr nextmap", "server", [src.win('sub_4212F0("vstr"'), src.handler("Cmd_Vstr_f"), src.exe_str("vstr")]),
		("writeconfig", "writeconfig [filename]", "Writes the dvars marked for saving to a config file.",
			"writeconfig backup.cfg", "server", stock_cmd(src, "writeconfig", "Com_WriteConfig_f") + [src.exe_str("Usage: writeconfig <filename>", False)]),
		("cmdlist", "cmdlist [filter]", "Lists all commands; a filter such as *ban* narrows the list.",
			"cmdlist *ban*", "server", [src.win('sub_4212F0("cmdlist"'), src.handler("Cmd_List_f"), src.exe_str("cmdlist")]),
		("dvarlist", "dvarlist [filter]", "Lists all dvars with their values; a filter such as sv_* narrows the list.",
			"dvarlist sv_*", "server", stock_cmd(src, "dvarlist", "Dvar_List_f")),

		# debug
		("scriptUsage", "scriptUsage", "Prints the running script threads.",
			"scriptUsage", "debug", stock_cmd(src, "scriptUsage", "SV_ScriptUsage_f") + [src.mac("Scr_DumpScriptThreads(")]),
		("stringUsage", "stringUsage", "Prints the script string memory in use.",
			"stringUsage", "debug", stock_cmd(src, "stringUsage", "SV_StringUsage_f") + [src.mac("MT_DumpTree(")]),
		("entitylist", "entitylist", "Lists the entities of the running map.",
			"entitylist", "debug", game_cmd(src, "entitylist") + [src.handler("Svcmd_EntityList_f")]),
	]


def cod2x_commands(src):
	match_usage = src.cod2x_file("src/shared/match.cpp", 'Com_Printf("USAGE: match <command> <options>')
	match_reg = src.cod2x_file("src/shared/match.cpp", 'Cmd_AddCommand("match"')

	def match(sub, needle):
		return [match_reg, match_usage, src.cod2x_file("src/shared/match.cpp", needle)]

	return [
		("unbanAll", "unbanAll", "Lifts all bans by deleting ban.txt.",
			"unbanAll", "players", [src.cod2x_file("src/shared/server.cpp", 'Cmd_AddCommand("unbanAll"'),
				src.cod2x_file("src/shared/server.cpp", 'FS_Delete("ban.txt")'), src.cod2x_file("README.md", "/unbanAll")]),
		("getIp", "getIp", "Asks the CoD2x master server for this server's public IP address and prints it.",
			"getIp", "server", [src.cod2x_file("src/shared/server.cpp", 'Cmd_AddCommand("getIp"'),
				src.cod2x_file("src/shared/server.cpp", 'Com_Printf("Server IP: %s\\n"')]),
		("cmdLine", "cmdLine", "Prints the command line the server was started with.",
			"cmdLine", "server", [src.cod2x_file("src/shared/common.cpp", 'Cmd_AddCommand("cmdLine"'),
				src.cod2x_file("src/shared/common.cpp", 'Com_Printf("Command line: \\n")')]),
		("match create", "match create [endpoint]", "Downloads the match data from a URL and starts the match.",
			"match create http://web.com/matches/MATCHID1", "match", match("create", 'Com_Printf("  match create <endpoint>')),
		("match status", "match status", "Prints the status of the current match.",
			"match status", "match", match("status", 'Com_Printf("  match status')),
		("match upload", "match upload", "Uploads the match data now.",
			"match upload", "match", match("upload", 'Com_Printf("  match upload')),
		("match cancel", "match cancel", "Cancels the current match.",
			"match cancel", "match", match("cancel", 'Com_Printf("  match cancel')),
	]


def zpam_commands(src):
	G = "source/maps/mp/gametypes/"

	def reg(rel, name):
		return src.zpam_file(G + rel, 'registerCvarEx("I", "%s"' % name)

	def readme(needle):
		return src.zpam_file("README.md", needle)

	def dev(name):
		return src.zpam_file(G + "global/developer.gsc", 'registerCvar("%s"' % name)

	return [
		("pam_mode", "pam_mode [mode]", "Switches zPAM to a mode such as comp or comp_mr12 and reloads the map with its rules.",
			"pam_mode comp_mr12", "match", [reg("global/pam.gsc", "pam_mode"), src.zpam_file(G + "global/pam.gsc", "thread ChangeTo(value)"),
				src.zpam_file(G + "global/pam.gsc", "map(level.mapname, false)")]),
		("pam_mode_custom", "pam_mode_custom [0|1]", "With 1, settings changed by rcon stay across maps; 0 sets them back to the mode's rules.",
			"pam_mode_custom 1", "match", [reg("global/pam.gsc", "pam_mode_custom"), src.zpam_file(G + "global/pam.gsc", "cvar_system::SetDefaults()"),
				src.zpam_file(G + "global/cvar_system.gsc", "if (level.pam_mode_custom && method != \"C\")")]),
		("scr_score_allies", "scr_score_allies [score]", "Sets the Allies' score in S&D; by default only during the first ready-up.",
			"scr_score_allies 5", "match", [reg("_score_set.gsc", "scr_score_allies"), src.zpam_file(G + "_score_set.gsc", '"scr_score_change_mode"'),
				src.zpam_file(G + "_score_set.gsc", "Score changing is available only in S&D gametype")]),
		("scr_score_axis", "scr_score_axis [score]", "Sets the Axis' score in S&D; by default only during the first ready-up.",
			"scr_score_axis 3", "match", [reg("_score_set.gsc", "scr_score_axis"), src.zpam_file(G + "_score_set.gsc", '"scr_score_change_mode"')]),
		("scr_matchinfo_reset", "scr_matchinfo_reset 1", "Clears the team info of the match.",
			"scr_matchinfo_reset 1", "match", [reg("_matchinfo.gsc", "scr_matchinfo_reset"), src.zpam_file(G + "_matchinfo.gsc", "Info about teams was cleared via rcon.")]),
		("scr_matchinfo_kick_not_allowed", "scr_matchinfo_kick_not_allowed [0|1]", "With 1 (the default), players who are not in the match's teams get kicked.",
			"scr_matchinfo_kick_not_allowed 0", "match", [reg("_matchinfo.gsc", "scr_matchinfo_kick_not_allowed"),
				src.zpam_file(G + "_matchinfo.gsc", "You are not assigned to any team in the match!")]),
		("scr_motd", "scr_motd [message]", "Sets the message of the day in zPAM's server info menu.",
			"scr_motd Welcome to our server", "match", [reg("_menu_serverinfo.gsc", "scr_motd")]),

		("scr_bots_add", "scr_bots_add [number]", "Adds this many bots to the server.",
			"scr_bots_add 2", "bots", [reg("_bots.gsc", "scr_bots_add")]),
		("scr_bots_remove", "scr_bots_remove [number]", "Removes this many bots from the server.",
			"scr_bots_remove 2", "bots", [reg("_bots.gsc", "scr_bots_remove")]),
		("scr_bots_removeAll", "scr_bots_removeAll 1", "Removes all bots from the server.",
			"scr_bots_removeAll 1", "bots", [reg("_bots.gsc", "scr_bots_removeAll")]),
		("scr_bots_freeze", "scr_bots_freeze [0|1]", "Freezes the bots in place (1, the default) or lets them move (0).",
			"scr_bots_freeze 0", "bots", [reg("_bots.gsc", "scr_bots_freeze")]),
		("scr_bots_spam", "scr_bots_spam [seconds]", "Connects and disconnects a bot over and over, one cycle every this many seconds.",
			"scr_bots_spam 5", "bots", [reg("_bots.gsc", "scr_bots_spam")]),

		("debug_handhitbox", "debug_handhitbox [0|1]", "Shows how the hand hitbox fix works, in game.",
			"debug_handhitbox 1", "debug", [dev("debug_handhitbox"), readme("**/rcon debug_handhitbox 1**")]),
		("debug_torsohitbox", "debug_torsohitbox [0|1]", "Shows how the torso hitbox fix works, in game.",
			"debug_torsohitbox 1", "debug", [dev("debug_torsohitbox"), readme("**/rcon debug_torsohitbox 1**")]),
		("debug_shotgun", "debug_shotgun [0|1]", "Shows how the consistent shotgun works, in game.",
			"debug_shotgun 1", "debug", [dev("debug_shotgun"), readme("**/rcon debug_shotgun 1**")]),
		("debug_fastreload", "debug_fastreload [0|1]", "Shows how the fast-reload fix works, in game.",
			"debug_fastreload 1", "debug", [dev("debug_fastreload"), readme("**/rcon debug_fastreload 1**")]),
		("debug_pronepeek", "debug_pronepeek [0|1]", "Shows how the prone-peek fix works, in game.",
			"debug_pronepeek 1", "debug", [dev("debug_pronepeek"), readme("**/rcon debug_pronepeek 1**")]),
		("scr_file", "scr_file [0|1]", "Writes live player data every frame to ZPAM_<ip>_<port>.txt on the server, for external tools.",
			"scr_file 1", "debug", [reg("_file.gsc", "scr_file"), src.zpam_file(G + "_file.gsc", 'OpenFile( "ZPAM_" + ip + "_" + port + ".txt"')]),
	]


# One sentence per zPAM setting; the gametype ones by their suffix.
SETTING_SUFFIX = {
	"timelimit": "Time limit for the whole map in minutes (0: none).",
	"half_round": "Rounds in the first half (0: no half time).",
	"half_score": "Score that ends the first half (0: no half time).",
	"end_round": "Rounds per map (0: no limit).",
	"end_score": "Score that ends the map (0: no limit).",
	"strat_time": "Strat time before each round, in seconds.",
	"roundlength": "Length of each round in minutes.",
	"halftime": "Plays the map in two halves with a side switch (1) or in one (0).",
}

SETTING_DESC = {
	"scr_fast_reload_fix": "Turns the fast-reload fix on or off.",
	"scr_shotgun_consistent": "Shotgun damage depends only on distance: kills at close range, weak at long range.",
	"g_shotgun_spread_fix": "Shotgun pellets form a fixed pattern instead of a random spread (needs CoD2x 1.4.6.5 or later).",
	"scr_hitbox_hand_fix": "Adjusts the damage of hits on the left hand for rifles and scopes.",
	"scr_hitbox_torso_fix": "Adjusts the torso damage of the M1, rifles, scopes and shotgun.",
	"scr_hitbox_neck_kill": "Neck hits count as headshots.",
	"scr_prone_peek_fix": "Turns the prone-peek fix on or off.",
	"scr_mg_peek_fix": "Turns the MG peek fix on or off.",
	"g_antilag": "Takes the player's ping into account when calculating hits.",
	"scr_killcam": "Turns the killcam on or off.",
	"scr_smoke_type": "How smoke grenades look: 0 thin, 1 thick, 2 consistent.",
	"scr_bar_buffed": "Gives the BAR a faster reload and fire rate.",
	"scr_bren_buffed": "Gives the Bren a faster reload.",
	"scr_breakout_british": "Allies are British instead of Americans on Breakout TLS.",
}

# Example values: the gametype ones by their suffix; anything else is a switch.
SETTING_EXAMPLE = {
	"timelimit": "30",
	"half_round": "12",
	"half_score": "0",
	"end_round": "24",
	"end_score": "13",
	"strat_time": "6",
	"roundlength": "2",
	"halftime": "1",
	"scr_smoke_type": "2",
}

REG_RE =r'(?:registerCvarEx\("([CI]?)",\s*|registerCvar\(|\[\[s?[Vv]ar\]\]\()"%s",\s*"(BOOL|INT|FLOAT|STRING)"([^;]*)\);'


def find_registration(src, name):
	"""The setting's registration in zPAM's scripts (not the rule files): method, type, range."""
	root = os.path.join(src.zpam, "source")
	pattern = re.compile(REG_RE % re.escape(name))
	for path in sorted(glob.glob(os.path.join(root, "**", "*.gsc"), recursive=True)):
		rel = os.path.relpath(path, src.zpam).replace(os.sep, "/")
		if "/rules/" in rel:
			continue
		for i, line in enumerate(src.lines(path)):
			if line.lstrip().startswith("//"):
				continue
			m = pattern.search(line)
			if m:
				args = [a.strip() for a in m.group(3).split(",")[1:]]
				return {
					"method": m.group(1) or "",
					"type": m.group(2),
					"args": args,
					"proof": "zpam/%s:%d" % (rel, i + 1)
				}
	raise SystemExit("no registration for zPAM setting " + name)


def value_placeholder(reg):
	t = reg["type"]
	args = reg["args"]
	if t == "BOOL":
		return "[0|1]"
	if len(args) >= 3 and args[1] not in ("undefined",) and args[2] not in ("undefined",):
		return "[%s-%s]" % (args[1], args[2])
	return "[value]"


def zpam_settings(src):
	rel = "source/maps/mp/gametypes/_menu_rcon_settings.gsc"
	path = os.path.join(src.zpam, rel)
	line_re = re.compile(r'cvar_names\[cvar_names\.size\]\s*=\s*"(\w+)";\s*cvar_names_gt\[cvar_names_gt\.size\]\s*=\s*"(\w*)";')
	out = []
	for i, line in enumerate(src.lines(path)):
		m = line_re.search(line)
		if not m:
			continue
		name, gt = m.group(1), m.group(2)
		reg = find_registration(src, name)
		if gt:
			suffix = name[len("scr_%s_" % gt):]
			desc = SETTING_SUFFIX[suffix]
		else:
			desc = SETTING_DESC[name]
		item = {
			"cmd": name,
			"syntax": "%s %s" % (name, value_placeholder(reg)),
			"desc": desc,
			"example": None,
			"source": "zpam",
			"category": "settings",
			"gametype": gt or None,
			"rules": reg["method"] == "C",
			"proof": ["zpam/%s:%d" % (rel, i + 1), reg["proof"]]
		}
		out.append(item)
	if not out:
		raise SystemExit("no settings found in " + rel)
	for item in out:
		gt = item["gametype"]
		value = SETTING_EXAMPLE.get(item["cmd"][len("scr_%s_" % gt):] if gt else item["cmd"], "1")
		item["example"] = "%s %s" % (item["cmd"], value)
	return out


def arena(text):
	"""The map blocks of a .arena file: map, longname, gametype, with their line."""
	maps = []
	for m in re.finditer(r"\{(.*?)\}", text, re.S):
		block = m.group(1)
		fields = dict(re.findall(r'(\w+)\s+"([^"]*)"', block))
		if "map" in fields:
			maps.append((fields, text.count("\n", 0, m.start()) + 1))
	return maps


def title_from_reference(ref):
	"""MPUI_SEARCH_AND_DESTROY -> Search and Destroy."""
	small = { "AND", "THE", "OF" }
	words = ref.split("_")[1:]
	return " ".join(w.lower() if w in small and i else w.capitalize() for i, w in enumerate(words))


def gametypes(src):
	out = []
	iw07 = zipfile.ZipFile(os.path.join(src.cod2, "main", "iw_07.iwd"))
	for gt in ["dm", "tdm", "sd", "hq", "ctf"]:
		member = "maps/mp/gametypes/%s.txt" % gt
		ref = iw07.read(member).decode("latin-1").strip().strip('"')
		iw07.getinfo("maps/mp/gametypes/%s.gsc" % gt)
		out.append({ "id": gt, "name": title_from_reference(ref), "source": "stock",
			"proof": ["iw_07.iwd:" + member + " (" + ref + ")", "iw_07.iwd:maps/mp/gametypes/%s.gsc" % gt] })

	readme = os.path.join(src.zpam, "README.md")
	for gt in ["htf", "re", "strat"]:
		gsc = os.path.join(src.zpam, "source", "maps", "mp", "gametypes", gt + ".gsc")
		if not os.path.isfile(gsc):
			raise SystemExit("zPAM gametype script missing: " + gsc)
		at = src.find_index(readme, "(%s)" % gt)
		name = re.match(r"\s*-\s*(.+?)\s*\(%s\)" % gt, src.lines(readme)[at]).group(1)
		out.append({ "id": gt, "name": name, "source": "zpam",
			"proof": ["zpam/README.md:%d" % (at + 1), "zpam/source/maps/mp/gametypes/%s.gsc" % gt] })
	return out


def maps(src):
	out = []
	iw15 = zipfile.ZipFile(os.path.join(src.cod2, "main", "iw_15.iwd"))
	text = iw15.read("mp/CoD2maps.arena").decode("latin-1")
	for fields, line in arena(text):
		out.append({ "id": fields["map"], "name": fields["longname"], "source": "stock",
			"gametypes": fields["gametype"].split(), "proof": ["iw_15.iwd:mp/CoD2maps.arena:%d" % line] })

	pack = "zpam_maps_v7.iwd"
	z = zipfile.ZipFile(os.path.join(src.cod2, "main", pack))
	names = set(n.lower() for n in z.namelist())
	for member in sorted(n for n in z.namelist() if n.lower().startswith("mp/") and n.lower().endswith(".arena")):
		for fields, line in arena(z.read(member).decode("latin-1")):
			bsp = "maps/mp/%s.d3dbsp" % fields["map"]
			if bsp.lower() not in names:
				continue
			listed = [i for i, l in enumerate(src.lines(os.path.join(src.zpam, "README.md")))
				if ("`%s`" % fields["map"]).lower() in l.lower()]
			if not listed:
				continue
			out.append({ "id": fields["map"], "name": fields["longname"], "source": "zpam",
				"gametypes": fields["gametype"].split(),
				"proof": ["%s:%s:%d" % (pack, member, line), "%s:%s" % (pack, bsp), "zpam/README.md:%d" % (listed[0] + 1)] })
	return out


# The README's table texts, as sentences.
TOKEN_DESC = {
	"pub": "Public: the server's own settings.",
	"comp": "Competitive: 6 seconds strat time, auto recording, team names, ready-up time limit.",
	"warmup": "No ready-up, for warming up before a match (DM only).",
	"mr3, mr10, mr12, mr15": "Max rounds (S&D and Retrieval only).",
	"20rounds": "First team to 21 wins (S&D and Retrieval only).",
	"10min, 15min, 30min, 60min, unlim": "Total time limit (TDM, DM, HQ, CTF and HTF only).",
	"2v2": "Scoped weapons and shotguns are disabled.",
	"rifle": "Bolt-action rifles and snipers only, no grenades, no weapon drop.",
	"russian": "The Russian side is used on Russian maps.",
	"draw": "No overtime.",
	"lan": "No ready-up warnings.",
	"custom": "Custom ruleset.",
	"na": "North American ruleset.",
	"sa": "South American ruleset.",
}


def pam_modes(src):
	"""The README's mode tables: modes, score sub-modes, options, and the examples."""
	readme = os.path.join(src.zpam, "README.md")
	lines = src.lines(readme)
	start = src.find_index(readme, "### PAM modes")
	tables = {}
	section = None
	examples = []
	for i in range(start, len(lines)):
		line = lines[i].strip()
		if line.startswith("## ") and i > start:
			break
		if line.startswith("#"):
			section = line.lstrip("#").strip()
			continue
		m = re.match(r"\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$", line)
		if not m or set(m.group(1)) <= set("-") or m.group(1) in ("PAM mode", "Score sub-mode", "Option sub-mode"):
			continue
		key, desc = m.group(1), m.group(2)
		if key.startswith("/rcon pam_mode "):
			examples.append({ "mode": key[len("/rcon pam_mode "):], "desc": desc, "proof": "zpam/README.md:%d" % (i + 1) })
		else:
			tables.setdefault(section, []).append({ "name": key, "desc": desc, "proof": "zpam/README.md:%d" % (i + 1) })

	kinds = [("PAM modes", "mode"), ("Score modes", "score"), ("Options", "option")]
	tokens = []
	for title, kind in kinds:
		if title not in tables:
			raise SystemExit("README table missing: " + title)
		for t in tables[title]:
			if t["name"] not in TOKEN_DESC:
				raise SystemExit("no description for pam_mode token: " + t["name"])
			t["desc"] = TOKEN_DESC[t["name"]]
			t["kind"] = kind
			tokens.append(t)
	for e in examples:
		e["desc"] = e["desc"].rstrip(".") + "."

	# Every token has to be one zPAM's scripts check for (most in global/rules.gsc).
	scripts = ""
	for path in glob.glob(os.path.join(src.zpam, "source", "maps", "mp", "gametypes", "**", "*.gsc"), recursive=True):
		scripts += open(path, encoding="latin-1").read()
	for t in tokens:
		for part in re.split(r",\s*", t["name"]):
			if '"%s"' % part not in scripts:
				raise SystemExit("pam_mode token not in zPAM's scripts: " + part)
	return { "tokens": tokens, "examples": examples }


def intro(src):
	usage = src.handler("CL_Rcon_f")
	return [
		{ "cmd": "rcon_password", "syntax": "set rcon_password [password]",
			"desc": "Goes into the server's config; without a password, rcon does not work.",
			"proof": [src.exe_str("rcon_password"), src.win('"rcon_password"'),
				src.exe_str("The server must set 'rcon_password' for clients to use 'rcon'.", False)] },
		{ "cmd": "rcon login", "syntax": "/rcon login [password]",
			"desc": "Logs you in from your console; the game keeps the password until you log out.",
			"proof": [usage, src.exe_str("USAGE: rcon login <password>", False)] },
		{ "cmd": "rcon", "syntax": "/rcon [command]",
			"desc": "Sends a command to the server, up to 1023 characters.",
			"proof": [usage, src.exe_str("You need to log in with 'rcon login <password>' before using rcon.", False),
				src.mac('"rcon commands are limited to %i characters\\n", 1023')] },
		{ "cmd": "rcon host", "syntax": "/rcon host [address]",
			"desc": "Picks the server when you are not connected to it; without a port, 28960 is used.",
			"proof": [usage, src.exe_str("USAGE: rcon host <address>", False), src.mac("word_FE9EA0 = 8305;")] },
		{ "cmd": "rcon logout", "syntax": "/rcon logout",
			"desc": "Forgets the password.",
			"proof": [usage, src.mac('I_stricmp(v4, "logout")')] },
	]


def to_items(rows, source):
	return [{ "cmd": c, "syntax": s, "desc": d, "example": e, "source": source, "category": cat, "proof": p }
		for c, s, d, e, cat, p in rows]


def check(items):
	seen = set()
	for it in items:
		key = it["cmd"].lower()
		if key in seen:
			raise SystemExit("duplicate command: " + it["cmd"])
		seen.add(key)
		if not it["syntax"].startswith(it["cmd"].split(" ")[0]):
			raise SystemExit("syntax does not start with the command: " + it["cmd"])
		if not it["proof"]:
			raise SystemExit("no proof: " + it["cmd"])
		if not it["desc"].endswith("."):
			raise SystemExit("description is not a sentence: " + it["cmd"])


HEADER = """/*
 * CoD2 rcon commands: stock 1.3, CoD2x and zPAM. Generated by tools/build-cod2-rcon.py;
 * do not edit by hand.
 *
 * commands: cmd, syntax ([placeholders] are yours to fill in), desc, example,
 * source (stock / cod2x / zpam), category, proof (file:line or exe@offset; not shown).
 * settings: zPAM's rcon-menu settings, same fields plus gametype and rules
 * (true: zPAM always sets them back to the rules' value at the next map).
 */
"""


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--cod2", required=True, help="CoD2 1.3 install (CoD2MP_s.exe, main/)")
	ap.add_argument("--cod2x", required=True, help="CoD2x source checkout")
	ap.add_argument("--zpam", required=True, help="zPAM (zpam3) source checkout")
	ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "cod2",
		"rcon-data.js"), help="where the data goes (default: js/cod2/rcon-data.js)")
	args = ap.parse_args()

	src = Sources(args.cod2, args.cod2x, args.zpam)

	commands = (to_items(stock_commands(src), "stock") + to_items(cod2x_commands(src), "cod2x")
		+ to_items(zpam_commands(src), "zpam"))
	settings = zpam_settings(src)
	check(commands + settings)

	data = {
		"sources": SOURCES,
		"categories": CATEGORIES,
		"intro": intro(src),
		"commands": commands,
		"gametypes": gametypes(src),
		"maps": maps(src),
		"pamModes": pam_modes(src),
		"settingsWarning": SETTINGS_WARNING,
		"settings": settings
	}

	with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
		fh.write(HEADER)
		fh.write("window.COD2_RCON = ")
		json.dump(data, fh, ensure_ascii=False, indent="\t")
		fh.write(";\n")

	count = {}
	for it in commands:
		count[it["source"]] = count.get(it["source"], 0) + 1
	print("commands: %d (%s)" % (len(commands), ", ".join("%s %d" % kv for kv in count.items())))
	print("settings: %d (%d rules)" % (len(settings), sum(1 for s in settings if s["rules"])))
	print("gametypes: %d, maps: %d" % (len(data["gametypes"]), len(data["maps"])))
	print("pam_mode tokens: %d, examples: %d" % (len(data["pamModes"]["tokens"]), len(data["pamModes"]["examples"])))
	print("wrote " + os.path.normpath(args.out))


if __name__ == "__main__":
	main()
