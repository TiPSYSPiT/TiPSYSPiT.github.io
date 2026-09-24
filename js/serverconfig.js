/*
 * Server configuration tab.
 *
 * Built from the settings a CoD4 server.cfg actually uses, with every name
 * checked against the dvar extraction that feeds the dvars tab. Defaults and
 * ranges quoted below are the engine's own, not values copied from a guide,
 * and a few names that circulate in copied configs are called out because the
 * engine never registers them.
 */
(function ()
{
	"use strict";

	var COPIED_RESET_MS = 1200;
	var HINT_RESET_MS = 3000;

	var SECTIONS = [
		{
			title: "Colour codes",
			note: "Usable anywhere the server shows text: the host name, the message of the " +
				"day, admin messages. ^ plus a digit switches colour from that point on.",
			lines: [
				{ code: "// ^1 red   ^2 green   ^3 yellow   ^4 blue" },
				{ code: "// ^5 cyan  ^6 pink    ^7 white    ^0 black" }
			]
		},
		{
			title: "Identity",
			lines: [
				{ code: 'sets sv_hostname "^1CoD4 ^7Server"',
					desc: "The name in the server browser. Default CoD4Host." },
				{ code: 'sets _Admin ""', desc: "Who runs the server." },
				{ code: 'sets _Email ""', desc: "Contact address." },
				{ code: 'sets _Website ""', desc: "Your site." },
				{ code: 'sets _Location ""', desc: "Where the machine stands." },
				{ code: 'sets _Irc ""', desc: "IRC channel, if you still have one." },
				{ code: 'set scr_motd ""', desc: "Message of the day, shown as players join." }
			],
			note: "sets rather than set: it publishes the value in the server info that the " +
				"browser reads, which is why the five underscore fields use it. scr_motd is " +
				"read by the game scripts rather than the engine, so it has no default of its own."
		},
		{
			title: "Slots and passwords",
			lines: [
				{ code: 'set sv_maxclients "20"', desc: "Total slots. Default 32." },
				{ code: 'set sv_privateclients "0"',
					desc: "Reserved slots, 0 to 64. Public slots are maxclients minus this." },
				{ code: 'set rcon_password ""', desc: "Needed for every rcon command. Leave it empty and rcon is off." },
				{ code: 'set sv_privatePassword ""', desc: "Password for the reserved slots." },
				{ code: 'set g_password ""', desc: "Locks the whole server. Useful for matches and practice." }
			]
		},
		{
			title: "Logging",
			lines: [
				{ code: 'set logfile "1"', desc: "0 off, 1 write asynchronously, 2 flush on every write. Default 1." },
				{ code: 'set g_log "games_mp.log"', desc: "File name. Default games_mp.log." },
				{ code: 'set g_logsync "0"', desc: "Synchronous logging on or off. Default off." }
			],
			note: "Guides often put the 0 to 3 mode list on g_logsync and set it to 2. The modes " +
				"belong to logfile; g_logsync is a plain switch. sv_log_damage turns up in the " +
				"same copied configs and is not a CoD4 dvar at all."
		},
		{
			title: "Connection limits",
			lines: [
				{ code: 'set sv_minPing "0"', desc: "Lowest ping allowed on connect, 0 to 999. 0 means no limit." },
				{ code: 'set sv_maxping "0"', desc: "Highest ping allowed on connect, 0 to 999. Default 0, so no limit." },
				{ code: 'set sv_maxRate "25000"', desc: "Bandwidth ceiling per client. Default 5000, maximum 25000." },
				{ code: 'set sv_fps "20"', desc: "Server tick rate, 10 to 1000. Default 20." }
			],
			note: "sv_fps also caps what a client's snaps setting can reach. Promod X lists " +
				"increased network rates among its changes, so a Promod server will not be " +
				"sitting on the old 5000."
		},
		{
			title: "Dropping idle players",
			lines: [
				{ code: 'set sv_timeout "240"', desc: "Seconds without a message before a client is dropped, 0 to 1800." },
				{ code: 'set sv_zombietime "2"', desc: "Seconds to keep syncing after a disconnect, 0 to 1800." },
				{ code: 'set g_inactivity "0"', desc: "Seconds of standing still before a kick. 0 never kicks." }
			],
			note: "g_inactivityspectator appears in the same guides but is not a CoD4 dvar."
		},
		{
			title: "Flood protection",
			lines: [
				{ code: 'set sv_floodProtect "4"',
					desc: "How many client commands the server processes per 800 ms. 0 turns it off." },
				{ code: 'set sv_reconnectlimit "3"', desc: "Minimum seconds between connect attempts, 0 to 1800." }
			],
			note: "Not a switch, a count: setting it to 1 is far stricter than it looks. Promod " +
				"sets 4 in its own match modes."
		},
		{
			title: "Anti-cheat",
			lines: [
				{ code: 'set sv_cheats "0"', desc: "Cheat-protected dvars. Off for anything competitive." },
				{ code: 'set sv_pure "1"', desc: "Refuse clients with modified iwd files. Default off." },
				{ code: 'set sv_punkbuster "0"', desc: "PunkBuster. Default on." },
				{ code: 'set sv_disableClientConsole "0"', desc: "Take the console away from clients. Default off." },
				{ code: 'set g_no_script_spam "1"', desc: "Silence script debug output. Default off." },
				{ code: 'set g_banIPs ""', desc: "Comma separated list of banned addresses." }
			],
			note: "cl_autocmd shows up in these blocks in older guides. It is a client name, not " +
				"a server one, and CoD4 does not register it either way."
		},
		{
			title: "Bans",
			lines: [
				{ code: 'set sv_kickBanTime "3600"', desc: "How long a kicked player stays out, in seconds." }
			]
		},
		{
			title: "Voice",
			lines: [
				{ code: 'set sv_voice "0"', desc: "Server side voice. Default off." },
				{ code: 'set sv_voiceQuality "3"', desc: "0 to 9. Default 3." },
				{ code: 'set voice_deadChat "0"', desc: "Let the dead talk to the living. Default off." },
				{ code: 'set voice_global "0"', desc: "Voice reaches everyone, not just your team. Default off." },
				{ code: 'set voice_localEcho "0"', desc: "Echo a player's own voice back. Default off." }
			],
			note: "Guides tend to file winvoice_mic_mute and sv_allowAnonymous under voice as " +
				"well. The first is a client setting, the second has nothing to do with voice."
		},
		{
			title: "Gameplay",
			lines: [
				{ code: 'set g_antilag "1"', desc: "Lag compensation on weapon hits. Default on." },
				{ code: 'set g_compassShowEnemies "0"', desc: "Enemies permanently on the compass. Default off." }
			]
		},
		{
			title: "Client downloads",
			lines: [
				{ code: 'set sv_allowdownload "1"', desc: "Let clients pull missing files. Default on." },
				{ code: 'seta sv_wwwDownload "1"', desc: "Send them to a web server instead. Default off." },
				{ code: 'seta sv_wwwBaseURL "http://example.com/cod4"', desc: "Where those files live." },
				{ code: 'seta sv_wwwDlDisconnected "1"', desc: "1 keeps them connected while downloading. Default off." }
			],
			note: "Only needed if you run a mod or custom maps."
		},
		{
			title: "Master servers",
			note: "Copied configs still carry a block of sv_master1 to sv_master7 and sv_gamespy " +
				"pointing at Activision and GameSpy. None of those names is a CoD4 dvar, so the " +
				"lines do nothing, and the GameSpy master servers were switched off in 2014. " +
				"Server listing today runs through CoD4X."
		},
		{
			title: "Free for all (dm)",
			lines: [
				{ code: "set scr_dm_scorelimit 150" },
				{ code: "set scr_dm_timelimit 10" },
				{ code: "set scr_dm_roundlimit 1" },
				{ code: "set scr_dm_numlives 0" },
				{ code: "set scr_dm_playerrespawndelay 0" },
				{ code: "set scr_dm_waverespawndelay 0" }
			]
		},
		{
			title: "Team deathmatch (war)",
			lines: [
				{ code: "set scr_war_scorelimit 750" },
				{ code: "set scr_war_timelimit 10" },
				{ code: "set scr_war_roundlimit 1" },
				{ code: "set scr_war_numlives 0" },
				{ code: "set scr_war_playerrespawndelay 0" },
				{ code: "set scr_war_waverespawndelay 0" }
			]
		},
		{
			title: "Domination (dom)",
			lines: [
				{ code: "set scr_dom_scorelimit 200" },
				{ code: "set scr_dom_timelimit 0" },
				{ code: "set scr_dom_roundlimit 1" },
				{ code: "set scr_dom_numlives 0" },
				{ code: "set scr_dom_playerrespawndelay 0" },
				{ code: "set scr_dom_waverespawndelay 0" }
			]
		},
		{
			title: "Headquarters (koth)",
			lines: [
				{ code: "set scr_koth_scorelimit 250" },
				{ code: "set scr_koth_timelimit 15" },
				{ code: "set scr_koth_roundlimit 1" },
				{ code: "set scr_koth_roundswitch 1" },
				{ code: "set scr_koth_numlives 0" },
				{ code: "set scr_koth_playerrespawndelay 0" },
				{ code: "set scr_koth_waverespawndelay 0" },
				{ code: "set koth_autodestroytime 60" },
				{ code: "set koth_spawntime 0" },
				{ code: "set koth_kothmode 0" },
				{ code: "set koth_capturetime 20" },
				{ code: "set koth_destroytime 10" },
				{ code: "set koth_delayPlayer 0" },
				{ code: "set koth_spawnDelay 60" }
			]
		},
		{
			title: "Sabotage (sab)",
			lines: [
				{ code: "set scr_sab_scorelimit 1" },
				{ code: "set scr_sab_timelimit 20" },
				{ code: "set scr_sab_roundlimit 0" },
				{ code: "set scr_sab_roundswitch 1" },
				{ code: "set scr_sab_numlives 0" },
				{ code: "set scr_sab_bombtimer 30" },
				{ code: "set scr_sab_planttime 2.5" },
				{ code: "set scr_sab_defusetime 5" },
				{ code: "set scr_sab_hotpotato 0" },
				{ code: "set scr_sab_playerrespawndelay 7.5" },
				{ code: "set scr_sab_waverespawndelay 0" }
			]
		},
		{
			title: "Search and destroy (sd)",
			lines: [
				{ code: "set scr_sd_scorelimit 4" },
				{ code: "set scr_sd_timelimit 2.5" },
				{ code: "set scr_sd_roundlimit 0" },
				{ code: "set scr_sd_roundswitch 3", desc: "Rounds before the teams swap sides." },
				{ code: "set scr_sd_numlives 1", desc: "1 makes it elimination: no respawns." },
				{ code: "set scr_sd_bombtimer 45" },
				{ code: "set scr_sd_planttime 5" },
				{ code: "set scr_sd_defusetime 5" },
				{ code: "set scr_sd_multibomb 0" },
				{ code: "set scr_sd_playerrespawndelay 0" },
				{ code: "set scr_sd_waverespawndelay 0" }
			],
			note: "The mode Promod matches run. Promod overrides most of these itself through " +
				"promod_mode, so set the mode rather than these lines on a match server."
		},
		{
			title: "Map rotation",
			lines: [
				{ code: 'set sv_maprotationcurrent ""', desc: "Leave empty. The server fills it in as it works through the list." },
				{ code: 'set sv_mapRotation "gametype sd map mp_backlot gametype sd map mp_crash gametype sd map mp_crossfire gametype sd map mp_citystreets gametype sd map mp_strike"',
					desc: "Gametype and map in pairs, one long string." }
			],
			note: "The gametype can change from entry to entry, so one rotation can mix modes. " +
				"The rcon commands tab lists every map name."
		}
	];

	var list = null, hint = null;
	var defaultHint = "", hintTimer = null;

	/* ---------- helpers ---------- */

	function el(tag, className, text)
	{
		var node = document.createElement(tag);
		if (className) { node.className = className; }
		if (text !== undefined) { node.textContent = text; }
		return node;
	}

	function setHint(message, isError)
	{
		if (hint === null) { return; }
		window.clearTimeout(hintTimer);
		hint.textContent = message;
		hint.classList.toggle("is-error", isError === true);
		hintTimer = window.setTimeout(function ()
		{
			hint.textContent = defaultHint;
			hint.classList.remove("is-error");
		}, HINT_RESET_MS);
	}

	function copyText(text)
	{
		if (navigator.clipboard && navigator.clipboard.writeText)
		{
			return navigator.clipboard.writeText(text);
		}

		return new Promise(function (resolve, reject)
		{
			var helper = document.createElement("textarea");
			helper.value = text;
			helper.setAttribute("readonly", "");
			helper.style.position = "fixed";
			helper.style.opacity = "0";
			document.body.appendChild(helper);
			helper.select();

			var ok = false;
			try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
			document.body.removeChild(helper);
			if (ok) { resolve(); } else { reject(new Error("copy rejected")); }
		});
	}

	/* ---------- rendering ---------- */

	function makeSection(section)
	{
		var node = el("section", "rc-group sc-group");

		var head = el("div", "sc-head");
		head.appendChild(el("h2", "rc-title", section.title));

		if (section.lines)
		{
			var block = section.lines.map(function (line) { return line.code; }).join("\n");
			var button = el("button", "btn btn-sm sc-copy", "Copy block");
			button.type = "button";
			button.setAttribute("data-command", block);
			button.setAttribute("aria-label", "Copy the " + section.title + " block");
			head.appendChild(button);
		}

		node.appendChild(head);

		if (section.lines)
		{
			for (var i = 0; i < section.lines.length; i++)
			{
				var row = el("div", "sc-line");
				row.appendChild(el("code", "sc-code", section.lines[i].code));
				if (section.lines[i].desc)
				{
					row.appendChild(el("p", "sc-desc", section.lines[i].desc));
				}
				node.appendChild(row);
			}
		}

		if (section.note) { node.appendChild(el("p", "sc-note", section.note)); }

		return node;
	}

	function onCopyClick(event)
	{
		var button = event.target.closest ? event.target.closest(".sc-copy") : null;
		if (button === null) { return; }

		var block = button.getAttribute("data-command");
		copyText(block).then(function ()
		{
			window.clearTimeout(button.resetTimer);
			button.textContent = "Copied";
			button.classList.add("is-copied");
			button.resetTimer = window.setTimeout(function ()
			{
				button.textContent = "Copy block";
				button.classList.remove("is-copied");
			}, COPIED_RESET_MS);
		}, function ()
		{
			setHint("Could not copy — select the lines and copy manually.", true);
		});
	}

	function init()
	{
		list = document.getElementById("sc-list");
		hint = document.getElementById("sc-hint");

		if (list === null) { return; }
		if (hint !== null) { defaultHint = hint.textContent; }

		for (var i = 0; i < SECTIONS.length; i++)
		{
			list.appendChild(makeSection(SECTIONS[i]));
		}

		list.addEventListener("click", onCopyClick);
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
