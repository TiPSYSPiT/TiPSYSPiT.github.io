/*
 * CoD2 rcon reference: stock 1.3, CoD2x and zPAM. Looks and copies like the
 * CoD4 rcon tab, with a search and filters for source and category. The data
 * is window.COD2_RCON from js/cod2/rcon-data.js (built by tools/build-cod2-rcon.py);
 * its proofs are not shown.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var copyText = window.UI.copyText;
	var setHint = function () {};

	var COPIED_RESET_MS = 1500;
	var PREFIX = "/rcon ";

	var data = window.COD2_RCON;
	var sourceLabels = {};
	var gametypeNames = {};

	var list = null;
	var searchBox = null;
	var countBox = null;
	var emptyBox = null;
	var categoryBox = null;
	var sourceBoxes = [];

	// Everything the filters show or hide: { node, source, category, haystack }.
	var entries = [];

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
			setHint("Could not copy — select the command and copy manually.", true);
		});
	}

	function track(node, source, category, text)
	{
		entries.push({ node: node, source: source, category: category, haystack: text.toLowerCase() });
	}

	/* ---------- rendering ---------- */

	function makeBadge(text, extra)
	{
		return el("span", "d2-src" + (extra ? " " + extra : ""), text);
	}

	// One command: what to type, its source, what it does and an example.
	function makeItem(item)
	{
		var row = el("div", "rc-item");
		var text = el("div", "rc-item-text");
		var head = el("div", "r2-head");
		var command = PREFIX + item.syntax;

		head.appendChild(el("code", "rc-code", command));
		head.appendChild(makeBadge(sourceLabels[item.source]));
		if (item.rules)
		{
			var rules = makeBadge("rules", "r2-rules");
			rules.title = "zPAM always sets this back to the rules' value at the next map in match modes";
			head.appendChild(rules);
		}
		text.appendChild(head);
		text.appendChild(el("p", "rc-desc", item.desc));

		if (item.example && item.example !== item.syntax)
		{
			var example = el("p", "rc-desc r2-example", "Example: ");
			example.appendChild(el("code", null, PREFIX + item.example));
			text.appendChild(example);
		}

		row.appendChild(text);
		row.appendChild(makeCopyButton(command));
		track(row, item.source, item.category, item.syntax + " " + item.desc + " " + (item.example || ""));
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

	// Uniform short entries (maps, gametypes) read better as a grid.
	function makeGrid(cells, category)
	{
		var grid = el("div", "rc-grid");

		for (var i = 0; i < cells.length; i++)
		{
			var c = cells[i];
			var cell = el("div", "rc-cell");
			var text = el("div", "rc-item-text");

			text.appendChild(el("span", "rc-cell-name", c.name));
			text.appendChild(el("code", "rc-code", c.command));

			cell.appendChild(text);
			cell.appendChild(makeCopyButton(c.command));
			grid.appendChild(cell);
			track(cell, c.source, category, c.name + " " + c.command);
		}

		return grid;
	}

	function makeTokens(tokens, category)
	{
		var box = el("dl", "rc-tokens");

		for (var i = 0; i < tokens.length; i++)
		{
			var dt = el("dt", null, tokens[i].name);
			var dd = el("dd", null, tokens[i].desc);
			box.appendChild(dt);
			box.appendChild(dd);
			// A term and its description show and hide together.
			track(dt, "zpam", category, tokens[i].name + " " + tokens[i].desc);
			entries[entries.length - 1].partner = dd;
		}

		return box;
	}

	// A sub-heading and what follows it; hidden together when nothing in it matches.
	function makeBlock(label, note, content)
	{
		var block = el("div", "r2-block");
		block.appendChild(el("h3", "rc-sub", label));
		if (note)
		{
			block.appendChild(el("p", "rc-note", note));
		}
		block.appendChild(content);
		return block;
	}

	function byCategory(items, category)
	{
		return items.filter(function (item) { return item.category === category; });
	}

	function byGametype(items, gametype)
	{
		return items.filter(function (item) { return (item.gametype || "") === gametype; });
	}

	function makeMapBlocks(section)
	{
		var gametypes = data.gametypes.map(function (g)
		{
			return { name: g.name, command: PREFIX + "g_gametype " + g.id, source: g.source };
		});
		var maps = function (source)
		{
			return data.maps.filter(function (m) { return m.source === source; }).map(function (m)
			{
				return { name: m.name, command: PREFIX + "map " + m.id, source: m.source };
			});
		};

		section.appendChild(makeBlock("Gametypes", null, makeGrid(gametypes, "map")));
		section.appendChild(makeBlock("Stock maps", null, makeGrid(maps("stock"), "map")));
		section.appendChild(makeBlock("zPAM maps", "From zPAM's map pack zpam_maps_v7.iwd.", makeGrid(maps("zpam"), "map")));
	}

	function makeModeBlocks(section)
	{
		var examples = data.pamModes.examples.map(function (e)
		{
			return { syntax: "pam_mode " + e.mode, desc: e.desc, source: "zpam", category: "match" };
		});

		section.appendChild(makeBlock("pam_mode parts",
			"Join the parts with underscores, the mode first: comp_mr12_2v2.",
			makeTokens(data.pamModes.tokens, "match")));
		section.appendChild(makeBlock("pam_mode examples", null, makeItems(examples)));
	}

	function makeSettingsBlocks(section)
	{
		var order = [""].concat(data.gametypes.map(function (g) { return g.id; }));

		for (var i = 0; i < order.length; i++)
		{
			var items = byGametype(data.settings, order[i]);
			if (items.length === 0)
			{
				continue;
			}
			var label = order[i] === "" ? "All gametypes" : gametypeNames[order[i]] + " (" + order[i] + ")";
			section.appendChild(makeBlock(label, null, makeItems(items)));
		}
	}

	function makeIntro()
	{
		var section = el("section", "rc-group");
		section.appendChild(el("h2", "rc-title", "How to use rcon"));
		section.appendChild(el("p", "rc-note",
			"The server needs an rcon password; you log in once from the console (~) and then send commands."));

		var box = el("div", "rc-items");
		for (var i = 0; i < data.intro.length; i++)
		{
			var step = data.intro[i];
			var row = el("div", "rc-item");
			var text = el("div", "rc-item-text");
			text.appendChild(el("code", "rc-code", step.syntax));
			text.appendChild(el("p", "rc-desc", step.desc));
			row.appendChild(text);
			row.appendChild(makeCopyButton(step.syntax));
			box.appendChild(row);
		}
		section.appendChild(box);
		return section;
	}

	function makeGroup(category)
	{
		var section = el("section", "rc-group r2-group");
		section.appendChild(el("h2", "rc-title", category.label));

		if (category.id === "settings")
		{
			section.appendChild(el("p", "rc-note r2-warn", data.settingsWarning));
			makeSettingsBlocks(section);
			return section;
		}

		var items = byCategory(data.commands, category.id);
		if (items.length > 0)
		{
			section.appendChild(makeItems(items));
		}
		if (category.id === "map")
		{
			makeMapBlocks(section);
		}
		if (category.id === "match")
		{
			makeModeBlocks(section);
		}
		return section;
	}

	/* ---------- filtering ---------- */

	function applyFilter()
	{
		var query = searchBox.value.trim().toLowerCase();
		var category = categoryBox.value;
		var sources = {};
		sourceBoxes.forEach(function (box)
		{
			sources[box.getAttribute("data-source")] = box.checked;
		});

		var shown = 0;
		var total = 0;
		for (var i = 0; i < entries.length; i++)
		{
			var e = entries[i];
			var match = (query === "" || e.haystack.indexOf(query) !== -1) &&
				(category === "" || e.category === category) &&
				sources[e.source] === true;
			e.node.hidden = !match;
			if (e.partner)
			{
				e.partner.hidden = !match;
				continue;
			}
			total++;
			if (match)
			{
				shown++;
			}
		}

		// Blocks and groups with nothing left in them go too.
		[].forEach.call(list.querySelectorAll(".r2-block, .r2-group"), function (box)
		{
			box.hidden = box.querySelector(".rc-item:not([hidden]), .rc-cell:not([hidden]), dt:not([hidden])") === null;
		});

		countBox.textContent = shown === total ? total + " commands" : shown + " of " + total + " commands";
		emptyBox.hidden = shown !== 0;
		emptyBox.textContent = query === "" ? "No command matches these filters."
			: "No command matches “" + searchBox.value.trim() + "” with these filters.";
	}

	function init()
	{
		list = document.getElementById("r2-list");
		searchBox = document.getElementById("r2-search");
		countBox = document.getElementById("r2-count");
		emptyBox = document.getElementById("r2-empty");
		categoryBox = document.getElementById("r2-category");
		setHint = window.UI.hint(document.getElementById("r2-hint"));

		if (list === null || !data)
		{
			return;
		}

		data.sources.forEach(function (s) { sourceLabels[s.id] = s.label; });
		data.gametypes.forEach(function (g) { gametypeNames[g.id] = g.name; });

		data.categories.forEach(function (c)
		{
			var option = document.createElement("option");
			option.value = c.id;
			option.textContent = c.label;
			categoryBox.appendChild(option);
		});

		list.appendChild(makeIntro());
		for (var i = 0; i < data.categories.length; i++)
		{
			list.appendChild(makeGroup(data.categories[i]));
		}

		sourceBoxes = [].slice.call(document.querySelectorAll("#panel-cod2-rcon [data-source]"));
		document.getElementById("panel-cod2-rcon").addEventListener("click", onCopyClick);
		searchBox.addEventListener("input", applyFilter);
		searchBox.addEventListener("search", applyFilter);
		categoryBox.addEventListener("change", applyFilter);
		sourceBoxes.forEach(function (box) { box.addEventListener("change", applyFilter); });

		applyFilter();
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
