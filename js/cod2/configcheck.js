/*
 * CoD2 config checker: reads a pasted or loaded .cfg (it never leaves the
 * browser) and reports, per line, what the game will do with it. The dvars are
 * window.COD2_DVARS (js/cod2/dvars-data.js), the commands window.COD2_CONFIG
 * (js/cod2/config-data.js) and the key names window.COD2_NAMES.keys.
 *
 * How the game runs a config, mirrored here (CoD2 1.3, see the proofs in
 * config-data.js):
 *   - A line splits into commands at ; outside quotes; // starts a comment.
 *   - set / seta / sets / setu and a bare "dvar value" set a dvar. A value the
 *     dvar does not take (out of range, not one of its choices) is rejected and
 *     the old value stays; read-only and write-protected dvars take nothing;
 *     cheat protected ones nothing without sv_cheats 1; latched ones change on
 *     the next restart. Numbers are read like atoi / atof, so text reads as 0.
 *   - The last line that sets a dvar or binds a key wins.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var setHint = function () {};

	var DEBOUNCE_MS = 150;
	var SET_COMMANDS = { set: true, seta: true, sets: true, setu: true };

	// Categories in the summary, worst first. tone: the colour of the finding.
	var CATEGORIES = [
		{ id: "syntax", label: "Syntax", tone: "red", comment: true },
		{ id: "value", label: "Invalid value", tone: "red", comment: true },
		{ id: "locked", label: "Locked", tone: "red", comment: true },
		{ id: "cheat", label: "Cheat protected", tone: "orange", comment: true },
		{ id: "unknown", label: "Unknown", tone: "plain", comment: false },
		{ id: "zpam", label: "zPAM", tone: "plain", comment: false },
		{ id: "cod2x", label: "CoD2x enforced", tone: "plain", comment: false },
		{ id: "duplicate", label: "Duplicate", tone: "plain", comment: true },
		{ id: "latched", label: "After restart", tone: "plain", comment: false }
	];

	// One line per kind of finding, for the "Example" button.
	var EXAMPLE = [
		"// Example config with a few problems",
		"unbindall",
		"bind TAB \"+scores\"",
		"bind MOUSE1 \"+attack\"",
		"bind F5 \"say ^1gg; say ^2wp\"",
		"bind MOUSEX \"+attack\"",
		"seta name \"^1Player\"",
		"seta com_maxfps \"250\"",
		"seta sensitivity \"2.5\"",
		"seta sensitivity \"3\"",
		"seta r_gamma \"5\"",
		"seta cg_drawFPS \"Simple\"",
		"seta cg_drawFPS \"Fast\"",
		"seta r_fullbright \"1\"",
		"seta cg_fov \"90\"",
		"seta cg_errordecay \"0\"",
		"seta shortversion \"1.4\"",
		"seta m_rinput \"2\"",
		"seta cg_drawCrosshiar \"1\"",
		"set r_picmip abc",
		"seta cl_hideServerIp",
		"bind F6 \"say hello"
	].join("\n");

	var dvars = {};
	var cod2revOnly = {};       // dvars only the CoD2rev server has
	var dvarNames = [];
	var commands = {};
	var keyNames = {};

	var input = null;
	var resultBox = null;
	var summaryBox = null;
	var searchBox = null;
	var countBox = null;
	var emptyBox = null;
	var cleanedBox = null;
	var fileName = "config_mp.cfg";
	var findings = [];
	var lines = [];
	var activeCategory = "";
	var timer = 0;

	/* ---------- reading the config ---------- */

	// One line: its commands (split at ; outside quotes, without the // comment),
	// and whether a quote is left open.
	function splitLine(line)
	{
		var parts = [];
		var current = "";
		var quoted = false;
		for (var i = 0; i < line.length; i++)
		{
			var c = line.charAt(i);
			if (!quoted && c === "/" && (line.charAt(i + 1) === "/" || line.charAt(i + 1) === "*"))
			{
				break;
			}
			if (c === "\"")
			{
				quoted = !quoted;
			}
			if (c === ";" && !quoted)
			{
				parts.push(current);
				current = "";
				continue;
			}
			current += c;
		}
		parts.push(current);
		return { commands: parts.map(function (p) { return p.trim(); }).filter(function (p) { return p !== ""; }), open: quoted };
	}

	// Words of one command; a quoted word keeps its spaces.
	function tokenize(command)
	{
		var tokens = [];
		var re = /"([^"]*)"?|(\S+)/g;
		var m;
		while ((m = re.exec(command)) !== null)
		{
			tokens.push(m[1] !== undefined ? m[1] : m[2]);
		}
		return tokens;
	}

	/* ---------- checks ---------- */

	function bound(v)
	{
		if (v === "inf")
		{
			return Infinity;
		}
		if (v === "-inf")
		{
			return -Infinity;
		}
		return typeof v === "number" ? v : null;
	}

	function rangeText(d)
	{
		var mn = bound(d.mn);
		var mx = bound(d.mx);
		if (mn !== null && mx !== null && mn !== -Infinity && mx !== Infinity)
		{
			return mn + " to " + mx;
		}
		if (mn !== null && mn !== -Infinity)
		{
			return "at least " + mn;
		}
		if (mx !== null && mx !== Infinity)
		{
			return "at most " + mx;
		}
		return "";
	}

	// What the game makes of a value: { problem } or {} when it takes it.
	function checkValue(d, value)
	{
		var v = value.trim();
		var number = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/;
		var isNumber = number.test(v);
		var n = isNumber ? parseFloat(v.match(number)[0]) : 0;
		var mn = bound(d.mn);
		var mx = bound(d.mx);

		switch (d.t)
		{
			case "bool":
				if (!isNumber)
				{
					return { problem: "\"" + v + "\" is not a number; the game reads it as 0 (off)." };
				}
				return {};
			case "int":
			case "float":
				if (!isNumber)
				{
					return { problem: "\"" + v + "\" is not a number; the game reads it as 0" +
						((mn !== null && 0 < mn) || (mx !== null && 0 > mx) ? ", which is out of range, so it is rejected." : ".") };
				}
				if (d.t === "int" && !/^[-+]?\d+$/.test(v))
				{
					n = parseInt(v, 10);
				}
				if ((mn !== null && n < mn) || (mx !== null && n > mx))
				{
					return { problem: n + " is out of range (" + rangeText(d) + "); the game rejects it and keeps the old value." };
				}
				return {};
			case "enum":
				var choices = d.v || [];
				var lower = v.toLowerCase();
				var ok = choices.some(function (c) { return String(c).toLowerCase() === lower; }) ||
					(/^\d+$/.test(v) && Number(v) < choices.length) ||
					(lower !== "" && choices.some(function (c) { return String(c).toLowerCase().indexOf(lower) === 0; }));
				return ok ? {} : { problem: "\"" + v + "\" is not one of " + choices.join(", ") + "; the game rejects it." };
			case "vec2":
			case "vec3":
			case "vec4":
			case "color":
				var want = d.t === "color" ? 4 : Number(d.t.charAt(3));
				var words = v.split(/\s+/).filter(function (w) { return w !== ""; });
				if (words.length < (d.t === "color" ? 3 : want) || words.some(function (w) { return !number.test(w); }))
				{
					return { problem: d.t === "color" ? "A color is four numbers from 0 to 1: \"r g b a\"." : "Expects " + want + " numbers." };
				}
				if (d.t === "color" && words.some(function (w) { return parseFloat(w) < 0 || parseFloat(w) > 1; }))
				{
					return { problem: "Color values go from 0 to 1." };
				}
				return {};
			default:
				return {};
		}
	}

	// A close dvar name, for typos.
	function suggestion(name)
	{
		var lower = name.toLowerCase();
		var best = null;
		var bestDistance = 3;
		dvarNames.forEach(function (candidate)
		{
			if (Math.abs(candidate.length - lower.length) >= bestDistance)
			{
				return;
			}
			var dist = distance(lower, candidate.toLowerCase(), bestDistance);
			if (dist < bestDistance)
			{
				bestDistance = dist;
				best = candidate;
			}
		});
		return best;
	}

	function distance(a, b, limit)
	{
		var prev = [];
		for (var j = 0; j <= b.length; j++)
		{
			prev[j] = j;
		}
		for (var i = 1; i <= a.length; i++)
		{
			var cur = [i];
			var rowMin = i;
			for (j = 1; j <= b.length; j++)
			{
				cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
				rowMin = Math.min(rowMin, cur[j]);
			}
			if (rowMin >= limit)
			{
				return limit;
			}
			prev = cur;
		}
		return prev[b.length];
	}

	function keyProblem(key)
	{
		if (key.length === 1)
		{
			return null;
		}
		if (/^0x[0-9a-f]{2}$/i.test(key) || keyNames[key.toUpperCase()])
		{
			return null;
		}
		return "\"" + key + "\" is not a key name, so the bind does nothing.";
	}

	function add(lineNo, category, message, ref)
	{
		findings.push({ line: lineNo, category: category, message: message, ref: ref || "" });
	}

	function checkDvar(lineNo, name, value, seen)
	{
		if (!/^\w+$/.test(name))
		{
			add(lineNo, "syntax", "\"" + name + "\" is not a valid dvar name (letters, digits and _ only).");
			return;
		}
		var d = dvars[name.toLowerCase()];
		if (!d && cod2revOnly[name.toLowerCase()])
		{
			add(lineNo, "unknown", cod2revOnly[name.toLowerCase()].n + " only exists on the CoD2rev server (a reverse-engineered " +
				"dedicated server), not in CoD2 1.3, CoD2x or zPAM.");
			return;
		}
		if (!d)
		{
			var close = suggestion(name);
			add(lineNo, "unknown", name + " is not a CoD2 dvar (stock 1.3, CoD2x or zPAM)" +
				(close ? "; did you mean " + close + "?" : ". A mod may create it; otherwise it does nothing."));
			return;
		}

		var p = d.p || [];
		var type = p[0];
		var takesIt = true;

		if (value !== null)
		{
			var result = checkValue(d, value);
			if (result.problem)
			{
				add(lineNo, "value", d.n + ": " + result.problem);
				takesIt = !/rejects/.test(result.problem);
			}
		}

		if (d.c === true)
		{
			// The standard reason only repeats the message; keep what it adds (e.g. CoD2x lifting the flag).
			var extra = (p[1] || "").replace(/^Registered with the cheat flag \(0x80\) by .*?\. Only works with sv_cheats 1\.\s*/, "");
			add(lineNo, "cheat", d.n + " is cheat protected: it has no effect without sv_cheats 1." + (extra ? " " + extra : ""), p[2]);
			takesIt = false;
		}
		else if (type === "Read-only" || type === "Write-protected")
		{
			add(lineNo, "locked", d.n + " is " + (type === "Read-only" ? "read-only" : "write-protected") +
				": the game ignores this. " + (p[1] || ""), p[2]);
			takesIt = false;
		}

		// Only a value the game takes replaces an earlier one.
		var key = d.n.toLowerCase();
		if (takesIt)
		{
			if (seen.dvars[key])
			{
				add(seen.dvars[key], "duplicate", d.n + " is set again in line " + lineNo + "; the later line wins.");
			}
			seen.dvars[key] = lineNo;
		}
		if (type === "set by zPAM" || type === "zPAM rules")
		{
			add(lineNo, "zpam", d.n + ": " + p[1], p[2]);
		}
		else if (type === "CoD2x enforced")
		{
			add(lineNo, "cod2x", d.n + ": " + p[1], p[2]);
		}
		if (d.f !== undefined && (d.f & 0x20))
		{
			add(lineNo, "latched", d.n + " is latched: a new value applies after a restart of that part of the game " +
				"(vid_restart, snd_restart, net_restart) or of the game. At game start that is no problem.");
		}
	}

	// A command inside a bind or a line; returns nothing, adds findings.
	function checkCommand(lineNo, tokens, seen, inBind)
	{
		var word = tokens[0];
		var lower = word.toLowerCase();

		if (SET_COMMANDS[lower])
		{
			if (tokens.length < 2)
			{
				add(lineNo, "syntax", lower + " without a dvar name.");
				return;
			}
			if (tokens.length < 3)
			{
				add(lineNo, "syntax", lower + " " + tokens[1] + " without a value; the game only prints its usage.");
				return;
			}
			checkDvar(lineNo, tokens[1], tokens.slice(2).join(" "), inBind ? { dvars: {} } : seen);
			return;
		}

		if (lower === "bind")
		{
			if (inBind)
			{
				return;
			}
			if (tokens.length < 2)
			{
				add(lineNo, "syntax", "bind without a key.");
				return;
			}
			var keyIssue = keyProblem(tokens[1]);
			if (keyIssue)
			{
				add(lineNo, "syntax", keyIssue);
				return;
			}
			var k = tokens[1].length === 1 ? tokens[1].toLowerCase() : tokens[1].toUpperCase();
			if (tokens.length > 2)
			{
				if (seen.keys[k])
				{
					add(seen.keys[k], "duplicate", "Key " + tokens[1] + " is bound again in line " + lineNo + "; the last one wins.");
				}
				seen.keys[k] = lineNo;
				var inner = tokens.slice(2).join(" ");
				splitLine(inner).commands.forEach(function (command)
				{
					var t = tokenize(command);
					if (t.length)
					{
						checkCommand(lineNo, t, seen, true);
					}
				});
			}
			return;
		}

		if (lower === "unbind" && tokens.length > 1)
		{
			var issue = keyProblem(tokens[1]);
			if (issue)
			{
				add(lineNo, "syntax", issue);
			}
			return;
		}

		if (lower === "unbindall")
		{
			seen.keys = {};
			return;
		}

		if (commands[lower])
		{
			return;
		}

		if (dvars[lower])
		{
			// "dvar value" sets it, a dvar alone prints it.
			if (tokens.length > 1)
			{
				checkDvar(lineNo, word, tokens.slice(1).join(" "), inBind ? { dvars: {} } : seen);
			}
			return;
		}

		if (/^[+-]/.test(word))
		{
			add(lineNo, "unknown", word + " is not a CoD2 action.");
			return;
		}

		var close = suggestion(word);
		add(lineNo, "unknown", word + " is not a CoD2 command or dvar" +
			(close ? "; did you mean " + close + "?" : "; the game prints \"Unknown command\"."));
	}

	function check(text)
	{
		findings = [];
		lines = text.split(/\r?\n/);
		var seen = { dvars: {}, keys: {} };

		lines.forEach(function (line, index)
		{
			var lineNo = index + 1;
			var parts = splitLine(line);
			if (parts.open)
			{
				add(lineNo, "syntax", "A quote is not closed; the rest of the line is read as one word.");
			}
			parts.commands.forEach(function (command)
			{
				var tokens = tokenize(command);
				if (tokens.length)
				{
					checkCommand(lineNo, tokens, seen, false);
				}
			});
		});

		var order = {};
		CATEGORIES.forEach(function (c, i) { order[c.id] = i; });
		findings.sort(function (a, b) { return a.line - b.line || order[a.category] - order[b.category]; });
	}

	/* ---------- output ---------- */

	function categoryOf(id)
	{
		for (var i = 0; i < CATEGORIES.length; i++)
		{
			if (CATEGORIES[i].id === id)
			{
				return CATEGORIES[i];
			}
		}
		return null;
	}

	function renderSummary()
	{
		summaryBox.textContent = "";
		var counts = {};
		findings.forEach(function (f) { counts[f.category] = (counts[f.category] || 0) + 1; });

		var all = el("button", "btn btn-sm k2-chip" + (activeCategory === "" ? " is-active" : ""), "All " + findings.length);
		all.type = "button";
		all.setAttribute("data-category", "");
		all.setAttribute("aria-pressed", String(activeCategory === ""));
		summaryBox.appendChild(all);

		CATEGORIES.forEach(function (c)
		{
			var button = el("button", "btn btn-sm k2-chip k2-" + c.tone + (activeCategory === c.id ? " is-active" : ""),
				c.label + " " + (counts[c.id] || 0));
			button.type = "button";
			button.disabled = !counts[c.id];
			button.setAttribute("data-category", c.id);
			button.setAttribute("aria-pressed", String(activeCategory === c.id));
			summaryBox.appendChild(button);
		});
	}

	function renderResults()
	{
		var query = searchBox.value.trim().toLowerCase();
		resultBox.textContent = "";
		var shown = 0;

		findings.forEach(function (f)
		{
			var source = lines[f.line - 1] || "";
			if (activeCategory !== "" && f.category !== activeCategory)
			{
				return;
			}
			if (query !== "" && (f.message + " " + source).toLowerCase().indexOf(query) === -1)
			{
				return;
			}
			var c = categoryOf(f.category);
			var item = el("li", "k2-item k2-" + c.tone);
			var head = el("div", "k2-head");
			var lineButton = el("button", "k2-line", "Line " + f.line);
			lineButton.type = "button";
			lineButton.setAttribute("data-line", String(f.line));
			lineButton.title = "Show this line in the config";
			head.appendChild(lineButton);
			head.appendChild(el("span", c.id === "cheat" ? "d2-cheat" : "dv-tag" + (c.tone === "red" ? " k2-tag-red" : ""), c.label));
			item.appendChild(head);
			item.appendChild(el("code", "k2-source", source.trim()));
			item.appendChild(el("p", "k2-message", f.message));
			if (f.ref)
			{
				item.appendChild(el("p", "k2-ref", f.ref));
			}
			resultBox.appendChild(item);
			shown++;
		});

		var total = lines.join("").trim() === "" ? 0 : findings.length;
		countBox.textContent = shown === total ? total + " findings" : shown + " of " + total + " findings";
		emptyBox.hidden = shown !== 0;
		emptyBox.textContent = input.value.trim() === "" ? "Paste a config or load a .cfg file."
			: findings.length === 0 ? "Nothing to report: every line does what it says."
				: "No finding matches these filters.";
	}

	// The config with the lines that do nothing or break commented out.
	function cleaned()
	{
		var reasons = {};
		findings.forEach(function (f)
		{
			if (categoryOf(f.category).comment)
			{
				(reasons[f.line] = reasons[f.line] || []).push(categoryOf(f.category).label.toLowerCase());
			}
		});
		return lines.map(function (line, i)
		{
			var why = reasons[i + 1];
			if (!why || line.trim() === "")
			{
				return line;
			}
			var unique = why.filter(function (w, j) { return why.indexOf(w) === j; });
			return "// [" + unique.join(", ") + "] " + line;
		}).join("\r\n");
	}

	function update()
	{
		check(input.value);
		renderSummary();
		renderResults();
		cleanedBox.textContent = cleaned();
	}

	function schedule()
	{
		window.clearTimeout(timer);
		timer = window.setTimeout(update, DEBOUNCE_MS);
	}

	// Selects a line in the textarea and scrolls it into view.
	function showLine(lineNo)
	{
		var text = input.value.split(/\n/);
		var start = 0;
		for (var i = 0; i < lineNo - 1 && i < text.length; i++)
		{
			start += text[i].length + 1;
		}
		var end = start + (text[lineNo - 1] || "").length;
		input.focus();
		input.setSelectionRange(start, end);
		var lineHeight = parseFloat(window.getComputedStyle(input).lineHeight) || 20;
		input.scrollTop = Math.max(0, (lineNo - 3) * lineHeight);
		input.scrollIntoView({ block: "nearest" });
	}

	function download()
	{
		var blob = new Blob([cleaned()], { type: "text/plain" });
		var url = URL.createObjectURL(blob);
		var a = document.createElement("a");
		a.href = url;
		a.download = fileName.replace(/\.cfg$/i, "") + "_checked.cfg";
		document.body.appendChild(a);
		a.click();
		a.remove();
		window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	function init()
	{
		input = document.getElementById("k2-input");
		if (input === null || !window.COD2_DVARS || !window.COD2_CONFIG || !window.COD2_NAMES)
		{
			return;
		}
		window.COD2_DVARS.forEach(function (d)
		{
			// Dvars only the CoD2rev server registers do not exist in the game.
			if (d.s.length === 1 && d.s[0] === "cod2rev")
			{
				cod2revOnly[d.n.toLowerCase()] = d;
				return;
			}
			dvars[d.n.toLowerCase()] = d;
			dvarNames.push(d.n);
		});
		Object.keys(window.COD2_CONFIG.commands).forEach(function (name) { commands[name.toLowerCase()] = true; });
		window.COD2_NAMES.keys.names.forEach(function (name) { keyNames[name.toUpperCase()] = true; });

		resultBox = document.getElementById("k2-results");
		summaryBox = document.getElementById("k2-summary");
		searchBox = document.getElementById("k2-search");
		countBox = document.getElementById("k2-count");
		emptyBox = document.getElementById("k2-empty");
		cleanedBox = document.getElementById("k2-cleaned");
		setHint = window.UI.hint(document.getElementById("k2-hint"));

		input.addEventListener("input", schedule);
		searchBox.addEventListener("input", renderResults);
		searchBox.addEventListener("search", renderResults);

		summaryBox.addEventListener("click", function (event)
		{
			var chip = event.target.closest ? event.target.closest(".k2-chip") : null;
			if (chip !== null && !chip.disabled)
			{
				activeCategory = chip.getAttribute("data-category");
				renderSummary();
				renderResults();
			}
		});
		resultBox.addEventListener("click", function (event)
		{
			var button = event.target.closest ? event.target.closest(".k2-line") : null;
			if (button !== null)
			{
				showLine(Number(button.getAttribute("data-line")));
			}
		});

		var file = document.getElementById("k2-file");
		document.getElementById("k2-load").addEventListener("click", function () { file.click(); });
		file.addEventListener("change", function ()
		{
			var f = file.files && file.files[0];
			if (!f)
			{
				return;
			}
			var reader = new FileReader();
			reader.onload = function ()
			{
				fileName = f.name;
				input.value = String(reader.result);
				file.value = "";
				update();
				setHint("Loaded " + f.name + " — it stays in your browser.");
			};
			reader.readAsText(f, "windows-1252");
		});
		document.getElementById("k2-example").addEventListener("click", function ()
		{
			input.value = EXAMPLE;
			fileName = "example.cfg";
			activeCategory = "";
			update();
		});
		document.getElementById("k2-clear").addEventListener("click", function ()
		{
			input.value = "";
			activeCategory = "";
			update();
			input.focus();
		});

		window.COD2_UI.copyButton(document.getElementById("k2-copy"), cleaned, function (text, isError) { setHint(text, isError); });
		document.getElementById("k2-download").addEventListener("click", download);

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
