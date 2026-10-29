/*
 * CoD4 dvar reference: stock 1.7, CoD4x and Promod X. The table itself is
 * js/shared/dvar-table.js; the data is window.COD4_DVARS from js/cod4/dvars-data.js.
 */
window.DvarTable({
	data: window.COD4_DVARS,
	panel: "panel-dvars",
	prefix: "d4",
	sources: { stock: "stock", cod4x: "CoD4x", promod: "Promod X" },
	defaultFrom: {
		"stock cfg": "Set by the game's default_mp.cfg; the engine does not register it",
		"promod cfg": "Set by a Promod X config; nothing registers it",
		"cod4x cfg": "Set by a CoD4x config; nothing registers it"
	},
	protections: {
		"Engine": { show: "cheat", label: "cheat protected", title: "Cheat flag (stock 1.7)" },
		"CoD4x": { show: "cheat", label: "cheat protected", title: "Cheat flag (CoD4x)" },
		"Promod": { show: "enforced", label: "Promod enforced", title: "Promod enforced" },
		"Read-only": { show: "info", title: "Read-only" },
		"Init only": { show: "info", title: "Init only" }
	}
});
