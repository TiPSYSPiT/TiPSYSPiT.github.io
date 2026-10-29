/*
 * Game switcher, tab bars and links, built from window.GAMES (js/shared/games.js,
 * filled by each game's js/<game>/game.js).
 *
 * index.html loads this as a plain script right after the two empty
 * navigation boxes, so the switcher and the right tab bar are in place before
 * the page is first drawn. The panels below are switched once they are
 * parsed.
 *
 * Every tab is linked as #<game>/<slug>.
 *   #<game>                 the first tab of that game
 *   #<game>/<unknown>       the first tab of that game; the address is
 *                           rewritten to that tab's link
 *   #<slug>                 an old link from before the games: the tab of that
 *                           name of the game marked legacyLinks; the address is
 *                           rewritten to #<game>/<slug>
 *   anything else           the first tab of the first game, with its link
 *                           written into the address bar
 *   none                    the first tab of the first game
 * Clicking a tab or a game writes its link into the address bar without
 * reloading or scrolling, and back and forward move between the tabs and
 * games visited. Switching to a game opens the tab last open in it.
 *
 * After every switch the shown tab's tablist fires a "tabchange" event (it
 * bubbles), so a panel that has to measure itself once visible can listen
 * for that.
 */
(function ()
{
	"use strict";

	var el = window.UI.el;

	var GAMES = window.GAMES || [];
	var switchBox = document.getElementById("game-switch");
	var barsBox = document.getElementById("game-tabs");
	if (GAMES.length === 0 || switchBox === null || barsBox === null)
	{
		return;
	}

	var root = document.documentElement;
	var favicon = document.getElementById("favicon");
	var heading = document.querySelector(".header h1");
	var games = {};              // game id -> { cfg, button, list, tabs, current }
	var activeGame = null;
	var ready = false;           // panels parsed

	/* ---------- building ---------- */

	function buildGame(cfg)
	{
		var game = { cfg: cfg, tabs: [], current: null };

		var button = el("button", "game-btn");
		button.type = "button";
		button.id = "game-" + cfg.id;
		button.setAttribute("role", "tab");
		button.setAttribute("aria-controls", "tabs-" + cfg.id);
		var icon = el("img", "game-icon");
		icon.src = cfg.icon;
		icon.alt = "";
		icon.width = 20;
		icon.height = 20;
		var name = el("span", "game-name");
		name.textContent = cfg.name;
		button.appendChild(icon);
		button.appendChild(name);
		button.addEventListener("click", function ()
		{
			openGame(cfg.id, false);
		});
		switchBox.appendChild(button);
		game.button = button;

		var list = el("div", "tabs");
		list.id = "tabs-" + cfg.id;
		list.setAttribute("role", "tablist");
		list.setAttribute("aria-label", cfg.name + " tools");
		list.setAttribute("aria-orientation", root.getAttribute("data-tabs") === "horizontal" ? "horizontal" : "vertical");

		cfg.tabs.forEach(function (entry)
		{
			var tab = el("button", "tab");
			tab.type = "button";
			tab.id = entry.id;
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-controls", entry.panel);
			tab.textContent = entry.label;
			tab.entry = entry;
			tab.addEventListener("click", function ()
			{
				select(cfg.id, entry, false);
				writeHash(false);
			});
			list.appendChild(tab);
			game.tabs.push(tab);
		});
		list.addEventListener("keydown", function (event)
		{
			onTabKey(game, event);
		});
		barsBox.appendChild(list);
		game.list = list;
		game.current = cfg.tabs[0];

		games[cfg.id] = game;
	}

	/* ---------- links ---------- */

	function decode(hash)
	{
		try
		{
			return decodeURIComponent(String(hash).replace(/^#/, "")).toLowerCase();
		}
		catch (err)
		{
			return null;    // a malformed escape such as #%E0 is simply unknown
		}
	}

	function entryFor(game, slug)
	{
		var tabs = game.cfg.tabs;
		for (var i = 0; i < tabs.length; i++)
		{
			if (tabs[i].slug === slug)
			{
				return tabs[i];
			}
		}
		return null;
	}

	// -> { game, entry, rewrite }: rewrite when the address is not the tab's link
	function route(hash)
	{
		var first = games[GAMES[0].id];
		var fallback = { game: first, entry: first.cfg.tabs[0], rewrite: false };
		var old = GAMES.filter(function (cfg) { return cfg.legacyLinks === true; })[0];
		var text = decode(hash);
		if (text === "")
		{
			return fallback;
		}
		fallback.rewrite = true;
		if (text === null)
		{
			return fallback;
		}

		var parts = text.split("/");
		var game = games.hasOwnProperty(parts[0]) ? games[parts[0]] : null;
		if (game !== null)
		{
			var entry = parts.length > 1 ? entryFor(game, parts[1]) : null;
			// #<game> alone is a link of its own; an unknown tab is not
			return { game: game, entry: entry || game.cfg.tabs[0], rewrite: parts.length > 1 && entry === null };
		}

		// The links from before there were games point at the tabs of one game.
		var legacy = parts.length === 1 && old ? entryFor(games[old.id], parts[0]) : null;
		if (legacy !== null)
		{
			return { game: games[old.id], entry: legacy, rewrite: true };
		}
		return fallback;
	}

	function linkFor(game)
	{
		return "#" + game.cfg.id + "/" + game.current.slug;
	}

	// pushState changes the address without scrolling or reloading, and gives
	// the back button an entry to return to; replace is for the arrow keys,
	// which would otherwise bury the previous page under history entries.
	function writeHash(replace)
	{
		var target = linkFor(games[activeGame]);
		if (window.location.hash === target)
		{
			return;
		}
		try
		{
			if (replace)
			{
				window.history.replaceState(null, "", target);
			}
			else
			{
				window.history.pushState(null, "", target);
			}
		}
		catch (err)
		{
			// Some browsers refuse history entries for pages opened from disk.
			// No element carries one of these ids, so this cannot scroll either.
			window.location.hash = target;
		}
	}

	/* ---------- switching ---------- */

	// The header, the tab title and the browser tab's icon follow the game.
	function showGame(id)
	{
		activeGame = id;
		var cfg = games[id].cfg;
		root.setAttribute("data-game", id);

		GAMES.forEach(function (other)
		{
			var game = games[other.id];
			var on = other.id === id;
			game.button.setAttribute("aria-selected", on ? "true" : "false");
			game.button.tabIndex = on ? 0 : -1;
			game.button.classList.toggle("is-active", on);
			game.list.hidden = !on;
		});

		// The logos are <svg>, which has no hidden property: set the attribute.
		var brands = document.querySelectorAll(".brand[data-game]");
		for (var i = 0; i < brands.length; i++)
		{
			if (brands[i].getAttribute("data-game") === id)
			{
				brands[i].removeAttribute("hidden");
			}
			else
			{
				brands[i].setAttribute("hidden", "");
			}
		}
		if (heading !== null)
		{
			heading.textContent = cfg.title;
		}
		document.title = cfg.title;
		if (favicon !== null)
		{
			favicon.href = cfg.favicon;
		}
	}

	function showPanels()
	{
		GAMES.forEach(function (cfg)
		{
			var game = games[cfg.id];
			cfg.tabs.forEach(function (entry)
			{
				var panel = document.getElementById(entry.panel);
				if (panel !== null)
				{
					panel.hidden = !(cfg.id === activeGame && entry === game.current);
				}
			});
		});
	}

	function select(gameId, entry, moveFocus)
	{
		var game = games[gameId];
		game.current = entry;
		if (activeGame !== gameId)
		{
			showGame(gameId);
		}

		game.tabs.forEach(function (tab)
		{
			var on = tab.entry === entry;
			tab.setAttribute("aria-selected", on ? "true" : "false");
			tab.tabIndex = on ? 0 : -1;
			tab.classList.toggle("is-active", on);
			if (on && moveFocus)
			{
				tab.focus();
			}
		});

		if (ready)
		{
			showPanels();
			game.list.dispatchEvent(new CustomEvent("tabchange", { bubbles: true, detail: { game: gameId, tab: entry } }));
		}
	}

	// A game opens on the tab last open in it.
	function openGame(id, replace)
	{
		if (id === activeGame)
		{
			return;
		}
		select(id, games[id].current, false);
		writeHash(replace);
	}

	function onTabKey(game, event)
	{
		var index = game.tabs.indexOf(document.activeElement);
		if (index === -1)
		{
			return;
		}

		// The arrows follow the way the bar runs (see tablayout.js).
		var vertical = game.list.getAttribute("aria-orientation") === "vertical";
		var nextKey = vertical ? "ArrowDown" : "ArrowRight";
		var prevKey = vertical ? "ArrowUp" : "ArrowLeft";
		var count = game.tabs.length;

		var next = -1;
		if (event.key === nextKey)
		{
			next = (index + 1) % count;
		}
		else if (event.key === prevKey)
		{
			next = (index - 1 + count) % count;
		}
		else if (event.key === "Home")
		{
			next = 0;
		}
		else if (event.key === "End")
		{
			next = count - 1;
		}
		if (next === -1)
		{
			return;
		}

		event.preventDefault();
		select(game.cfg.id, game.tabs[next].entry, true);
		writeHash(true);
	}

	// The switcher is a row of its own: left and right move between games.
	function onGameKey(event)
	{
		var ids = GAMES.map(function (cfg) { return cfg.id; });
		var index = ids.indexOf(activeGame);
		var next = -1;
		if (event.key === "ArrowRight")
		{
			next = (index + 1) % ids.length;
		}
		else if (event.key === "ArrowLeft")
		{
			next = (index - 1 + ids.length) % ids.length;
		}
		else if (event.key === "Home")
		{
			next = 0;
		}
		else if (event.key === "End")
		{
			next = ids.length - 1;
		}
		if (next === -1)
		{
			return;
		}
		event.preventDefault();
		openGame(ids[next], true);
		games[ids[next]].button.focus();
	}

	// Back, forward, or a link typed into the address bar.
	function syncFromUrl()
	{
		var target = route(window.location.hash);
		if (target.rewrite)
		{
			select(target.game.cfg.id, target.entry, false);
			writeHash(true);
			return;
		}
		if (activeGame !== target.game.cfg.id || target.game.current !== target.entry)
		{
			select(target.game.cfg.id, target.entry, false);
		}
	}

	/* ---------- start ---------- */

	GAMES.forEach(buildGame);
	switchBox.addEventListener("keydown", onGameKey);

	var start = route(window.location.hash);
	select(start.game.cfg.id, start.entry, false);
	if (start.rewrite)
	{
		writeHash(true);
	}

	window.addEventListener("hashchange", syncFromUrl);
	window.addEventListener("popstate", syncFromUrl);

	// The panels are all parsed once the document turns "interactive", which
	// is before the deferred tool scripts run: they start with the right
	// panel already showing, as they did when this file was deferred too.
	function onReady()
	{
		if (ready || document.readyState === "loading")
		{
			return;
		}
		ready = true;
		select(activeGame, games[activeGame].current, false);
	}

	document.addEventListener("readystatechange", onReady);
	onReady();
})();
