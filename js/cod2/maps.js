/*
 * CoD2 maps: the 15 stock multiplayer maps as cards, with a detail view. The
 * data is window.COD2_MAPS (js/cod2/maps-data.js, built with its images in
 * assets/cod2/maps/ by tools/build-cod2-maps.py); the name of Search and
 * Destroy comes from window.COD2_RCON.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;

	var IMAGES = "assets/cod2/maps/";
	var NATIONS = { american: "American", british: "British", russian: "Russian", german: "German" };

	var maps = [];
	var sdName = "Search and Destroy";
	var grid = null;
	var searchBox = null;
	var countBox = null;
	var emptyBox = null;
	var dialog = null;
	var cards = [];

	// What zPAM does with the map, as sentences.
	function zpamNotes(map)
	{
		var z = map.zpam;
		var notes = [];
		if (z.fix)
		{
			notes.push("zPAM has its own version, " + z.fix + " (in zpam_maps_v7.iwd). A new zPAM server switches to it and warns while the old one runs.");
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
		body.appendChild(el("code", "rc-code m2-id", map.id));
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
		// The sides as the map script sets them (game["allies"], ["axis"], ["attackers"]).
		var side = function (s) { return s === "axis" ? "Axis" : "Allies"; };
		var rows = [["Map", map.id], ["Allies", NATIONS[map.allies] || map.allies], ["Axis", NATIONS[map.axis] || map.axis],
			[sdName, side(map.attackers) + " attack (plant the bomb), " + side(map.defenders) + " defend"]];
		rows.forEach(function (f)
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
		var shown = 0;
		cards.forEach(function (c)
		{
			var match = query === "" || c.haystack.indexOf(query) !== -1;
			c.node.hidden = !match;
			if (match)
			{
				shown++;
			}
		});
		countBox.textContent = shown === cards.length ? cards.length + " maps" : shown + " of " + cards.length + " maps";
		emptyBox.hidden = shown !== 0;
		emptyBox.textContent = "No map matches this filter.";
	}

	function init()
	{
		grid = document.getElementById("m2-grid");
		if (grid === null || !window.COD2_MAPS)
		{
			return;
		}
		maps = window.COD2_MAPS;
		(window.COD2_RCON ? window.COD2_RCON.gametypes : []).forEach(function (g)
		{
			if (g.id === "sd")
			{
				sdName = g.name;
			}
		});
		searchBox = document.getElementById("m2-search");
		countBox = document.getElementById("m2-count");
		emptyBox = document.getElementById("m2-empty");
		dialog = document.getElementById("m2-dialog");

		maps.forEach(function (m) { grid.appendChild(makeCard(m)); });

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
