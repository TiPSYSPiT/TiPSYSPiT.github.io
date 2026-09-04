/*
 * Promod rcon reference.
 *
 * Sources, per entry:
 *   - promod_commands.txt (the file in this folder)
 *   - help.fshost.me/games/cod4/mods/promodlive  (preset modes, extra examples)
 * The preset mode names were cross-checked against promod_x-master/promod/modes.gsc.
 *
 * Map and game mode lists are sorted by display name.
 */
(function ()
{
	"use strict";

	var COPIED_RESET_MS = 1500;
	var HINT_RESET_MS = 3000;

	var GROUPS = [
		{
			title: "Authentication & server",
			items: [
				{ cmd: "/rcon login [password]", desc: "Logs you in as an administrator." },
				{ cmd: "/rcon status", desc: "Displays connected players, IDs, GUIDs, and IPs." },
				{ cmd: "/rcon say [message]", desc: "Sends a global text message to all active players." }
			]
		},
		{
			title: "Promod modes",
			note: "The promod_mode dvar follows a specific syntax. The game accepts the bits " +
				"between underscores ( _ ) in any order, so match_mr12_knife and " +
				"knife_mr12_match are the same thing.",
			tokens: [
				{ name: "match", desc: "Standard match mode, may not be used with knockout mode. Round limit = mr#*2" },
				{ name: "knockout", desc: "Knockout match mode, may not be used with standard match mode. Score limit = mr#+1" },
				{ name: "mr#", desc: "Maxrounds, for example mr10, mr12 or mr15. Default is 10. Works only in Search & Destroy and Sabotage." },
				{ name: "lan", desc: "LAN mode \u2014 g_antilag 0, PunkBuster messages turned off, may not be used with pb mode." },
				{ name: "pb", desc: "PunkBuster variant, may not be combined with lan. The source only shows it inside examples such as match_mr12_pb and does not define it on its own." },
				{ name: "hc", desc: "Hardcore mode (disables some HUD elements and reduces health level to 30)." },
				{ name: "knife", desc: "Knife round \u2014 adds a knife round and an extra ready-up mode to Search & Destroy matches." },
				{ name: "1v1 / 2v2", desc: "Used for 1v1 and 2v2 matches, disables Demolitions and Sniper classes." },
				{ name: "#:#", desc: "Sets the match score in S&D using A:D format \u2014 useful in case of a restart, may not be used with knife mode." },
				{ name: "strat", desc: "Strategy mode for practicing." }
			],
			blocks: [
				{
					label: "Examples",
					items: [
						{ cmd: "/rcon promod_mode match_mr12", desc: "Standard match, 12 maxrounds." },
						{ cmd: "/rcon promod_mode knockout_mr12_knife", desc: "Knockout, 12 maxrounds, with knife round." },
						{ cmd: "/rcon promod_mode 1v1_mr10", desc: "1v1 match, 10 maxrounds." },
						{ cmd: "/rcon promod_mode 2v2_mr10", desc: "2v2 match, 10 maxrounds." },
						{ cmd: "/rcon promod_mode strat", desc: "Strategy mode for practicing." }
					]
				}
			]
		},
		{
			title: "Game modes",
			note: "Change gametype: /rcon g_gametype [mode].",
			grid: [
				{ name: "Domination", cmd: "/rcon g_gametype dom" },
				{ name: "Free For All / Deathmatch", cmd: "/rcon g_gametype dm" },
				{ name: "Headquarters", cmd: "/rcon g_gametype koth" },
				{ name: "Sabotage", cmd: "/rcon g_gametype sab" },
				{ name: "Search & Destroy", cmd: "/rcon g_gametype sd" },
				{ name: "Team Deathmatch", cmd: "/rcon g_gametype war" }
			]
		},
		{
			title: "Match control",
			items: [
				{ cmd: "/rcon map_restart", desc: "Restarts the current round or map." },
				{ cmd: "/rcon fast_restart", desc: "Restarts the current round or map." }
			]
		},
		{
			title: "Maps",
			note: "Change map: /rcon map [mapname] \u2014 switches the current map.",
			grid: [
				{ name: "Ambush", cmd: "/rcon map mp_convoy" },
				{ name: "Backlot", cmd: "/rcon map mp_backlot" },
				{ name: "Bloc", cmd: "/rcon map mp_bloc" },
				{ name: "Bog", cmd: "/rcon map mp_bog" },
				{ name: "Broadcast", cmd: "/rcon map mp_broadcast" },
				{ name: "China Town", cmd: "/rcon map mp_carentan" },
				{ name: "Countdown", cmd: "/rcon map mp_countdown" },
				{ name: "Crash", cmd: "/rcon map mp_crash" },
				{ name: "Creek", cmd: "/rcon map mp_creek" },
				{ name: "Crossfire", cmd: "/rcon map mp_crossfire" },
				{ name: "District", cmd: "/rcon map mp_citystreets" },
				{ name: "Downpour", cmd: "/rcon map mp_farm" },
				{ name: "Killhouse", cmd: "/rcon map mp_killhouse" },
				{ name: "Overgrown", cmd: "/rcon map mp_overgrown" },
				{ name: "Pipeline", cmd: "/rcon map mp_pipeline" },
				{ name: "Shipment", cmd: "/rcon map mp_shipment" },
				{ name: "Showdown", cmd: "/rcon map mp_showdown" },
				{ name: "Strike", cmd: "/rcon map mp_strike" },
				{ name: "Vacant", cmd: "/rcon map mp_vacant" },
				{ name: "Wet Work", cmd: "/rcon map mp_cargoship" },
				{ name: "Winter Crash", cmd: "/rcon map mp_crash_snow" }
			]
		}
	];

	var list = null;
	var hint = null;
	var defaultHint = "";
	var hintTimer = null;

	function setHint(message, isError)
	{
		if (hint === null)
		{
			return;
		}

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
			helper.style.top = "-1000px";
			document.body.appendChild(helper);
			helper.select();

			var copied = false;
			try
			{
				copied = document.execCommand("copy");
			}
			catch (err)
			{
				copied = false;
			}

			document.body.removeChild(helper);

			if (copied)
			{
				resolve();
			}
			else
			{
				reject(new Error("copy command rejected"));
			}
		});
	}

	// The button confirms on itself, so feedback stays where the eye already is.
	function makeCopyButton(command)
	{
		var button = document.createElement("button");
		button.type = "button";
		button.className = "btn btn-sm rc-copy";
		button.textContent = "Copy";
		button.setAttribute("data-command", command);
		button.setAttribute("aria-label", "Copy " + command);
		return button;
	}

	function onCopyClick(event)
	{
		var button = event.target.closest ? event.target.closest(".rc-copy") : null;
		if (button === null)
		{
			return;
		}

		var command = button.getAttribute("data-command");

		copyText(command).then(function ()
		{
			window.clearTimeout(button.resetTimer);
			button.textContent = "Copied";
			button.classList.add("is-copied");

			button.resetTimer = window.setTimeout(function ()
			{
				button.textContent = "Copy";
				button.classList.remove("is-copied");
			}, COPIED_RESET_MS);
		}, function ()
		{
			setHint("Could not copy \u2014 select the command and copy manually.", true);
		});
	}

	/* ---------- rendering ---------- */

	function el(tag, className, text)
	{
		var node = document.createElement(tag);
		if (className)
		{
			node.className = className;
		}
		if (text !== undefined)
		{
			node.textContent = text;
		}
		return node;
	}

	function makeItem(item)
	{
		var row = el("div", "rc-item");
		var text = el("div", "rc-item-text");

		text.appendChild(el("code", "rc-code", item.cmd));
		if (item.desc)
		{
			text.appendChild(el("p", "rc-desc", item.desc));
		}

		row.appendChild(text);
		row.appendChild(makeCopyButton(item.cmd));
		return row;
	}

	function makeItems(items)
	{
		var box = el("div", "rc-items");
		for (var i = 0; i < items.length; i++)
		{
			box.appendChild(makeItem(items[i]));
		}
		return box;
	}

	function makeTokens(tokens)
	{
		var box = el("dl", "rc-tokens");

		for (var i = 0; i < tokens.length; i++)
		{
			box.appendChild(el("dt", null, tokens[i].name));
			box.appendChild(el("dd", null, tokens[i].desc));
		}

		return box;
	}

	// Uniform short entries (maps, game modes) read better as a grid.
	function makeGrid(entries)
	{
		var grid = el("div", "rc-grid");

		for (var i = 0; i < entries.length; i++)
		{
			var cell = el("div", "rc-cell");
			var text = el("div", "rc-item-text");

			text.appendChild(el("span", "rc-cell-name", entries[i].name));
			text.appendChild(el("code", "rc-code", entries[i].cmd));

			cell.appendChild(text);
			cell.appendChild(makeCopyButton(entries[i].cmd));
			grid.appendChild(cell);
		}

		return grid;
	}

	function makeGroup(group)
	{
		var section = el("section", "rc-group");

		section.appendChild(el("h2", "rc-title", group.title));

		if (group.note)
		{
			section.appendChild(el("p", "rc-note", group.note));
		}

		if (group.tokens)
		{
			section.appendChild(makeTokens(group.tokens));
		}

		if (group.items)
		{
			section.appendChild(makeItems(group.items));
		}

		if (group.blocks)
		{
			for (var i = 0; i < group.blocks.length; i++)
			{
				section.appendChild(el("h3", "rc-sub", group.blocks[i].label));
				section.appendChild(makeItems(group.blocks[i].items));
			}
		}

		if (group.grid)
		{
			section.appendChild(makeGrid(group.grid));
		}

		return section;
	}

	function init()
	{
		list = document.getElementById("rc-list");
		hint = document.getElementById("rc-hint");

		if (list === null)
		{
			return;
		}

		if (hint !== null)
		{
			defaultHint = hint.textContent;
		}

		for (var i = 0; i < GROUPS.length; i++)
		{
			list.appendChild(makeGroup(GROUPS[i]));
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
