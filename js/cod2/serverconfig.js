/*
 * CoD2 server config: a form that writes a zPAM server.cfg. The data is
 * window.COD2_SERVER (js/cod2/server-data.js: what each pam_mode sets, zPAM's
 * example values), window.COD2_DVARS (defaults, ranges, descriptions) and
 * window.COD2_RCON (gametypes, maps, zPAM's rcon-menu settings).
 *
 * Passwords are never filled in: they start as CHANGE_ME and the page warns
 * while they are. Nothing is stored or sent anywhere.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var setHint = function () {};

	var COPIED_RESET_MS = 1500;
	var PLACEHOLDER = "CHANGE_ME";
	var START_LINE = "+set dedicated 2 +set net_port 28960 +exec server.cfg";

	// The form, section by section. value: what the field starts with, if not zPAM's
	// example value or the game default; desc: one line in the form and the output.
	var SECTIONS = [
		{ id: "info", title: "Server info", fields: [
			{ n: "sv_hostname", label: "Server name", value: "My zPAM server", desc: "The name in the server browser; color codes work." },
			{ n: "scr_motd", label: "Message of the day", desc: "Shown in zPAM's server info menu; \\n starts a new line." },
			{ n: "sv_maxclients", label: "Max clients", desc: "Player slots, private slots included." },
			{ n: "sv_privateClients", label: "Private slots", desc: "Slots only for players with the private password." }
		] },
		{ id: "download", title: "Downloads", fields: [
			{ n: "sv_wwwDownload", label: "Web download", desc: "Players download zPAM and maps over HTTP; zPAM needs it." },
			{ n: "sv_wwwBaseURL", label: "Download URL", desc: "Where the files are; zPAM's own URL works for its files." },
			{ n: "sv_wwwDlDisconnected", label: "Disconnect while downloading", desc: "Drop the connection during a web download." },
			{ n: "sv_allowDownload", label: "Game download", desc: "Slow download from the game server itself." }
		] },
		{ id: "network", title: "Network", fields: [
			{ n: "sv_maxRate", label: "Max rate", desc: "Bytes per second a player may receive; 25000 is the most." },
			{ n: "sv_maxPing", label: "Max ping", desc: "Players above it cannot join; 0: no limit." },
			{ n: "sv_minPing", label: "Min ping", desc: "Players below it cannot join; 0: no limit." },
			{ n: "sv_timeout", label: "Timeout", desc: "Seconds before a player with 999 ping is dropped." },
			{ n: "sv_kickBanTime", label: "Kick ban time", desc: "Seconds a kicked player can not come back; 0: at once." },
			{ n: "sv_reconnectlimit", label: "Reconnect limit", desc: "Seconds before a player may connect again." },
			{ n: "sv_floodProtect", label: "Flood protection", desc: "Limits how fast a player can send chat and commands." }
		] },
		{ id: "cod2x", title: "CoD2x", fields: [
			{ n: "sv_cracked", label: "Accept invalid CD keys", desc: "Lets players with an invalid CD key join." },
			{ n: "sv_hideServerIp", label: "Hide server IP", desc: "Hides the IP on the scoreboard, for streams." }
		] },
		{ id: "logging", title: "Logging", fields: [
			{ n: "logfile", label: "Console log", choices: [["0", "off"], ["1", "buffered"], ["2", "continuous"]],
				desc: "Writes the console into console_mp.log." },
			{ n: "g_log", label: "Game log file", desc: "Game events (kills, chat, rounds) for stats tools; empty: off." },
			{ n: "g_logsync", label: "Write log at once", desc: "Writes every event right away instead of buffered." }
		] }
	];

	var data = null;
	var dvars = {};
	var gametypeNames = {};
	var mapsById = {};
	var fieldBoxes = {};
	var fieldRows = {};
	var rotation = [];

	var gametypeBox = null;
	var modeBox = null;
	var scoreBox = null;
	var optionBoxes = [];
	var modeInfo = null;
	var pubBox = null;
	var pubFields = {};
	var rconBox = null;
	var passwordBox = null;
	var gamePasswordBox = null;
	var privatePasswordBox = null;
	var rotationList = null;
	var addGametypeBox = null;
	var addMapBox = null;
	var warnBox = null;
	var output = null;

	/* ---------- values ---------- */

	function dvar(name)
	{
		return dvars[name.toLowerCase()] || null;
	}

	function bound(v)
	{
		if (v === "inf" || v === "-inf" || v === undefined || v === null)
		{
			return v === "-inf" ? -Infinity : v === "inf" ? Infinity : null;
		}
		return v;
	}

	// The value a field starts with: the tab's own, zPAM's example, or the game's default.
	function startValue(spec)
	{
		if (spec.value !== undefined)
		{
			return String(spec.value);
		}
		var ex = data.example[spec.n];
		if (ex)
		{
			return ex[0];
		}
		var d = dvar(spec.n);
		return d && d.d !== undefined ? String(d.d) : "";
	}

	function quote(value)
	{
		return "\"" + String(value).replace(/"/g, "") + "\"";
	}

	/* ---------- pam_mode ---------- */

	function currentGametype()
	{
		return gametypeBox.value;
	}

	function rulesFor(gt)
	{
		return data.gametypes[gt] || null;
	}

	function pamMode()
	{
		var mode = modeBox.value;
		if (mode === "" || mode === "pub")
		{
			return mode;
		}
		var parts = [mode];
		if (scoreBox.value !== "")
		{
			parts.push(scoreBox.value);
		}
		optionBoxes.forEach(function (box)
		{
			if (box.checked)
			{
				parts.push(box.value);
			}
		});
		return parts.join("_");
	}

	// The rules files a pam_mode loads for a gametype, in order: mode, score, options.
	function pamFiles(gt, mode)
	{
		var rules = rulesFor(gt);
		if (!rules || mode === "")
		{
			return [];
		}
		var parts = mode.split("_");
		var files = [];
		parts.forEach(function (part, i)
		{
			var list = i === 0 ? rules.modes : rules.scores;
			var found = list.filter(function (x) { return x.id === part; })[0];
			if (!found && i > 0)
			{
				found = data.options.filter(function (x) { return x.id === part; })[0];
			}
			if (found)
			{
				files.push(found);
			}
		});
		return files;
	}

	// zPAM's check (IsValidPAMModeForGametype): mode first, then score parts or options.
	function pamValidFor(gt, mode)
	{
		var rules = rulesFor(gt);
		if (!rules || mode === "")
		{
			return false;
		}
		var parts = mode.split("_");
		if (!rules.modes.some(function (m) { return m.id === parts[0]; }))
		{
			return false;
		}
		return parts.slice(1).every(function (p)
		{
			return rules.scores.some(function (s) { return s.id === p; }) || data.options.some(function (o) { return o.id === p; });
		});
	}

	// The settings a pam_mode sets, the later files winning: { name: [value, comment, condition] }.
	function pamSettings(gt, mode)
	{
		var out = {};
		if (mode === "pub")
		{
			return out;
		}
		pamFiles(gt, mode).forEach(function (file)
		{
			file.settings.forEach(function (s)
			{
				if (!s[3])
				{
					out[s[0]] = [s[1], s[2]];
				}
			});
		});
		return out;
	}

	function fillModes()
	{
		var gt = currentGametype();
		var rules = rulesFor(gt);
		var previousMode = modeBox.value;
		var previousScore = scoreBox.value;
		modeBox.textContent = "";
		scoreBox.textContent = "";

		if (!rules)
		{
			modeBox.appendChild(el("option", null, "none for this gametype"));
			modeBox.lastChild.value = "";
			modeBox.disabled = true;
			scoreBox.disabled = true;
			return;
		}
		modeBox.disabled = false;
		rules.modes.slice().sort(function (a, b) { return a.id === "comp" ? -1 : b.id === "comp" ? 1 : 0; }).forEach(function (m)
		{
			var option = el("option", null, m.id);
			option.value = m.id;
			modeBox.appendChild(option);
		});
		modeBox.value = rules.modes.some(function (m) { return m.id === previousMode; }) ? previousMode : "comp";

		var comp = rules.modes.filter(function (m) { return m.id === "comp"; })[0];
		var standard = el("option", null, "default" + (comp && comp.format ? " (" + comp.format + ")" : ""));
		standard.value = "";
		scoreBox.appendChild(standard);
		rules.scores.forEach(function (s)
		{
			var option = el("option", null, s.id);
			option.value = s.id;
			scoreBox.appendChild(option);
		});
		scoreBox.value = rules.scores.some(function (s) { return s.id === previousScore; }) ? previousScore : "";
	}

	function renderModeInfo()
	{
		var gt = currentGametype();
		var mode = pamMode();
		var pub = mode === "pub" || mode === "";
		scoreBox.disabled = pub || !rulesFor(gt);
		optionBoxes.forEach(function (box) { box.disabled = pub || !rulesFor(gt); });

		modeInfo.textContent = "";
		if (!rulesFor(gt))
		{
			modeInfo.appendChild(el("p", "rc-note", "zPAM has no pam_mode for " + (gametypeNames[gt] || gt) +
				"; it runs with its own rules."));
			return;
		}
		modeInfo.appendChild(el("p", "s2-mode", "pam_mode " + mode));
		var files = pamFiles(gt, mode);
		var list = el("ul", "s2-mode-parts");
		files.forEach(function (f)
		{
			list.appendChild(el("li", null, f.id + ": " + (f.desc || "")));
		});
		modeInfo.appendChild(list);

		if (pub)
		{
			modeInfo.appendChild(el("p", "rc-note", "pub sets nothing: the match settings below are what the server uses."));
			return;
		}
		var settings = pamSettings(gt, mode);
		var names = Object.keys(settings);
		var details = el("details", "s2-details");
		details.appendChild(el("summary", null, "It sets " + names.length + " settings at every map start"));
		var table = el("div", "s2-settings");
		names.forEach(function (name)
		{
			var row = el("div", "s2-setting");
			row.appendChild(el("code", null, name + " " + (settings[name][0] === null ? "(computed)" : settings[name][0])));
			if (settings[name][1])
			{
				row.appendChild(el("span", null, settings[name][1]));
			}
			table.appendChild(row);
		});
		details.appendChild(table);
		modeInfo.appendChild(details);
	}

	/* ---------- form fields ---------- */

	function rangeText(d)
	{
		var mn = bound(d.mn);
		var mx = bound(d.mx);
		if (mn !== null && mx !== null && isFinite(mn) && isFinite(mx))
		{
			return mn + "–" + mx;
		}
		if (mn !== null && isFinite(mn))
		{
			return "≥ " + mn;
		}
		return "";
	}

	function makeField(spec, idPrefix)
	{
		var d = dvar(spec.n) || {};
		var row = el("div", "kf-opt s2-opt");
		var label = el("label", "kf-opt-label s2-label", spec.label);
		label.title = spec.n;
		var id = idPrefix + spec.n;
		label.htmlFor = id;
		row.appendChild(label);

		var field;
		var start = startValue(spec);
		if (spec.choices || d.t === "bool")
		{
			field = el("select", "dv-select s2-select");
			(spec.choices || [["1", "on"], ["0", "off"]]).forEach(function (c)
			{
				var option = el("option", null, c[1]);
				option.value = c[0];
				field.appendChild(option);
			});
			field.value = start;
			field.id = id;
			row.appendChild(field);
			field.addEventListener("change", update);
		}
		else if (d.t === "int" || d.t === "float")
		{
			field = el("input", "kf-value kf-num");
			field.id = id;
			field.value = start;
			field.setAttribute("aria-label", spec.label);
			var mn = bound(d.mn);
			var mx = bound(d.mx);
			var stepper = window.Decimal.attach(field, { min: mn === null ? undefined : mn, max: mx === null ? undefined : mx,
				step: 1, integer: d.t === "int", buttons: true, label: spec.label });
			field.addEventListener("input", update);
			row.appendChild(stepper);
			var range = rangeText(d);
			if (range)
			{
				row.appendChild(el("span", "mm-range-hint", range));
			}
		}
		else
		{
			field = el("input", "kf-value s2-text");
			field.type = "text";
			field.id = id;
			field.value = start;
			field.spellcheck = false;
			field.autocomplete = "off";
			field.addEventListener("input", update);
			row.appendChild(field);
		}

		var tag = el("span", "dv-tag s2-pam-tag", "set by pam_mode");
		tag.hidden = true;
		row.appendChild(tag);

		var def = d.d !== undefined ? "game default " + (d.t === "bool" ? (d.d ? "on" : "off") : (d.d === "" ? "empty" : d.d)) : "";
		var ex = data.example[spec.n];
		row.appendChild(el("p", "kf-opt-desc", spec.desc + (def ? " (" + def + (ex && ex[0] !== String(d.d) ? ", zPAM example " + (ex[0] === "" ? "empty" : ex[0]) : "") + ")" : "")));

		row.tag = tag;
		return { row: row, field: field };
	}

	// The match settings of zPAM's rcon menu for a gametype (and those of every gametype), for pub.
	function renderPub()
	{
		pubBox.textContent = "";
		pubFields = {};
		var gt = currentGametype();
		var rcon = window.COD2_RCON;
		var list = rcon.settings.filter(function (s) { return s.gametype === gt || !s.gametype; });
		list.forEach(function (s)
		{
			var made = makeField({ n: s.cmd, label: s.cmd, desc: s.desc }, "s2-pub-");
			made.row.querySelector(".s2-label").classList.add("s2-label-code");
			pubBox.appendChild(made.row);
			pubFields[s.cmd] = made.field;
		});
	}

	/* ---------- map rotation ---------- */

	function mapsFor(gt)
	{
		return window.COD2_RCON.maps.filter(function (m) { return m.gametypes.indexOf(gt) !== -1; });
	}

	function mapLabel(m)
	{
		return m.name + " (" + m.id + ")" + (m.source === "zpam" ? " – zPAM" : "");
	}

	function fillAddMaps()
	{
		var gt = addGametypeBox.value;
		var previous = addMapBox.value;
		addMapBox.textContent = "";
		[["stock", "Stock maps"], ["zpam", "zPAM map pack"]].forEach(function (group)
		{
			var og = el("optgroup");
			og.label = group[1];
			mapsFor(gt).filter(function (m) { return m.source === group[0]; }).forEach(function (m)
			{
				var option = el("option", null, mapLabel(m));
				option.value = m.id;
				og.appendChild(option);
			});
			if (og.childNodes.length)
			{
				addMapBox.appendChild(og);
			}
		});
		if (previous && mapsById[previous] && mapsById[previous].gametypes.indexOf(gt) !== -1)
		{
			addMapBox.value = previous;
		}
	}

	function renderRotation()
	{
		rotationList.textContent = "";
		rotation.forEach(function (entry, index)
		{
			var m = mapsById[entry.map];
			var row = el("li", "s2-rot");
			row.setAttribute("data-index", String(index));

			var handle = el("span", "s2-handle", "☰");
			handle.title = "Drag to move";
			handle.setAttribute("aria-hidden", "true");
			row.appendChild(handle);

			var name = el("span", "s2-rot-name");
			name.appendChild(el("span", "s2-rot-title", m ? m.name : entry.map));
			name.appendChild(el("code", "s2-rot-id", entry.map));
			if (m && m.source === "zpam")
			{
				name.appendChild(el("span", "d2-src", "zPAM"));
			}
			row.appendChild(name);

			var gt = el("select", "dv-select s2-rot-gt");
			gt.setAttribute("aria-label", "Gametype for " + entry.map);
			(m ? m.gametypes : [entry.gt]).forEach(function (g)
			{
				var option = el("option", null, g);
				option.value = g;
				option.title = gametypeNames[g] || g;
				gt.appendChild(option);
			});
			gt.value = entry.gt;
			gt.addEventListener("change", function () { entry.gt = gt.value; update(); });
			row.appendChild(gt);

			[["↑", "Move up", -1], ["↓", "Move down", 1]].forEach(function (b)
			{
				var button = el("button", "btn btn-sm s2-move", b[0]);
				button.type = "button";
				button.setAttribute("aria-label", b[1] + ": " + entry.map);
				button.disabled = (b[2] < 0 && index === 0) || (b[2] > 0 && index === rotation.length - 1);
				button.addEventListener("click", function () { move(index, index + b[2]); });
				row.appendChild(button);
			});
			var remove = el("button", "btn btn-sm s2-move", "×");
			remove.type = "button";
			remove.setAttribute("aria-label", "Remove " + entry.map);
			remove.addEventListener("click", function ()
			{
				rotation.splice(index, 1);
				renderRotation();
				update();
			});
			row.appendChild(remove);

			handle.addEventListener("pointerdown", function (event) { startDrag(event, index); });
			rotationList.appendChild(row);
		});
		if (rotation.length === 0)
		{
			rotationList.appendChild(el("li", "s2-rot-empty", "No maps yet: pick a gametype and a map and click Add."));
		}
	}

	function move(from, to)
	{
		if (to < 0 || to >= rotation.length || from === to)
		{
			return;
		}
		var entry = rotation.splice(from, 1)[0];
		rotation.splice(to, 0, entry);
		renderRotation();
		update();
		var buttons = rotationList.querySelectorAll(".s2-rot")[to];
		if (buttons)
		{
			buttons.querySelector(".s2-move").focus();
		}
	}

	// Drag by the handle (mouse, pen or touch): the row follows the pointer and
	// lands where it is let go.
	function startDrag(event, index)
	{
		event.preventDefault();
		var rows = [].slice.call(rotationList.querySelectorAll(".s2-rot"));
		var dragged = rows[index];
		var target = index;
		dragged.classList.add("is-dragging");
		dragged.setPointerCapture(event.pointerId);

		// target: the gap the row goes into, 0 (before the first) to rows.length (after the last).
		function onMove(e)
		{
			target = rows.length;
			for (var i = 0; i < rows.length; i++)
			{
				var r = rows[i].getBoundingClientRect();
				if (e.clientY < r.top + r.height / 2)
				{
					target = i;
					break;
				}
			}
			rows.forEach(function (row, i)
			{
				row.classList.toggle("is-drop-before", i === target && i !== index && i !== index + 1);
				row.classList.toggle("is-drop-after", target === rows.length && i === rows.length - 1 && i !== index);
			});
		}
		function onUp()
		{
			dragged.removeEventListener("pointermove", onMove);
			dragged.removeEventListener("pointerup", onUp);
			dragged.removeEventListener("pointercancel", onUp);
			var to = target > index ? target - 1 : target;
			if (to === index)
			{
				renderRotation();
				return;
			}
			move(index, to);
		}
		dragged.addEventListener("pointermove", onMove);
		dragged.addEventListener("pointerup", onUp);
		dragged.addEventListener("pointercancel", onUp);
	}

	function rotationString()
	{
		var parts = [];
		var last = null;
		rotation.forEach(function (entry)
		{
			if (entry.gt !== last)
			{
				parts.push("gametype " + entry.gt);
				last = entry.gt;
			}
			parts.push("map " + entry.map);
		});
		return parts.join(" ");
	}

	/* ---------- output ---------- */

	function value(name)
	{
		var box = fieldBoxes[name] || pubFields[name];
		return box ? box.value.trim() : "";
	}

	function line(name, val, comment)
	{
		var text = "set " + name + " " + quote(val);
		return comment ? pad(text, 40) + "// " + comment : text;
	}

	function pad(text, width)
	{
		while (text.length < width)
		{
			text += " ";
		}
		return text + " ";
	}

	function build(warnings)
	{
		var gt = currentGametype();
		var mode = rulesFor(gt) ? pamMode() : "";
		var pamSet = pamSettings(gt, mode);
		var out = [];
		out.push("// server.cfg for zPAM " + data.version + ", made with cod-tools (tipsyspit.github.io/#cod2/server-config).");
		out.push("// Put it into the main folder and start the server with:");
		out.push("//   " + START_LINE);
		out.push("// zPAM runs from main: leave fs_game empty. It needs zpam" + data.version.replace(".", "") +
			".iwd and zpam_maps_v7.iwd in main.");

		SECTIONS.forEach(function (section)
		{
			out.push("");
			out.push("// ---------- " + section.title + " ----------");
			section.fields.forEach(function (spec)
			{
				var comment = spec.desc;
				if (pamSet[spec.n])
				{
					comment = "pam_mode " + mode + " sets it to " + pamSet[spec.n][0] + ". " + comment;
				}
				out.push(line(spec.n, value(spec.n), comment));
			});
			if (section.id === "info")
			{
				out.push("");
				out.push("// ---------- Passwords ----------");
				out.push(line("rcon_password", rconBox.value, "For /rcon login; keep it secret."));
				out.push(line("g_password", passwordBox.checked ? gamePasswordBox.value : "", passwordBox.checked ? "Password to join." : "Empty: everyone can join."));
				if (Number(value("sv_privateClients")) > 0)
				{
					out.push(line("sv_privatePassword", privatePasswordBox.value, "Password for the private slots."));
				}
			}
		});

		out.push("");
		out.push("// ---------- zPAM ----------");
		out.push(line("g_gametype", gt, gametypeNames[gt] || ""));
		if (mode !== "")
		{
			var files = pamFiles(gt, mode);
			out.push(line("pam_mode", mode, files.map(function (f) { return f.desc; }).join(" ")));
		}

		if (mode === "pub")
		{
			out.push("");
			out.push("// ---------- Match settings (pam_mode pub uses them as they are) ----------");
			Object.keys(pubFields).forEach(function (name)
			{
				var s = window.COD2_RCON.settings.filter(function (x) { return x.cmd === name; })[0];
				out.push(line(name, value(name), s ? s.desc : ""));
			});
		}
		else if (mode !== "")
		{
			out.push("// pam_mode " + mode + " sets " + Object.keys(pamSet).length + " match settings at every map start,");
			out.push("// so they are left out here.");
		}

		out.push("");
		out.push("// ---------- Map rotation ----------");
		if (rotation.length)
		{
			out.push("set sv_mapRotation " + quote(rotationString()));
			out.push("");
			out.push("// Start the first map of the rotation.");
			out.push("map_rotate");
		}
		else
		{
			out.push("// No maps picked: add them above.");
		}
		return out.join("\r\n");
	}

	function collectWarnings()
	{
		var list = [];
		if (rconBox.value.trim() === "" || rconBox.value.trim() === PLACEHOLDER)
		{
			list.push("Set your own rcon_password: with " + (rconBox.value.trim() === "" ? "none, rcon does not work" : PLACEHOLDER + " anybody can guess it") + ".");
		}
		if (passwordBox.checked && (gamePasswordBox.value.trim() === "" || gamePasswordBox.value.trim() === PLACEHOLDER))
		{
			list.push("The join password (g_password) is still " + (gamePasswordBox.value.trim() === "" ? "empty" : PLACEHOLDER) + ".");
		}
		if (Number(value("sv_privateClients")) > 0 && (privatePasswordBox.value.trim() === "" || privatePasswordBox.value.trim() === PLACEHOLDER))
		{
			list.push("The private slot password (sv_privatePassword) is still " + (privatePasswordBox.value.trim() === "" ? "empty" : PLACEHOLDER) + ".");
		}
		if (Number(value("sv_privateClients")) >= Number(value("sv_maxclients")))
		{
			list.push("All slots are private slots: nobody without the private password can join.");
		}
		if (value("sv_wwwDownload") !== "1" || value("sv_wwwBaseURL") === "")
		{
			list.push("zPAM needs web download: sv_wwwDownload 1 and a working sv_wwwBaseURL.");
		}
		Object.keys(fieldBoxes).concat(["rcon_password"]).forEach(function (name)
		{
			var box = name === "rcon_password" ? rconBox : fieldBoxes[name];
			if (/"/.test(box.value))
			{
				list.push(name + ": \" would end the value, so it is left out.");
			}
		});

		var mode = rulesFor(currentGametype()) ? pamMode() : "";
		var seen = {};
		rotation.forEach(function (entry)
		{
			var m = mapsById[entry.map];
			if (m && m.source === "stock" && mapsById[entry.map + "_fix"] && !seen[entry.map])
			{
				seen[entry.map] = true;
				list.push(entry.map + " has a zPAM version, " + entry.map + "_fix; zPAM switches to it on a new server and warns that the old one is in use.");
			}
			if (mode !== "" && rulesFor(entry.gt) && !pamValidFor(entry.gt, mode) && !seen["gt" + entry.gt])
			{
				seen["gt" + entry.gt] = true;
				list.push("pam_mode " + mode + " is not valid for " + entry.gt + " in the rotation; zPAM falls back to its default there.");
			}
		});
		if (rotation.some(function (e) { return mapsById[e.map] && mapsById[e.map].source === "zpam"; }))
		{
			list.push("zPAM maps need zpam_maps_v7.iwd in main on the server; players get it by web download.");
		}
		if (rotation.length && rotation[0].gt !== currentGametype())
		{
			list.push("The rotation starts with gametype " + rotation[0].gt + ", so g_gametype " + currentGametype() + " applies only until map_rotate runs.");
		}
		return list;
	}

	function update()
	{
		gamePasswordBox.disabled = !passwordBox.checked;
		privatePasswordBox.closest(".kf-opt").hidden = !(Number(value("sv_privateClients")) > 0);

		var gt = currentGametype();
		var mode = rulesFor(gt) ? pamMode() : "";
		var pamSet = pamSettings(gt, mode);
		Object.keys(fieldRows).forEach(function (name)
		{
			fieldRows[name].tag.hidden = !pamSet[name];
		});
		pubBox.closest(".s2-section").hidden = mode !== "pub";
		renderModeInfo();

		var warnings = collectWarnings();
		warnBox.textContent = "";
		warnings.forEach(function (text) { warnBox.appendChild(el("li", null, text)); });
		warnBox.hidden = warnings.length === 0;
		output.textContent = build(warnings);
	}

	/* ---------- setup ---------- */

	function makeSection(title, parent)
	{
		var section = el("section", "rc-group s2-section");
		section.appendChild(el("h2", "rc-title", title));
		parent.appendChild(section);
		return section;
	}

	function makePasswordRow(id, label, desc, checkbox)
	{
		var row = el("div", "kf-opt s2-opt");
		var lab = el("label", "kf-opt-label s2-label", label);
		lab.htmlFor = id;
		row.appendChild(lab);
		var input = el("input", "kf-value s2-text");
		input.type = "text";
		input.id = id;
		input.value = PLACEHOLDER;
		input.spellcheck = false;
		input.autocomplete = "off";
		input.addEventListener("input", update);
		if (checkbox)
		{
			row.appendChild(checkbox);
		}
		row.appendChild(input);
		row.appendChild(el("p", "kf-opt-desc", desc));
		return { row: row, input: input };
	}

	function copyButton(button, getText)
	{
		button.addEventListener("click", function ()
		{
			window.UI.copyText(getText()).then(function ()
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
				setHint("Could not copy — select the text and copy manually.", true);
			});
		});
	}

	function download()
	{
		var url = URL.createObjectURL(new Blob([output.textContent], { type: "text/plain" }));
		var a = document.createElement("a");
		a.href = url;
		a.download = "server.cfg";
		document.body.appendChild(a);
		a.click();
		a.remove();
		window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	function init()
	{
		var form = document.getElementById("s2-form");
		data = window.COD2_SERVER;
		if (form === null || !data || !window.COD2_DVARS || !window.COD2_RCON)
		{
			return;
		}
		window.COD2_DVARS.forEach(function (d) { dvars[d.n.toLowerCase()] = d; });
		window.COD2_RCON.gametypes.forEach(function (g) { gametypeNames[g.id] = g.name; });
		window.COD2_RCON.maps.forEach(function (m) { mapsById[m.id] = m; });
		warnBox = document.getElementById("s2-warnings");
		output = document.getElementById("s2-output");
		setHint = window.UI.hint(document.getElementById("s2-hint"));

		// Server info and passwords.
		SECTIONS.forEach(function (section)
		{
			var box = makeSection(section.title, form);
			section.fields.forEach(function (spec)
			{
				var made = makeField(spec, "s2-");
				fieldBoxes[spec.n] = made.field;
				fieldRows[spec.n] = made.row;
				box.appendChild(made.row);
			});
			if (section.id === "info")
			{
				var pw = makeSection("Passwords", form);
				pw.appendChild(el("p", "rc-note", "Never filled in for you: replace " + PLACEHOLDER + " with your own."));
				var rcon = makePasswordRow("s2-rcon", "rcon password", "rcon_password: for /rcon login. Without one, rcon is off.");
				rconBox = rcon.input;
				pw.appendChild(rcon.row);
				passwordBox = el("input");
				passwordBox.type = "checkbox";
				passwordBox.id = "s2-use-password";
				passwordBox.setAttribute("aria-label", "Password to join");
				passwordBox.addEventListener("change", update);
				var game = makePasswordRow("s2-password", "Join password", "g_password: tick the box for a private server; otherwise everyone can join.", passwordBox);
				gamePasswordBox = game.input;
				pw.appendChild(game.row);
				var priv = makePasswordRow("s2-private", "Private password", "sv_privatePassword: for the private slots.");
				privatePasswordBox = priv.input;
				pw.appendChild(priv.row);
			}
		});

		// zPAM: gametype and pam_mode.
		var zpam = makeSection("zPAM " + data.version, form);
		zpam.appendChild(el("p", "rc-note", "pam_mode picks zPAM's rules. In every mode but pub they set the match settings " +
			"at each map start, whatever server.cfg says."));
		var grid = el("div", "s2-pam");
		gametypeBox = el("select", "dv-select");
		gametypeBox.id = "s2-gametype";
		window.COD2_RCON.gametypes.forEach(function (g)
		{
			var option = el("option", null, g.name + " (" + g.id + ")");
			option.value = g.id;
			gametypeBox.appendChild(option);
		});
		gametypeBox.value = data.example.g_gametype ? data.example.g_gametype[0] : "sd";
		modeBox = el("select", "dv-select");
		modeBox.id = "s2-mode";
		scoreBox = el("select", "dv-select");
		scoreBox.id = "s2-score";
		[["Gametype", gametypeBox], ["Mode", modeBox], ["Score", scoreBox]].forEach(function (pair)
		{
			var label = el("label", "d2-check");
			label.appendChild(el("span", "d2-filter-label dv-first", pair[0]));
			label.appendChild(pair[1]);
			grid.appendChild(label);
		});
		zpam.appendChild(grid);
		var options = el("div", "s2-options");
		options.appendChild(el("span", "d2-filter-label dv-first", "Options"));
		data.options.forEach(function (o)
		{
			var label = el("label", "d2-check");
			label.title = o.desc;
			var box = el("input");
			box.type = "checkbox";
			box.value = o.id;
			box.addEventListener("change", update);
			optionBoxes.push(box);
			label.appendChild(box);
			label.appendChild(document.createTextNode(" " + o.id));
			options.appendChild(label);
		});
		zpam.appendChild(options);
		modeInfo = el("div", "s2-mode-info");
		zpam.appendChild(modeInfo);

		var pubSection = makeSection("Match settings for pub", form);
		pubSection.appendChild(el("p", "rc-note", "Only pub uses these as they are; every other mode sets its own."));
		pubBox = el("div");
		pubSection.appendChild(pubBox);

		gametypeBox.addEventListener("change", function ()
		{
			fillModes();
			renderPub();
			addGametypeBox.value = gametypeBox.value;
			fillAddMaps();
			update();
		});
		modeBox.addEventListener("change", update);
		scoreBox.addEventListener("change", update);

		// Map rotation.
		var rot = makeSection("Map rotation", form);
		rot.appendChild(el("p", "rc-note", "Pick a gametype and a map, then Add. Drag a map by its handle or use the arrows to change the order."));
		var adder = el("div", "s2-add");
		addGametypeBox = el("select", "dv-select");
		addGametypeBox.setAttribute("aria-label", "Gametype of the map to add");
		window.COD2_RCON.gametypes.forEach(function (g)
		{
			var option = el("option", null, g.id);
			option.value = g.id;
			option.title = g.name;
			addGametypeBox.appendChild(option);
		});
		addGametypeBox.value = gametypeBox.value;
		addMapBox = el("select", "dv-select s2-add-map");
		addMapBox.setAttribute("aria-label", "Map to add");
		var addButton = el("button", "btn btn-sm", "Add");
		addButton.type = "button";
		var addAll = el("button", "btn btn-sm", "Add all stock maps");
		addAll.type = "button";
		var clearAll = el("button", "btn btn-sm", "Clear");
		clearAll.type = "button";
		adder.appendChild(addGametypeBox);
		adder.appendChild(addMapBox);
		adder.appendChild(addButton);
		adder.appendChild(addAll);
		adder.appendChild(clearAll);
		rot.appendChild(adder);
		rotationList = el("ol", "s2-rotation");
		rot.appendChild(rotationList);

		addGametypeBox.addEventListener("change", fillAddMaps);
		addButton.addEventListener("click", function ()
		{
			if (addMapBox.value)
			{
				rotation.push({ gt: addGametypeBox.value, map: addMapBox.value });
				renderRotation();
				update();
			}
		});
		addAll.addEventListener("click", function ()
		{
			mapsFor(addGametypeBox.value).filter(function (m) { return m.source === "stock"; }).forEach(function (m)
			{
				rotation.push({ gt: addGametypeBox.value, map: m.id });
			});
			renderRotation();
			update();
		});
		clearAll.addEventListener("click", function ()
		{
			rotation = [];
			renderRotation();
			update();
		});

		// A start that works: zPAM's fixed versions of the classic maps.
		["mp_toujane_fix", "mp_burgundy_fix", "mp_dawnville_fix", "mp_matmata_fix", "mp_carentan_fix"].forEach(function (id)
		{
			if (mapsById[id])
			{
				rotation.push({ gt: gametypeBox.value, map: id });
			}
		});

		fillModes();
		renderPub();
		fillAddMaps();
		renderRotation();

		copyButton(document.getElementById("s2-copy"), function () { return output.textContent; });
		document.getElementById("s2-download").addEventListener("click", download);
		update();
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
