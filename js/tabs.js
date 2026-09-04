/*
 * Tab switching for the tool panels.
 */
(function ()
{
	"use strict";

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
		}

		list.addEventListener("click", function (event)
		{
			var tab = event.target.closest ? event.target.closest('[role="tab"]') : null;
			if (tab !== null)
			{
				select(tab, false);
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
		});
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
