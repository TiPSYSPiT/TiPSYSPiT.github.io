/*
 * FAQ tab.
 *
 * Everything here was checked against the CoD4 sources rather than written from
 * memory: dvar names, defaults and ranges come from the same extraction that
 * feeds the dvars tab, the console commands from Cmd_AddCommandInternal, the
 * profile path from Com_BuildPlayerProfilePath, and the set / seta / sets /
 * setu flags from Dvar_SetA_f and its siblings.
 */
(function ()
{
	"use strict";

	var COPIED_RESET_MS = 1200;
	var HINT_RESET_MS = 3000;

	// KeyboardEvent.code mapped to the name CoD4 binds under, from the keynames
	// table in cl_keys.cpp. Only keys that produce no character are listed:
	// those cannot be typed into the field, so the field catches them instead.
	// Printable keys, Tab, Escape, Backspace and the modifiers are left alone,
	// so ordinary typing and Shift for capitals keep working.
	var CAPTURED_KEYS = {
		F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
		F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
		ArrowUp: "UPARROW", ArrowDown: "DOWNARROW",
		ArrowLeft: "LEFTARROW", ArrowRight: "RIGHTARROW",
		Insert: "INS", Delete: "DEL", PageUp: "PGUP", PageDown: "PGDN",
		Home: "HOME", End: "END", Pause: "PAUSE", CapsLock: "CAPSLOCK",
		Enter: "ENTER", Space: "SPACE",
		NumLock: "KP_NUMLOCK", Numpad0: "KP_INS", Numpad1: "KP_END",
		Numpad2: "KP_DOWNARROW", Numpad3: "KP_PGDN", Numpad4: "KP_LEFTARROW",
		Numpad5: "KP_5", Numpad6: "KP_RIGHTARROW", Numpad7: "KP_HOME",
		Numpad8: "KP_UPARROW", Numpad9: "KP_PGUP", NumpadDecimal: "KP_DEL",
		NumpadDivide: "KP_SLASH", NumpadMultiply: "KP_STAR",
		NumpadSubtract: "KP_MINUS", NumpadAdd: "KP_PLUS",
		NumpadEnter: "KP_ENTER", NumpadEqual: "KP_EQUALS"
	};

	var ENTRIES = [
		/* ---------- Getting started ---------- */
		{
			group: "Getting started",
			q: "I have the game on disc. What do I install, and in what order?",
			a: "Four things, and the order matters: each patch expects the one before it.",
			steps: [
				{ text: "Install Call of Duty 4 from your discs." },
				{ text: "Apply patch 1.6." },
				{ text: "Apply patch 1.7 on top of it." },
				{ text: "Install the CoD4X 21.3 client.", link: "https://cod4x.ovh/t/cod4x-client-and-server-files/24",
					linkText: "cod4x.ovh" }
			]
		},
		{
			group: "Getting started",
			q: "I bought the game on Steam. What do I still need?",
			a: "Only the last step. Steam keeps the game patched to 1.7 for you, so the official " +
				"patches are already done by the time it finishes installing.",
			steps: [
				{ text: "Buy and install Call of Duty 4: Modern Warfare through Steam." },
				{ text: "Install the CoD4X 21.3 client.", link: "https://cod4x.ovh/t/cod4x-client-and-server-files/24",
					linkText: "cod4x.ovh" }
			]
		},
		{
			group: "Getting started",
			q: "What do I need to play on FPS Challenge?",
			a: "A working 1.7 install, then two IDs on your profile and three downloads. The " +
				"anticheat has to be able to tell who you are before it lets you onto a server, " +
				"which is what the IDs are for.",
			steps: [
				{ text: "Register at FPS Challenge and sign in.", link: "https://fpschallenge.eu/",
					linkText: "fpschallenge.eu" },
				{ text: "Put your Steam ID and your TeamSpeak 3 ID into the Identifiers section " +
					"of your profile. Without them you get onto neither the game servers nor the " +
					"TeamSpeak, which is at fpschallenge." },
				{ text: "Install the CoD4X 21.4 client.",
					link: "https://fpschallenge.b-cdn.net/public/gamefiles/cod4/cod4x_client_21_4.zip",
					linkText: "cod4x_client_21_4.zip",
					sub: [
						"Extract the archive.",
						"Copy the cod4-client-manualinstall_21.4 folder into your CoD4 folder.",
						"Open that folder and run install.cmd.",
						"Start the game once. It updates the CoD4X client by itself."
					] },
				{ text: "Apply the 21.5 hotfix on top.",
					link: "https://fpschallenge.b-cdn.net/public/gamefiles/cod4/cod4x_client_21_5.zip",
					linkText: "cod4x_client_21_5.zip",
					sub: [
						"Extract the archive and take the cod4x_021.dll out of it.",
						"Overwrite the file of the same name in the bin folder below."
					] },
				{ text: "Install the FPS Challenge anticheat.",
					link: "https://dl.fpschallenge.eu/anticheat/FPSCACInstaller.msi",
					linkText: "FPSCACInstaller.msi",
					sub: ["Run the installer and follow it through."] }
			],
			rows: [
				{ label: "hotfix", desc: "target folder", text: "%localappdata%\\CallofDuty4MW\\bin\\cod4x_021" }
			]
		},

		/* ---------- HUD and display ---------- */
		{
			group: "HUD and display",
			q: "How do I turn the FPS counter on and off?",
			a: "It is not a plain switch: cg_drawFPS has four settings. 0 hides it, 1 is the " +
				"plain number most people want.",
			cfg: 'seta cg_drawFPS "1"',
			cmd: "/cg_drawFPS 1",
			note: "0 off, 1 simple, 2 simple with ranges, 3 verbose. Default 1. " +
				"cg_drawFPSLabels 0 drops the wording next to the number."
		},
		{
			group: "HUD and display",
			q: "How do I turn the lagometer on and off?",
			a: "A straight on/off switch for the two graphs in the lower right: snapshot flow " +
				"on top, ping below.",
			cfg: 'seta cg_drawLagometer "1"',
			cmd: "/cg_drawLagometer 1",
			note: "Default 0."
		},
		{
			group: "HUD and display",
			q: "How do I change the field of view?",
			a: "cg_fov is in degrees. The game clamps it to 65 to 120, so a larger number is " +
				"quietly ignored rather than applied. cg_fovScale multiplies whatever cg_fov " +
				"ends up as, so the two stack: 65 with a scale of 1.25 gives you 81.25.",
			cfg: 'seta cg_fov "80"\nseta cg_fovScale "1"',
			cmd: "/cg_fov 80",
			note: "cg_fov defaults to 65 and runs 65 to 120. cg_fovScale defaults to 1 and runs " +
				"0.2 to 2. Both are protected client settings, so a server cannot overwrite them."
		},
		{
			group: "HUD and display",
			q: "How do I get rid of the crosshair?",
			a: "There are two crosshair dvars, one for the game and one the menu writes. " +
				"If it comes back after a restart, set both.",
			cfg: 'seta cg_drawCrosshair "0"\nseta ui_drawCrosshair "0"',
			cmd: "/cg_drawCrosshair 0",
			note: "Both default to 1."
		},
		{
			group: "HUD and display",
			q: "How do I hide enemy names under the crosshair?",
			a: "cg_drawCrosshairNames controls the name that appears when you aim at someone.",
			cfg: 'seta cg_drawCrosshairNames "0"',
			cmd: "/cg_drawCrosshairNames 0",
			note: "Default 1."
		},
		{
			group: "HUD and display",
			q: "How do I turn off blood and shell casings?",
			a: "Two separate switches. Both are mostly a matter of taste, though fewer casings " +
				"means slightly less to draw.",
			cfg: 'seta cg_blood "0"\nseta cg_brass "0"',
			cmd: "/cg_blood 0",
			note: "Both default to 1."
		},
		{
			group: "HUD and display",
			q: "How do I show the small console overlay?",
			a: "con_minicon keeps the last few console lines on screen without opening the " +
				"full console.",
			cfg: 'seta con_minicon "1"',
			cmd: "/con_minicon 1",
			note: "Default 0."
		},

		/* ---------- Graphics and performance ---------- */
		{
			group: "Graphics and performance",
			q: "How do I cap my frame rate?",
			a: "com_maxfps sets the ceiling. Mind the spelling: com, not con.",
			cfg: 'seta com_maxfps "250"',
			cmd: "/com_maxfps 250",
			note: "Default 85, range 0 to 1000. 125, 250 and 333 are the values you see most often."
		},
		{
			group: "Graphics and performance",
			q: "Why does r_picmip do nothing?",
			a: "Because it is read-only until you take manual control of it. r_picmip_manual has " +
				"to be 1 first, otherwise the game picks the level itself and ignores yours.",
			cfg: 'seta r_picmip_manual "1"\nseta r_picmip "3"',
			cmd: "/r_picmip_manual 1",
			note: "r_picmip runs 0 to 3, where 3 is the blurriest and cheapest."
		},
		{
			group: "Graphics and performance",
			q: "How do I change the brightness?",
			a: "r_gamma is the in-game brightness. It survives a restart, unlike the menu slider " +
				"on some setups.",
			cfg: 'seta r_gamma "1.4"',
			cmd: "/r_gamma 1.4",
			note: "Default 0.8, range 0.5 to 3."
		},
		{
			group: "Graphics and performance",
			q: "Do I have to restart the game after changing a video setting?",
			a: "Not the whole game. vid_restart reloads the renderer, which is enough for " +
				"resolution, picmip and most r_ dvars.",
			cmd: "/vid_restart"
		},

		/* ---------- Mouse, view and sound ---------- */
		{
			group: "Mouse, view and sound",
			q: "How do I set my mouse sensitivity exactly?",
			a: "The menu slider rounds; typing the number does not. Any value in range is kept " +
				"as you type it.",
			cfg: 'seta sensitivity "2.75"',
			cmd: "/sensitivity 2.75",
			note: "Default 5, range 0.01 to 100."
		},
		{
			group: "Mouse, view and sound",
			q: "How do I turn off mouse smoothing?",
			a: "m_filter averages your mouse movement over frames, which feels like a slight " +
				"delay. It is off by default, so check it if aiming feels floaty.",
			cfg: 'seta m_filter "0"',
			cmd: "/m_filter 0",
			note: "Default 0."
		},
		{
			group: "Mouse, view and sound",
			q: "How do I change the game volume from the config?",
			a: "snd_volume is the master volume as a fraction, not a percentage.",
			cfg: 'seta snd_volume "0.6"',
			cmd: "/snd_volume 0.6",
			note: "Default 0.8, range 0 to 1."
		},

		/* ---------- The config file ---------- */
		{
			group: "The config file",
			q: "Where is config_mp.cfg?",
			a: "In two different places, depending on which client you run. The stock game keeps " +
				"it inside its own install folder; CoD4X moves it out to your user profile. " +
				"The profile folder is named after the profile you created, not your in-game name.",
			rows: [
				{ label: "stock", text: "<CoD4 install folder>\\players\\profiles\\<profile>\\config_mp.cfg", copy: false },
				{ label: "CoD4X", text: "%localappdata%\\CallofDuty4MW\\players\\profiles\\" }
			],
			note: "The CoD4X line can go straight into the address bar of Explorer, which expands " +
				"%localappdata% for you and drops you next to your profile folders. The game " +
				"builds the path itself and executes the file at startup, so editing the wrong " +
				"copy changes nothing."
		},
		{
			group: "The config file",
			q: "Why are my edits gone after I quit the game?",
			a: "Because CoD4 writes config_mp.cfg back out when it exits, overwriting anything " +
				"you changed while it was running. Three ways round it: edit the file with the " +
				"game closed, keep your settings in a file of your own and load that instead, " +
				"or write-protect config_mp.cfg so the game cannot overwrite it at all.",
			cfg: 'exec mysettings.cfg',
			cmd: "/exec mysettings.cfg",
			note: "To write-protect it: right-click config_mp.cfg, Properties, tick Read-only, " +
				"OK. Your settings then survive every restart, but nothing you change in the " +
				"in-game menus is kept either. Put your own .cfg next to config_mp.cfg."
		},
		{
			group: "The config file",
			q: "What is the difference between set, seta, sets and setu?",
			a: "They all set a value; they differ in the flag they add afterwards. seta marks it " +
				"to be archived, which is what puts it back in config_mp.cfg on the next write. " +
				"Plain set lasts until you quit. sets and setu mark a value as server info or " +
				"user info and belong on servers, not in your config.",
			cfg: 'seta cg_fov "80"',
			note: "This is why nearly every line in a player config starts with seta."
		},
		{
			group: "The config file",
			q: "How do I load a config while the game is running?",
			a: "exec runs a file from the same folder config_mp.cfg lives in. Handy for a " +
				"separate match config or a set of binds.",
			cmd: "/exec match.cfg"
		},
		{
			group: "The config file",
			q: "How do I save my current settings to a file?",
			a: "writeconfig dumps every archived dvar and every bind into a file you name.",
			cmd: "/writeconfig backup.cfg",
			note: "It writes next to config_mp.cfg."
		},

		/* ---------- Binds and scripts ---------- */
		{
			group: "Binds and scripts",
			q: "How do I bind a key?",
			a: "bind takes the key first and the command second. Wrap the command in quotes as " +
				"soon as it contains a space.",
			cfg: 'bind F "+melee"',
			cmd: '/bind F "+melee"',
			note: "bindlist prints everything currently bound, unbind F clears one key, " +
				"unbindall clears the lot."
		},
		{
			group: "Binds and scripts",
			q: "How do I put several commands on one key?",
			a: "Separate them with semicolons inside the quotes. They run in order, left to right.",
			cfg: 'bind X "say Nice one; +smoke"',
			note: "This is the same trick the killfeed and scoreboard tabs use to re-apply " +
				"colours that the mod resets."
		},
		{
			group: "Binds and scripts",
			q: "How do I make a key toggle between two settings?",
			a: "Two ways. toggle flips a single dvar between values, and for anything longer you " +
				"store the two halves as dvars and jump between them with vstr.",
			cfg: 'bind N "toggle cg_drawFPS 0 1"\n' +
				'seta fovOn "cg_fov 80; seta fovSwap vstr fovOff"\n' +
				'seta fovOff "cg_fov 65; seta fovSwap vstr fovOn"\n' +
				'seta fovSwap "vstr fovOn"\n' +
				'bind M "vstr fovSwap"',
			note: "Careful: vstr is on most league banned-content lists, because it is what " +
				"cheat menus are built from. The config checker flags it."
		},

		/* ---------- Promod menu ---------- */
		{
			group: "Promod menu",
			q: "What is behind B4 in Promod?",
			a: "B opens the quick message menu. 1 to 3 are the stock CoD4 pages, 4 is Promod's " +
				"own and 5 its graphics page. So B45 means: B, then 4, then 5. Every line is " +
				"also a console command, which is what you bind to a key. Click a key field " +
				"and press the key you want, or type its name.",
			rows: [
				{ label: "B41", desc: "Timeout", text: "openscriptmenu quickpromod 1", bind: true },
				{ label: "B42", desc: "Drop Bomb", text: "openscriptmenu quickpromod 2", bind: true },
				{ label: "B43", desc: "Suicide", text: "openscriptmenu quickpromod 3", bind: true },
				{ label: "B44", desc: "Spectate Team", text: "openscriptmenu quickpromod killspec", bind: true },
				{ label: "B45", desc: "Automatic record", text: "openscriptmenu quickpromod 4", bind: true },
				{ label: "B46", desc: "Velocity meter", text: "openscriptmenu quickpromod velocity", bind: true },
				{ label: "B47", desc: "Statistics", text: "openscriptmenu quickpromod 5", bind: true }
			],
			note: "Timeout only works while you are on a team, and Drop Bomb not while you are " +
				"planting. Spectate Team kills you, frees your class slot and holds you out " +
				"until you pick a class again. Older bind collections list different numbers, " +
				"because the order changed between Promod versions — these are from Promod X."
		},
		{
			group: "Promod menu",
			q: "What is behind B5 in Promod?",
			a: "The graphics page. Each line cycles or toggles one client setting, and the menu " +
				"shows you the value it is on. Click a key field and press the key you want, " +
				"or type its name.",
			rows: [
				{ label: "B51", desc: "Lighting", text: "openscriptmenu quickpromodgfx 1", bind: true },
				{ label: "B52", desc: "Film Tweaks", text: "openscriptmenu quickpromodgfx 2", bind: true },
				{ label: "B53", desc: "Texture Filtering", text: "openscriptmenu quickpromodgfx 3", bind: true },
				{ label: "B54", desc: "Normal Map", text: "openscriptmenu quickpromodgfx 4", bind: true },
				{ label: "B55", desc: "FOV Scale", text: "openscriptmenu quickpromodgfx 5", bind: true },
				{ label: "B56", desc: "Gun X", text: "openscriptmenu quickpromodgfx 6", bind: true },
				{ label: "B57", desc: "Sound Faction", text: "openscriptmenu quickpromodgfx 7", bind: true }
			],
			note: "Lighting runs 1.2, Stock, Off and writes r_lighttweaksunlight. Film Tweaks " +
				"is r_filmusetweaks, Texture Filtering is r_texfilterdisable, so On in the menu " +
				"means filtering is on. FOV Scale steps through 1, 1.05, 1.1 and 1.125 and the " +
				"menu shows the result of cg_fov times the scale. Gun X moves cg_gun_x in steps " +
				"of 0.2 up to 1. Sound Faction cycles Default, United Kingdom, United States, " +
				"Russia, Arab."
		},

		/* ---------- Demos and screenshots ---------- */
		{
			group: "Demos and screenshots",
			q: "How do I record and play back a demo?",
			a: "record starts writing, stoprecord ends it, demo plays one back. Without a name " +
				"the game numbers the file for you.",
			cfg: 'bind F9 "record"\nbind F10 "stoprecord"',
			cmd: "/record match1",
			note: "Demos land in the same folder as your config. Play one with /demo match1."
		},
		{
			group: "Demos and screenshots",
			q: "How do I take a screenshot?",
			a: "Two commands: an uncompressed one and a much smaller JPEG.",
			cfg: 'bind F12 "screenshotJpeg"',
			cmd: "/screenshotJpeg"
		}
	];

	var list = null, search = null, count = null, empty = null, hint = null;
	var items = [];
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

	// A row is { label, text, desc, bind, copy }. desc is the middle column the
	// menu tables need. bind adds a key field: type a key and the line turns
	// into the bind you can paste into a config. copy: false drops the button
	// for lines not worth copying, such as a path full of placeholders.
	function commandRow(spec)
	{
		var row = el("div", "fq-cmd");
		row.appendChild(el("span", "fq-kind", spec.label));

		if (spec.desc) { row.appendChild(el("span", "fq-desc", spec.desc)); }

		var key = null;
		if (spec.bind)
		{
			key = el("input", "fq-key");
			key.type = "text";
			key.placeholder = "key";
			key.spellcheck = false;
			key.autocomplete = "off";
			key.setAttribute("aria-label", "Bind key for " + (spec.desc || spec.text));
			row.appendChild(key);
		}

		var code = el("code", "fq-code", spec.text);
		row.appendChild(code);

		var button = null;
		if (spec.copy !== false)
		{
			button = el("button", "btn btn-sm fq-copy", "Copy");
			button.type = "button";
			button.setAttribute("data-command", spec.text);
			button.setAttribute("aria-label", "Copy " + spec.text);
			row.appendChild(button);
		}
		else
		{
			// holds the button's place so the code field keeps the same width
			var spacer = el("span", "fq-copy-space");
			spacer.setAttribute("aria-hidden", "true");
			row.appendChild(spacer);
		}

		if (key !== null)
		{
			var refresh = function ()
			{
				// with no key there is nothing to bind to, so show the bare command
				var typed = key.value.trim();
				var line = typed === "" ? spec.text : 'bind ' + typed + ' "' + spec.text + '"';
				code.textContent = line;
				if (button !== null)
				{
					button.setAttribute("data-command", line);
					button.setAttribute("aria-label", "Copy " + line);
				}
			};

			key.addEventListener("input", refresh);

			// F-keys, the arrows and the numpad type nothing, and the browser
			// has its own plans for some of them, so take them here by name.
			key.addEventListener("keydown", function (event)
			{
				var name = CAPTURED_KEYS[event.code];
				if (name === undefined) { return; }
				event.preventDefault();
				key.value = name;
				refresh();
			});
		}

		return row;
	}

	function makeItem(entry)
	{
		var item = el("div", "fq-item");
		item.appendChild(el("h3", "fq-q", entry.q));
		item.appendChild(el("p", "fq-a", entry.a));

		if (entry.cfg) { item.appendChild(commandRow({ label: "config", text: entry.cfg })); }
		if (entry.cmd) { item.appendChild(commandRow({ label: "console", text: entry.cmd })); }

		// a few answers are a procedure rather than a setting
		var stepText = [];
		if (entry.steps)
		{
			var list = el("ol", "fq-steps");
			for (var st = 0; st < entry.steps.length; st++)
			{
				var step = entry.steps[st];
				var li = el("li", null, step.text);
				stepText.push(step.text);

				if (step.link)
				{
					li.appendChild(document.createTextNode(" "));
					var link = el("a", "fq-link", step.linkText || "download");
					link.href = step.link;
					link.target = "_blank";
					link.rel = "noopener noreferrer";
					li.appendChild(link);
				}

				if (step.sub)
				{
					var subs = el("ul", "fq-substeps");
					for (var sb = 0; sb < step.sub.length; sb++)
					{
						subs.appendChild(el("li", null, step.sub[sb]));
						stepText.push(step.sub[sb]);
					}
					li.appendChild(subs);
				}

				list.appendChild(li);
			}
			item.appendChild(list);
		}

		// some answers are neither: a list of paths or a menu table, each row
		// carrying its own label and, where it helps, a description
		var extra = [];
		if (entry.rows)
		{
			for (var r = 0; r < entry.rows.length; r++)
			{
				item.appendChild(commandRow(entry.rows[r]));
				extra.push(entry.rows[r].label, entry.rows[r].desc, entry.rows[r].text);
			}
		}

		if (entry.note) { item.appendChild(el("p", "fq-note", entry.note)); }

		// one lowercased haystack per entry, so filtering stays a substring test
		var haystack = [entry.q, entry.a, entry.cfg, entry.cmd, entry.note]
			.concat(stepText).concat(extra).filter(Boolean).join(" ").toLowerCase();

		return { node: item, text: haystack };
	}

	function render()
	{
		var groups = [];
		for (var i = 0; i < ENTRIES.length; i++)
		{
			if (groups.indexOf(ENTRIES[i].group) === -1) { groups.push(ENTRIES[i].group); }
		}

		for (var g = 0; g < groups.length; g++)
		{
			var section = el("section", "rc-group fq-group");
			section.appendChild(el("h2", "rc-title", groups[g]));

			for (var e = 0; e < ENTRIES.length; e++)
			{
				if (ENTRIES[e].group !== groups[g]) { continue; }
				var made = makeItem(ENTRIES[e]);
				made.section = section;
				items.push(made);
				section.appendChild(made.node);
			}

			list.appendChild(section);
		}
	}

	function filter()
	{
		var term = search.value.trim().toLowerCase();
		var shown = 0;

		for (var i = 0; i < items.length; i++)
		{
			var match = term === "" || items[i].text.indexOf(term) !== -1;
			items[i].node.hidden = !match;
			if (match) { shown++; }
		}

		// a group with nothing left in it should go too
		var sections = list.querySelectorAll(".fq-group");
		for (var s = 0; s < sections.length; s++)
		{
			var visible = sections[s].querySelectorAll(".fq-item:not([hidden])").length;
			sections[s].hidden = visible === 0;
		}

		count.textContent = shown === ENTRIES.length
			? ENTRIES.length + " questions"
			: shown + " of " + ENTRIES.length;

		empty.hidden = shown !== 0;
		if (shown === 0) { empty.textContent = "Nothing matches “" + search.value.trim() + "”."; }
	}

	function onCopyClick(event)
	{
		var button = event.target.closest ? event.target.closest(".fq-copy") : null;
		if (button === null) { return; }

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
			setHint("Could not copy — select the command and copy manually.", true);
		});
	}

	function init()
	{
		list = document.getElementById("fq-list");
		search = document.getElementById("fq-search");
		count = document.getElementById("fq-count");
		empty = document.getElementById("fq-empty");
		hint = document.getElementById("fq-hint");

		if (list === null || search === null) { return; }
		if (hint !== null) { defaultHint = hint.textContent; }

		render();
		filter();

		search.addEventListener("input", filter);
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
