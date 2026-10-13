/*
 * Tab bar layout: top to bottom (a column beside the panels, the default) or
 * left to right (a row above them), picked with the two buttons in the header.
 *
 * The choice is kept in this browser's localStorage. This file is loaded in
 * <head> without defer, so the saved layout is on the page before anything is
 * drawn and a left-to-right page never shows the column first.
 */
(function ()
{
	"use strict";

	var STORAGE_KEY = "cod-tools.tab-layout";
	var root = document.documentElement;

	// Storage can be missing or throw (private windows, blocked site data);
	// the page then simply starts with the default every time.
	function readSaved()
	{
		try
		{
			return window.localStorage.getItem(STORAGE_KEY);
		}
		catch (err)
		{
			return null;
		}
	}

	function save(layout)
	{
		try
		{
			window.localStorage.setItem(STORAGE_KEY, layout);
		}
		catch (err)
		{
			// not kept, but the switch itself still works
		}
	}

	function apply(layout)
	{
		root.setAttribute("data-tabs", layout);

		var list = document.querySelector('[role="tablist"]');
		if (list !== null)
		{
			list.setAttribute("aria-orientation", layout);
		}

		var buttons = document.querySelectorAll("[data-tab-layout]");
		for (var i = 0; i < buttons.length; i++)
		{
			var on = buttons[i].getAttribute("data-tab-layout") === layout;
			buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
		}
	}

	var current = readSaved() === "horizontal" ? "horizontal" : "vertical";
	apply(current);

	function init()
	{
		apply(current);

		var buttons = document.querySelectorAll("[data-tab-layout]");
		for (var i = 0; i < buttons.length; i++)
		{
			buttons[i].addEventListener("click", function (event)
			{
				var layout = event.currentTarget.getAttribute("data-tab-layout");
				if (layout === current)
				{
					return;
				}
				current = layout;
				apply(layout);
				save(layout);
			});
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
