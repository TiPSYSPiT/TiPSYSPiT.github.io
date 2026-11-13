/*
 * CoD2 maps: the 15 stock multiplayer maps as cards, with a detail view. The
 * data is window.COD2_MAPS (js/cod2/maps-data.js, built with its images in
 * assets/cod2/maps/ by tools/build-cod2-maps.py); gametype names come from
 * window.COD2_RCON.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var setHint = function () {};

	var COPIED_RESET_MS = 1500;
	var IMAGES = "assets/cod2/maps/";
	var TEAMS = { american: "American", british: "British", russian: "Russian" };

	var maps = [];
	var gametypeNames = {};
	var grid = null;
	var searchBox = null;
	var gametypeBox = null;
	var countBox = null;
	var emptyBox = null;
	var dialog = null;
	var cards = [];

	function copyButton(command, label)
	{
		var button = el("button", "btn btn-sm rc-copy", "Copy");
		button.type = "button";
		button.setAttribute("data-command", command);
		button.setAttribute("aria-label", "Copy " + (label || command));
		return button;
	}

	function onCopyClick(event)
	{
		var button = event.target.closest ? event.target.closest(".rc-copy[data-command]") : null;
		if (button === null)
		{
			return;
		}
		window.UI.copyText(button.getAttribute("data-command")).then(function ()
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
	}

	function badges(map)
	{
		var box = el("div", "m2-badges");
		map.gametypes.forEach(function (g)
		{
			var badge = el("span", "d2-src", g);
			badge.title = gametypeNames[g] || g;
			box.appendChild(badge);
		});
		(map.zpam.gametypes || []).forEach(function (g)
		{
			var badge = el("span", "d2-src m2-zpam", g);
			badge.title = (gametypeNames[g] || g) + " (zPAM)";
			box.appendChild(badge);
		});
		return box;
	}

	// What zPAM does with the map, as sentences.
	function zpamNotes(map)
	{
		var z = map.zpam;
		var notes = [];
		if (z.fix)
		{
			notes.push("zPAM has its own version, " + z.fix + " (in zpam_maps_v7.iwd). A new zPAM server switches to it and warns while the old one runs.");
		}
		if (z.gametypes && z.gametypes.length)
		{
			notes.push("zPAM adds " + z.gametypes.map(function (g) { return gametypeNames[g] || g; }).join(", ") + ".");
		}
		if (z.killtriggers)
		{
			notes.push("zPAM can remove " + z.killtriggers + " kill trigger" + (z.killtriggers === 1 ? "" : "s") +
				" of the 1.3 patch (scr_remove_killtriggers, on in its match modes).");
		}
		if (z.replaceRussian)
		{
			notes.push("The allies are Russian; with scr_replace_russian 1 zPAM makes them British.");
		}
		if (map.images.radar)
		{
			notes.push("zPAM has a radar for this map; in game it is turned by " + map.radarRotation + "°.");
		}
		return notes;
	}

	function makeCard(map)
	{
		var card = el("article", "m2-card");
		var open = el("button", "m2-open");
		open.type = "button";
		open.setAttribute("aria-label", "Details: " + map.name);
		var img = el("img", "m2-thumb");
		img.src = IMAGES + map.images["loadscreen-small"];
		img.alt = "";
		img.loading = "lazy";
		img.width = 480;
		img.height = 360;
		open.appendChild(img);
		open.addEventListener("click", function () { showDetail(map); });
		card.appendChild(open);

		var body = el("div", "m2-body");
		body.appendChild(el("h3", "m2-name", map.name));
		var idRow = el("div", "m2-id");
		idRow.appendChild(el("code", "rc-code", map.id));
		idRow.appendChild(copyButton(map.id));
		body.appendChild(idRow);
		body.appendChild(badges(map));
		var more = el("button", "btn btn-sm m2-more", "Details");
		more.type = "button";
		more.addEventListener("click", function () { showDetail(map); });
		body.appendChild(more);
		card.appendChild(body);

		cards.push({ node: card, map: map, haystack: (map.name + " " + map.id + " " + (map.zpam.fix || "")).toLowerCase() });
		return card;
	}

	function showDetail(map)
	{
		var body = dialog.querySelector(".m2-dialog-body");
		body.textContent = "";
		dialog.querySelector(".m2-dialog-title").textContent = map.name;

		var large = el("img", "m2-large");
		large.src = IMAGES + map.images.loadscreen;
		large.alt = "Loading screen of " + map.name;
		large.width = 1024;
		large.height = 768;
		body.appendChild(large);

		var info = el("div", "m2-info");
		var facts = el("dl", "rc-tokens m2-facts");
		[["Map", map.id], ["Gametypes", map.gametypes.map(function (g) { return gametypeNames[g] || g; }).join(", ")],
			["Allies", TEAMS[map.allies] || map.allies]].forEach(function (f)
		{
			facts.appendChild(el("dt", null, f[0]));
			facts.appendChild(el("dd", null, f[1]));
		});
		info.appendChild(facts);

		var commands = el("div", "rc-items");
		var list = [["/rcon map " + map.id, "Loads the map with the current gametype."]];
		if (map.zpam.fix)
		{
			list.push(["/rcon map " + map.zpam.fix, "zPAM's version of the map."]);
		}
		list.forEach(function (c)
		{
			var row = el("div", "rc-item");
			var text = el("div", "rc-item-text");
			text.appendChild(el("code", "rc-code", c[0]));
			text.appendChild(el("p", "rc-desc", c[1]));
			row.appendChild(text);
			row.appendChild(copyButton(c[0]));
			commands.appendChild(row);
		});
		info.appendChild(commands);

		var notes = zpamNotes(map);
		if (notes.length)
		{
			info.appendChild(el("h3", "rc-sub", "zPAM"));
			var ul = el("ul", "m2-notes");
			notes.forEach(function (n) { ul.appendChild(el("li", null, n)); });
			info.appendChild(ul);
		}
		body.appendChild(info);

		// The map from above: the render, or zPAM's radar where there is one.
		var views = [];
		if (map.images.topdown)
		{
			views.push(["Top-down", map.images.topdown, "Rendered from the map file (CoD2 demo viewer).", "topdown"]);
		}
		if (map.images.radar)
		{
			views.push(["zPAM radar", map.images.radar, "zPAM's radar image, facing the same way as the top-down view.", "radar"]);
		}
		if (views.length)
		{
			var overhead = el("div", "m2-overhead");
			var switcher = el("div", "m2-views");
			switcher.setAttribute("role", "group");
			switcher.setAttribute("aria-label", "View from above");
			var image = el("img", "m2-overhead-img");
			image.width = 768;
			image.height = 768;
			var caption = el("p", "rc-note m2-caption");
			var shown = views[0][3];
			views.forEach(function (v, i)
			{
				var b = el("button", "btn btn-sm m2-view", v[0]);
				b.type = "button";
				b.addEventListener("click", function ()
				{
					image.src = IMAGES + v[1];
					image.alt = v[0] + " of " + map.name;
					image.classList.toggle("is-radar", v[0] !== "Top-down");
					caption.textContent = v[2];
					shown = v[3];
					[].forEach.call(switcher.children, function (x)
					{
						if (x.classList.contains("m2-view"))
						{
							x.setAttribute("aria-pressed", String(x === b));
						}
					});
				});
				switcher.appendChild(b);
				if (i === 0)
				{
					b.click();
				}
			});
			// The tactics board draws on the image shown here.
			if (map.board && window.COD2_TACTICS)
			{
				var tactics = el("button", "btn btn-sm btn-primary m2-tactics", "Tactics");
				tactics.type = "button";
				tactics.title = "Draw a tactic on this image (not saved)";
				tactics.addEventListener("click", function ()
				{
					closeDetail();
					window.COD2_TACTICS.open(map, shown, showDetail);
				});
				switcher.appendChild(tactics);
			}
			overhead.appendChild(switcher);
			overhead.appendChild(image);
			overhead.appendChild(caption);
			body.appendChild(overhead);
		}

		if (typeof dialog.showModal === "function")
		{
			dialog.showModal();
		}
		else
		{
			dialog.setAttribute("open", "");
		}
		dialog.querySelector(".m2-close").focus();
	}

	function closeDetail()
	{
		if (typeof dialog.close === "function")
		{
			dialog.close();
		}
		else
		{
			dialog.removeAttribute("open");
		}
	}

	function applyFilter()
	{
		var query = searchBox.value.trim().toLowerCase();
		var gt = gametypeBox.value;
		var shown = 0;
		cards.forEach(function (c)
		{
			var all = c.map.gametypes.concat(c.map.zpam.gametypes || []);
			var match = (query === "" || c.haystack.indexOf(query) !== -1) && (gt === "" || all.indexOf(gt) !== -1);
			c.node.hidden = !match;
			if (match)
			{
				shown++;
			}
		});
		countBox.textContent = shown === cards.length ? cards.length + " maps" : shown + " of " + cards.length + " maps";
		emptyBox.hidden = shown !== 0;
		emptyBox.textContent = "No map matches these filters.";
	}

	function init()
	{
		grid = document.getElementById("m2-grid");
		if (grid === null || !window.COD2_MAPS)
		{
			return;
		}
		maps = window.COD2_MAPS;
		(window.COD2_RCON ? window.COD2_RCON.gametypes : []).forEach(function (g) { gametypeNames[g.id] = g.name; });
		searchBox = document.getElementById("m2-search");
		gametypeBox = document.getElementById("m2-gametype");
		countBox = document.getElementById("m2-count");
		emptyBox = document.getElementById("m2-empty");
		dialog = document.getElementById("m2-dialog");
		setHint = window.UI.hint(document.getElementById("m2-hint"));

		var seen = {};
		maps.forEach(function (m)
		{
			m.gametypes.forEach(function (g) { seen[g] = seen[g] || "stock"; });
			(m.zpam.gametypes || []).forEach(function (g) { seen[g] = seen[g] || "zpam"; });
		});
		Object.keys(seen).sort(function (a, b) { return (seen[a] === "zpam") - (seen[b] === "zpam") || a.localeCompare(b); }).forEach(function (g)
		{
			var option = el("option", null, (gametypeNames[g] || g) + (seen[g] === "zpam" ? " (zPAM)" : ""));
			option.value = g;
			gametypeBox.appendChild(option);
		});

		maps.forEach(function (m) { grid.appendChild(makeCard(m)); });

		document.getElementById("panel-cod2-maps").addEventListener("click", onCopyClick);
		dialog.addEventListener("click", function (event)
		{
			if (event.target === dialog)
			{
				closeDetail();      // a click on the backdrop
			}
		});
		dialog.querySelector(".m2-close").addEventListener("click", closeDetail);
		searchBox.addEventListener("input", applyFilter);
		searchBox.addEventListener("search", applyFilter);
		gametypeBox.addEventListener("change", applyFilter);
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
