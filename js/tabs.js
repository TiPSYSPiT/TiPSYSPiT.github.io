/*
 * Tab switching for the tool panels.
 *
 * Every tab can be linked to by a hash made from its name: "scoreboard
 * generator" is #scoreboard-generator. Opening the page with such a hash shows
 * that tab, clicking a tab writes its hash into the address bar, and the
 * browser's back and forward buttons move between the tabs visited. A missing
 * or unknown hash leaves the default tab open.
 *
 * After every switch the tablist fires a "tabchange" event, so a panel that
 * has to measure itself once it is visible can listen for that.
 */
(function ()
{
	"use strict";

	// "scoreboard generator" -> "scoreboard-generator", "FAQ" -> "faq"
	function slugOf(tab)
	{
		return tab.textContent.trim().toLowerCase().replace(/\s+/g, "-");
	}

	function init()
	{
		var list = document.querySelector('[role="tablist"]');
		if (list === null)
		{
			return;
		}

		var tabs = [].slice.call(list.querySelectorAll('[role="tab"]'));
		if (tabs.length === 0)
		{
			return;
		}

		// Whatever the markup opens with is the tab for a missing or unknown hash.
		var defaultTab = tabs.filter(function (tab)
		{
			return tab.getAttribute("aria-selected") === "true";
		})[0] || tabs[0];

		function select(tab, moveFocus)
		{
			for (var i = 0; i < tabs.length; i++)
			{
				var active = tabs[i] === tab;
				tabs[i].setAttribute("aria-selected", active ? "true" : "false");
				tabs[i].tabIndex = active ? 0 : -1;
				tabs[i].classList.toggle("is-active", active);

				var panel = document.getElementById(tabs[i].getAttribute("aria-controls"));
				if (panel !== null)
				{
					panel.hidden = !active;
				}
			}

			if (moveFocus)
			{
				tab.focus();
			}

			list.dispatchEvent(new CustomEvent("tabchange", { detail: { tab: tab } }));
		}

		function tabForHash(hash)
		{
			var slug;
			try
			{
				slug = decodeURIComponent(String(hash).replace(/^#/, "")).toLowerCase();
			}
			catch (err)
			{
				return null;   // a malformed escape such as #%E0 is simply unknown
			}

			for (var i = 0; i < tabs.length; i++)
			{
				if (slugOf(tabs[i]) === slug)
				{
					return tabs[i];
				}
			}
			return null;
		}

		// pushState changes the address without scrolling or reloading, and
		// gives the back button an entry to return to. replace is for the arrow
		// keys, which step through tabs one by one and would otherwise bury the
		// previous page under a pile of history entries.
		function writeHash(tab, replace)
		{
			var target = "#" + slugOf(tab);
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

		// Back, forward, or a hash typed into the address bar.
		function syncFromUrl()
		{
			var tab = tabForHash(window.location.hash) || defaultTab;
			if (tab.getAttribute("aria-selected") !== "true")
			{
				select(tab, false);
			}
		}

		list.addEventListener("click", function (event)
		{
			var tab = event.target.closest ? event.target.closest('[role="tab"]') : null;
			if (tab !== null)
			{
				select(tab, false);
				writeHash(tab, false);
			}
		});

		list.addEventListener("keydown", function (event)
		{
			var index = tabs.indexOf(document.activeElement);
			if (index === -1)
			{
				return;
			}

			var next = -1;
			if (event.key === "ArrowRight")
			{
				next = (index + 1) % tabs.length;
			}
			else if (event.key === "ArrowLeft")
			{
				next = (index - 1 + tabs.length) % tabs.length;
			}
			else if (event.key === "Home")
			{
				next = 0;
			}
			else if (event.key === "End")
			{
				next = tabs.length - 1;
			}

			if (next === -1)
			{
				return;
			}

			event.preventDefault();
			select(tabs[next], true);
			writeHash(tabs[next], true);
		});

		// Both can fire for the same step back; the second finds the tab
		// already open and does nothing.
		window.addEventListener("hashchange", syncFromUrl);
		window.addEventListener("popstate", syncFromUrl);

		var initial = tabForHash(window.location.hash);
		if (initial !== null && initial !== defaultTab)
		{
			select(initial, false);
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
})();
