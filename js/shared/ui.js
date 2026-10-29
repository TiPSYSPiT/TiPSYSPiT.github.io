/*
 * Small helpers every tool uses, as window.UI:
 *
 *   UI.el(tag, className, text)
 *       a new element; className and text are optional, text goes in as
 *       textContent
 *   UI.escapeHtml(text)
 *       text made safe to put into HTML
 *   UI.copyText(text)
 *       puts text on the clipboard; a promise. The clipboard API first; where
 *       a browser does not have it or refuses it (a page opened from disk, no
 *       permission), the old copy command.
 *   UI.hint(element)
 *       a setHint(message, isError) function for a status line: it shows the
 *       message (red with isError) and after a few seconds goes back to the
 *       text the line had when UI.hint was called. With no element it does
 *       nothing.
 *
 * Loaded as a plain script before the others, so they can take these when
 * they start.
 */
(function ()
{
	"use strict";

	var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
	var HINT_RESET_MS = 3000;

	function el(tag, className, text)
	{
		var node = document.createElement(tag);
		if (className)
		{
			node.className = className;
		}
		if (text !== undefined)
		{
			node.textContent = text;
		}
		return node;
	}

	function escapeHtml(text)
	{
		return String(text).replace(/[&<>"']/g, function (ch) { return HTML_ESCAPES[ch]; });
	}

	function copyWithCommand(text)
	{
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

	function copyText(text)
	{
		if (navigator.clipboard && navigator.clipboard.writeText)
		{
			return navigator.clipboard.writeText(text).catch(function ()
			{
				return copyWithCommand(text);
			});
		}
		return copyWithCommand(text);
	}

	function hint(element)
	{
		if (!element)
		{
			return function () {};
		}
		var resting = element.textContent;
		var timer = null;
		return function (message, isError)
		{
			window.clearTimeout(timer);
			element.textContent = message;
			element.classList.toggle("is-error", isError === true);
			timer = window.setTimeout(function ()
			{
				element.textContent = resting;
				element.classList.remove("is-error");
			}, HINT_RESET_MS);
		};
	}

	window.UI = {
		el: el,
		escapeHtml: escapeHtml,
		copyText: copyText,
		hint: hint
	};
})();
