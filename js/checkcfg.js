/*
 * CoD4 Config Checker
 * Scans a pasted config for disallowed DVAR names and disallowed bind/DVAR contents.
 */
(function ()
{
	"use strict";

	// Exact DVAR names that are not allowed.
	var DISALLOWED_DVARS = [
		"aim.autoaim", "aimbot", "chams", "con_maxfps", "hax_aimbot", "hax_autoshoot",
		"hax_distesp", "hax_killsounds", "hax_killspam", "hax_nameesp", "hax_radar",
		"hax_stats", "hax_wallhack", "Mom_aimbot", "Mom_autoshoot", "Mom_distesp",
		"Mom_killspam", "Mom_nameesp", "Mom_radar", "Mom_stats", "Mom_wallhack",
		"nameesp", "norecoil", "recoil", "wallhack", "wh", "_aimbot", "_autoshoot",
		"_crosshair", "_crosshairhealth", "_infoenemy", "_killsounds", "_killspam",
		"_nameesp", "_radar", "_simpletrace", "_stats", "_wallhack"
	];

	// Substrings that are not allowed inside a bind action or a DVAR value.
	var DISALLOWED_CONTENTS = [
		"aim", "chams", "esp", "health", "info", "key", "kill", "radar", "recoil",
		"trace", "tracker", "vstr", "wall", "wait"
	];

	// Pre-lowercased lookups so we do not re-lowercase inside the scan loop.
	var DVARS_LOWER = DISALLOWED_DVARS.map(function (v) { return v.toLowerCase(); });
	var CONTENTS_LOWER = DISALLOWED_CONTENTS.map(function (v) { return v.toLowerCase(); });

	var BIND_RE = /^bind\s+(\S+)\s+(.+)$/i;
	var SET_RE = /^set[aus]?\s+(\S+)\s+(.+)$/i;

	var MAX_SNIPPET = 300;
	var MAX_FILE_BYTES = 2 * 1024 * 1024;
	var DOWNLOAD_FILE_NAME = "config_mp.cfg";
	var HINT_RESET_MS = 3000;
	var HIGHLIGHT_DEBOUNCE_MS = 120;

	var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

	var input = null;
	var output = null;
	var gutter = null;
	var gutterBox = null;
	var highlights = null;
	var hint = null;
	var fileInput = null;
	var uploadBtn = null;
	var copyBtn = null;
	var downloadBtn = null;

	var defaultHint = "";
	var hintTimer = null;
	var gutterLines = -1;
	var highlightsOn = false;
	var highlightTimer = null;

	/* ---------- scanning ---------- */

	function escapeHtml(text)
	{
		return String(text).replace(/[&<>"']/g, function (ch) { return HTML_ESCAPES[ch]; });
	}

	function snippet(line)
	{
		var text = line.length > MAX_SNIPPET ? line.slice(0, MAX_SNIPPET) + " …" : line;
		return escapeHtml(text);
	}

	// Strips one layer of matching quotes and any trailing line comment.
	function normalizeToken(token)
	{
		var value = token.replace(/\s*\/\/.*$/, "").trim();
		if (value.length > 1 && ((value.charAt(0) === '"' && value.slice(-1) === '"') ||
			(value.charAt(0) === "'" && value.slice(-1) === "'")))
		{
			value = value.slice(1, -1);
		}
		return value;
	}

	function findDisallowedContent(value)
	{
		var lower = value.toLowerCase();
		for (var i = 0; i < CONTENTS_LOWER.length; i++)
		{
			if (lower.indexOf(CONTENTS_LOWER[i]) !== -1)
			{
				return DISALLOWED_CONTENTS[i];
			}
		}
		return null;
	}

	function findDisallowedDvar(name)
	{
		var lower = name.toLowerCase();
		for (var i = 0; i < DVARS_LOWER.length; i++)
		{
			if (lower === DVARS_LOWER[i])
			{
				return DISALLOWED_DVARS[i];
			}
		}
		return null;
	}

	function splitLines(text)
	{
		return text.split(/\r\n|\r|\n/);
	}

	function lineActions(lineNumber)
	{
		return '<div class="line-actions">' +
			'<a href="#" class="line-action jump-line" data-line="' + lineNumber +
			'">Jump to this line</a>' +
			'<a href="#" class="line-action remove-line" data-line="' + lineNumber +
			'">Remove this line</a>' +
			"</div>";
	}

	// Returns findings as data so the result list and the highlight layer are
	// always driven by the same scan.
	function scan(lines)
	{
		var findings = [];

		for (var i = 0; i < lines.length; i++)
		{
			var line = lines[i].trim();
			var lineNumber = i + 1;

			// Skip blank lines and full-line comments.
			if (line === "" || line.indexOf("//") === 0)
			{
				continue;
			}

			var match = BIND_RE.exec(line);
			if (match !== null)
			{
				var badAction = findDisallowedContent(normalizeToken(match[2]));
				if (badAction !== null)
				{
					findings.push({
						line: lineNumber,
						severity: "orange",
						label: "Disallowed BIND contents",
						term: badAction,
						text: line
					});
				}
				continue;
			}

			match = SET_RE.exec(line);
			if (match !== null)
			{
				var badName = findDisallowedDvar(normalizeToken(match[1]));
				if (badName !== null)
				{
					findings.push({
						line: lineNumber,
						severity: "red",
						label: "Disallowed DVAR name",
						term: badName,
						text: line
					});
				}

				var badValue = findDisallowedContent(normalizeToken(match[2]));
				if (badValue !== null)
				{
					findings.push({
						line: lineNumber,
						severity: "orange",
						label: "Disallowed DVAR contents",
						term: badValue,
						text: line
					});
				}
			}
		}

		return findings;
	}

	function renderFindings(findings)
	{
		var items = [];

		for (var i = 0; i < findings.length; i++)
		{
			var f = findings[i];
			items.push('<li class="' + f.severity + '">Line ' + f.line + ": " + f.label +
				" <em>" + escapeHtml(f.term) + "</em><pre>" + snippet(f.text) + "</pre>" +
				lineActions(f.line) + "</li>");
		}

		return items.join("");
	}

	/* ---------- line number gutter ---------- */

	// The textarea does not soft-wrap (wrap="off"), so one visual row is one config line.
	function renderGutter()
	{
		if (gutter === null || input === null)
		{
			return;
		}

		var count = splitLines(input.value).length;
		if (count !== gutterLines)
		{
			var numbers = new Array(count);
			for (var i = 0; i < count; i++)
			{
				numbers[i] = i + 1;
			}
			gutter.textContent = numbers.join("\n");
			gutterLines = count;

			if (gutterBox !== null)
			{
				// Widen the gutter once the line count needs another digit.
				gutterBox.style.width = "calc(" + String(count).length + "ch + 24px)";
			}
		}

		syncScroll();
	}

	function syncScroll()
	{
		if (input === null)
		{
			return;
		}

		if (gutter !== null)
		{
			gutter.style.transform = "translateY(" + (-input.scrollTop) + "px)";
		}

		if (highlights !== null)
		{
			highlights.style.transform = "translate(" + (-input.scrollLeft) + "px, " +
				(-input.scrollTop) + "px)";
		}
	}

	/* ---------- highlight layer ---------- */

	// A line flagged both red and orange is painted with the more severe colour.
	function severityByLine(findings)
	{
		var map = {};

		for (var i = 0; i < findings.length; i++)
		{
			var f = findings[i];
			if (map[f.line] !== "red")
			{
				map[f.line] = f.severity;
			}
		}

		return map;
	}

	function renderHighlights(lines, findings)
	{
		if (highlights === null)
		{
			return;
		}

		if (!highlightsOn)
		{
			highlights.innerHTML = "";
			return;
		}

		var map = severityByLine(findings);
		var rows = new Array(lines.length);

		for (var i = 0; i < lines.length; i++)
		{
			var severity = map[i + 1];
			// A zero width space keeps blank rows one line tall.
			var text = lines[i] === "" ? "&#8203;" : escapeHtml(lines[i]);
			rows[i] = severity
				? '<div class="hl-' + severity + '">' + text + "</div>"
				: "<div>" + text + "</div>";
		}

		highlights.innerHTML = rows.join("");
		syncScroll();
	}

	// Keeps the colours in step while the config is edited after a scan.
	function refreshHighlights()
	{
		if (input === null || !highlightsOn)
		{
			return;
		}

		var lines = splitLines(input.value);
		renderHighlights(lines, scan(lines));
	}

	function queueHighlightRefresh()
	{
		window.clearTimeout(highlightTimer);
		highlightTimer = window.setTimeout(refreshHighlights, HIGHLIGHT_DEBOUNCE_MS);
	}

	// Pasting a whole config leaves the caret at the very end, so the view sits at
	// the bottom of the file. Jump back to the start of line 1 instead.
	function scrollToStart()
	{
		if (input === null)
		{
			return;
		}

		if (input.setSelectionRange)
		{
			input.setSelectionRange(0, 0);
		}
		input.scrollTop = 0;
		input.scrollLeft = 0;
		syncScroll();
	}

	/* ---------- status line ---------- */

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

	function showResultTools(show)
	{
		if (copyBtn !== null)
		{
			copyBtn.hidden = !show;
		}
		if (downloadBtn !== null)
		{
			downloadBtn.hidden = !show;
		}
	}

	/* ---------- actions ---------- */

	function checkCfg()
	{
		if (input === null || output === null)
		{
			return;
		}

		renderGutter();

		if (input.value.trim() === "")
		{
			output.innerHTML = "";
			output.hidden = true;
			showResultTools(false);
			highlightsOn = false;
			renderHighlights([], []);
			return;
		}

		var lines = splitLines(input.value);
		var findings = scan(lines);

		output.innerHTML = findings.length > 0
			? renderFindings(findings)
			: '<li class="green">Your config is clean. Congratulations!</li>';
		output.hidden = false;
		showResultTools(true);

		// Colouring starts with the first scan and then tracks further edits.
		highlightsOn = true;
		renderHighlights(lines, findings);
	}

	// Character offsets of one line inside the textarea value.
	function lineRange(lineNumber)
	{
		var value = input.value;
		var start = 0;
		var newline;

		for (var i = 1; i < lineNumber; i++)
		{
			newline = value.indexOf("\n", start);
			if (newline === -1)
			{
				return null;
			}
			start = newline + 1;
		}

		newline = value.indexOf("\n", start);
		return { start: start, end: newline === -1 ? value.length : newline };
	}

	function jumpToLine(lineNumber)
	{
		if (input === null || lineNumber < 1)
		{
			return;
		}

		var range = lineRange(lineNumber);
		if (range === null)
		{
			return;
		}

		// Focusing brings the editor itself back into view if it is scrolled off.
		input.focus();
		if (input.setSelectionRange)
		{
			input.setSelectionRange(range.start, range.end);
		}

		var style = window.getComputedStyle(input);
		var lineHeight = parseFloat(style.lineHeight) || 0;
		var paddingTop = parseFloat(style.paddingTop) || 0;
		var centred = paddingTop + (lineNumber - 1) * lineHeight -
			(input.clientHeight - lineHeight) / 2;

		input.scrollTop = centred > 0 ? centred : 0;
		input.scrollLeft = 0;
		syncScroll();
	}

	function removeLine(lineNumber)
	{
		if (input === null)
		{
			return;
		}

		var index = lineNumber - 1;
		// Re-read the textarea instead of trusting a cached copy, so manual edits are not lost.
		var lines = splitLines(input.value);
		if (index < 0 || index >= lines.length)
		{
			return;
		}

		lines.splice(index, 1);
		input.value = lines.join("\n");
		checkCfg();
	}

	function loadFile(file)
	{
		if (!file)
		{
			return;
		}

		if (!/\.cfg$/i.test(file.name))
		{
			setHint("Only .cfg files can be loaded.", true);
			return;
		}

		if (file.size > MAX_FILE_BYTES)
		{
			setHint("That file is too large for a config (max 2 MB).", true);
			return;
		}

		var reader = new FileReader();

		reader.onload = function ()
		{
			input.value = String(reader.result);
			checkCfg();
			scrollToStart();
			setHint("Loaded " + file.name + ".");
		};

		reader.onerror = function ()
		{
			setHint("That file could not be read.", true);
		};

		reader.readAsText(file);
	}

	function copyText(text)
	{
		if (navigator.clipboard && navigator.clipboard.writeText)
		{
			return navigator.clipboard.writeText(text);
		}

		// Fallback for browsers that gate the async clipboard API.
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

	function copyConfig()
	{
		copyText(input.value).then(function ()
		{
			setHint("Config copied to clipboard.");
		}, function ()
		{
			setHint("Could not copy — select the text and copy manually.", true);
		});
	}

	function downloadConfig()
	{
		var blob = new Blob([input.value], { type: "text/plain;charset=utf-8" });
		var url = URL.createObjectURL(blob);
		var link = document.createElement("a");

		link.href = url;
		link.download = DOWNLOAD_FILE_NAME;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		// Give the browser a moment to start the download before releasing the blob.
		window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
		setHint("Downloaded " + DOWNLOAD_FILE_NAME + ".");
	}

	/* ---------- wiring ---------- */

	function init()
	{
		input = document.getElementById("cfg");
		output = document.getElementById("violations");
		gutter = document.getElementById("gutter");
		gutterBox = document.querySelector(".gutter-box");
		highlights = document.getElementById("highlights");
		hint = document.getElementById("hint");
		fileInput = document.getElementById("file");
		uploadBtn = document.getElementById("upload");
		copyBtn = document.getElementById("copy");
		downloadBtn = document.getElementById("download");

		if (input === null || output === null)
		{
			return;
		}

		if (hint !== null)
		{
			defaultHint = hint.textContent;
		}

		renderGutter();
		input.addEventListener("input", function ()
		{
			renderGutter();
			queueHighlightRefresh();
		});
		input.addEventListener("scroll", syncScroll);

		input.addEventListener("paste", function ()
		{
			// The pasted text only lands after this event, so rewind on the next tick.
			window.setTimeout(scrollToStart, 0);
		});

		var form = document.querySelector("form");
		if (form !== null)
		{
			form.addEventListener("submit", function (event)
			{
				event.preventDefault();
				checkCfg();
			});
		}

		// Delegated handler: no inline onclick, so the line number can never be injected.
		output.addEventListener("click", function (event)
		{
			var link = event.target.closest ? event.target.closest("a.line-action") : null;
			if (link === null)
			{
				return;
			}

			event.preventDefault();
			var lineNumber = parseInt(link.getAttribute("data-line"), 10);

			if (link.className.indexOf("jump-line") !== -1)
			{
				jumpToLine(lineNumber);
			}
			else
			{
				removeLine(lineNumber);
			}
		});

		if (uploadBtn !== null && fileInput !== null)
		{
			uploadBtn.addEventListener("click", function ()
			{
				fileInput.click();
			});

			fileInput.addEventListener("change", function ()
			{
				loadFile(fileInput.files[0]);
				// Reset so picking the same file again still fires a change event.
				fileInput.value = "";
			});
		}

		if (copyBtn !== null)
		{
			copyBtn.addEventListener("click", copyConfig);
		}

		if (downloadBtn !== null)
		{
			downloadBtn.addEventListener("click", downloadConfig);
		}
	}

	if (document.readyState === "loading")
	{
		document.addEventListener("DOMContentLoaded", init);
	}
	else
	{
		init();
	}

	// Kept on window for the inline handlers in older copies of index.html.
	window.checkCfg = checkCfg;
	window.removeLine = removeLine;
})();
