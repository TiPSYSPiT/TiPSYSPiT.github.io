/*
 * Copy buttons of the CoD2 tabs, in one place. A button confirms on itself
 * ("Copied" for a moment), so the feedback stays where the eye already is; if
 * the browser refuses, setHint (from window.UI.hint) says so.
 *
 *   COD2_UI.copyButton(button, getText, setHint)
 *       copies getText() when the button is clicked.
 *   COD2_UI.commandButton(command, label)
 *       a new "Copy" button for one command (class rc-copy, data-command).
 *   COD2_UI.delegateCopy(container, setHint)
 *       one click handler on container for all its commandButton buttons,
 *       also those added later.
 */
window.COD2_UI = (function ()
{
	"use strict";

	var COPIED_RESET_MS = 1500;
	var FAILED = "Could not copy — select the text and copy manually.";

	function copy(button, text, setHint)
	{
		window.UI.copyText(text).then(function ()
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
			if (setHint)
			{
				setHint(FAILED, true);
			}
		});
	}

	function copyButton(button, getText, setHint)
	{
		button.addEventListener("click", function () { copy(button, getText(), setHint); });
	}

	function commandButton(command, label)
	{
		var button = window.UI.el("button", "btn btn-sm rc-copy", "Copy");
		button.type = "button";
		button.setAttribute("data-command", command);
		button.setAttribute("aria-label", "Copy " + (label || command));
		return button;
	}

	function delegateCopy(container, setHint)
	{
		container.addEventListener("click", function (event)
		{
			var button = event.target.closest ? event.target.closest(".rc-copy[data-command]") : null;
			if (button !== null)
			{
				copy(button, button.getAttribute("data-command"), setHint);
			}
		});
	}

	return { copyButton: copyButton, commandButton: commandButton, delegateCopy: delegateCopy };
})();
