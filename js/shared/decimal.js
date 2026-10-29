/*
 * Number fields with a decimal point, whatever the browser's language.
 *
 * <input type="number"> follows the system locale: a German Chrome shows and
 * expects "0,5", while every config line needs "0.5". So the tools use text
 * fields instead (inputmode="decimal" still brings up the number keyboard on
 * phones) and this helper gives them the rest of a number field's behaviour:
 *
 *   Decimal.attach(input, { min, max, step, buttons })
 *       commas typed or pasted turn into points at once, and the arrow keys
 *       step the value up and down within min and max; with buttons: true
 *       the field gets a - and a + button that do the same
 *   Decimal.sync(element)
 *       updates those buttons after a value was set from code
 *   Decimal.attachList(input)
 *       for "r g b a" fields: a comma inside a number ("0,498") becomes a
 *       point, a comma between numbers ("1, 0, 0") stays a separator
 *   Decimal.parse(text)
 *       a number written with a point or a comma, or null
 *
 * attach() must run before the field's own input listeners are added, so they
 * already see the point.
 */
(function ()
{
	"use strict";

	var NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

	function parse(text)
	{
		var s = String(text).trim().replace(/,/g, ".");
		return NUMBER.test(s) ? Number(s) : null;
	}

	// Space separated values: a comma inside a value is a decimal comma, a
	// trailing one a separator. No spaces at all: commas are separators.
	function normalizeList(text)
	{
		if (!/\s/.test(text.trim()))
		{
			return text;
		}
		return text.replace(/(\d),(?=\d)/g, "$1.");
	}

	// Same length in and out, so the caret can stay where it was.
	function rewrite(input, next)
	{
		if (next === input.value)
		{
			return;
		}
		var start = input.selectionStart;
		var end = input.selectionEnd;
		input.value = next;
		if (start !== null && document.activeElement === input)
		{
			input.setSelectionRange(start, end);
		}
	}

	function decimalsOf(step)
	{
		var s = String(step);
		var dot = s.indexOf(".");
		return dot === -1 ? 0 : s.length - dot - 1;
	}

	function isFiniteLimit(limit)
	{
		return limit !== undefined && isFinite(limit);
	}

	// One step up or down from the field's value: kept within min and max,
	// and rounded to the step's decimals (0.1 + 0.2 would otherwise give
	// 0.30000000000000004), or the min's when it has more (a min of 0.01 with
	// a step of 1).
	function stepValue(input, opts, direction)
	{
		var value = parse(input.value);
		if (value === null)
		{
			value = isFiniteLimit(opts.min) ? opts.min : 0;
		}
		value += direction * opts.step;
		if (isFiniteLimit(opts.min) && value < opts.min)
		{
			value = opts.min;
		}
		if (isFiniteLimit(opts.max) && value > opts.max)
		{
			value = opts.max;
		}
		var places = Math.max(decimalsOf(opts.step), isFiniteLimit(opts.min) ? decimalsOf(opts.min) : 0);
		var next = String(Number(value.toFixed(places)));
		if (next === input.value)
		{
			return false;
		}
		input.value = next;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		return true;
	}

	function makeButton(text, label)
	{
		var button = document.createElement("button");
		button.type = "button";
		button.className = "num-step";
		button.textContent = text;
		button.setAttribute("aria-label", label);
		return button;
	}

	// Held down, a button steps once, waits, then keeps stepping until it is
	// let go or reaches the limit. Enter and Space step once.
	var REPEAT_DELAY_MS = 400;
	var REPEAT_EVERY_MS = 70;

	function wireButton(button, input, opts, direction, sync)
	{
		var delay = 0;
		var timer = 0;

		function stop()
		{
			window.clearTimeout(delay);
			window.clearInterval(timer);
		}

		function step()
		{
			if (button.disabled || !stepValue(input, opts, direction))
			{
				stop();
			}
			sync();
		}

		button.addEventListener("pointerdown", function (event)
		{
			if (event.button !== 0 || button.disabled)
			{
				return;
			}
			event.preventDefault();
			step();
			delay = window.setTimeout(function ()
			{
				timer = window.setInterval(step, REPEAT_EVERY_MS);
			}, REPEAT_DELAY_MS);
		});
		["pointerup", "pointerleave", "pointercancel", "blur"].forEach(function (type)
		{
			button.addEventListener(type, stop);
		});
		// A pointer click already stepped on pointerdown; detail is 0 only
		// when the keyboard pressed the button.
		button.addEventListener("click", function (event)
		{
			if (event.detail === 0)
			{
				step();
			}
		});
	}

	// options: min, max (Infinity or left out for no limit), step, integer
	// (number keyboard without a decimal key), buttons (add the - and +
	// buttons; the field is then wrapped, in place if it is in the page
	// already, and attach returns the wrapper to insert instead).
	function attach(input, options)
	{
		var opts = options || {};
		input.type = "text";
		input.inputMode = opts.integer ? "numeric" : "decimal";
		input.autocomplete = "off";
		input.spellcheck = false;

		input.addEventListener("input", function ()
		{
			rewrite(input, input.value.replace(/,/g, "."));
		});

		if (opts.step === undefined)
		{
			return input;
		}

		input.addEventListener("keydown", function (event)
		{
			if (event.key !== "ArrowUp" && event.key !== "ArrowDown")
			{
				return;
			}
			event.preventDefault();
			stepValue(input, opts, event.key === "ArrowUp" ? 1 : -1);
		});

		if (!opts.buttons)
		{
			return input;
		}

		var wrap = document.createElement("span");
		wrap.className = "num-stepper";
		var label = input.getAttribute("aria-label") || opts.label || "value";
		var minus = makeButton("−", "Decrease " + label);
		var plus = makeButton("+", "Increase " + label);

		// At a limit its button is disabled; a field holding no number leaves
		// both on, the next step starts from the min.
		function sync()
		{
			var value = parse(input.value);
			minus.disabled = value !== null && isFiniteLimit(opts.min) && value <= opts.min;
			plus.disabled = value !== null && isFiniteLimit(opts.max) && value >= opts.max;
		}

		wireButton(minus, input, opts, -1, sync);
		wireButton(plus, input, opts, 1, sync);
		input.addEventListener("input", sync);
		// The tools rewrite the field when it loses focus (a clamped or
		// restored value), after this listener; check once they are done.
		input.addEventListener("blur", function () { window.setTimeout(sync, 0); });
		input.decimalSync = sync;

		if (input.parentNode !== null)
		{
			input.parentNode.replaceChild(wrap, input);
		}
		wrap.appendChild(input);
		wrap.appendChild(minus);
		wrap.appendChild(plus);
		sync();
		return wrap;
	}

	// After a field's value was set from code (a reset), bring its buttons up
	// to date. Takes a field or an element that holds fields.
	function sync(root)
	{
		var fields = root.decimalSync ? [root] : root.querySelectorAll(".num-stepper input");
		for (var i = 0; i < fields.length; i++)
		{
			if (fields[i].decimalSync)
			{
				fields[i].decimalSync();
			}
		}
	}

	function attachList(input)
	{
		input.addEventListener("input", function ()
		{
			rewrite(input, normalizeList(input.value));
		});
	}

	window.Decimal = {
		parse: parse,
		attach: attach,
		attachList: attachList,
		sync: sync
	};
})();
