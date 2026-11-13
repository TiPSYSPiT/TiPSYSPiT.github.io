/*
 * CoD2 chat generator: colored say / say_team messages for binds, previewed the
 * way the chat shows them. The data is window.COD2_NAMES.chat and .keys from
 * js/cod2/name-data.js (built by tools/build-cod2-names.py); drawing and the
 * palette are js/cod2/text.js.
 *
 * What the game does with a bound chat line, mirrored here:
 *   - ; ends the command (the rest runs as a command of its own) and " ends the
 *     bind, so both are left out; // or /* starts a comment and cuts the line.
 *   - Reliable commands turn % into . (MSG_WriteReliableCommandToBuffer).
 *   - The server joins the words with single spaces (ConcatArgs) and keeps at
 *     most 149 bytes of the message, ^X counting 2 (G_Say).
 *   - The chat line is "Name^7: ^7message" (say) or "(Allies)Name^7: ^5message"
 *     (say_team); the name has no colors of its own and shows in the team color
 *     (^8 allies, ^9 axis), dead players get "(Dead)" in front. The chat wraps a
 *     line after 90 visible characters, at the last space (CG_AddToTeamChat).
 */
(function ()
{
	"use strict";

	var el = window.UI.el;
	var T = window.COD2_TEXT;
	var setHint = function () {};

	var SCALE = 2;
	var WRAP = 90;
	var DEFAULT_MESSAGES = [{ key: "F5", mode: "say", text: "^1Hello ^7world" }];

	var data = window.COD2_NAMES;
	var chat = null;
	var keyNames = {};
	var allies = null;

	var list = null;
	var palette = null;
	var canvas = null;
	var countBox = null;
	var warnBox = null;
	var output = null;
	var nameBox = null;
	var teamBox = null;
	var deadBox = null;
	var rows = [];
	var active = null;

	/* ---------- the game's rules ---------- */

	// The message as the server keeps it; cap is the byte limit (149, or Infinity to measure).
	function cleanMessage(text, cap, notes)
	{
		text = text.replace(/[\r\n\t]+/g, " ");
		if (/[";]/.test(text))
		{
			notes.stripped = true;
			text = text.replace(/[";]/g, "");
		}
		var comment = text.search(/\/\/|\/\*/);
		if (comment !== -1)
		{
			notes.comment = true;
			text = text.slice(0, comment);
		}

		var out = "";
		for (var i = 0; i < text.length; i++)
		{
			var c = text.charAt(i);
			if (c === "%")
			{
				notes.percent = true;
				c = ".";
			}
			if (c !== " " && !data.font.glyphs[c])
			{
				notes.unsupported = notes.unsupported || [];
				if (notes.unsupported.indexOf(c) === -1)
				{
					notes.unsupported.push(c);
				}
				continue;
			}
			if (c > "~")
			{
				notes.nonAscii = true;
			}
			out += c;
		}

		var joined = out.split(" ").filter(function (word) { return word !== ""; }).join(" ");
		if (/ {2}/.test(out.trim()))
		{
			notes.spaces = true;
		}
		if (joined.length > cap)
		{
			notes.cut = true;
			joined = joined.slice(0, cap);
		}
		if (joined === "")
		{
			notes.empty = true;
		}
		return joined;
	}

	// I_CleanStr: the name without color codes, printable characters only.
	function cleanName(name)
	{
		return T.stripCodes(name).replace(/[^ -~]/g, "");
	}

	// "" for no bind, null for a usable key, or what is wrong with it.
	function keyProblem(key)
	{
		if (key === "")
		{
			return "";
		}
		if (key === ";")
		{
			return "; ends the command; write the key as SEMICOLON.";
		}
		if (key.length === 1)
		{
			return key === "\"" || key === " " ? "\"" + key + "\" can not be bound this way." : null;
		}
		if (/^0x[0-9a-f]{2}$/i.test(key) || keyNames[key.toUpperCase()])
		{
			return null;
		}
		return "\"" + key + "\" is not a key name (for example F5, MOUSE4, KP_ENTER or a single character).";
	}

	// CG_AddToTeamChat: a new line after 90 visible characters, at the last space,
	// starting with the color the text had there.
	function wrapChat(text)
	{
		var lines = [];
		var buf = "";
		var lastSpace = -1;
		var color = "7";
		var count = 0;
		var i = 0;
		while (i < text.length)
		{
			if (count >= WRAP)
			{
				if (lastSpace !== -1)
				{
					i -= buf.length - (lastSpace + 1);
					buf = buf.slice(0, lastSpace);
				}
				lines.push(buf);
				buf = "^" + color;
				lastSpace = -1;
				count = 0;
			}
			var c = text.charAt(i);
			var next = text.charAt(i + 1);
			if (c === "^" && T.isDigit(next))
			{
				buf += c + next;
				color = next;
				i += 2;
			}
			else
			{
				buf += c;
				if (c === " ")
				{
					lastSpace = buf.length - 1;
				}
				count++;
				i++;
			}
		}
		lines.push(buf);
		return lines;
	}

	// The line the other players see.
	function chatLine(mode, message)
	{
		var team = teamBox.value;
		var prefix = "^" + chat.nameColor[team] + (deadBox.checked ? "(" + chat.text.dead + ")" : "");
		var name = cleanName(nameBox.value) || "Player";
		if (mode === "say_team")
		{
			return prefix + "(" + chat.text[team] + ")" + name + "^7: ^" + chat.teamColor + message;
		}
		return prefix + name + "^7: ^" + chat.sayColor + message;
	}

	/* ---------- output ---------- */

	function warnings(notes, needed, keyIssue)
	{
		var out = [];
		if (notes.cut)
		{
			out.push("The message needs " + needed + " bytes; the server keeps only the first " + chat.maxBytes + " (each ^X counts 2).");
		}
		if (notes.stripped)
		{
			out.push("\" and ; are left out: \" would end the bind, ; would end the command.");
		}
		if (notes.comment)
		{
			out.push("// or /* starts a comment in a command, so the message ends there.");
		}
		if (notes.percent)
		{
			out.push("The game turns % into . in chat.");
		}
		if (notes.spaces)
		{
			out.push("The server joins the words with single spaces.");
		}
		if (notes.unsupported)
		{
			out.push("Removed: characters the game font does not have (" + notes.unsupported.join(" ") + ").");
		}
		if (notes.nonAscii)
		{
			out.push("Characters outside plain ASCII are in the game font, but the console may not take them; put the line in your config instead.");
		}
		if (notes.empty)
		{
			out.push("The message is empty; the server ignores say without text.");
		}
		if (keyIssue)
		{
			out.push(keyIssue + " The line is written without bind.");
		}
		return out;
	}

	function update()
	{
		var lines = [];
		var binds = [];
		var allWarnings = [];

		rows.forEach(function (row, index)
		{
			var notes = {};
			var message = cleanMessage(row.text.value, chat.maxBytes, notes);
			var needed = cleanMessage(row.text.value, Infinity, {}).length;
			var key = row.key.value.trim();
			var keyIssue = keyProblem(key);
			var mode = row.mode.value;

			row.count.textContent = needed + " / " + chat.maxBytes;
			row.count.classList.toggle("is-over", needed > chat.maxBytes);
			row.key.classList.toggle("is-invalid", !!keyIssue);
			row.state = { needed: needed };

			var command = mode + " " + message;
			binds.push(key !== "" && !keyIssue ? "bind " + key + " \"" + command + "\"" : command);
			if (message !== "")
			{
				lines = lines.concat(wrapChat(chatLine(mode, message)));
			}

			warnings(notes, needed, keyIssue).forEach(function (text)
			{
				allWarnings.push((rows.length > 1 ? "Message " + (index + 1) + ": " : "") + text);
			});
		});

		if (/\^[89]/.test(rows.map(function (r) { return r.text.value; }).join("")))
		{
			allWarnings.push("^8 and ^9 are the team colors (allies, axis); they change with the teams of the map.");
		}

		T.draw(canvas, lines.length ? lines : [""], SCALE, allies);
		output.textContent = binds.join("\n");

		var current = active || rows[0];
		countBox.textContent = current.state.needed + " / " + chat.maxBytes + " bytes";
		countBox.classList.toggle("is-over", current.state.needed > chat.maxBytes);

		warnBox.textContent = "";
		allWarnings.forEach(function (text) { warnBox.appendChild(el("li", null, text)); });
		warnBox.hidden = allWarnings.length === 0;
	}

	/* ---------- message rows ---------- */

	function setActive(row)
	{
		active = row;
		rows.forEach(function (r) { r.box.classList.toggle("is-active", r === row); });
	}

	function renumber()
	{
		rows.forEach(function (row, i)
		{
			var n = i + 1;
			row.key.setAttribute("aria-label", "Bind key, message " + n);
			row.mode.setAttribute("aria-label", "Chat, message " + n);
			row.text.setAttribute("aria-label", "Message " + n);
			row.remove.setAttribute("aria-label", "Remove message " + n);
			row.remove.disabled = rows.length === 1;
		});
	}

	function addRow(message)
	{
		var row = {};
		row.box = el("div", "c2-row");

		row.key = el("input", "c2-key");
		row.key.type = "text";
		row.key.value = message.key;
		row.key.placeholder = "key";
		row.key.spellcheck = false;
		row.key.autocomplete = "off";

		row.mode = el("select", "dv-select c2-mode");
		["say", "say_team"].forEach(function (mode)
		{
			var option = el("option", null, mode);
			option.value = mode;
			row.mode.appendChild(option);
		});
		row.mode.value = message.mode;

		row.text = el("input", "n2-input c2-text");
		row.text.type = "text";
		row.text.value = message.text;
		row.text.spellcheck = false;
		row.text.autocomplete = "off";

		row.count = el("span", "n2-count c2-count");

		row.remove = el("button", "btn btn-sm c2-remove", "×");
		row.remove.type = "button";
		row.remove.addEventListener("click", function ()
		{
			rows.splice(rows.indexOf(row), 1);
			row.box.remove();
			if (active === row)
			{
				setActive(rows[0]);
			}
			renumber();
			update();
		});

		[row.key, row.mode, row.text].forEach(function (field)
		{
			field.addEventListener("input", update);
			field.addEventListener("focus", function () { setActive(row); update(); });
		});

		row.box.appendChild(row.key);
		row.box.appendChild(row.mode);
		row.box.appendChild(row.remove);
		row.box.appendChild(row.text);
		row.box.appendChild(row.count);
		list.appendChild(row.box);
		rows.push(row);
		renumber();
		return row;
	}

	function activeText()
	{
		return (active || rows[0]).text;
	}

	/* ---------- setup ---------- */

	function init()
	{
		list = document.getElementById("c2-list");
		if (list === null || !data || !data.chat)
		{
			return;
		}
		chat = data.chat;
		data.keys.names.forEach(function (name) { keyNames[name.toUpperCase()] = true; });
		palette = document.getElementById("c2-palette");
		canvas = document.getElementById("c2-canvas");
		countBox = document.getElementById("c2-count");
		warnBox = document.getElementById("c2-warnings");
		output = document.getElementById("c2-output");
		nameBox = document.getElementById("c2-name");
		teamBox = document.getElementById("c2-team");
		deadBox = document.getElementById("c2-dead");
		setHint = window.UI.hint(document.getElementById("c2-hint"));

		allies = T.makeAlliesPicker(document.getElementById("c2-allies"), function (team)
		{
			allies = team;
			T.paintSwatches(palette, allies);
			update();
		});

		DEFAULT_MESSAGES.forEach(addRow);
		setActive(rows[0]);

		T.makePalette(palette, function (code)
		{
			var field = activeText();
			T.applyCode(field, code);
			update();
		});
		T.paintSwatches(palette, allies);

		document.getElementById("c2-add").addEventListener("click", function ()
		{
			var row = addRow({ key: "", mode: "say", text: "" });
			setActive(row);
			row.key.focus();
			update();
		});
		document.getElementById("c2-random-letters").addEventListener("click", function ()
		{
			activeText().value = T.randomColors(activeText().value, true);
			update();
		});
		document.getElementById("c2-random-words").addEventListener("click", function ()
		{
			activeText().value = T.randomColors(activeText().value, false);
			update();
		});
		document.getElementById("c2-strip").addEventListener("click", function ()
		{
			activeText().value = T.stripCodes(activeText().value);
			update();
		});
		[nameBox, teamBox, deadBox].forEach(function (field)
		{
			field.addEventListener("input", update);
			field.addEventListener("change", update);
		});
		T.copyButton(document.getElementById("c2-copy"), function () { return output.textContent; },
			function (text, isError) { setHint(text, isError); });

		T.ready(update);
		window.addEventListener("resize", function () { T.ready(update); });
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
