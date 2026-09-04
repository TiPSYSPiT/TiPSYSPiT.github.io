/*
 * Killfeed colours: pick a colour per DVAR, or paste the values you already
 * have in your config to see what colour they are.
 *
 * Only the two team colour DVARs are handled here, because those are the ones
 * that decide how the names in the killfeed are tinted.
 *
 * The exact numbers a row holds live in its data-rgba attribute. The colour
 * swatch is only a preview: reading the colour back out of it would round
 * every channel to 8 bit and quietly turn a pasted 0.5 into 0.502.
 */
(function ()
{
	"use strict";

	// Each row shows a short label but always emits the full DVAR name, which
	// is kept in the row's data-dvar attribute.
	var DEFAULT_ROWS = [
		{ dvar: "g_TeamColor_Allies", label: "Allies", rgba: [0.498, 0.655, 1, 1] },
		{ dvar: "g_TeamColor_Axis", label: "Axis", rgba: [1, 0.541, 0.361, 1] }
	];

	var HINT_RESET_MS = 3000;

	var rowsBox = null;
	var keyField = null;
	var actionField = null;
	var bindBox = null;
	var hint = null;
	var defaultHint = "";
	var hintTimer = null;

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

	/* ---------- value conversion ---------- */

	// "0.502" rather than "0.502000", and a plain "1" instead of "1.000".
	function formatChannel(value)
	{
		var text = value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		return text === "" || text === "-0" ? "0" : text;
	}

	function formatRgba(rgba)
	{
		return formatChannel(rgba[0]) + " " + formatChannel(rgba[1]) + " " +
			formatChannel(rgba[2]) + " " + formatChannel(rgba[3]);
	}

	// Accepts "0.62 0.506 0.714 1", comma separated values, a quoted group, and
	// a whole config line pasted straight in. Alpha may be left off.
	function parseRgba(raw)
	{
		var quoted = /"([^"]*)"/.exec(raw);
		var body = (quoted !== null ? quoted[1] : String(raw)).trim();
		if (body === "")
		{
			return null;
		}

		var parts = body.split(/[\s,]+/);
		if (parts.length < 3 || parts.length > 4)
		{
			return null;
		}

		var values = [];
		for (var i = 0; i < parts.length; i++)
		{
			var value = Number(parts[i]);
			if (parts[i] === "" || isNaN(value) || value < 0 || value > 1)
			{
				return null;
			}
			values.push(value);
		}

		if (values.length === 3)
		{
			values.push(1);
		}

		return values;
	}

	function toHex(rgba)
	{
		var out = "#";
		for (var i = 0; i < 3; i++)
		{
			var channel = Math.round(rgba[i] * 255).toString(16);
			out += channel.length === 1 ? "0" + channel : channel;
		}
		return out;
	}

	// Accepts "#9e81b6", "9e81b6" and the three digit short form.
	function hexToRgb(hex)
	{
		var match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
		if (match === null)
		{
			return null;
		}

		var digits = match[1];
		if (digits.length === 3)
		{
			digits = digits.charAt(0) + digits.charAt(0) + digits.charAt(1) +
				digits.charAt(1) + digits.charAt(2) + digits.charAt(2);
		}

		var value = parseInt(digits, 16);
		return [
			((value >> 16) & 255) / 255,
			((value >> 8) & 255) / 255,
			(value & 255) / 255
		];
	}

	function readRgba(row)
	{
		return parseRgba(row.getAttribute("data-rgba")) || [0, 0, 0, 1];
	}

	// "skip" names the field the user is typing in, so it is not rewritten
	// under the cursor. Pass null when the change came from somewhere else.
	function writeRgba(row, rgba, skip)
	{
		row.setAttribute("data-rgba", formatRgba(rgba));
		row.querySelector(".kf-color").value = toHex(rgba);

		var value = row.querySelector(".kf-value");
		value.classList.remove("is-invalid");
		if (skip !== "value")
		{
			value.value = formatRgba(rgba);
		}

		var hex = row.querySelector(".kf-hex");
		hex.classList.remove("is-invalid");
		if (skip !== "hex")
		{
			hex.value = toHex(rgba);
		}
	}

	/* ---------- rows ---------- */

	function makeRow(data)
	{
		var row = document.createElement("div");
		row.className = "kf-row";

		var color = document.createElement("input");
		color.type = "color";
		color.className = "kf-color";
		color.setAttribute("aria-label", "Colour");

		var name = document.createElement("input");
		name.type = "text";
		name.className = "kf-dvar";
		name.value = data.label;
		name.readOnly = true;
		name.title = data.dvar;
		name.spellcheck = false;
		name.autocomplete = "off";
		name.setAttribute("aria-label", "DVAR name");
		row.setAttribute("data-dvar", data.dvar);

		var value = document.createElement("input");
		value.type = "text";
		value.className = "kf-value";
		value.placeholder = "0 0 0 1";
		value.spellcheck = false;
		value.autocomplete = "off";
		value.title = "Red, green, blue and alpha from 0 to 1";
		value.setAttribute("aria-label", "Value: red green blue alpha");

		var hex = document.createElement("input");
		hex.type = "text";
		hex.className = "kf-hex";
		hex.placeholder = "#ffffff";
		hex.spellcheck = false;
		hex.autocomplete = "off";
		hex.title = "Hex colour, e.g. #9e81b6";
		hex.setAttribute("aria-label", "Hex colour");

		row.appendChild(color);
		row.appendChild(name);
		row.appendChild(value);
		row.appendChild(hex);

		writeRgba(row, data.rgba, null);
		return row;
	}

	function renderRows(list)
	{
		rowsBox.innerHTML = "";
		for (var i = 0; i < list.length; i++)
		{
			rowsBox.appendChild(makeRow(list[i]));
		}
	}

	// Every named row as { dvar, value } with the value already formatted.
	function collectEntries()
	{
		var rows = rowsBox.querySelectorAll(".kf-row");
		var entries = [];

		for (var i = 0; i < rows.length; i++)
		{
			// The field only shows a short label, so the real name comes from
			// the row itself.
			var dvar = rows[i].getAttribute("data-dvar");
			if (!dvar)
			{
				continue;
			}

			entries.push({ dvar: dvar, value: formatRgba(readRgba(rows[i])) });
		}

		return entries;
	}

	// bind W "+forward; g_TeamColor_Allies 0.498 0.655 1 1; ..."
	// Re-applies the colours on every key press, so a server that resets them
	// does not keep them reset. Clearing the key or the action drops the line.
	function buildBindLine(entries)
	{
		if (keyField === null || actionField === null)
		{
			return null;
		}

		var key = keyField.value.trim();
		var action = actionField.value.trim();
		if (key === "" || action === "")
		{
			return null;
		}

		var parts = [action];
		for (var i = 0; i < entries.length; i++)
		{
			parts.push(entries[i].dvar + " " + entries[i].value);
		}

		return "bind " + key + ' "' + parts.join("; ") + '"';
	}

	// textContent, never innerHTML: the bind key and action are free text.
	function fill(box, text, placeholder)
	{
		if (box === null)
		{
			return;
		}

		var empty = text === "";
		box.textContent = empty ? placeholder : text;
		box.classList.toggle("is-empty", empty);
	}

	function renderOutput()
	{
		var bind = buildBindLine(collectEntries());
		fill(bindBox, bind === null ? "" : bind,
			"Enter a bind key and action to generate this line.");
	}

	function onRowInput(event)
	{
		var field = event.target;
		var row = field.parentNode;

		if (field.className === "kf-color")
		{
			var picked = hexToRgb(field.value);
			if (picked !== null)
			{
				writeRgba(row, [picked[0], picked[1], picked[2], readRgba(row)[3]], null);
			}
		}
		else if (field.className.indexOf("kf-value") !== -1)
		{
			var parsed = parseRgba(field.value);
			if (parsed === null)
			{
				// Keep the last good colour so the swatch never flickers mid-typing.
				field.classList.add("is-invalid");
			}
			else
			{
				writeRgba(row, parsed, "value");
			}
		}
		else if (field.className.indexOf("kf-hex") !== -1)
		{
			var typed = hexToRgb(field.value);
			if (typed === null)
			{
				field.classList.add("is-invalid");
			}
			else
			{
				writeRgba(row, [typed[0], typed[1], typed[2], readRgba(row)[3]], "hex");
			}
		}

		renderOutput();
	}

	/* ---------- clipboard ---------- */

	function copyText(text)
	{
		if (navigator.clipboard && navigator.clipboard.writeText)
		{
			return navigator.clipboard.writeText(text);
		}

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

	function copyBox(box, label)
	{
		if (box === null || box.classList.contains("is-empty"))
		{
			setHint("Nothing to copy in the " + label + " box yet.", true);
			return;
		}

		var text = box.textContent;
		var count = text.split("\n").length;

		copyText(text).then(function ()
		{
			setHint(count === 1 ? "Bind line copied." : count + " " + label + " lines copied.");
		}, function ()
		{
			setHint("Could not copy \u2014 select the text and copy manually.", true);
		});
	}

	/* ---------- wiring ---------- */

	function init()
	{
		rowsBox = document.getElementById("kf-rows");
		keyField = document.getElementById("kf-key");
		actionField = document.getElementById("kf-action");
		bindBox = document.getElementById("kf-output-bind");
		hint = document.getElementById("kf-hint");

		if (rowsBox === null || bindBox === null)
		{
			return;
		}

		if (hint !== null)
		{
			defaultHint = hint.textContent;
		}

		renderRows(DEFAULT_ROWS);
		renderOutput();

		rowsBox.addEventListener("input", onRowInput);

		if (keyField !== null)
		{
			keyField.addEventListener("input", renderOutput);
		}
		if (actionField !== null)
		{
			actionField.addEventListener("input", renderOutput);
		}

		// Leaving an unparsable value behind restores the last good numbers.
		rowsBox.addEventListener("focusout", function (event)
		{
			var field = event.target;
			if (field.classList.contains("is-invalid"))
			{
				writeRgba(field.parentNode, readRgba(field.parentNode), null);
			}
		});

		var reset = document.getElementById("kf-reset");
		if (reset !== null)
		{
			reset.addEventListener("click", function ()
			{
				renderRows(DEFAULT_ROWS);
				renderOutput();
				setHint("Reset to the default DVARs.");
			});
		}

		var copyBind = document.getElementById("kf-copy-bind");
		if (copyBind !== null)
		{
			copyBind.addEventListener("click", function ()
			{
				copyBox(bindBox, "bind");
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
