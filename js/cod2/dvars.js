/*
 * CoD2 dvar reference: stock 1.3, CoD2x and zPAM. The table itself is
 * js/shared/dvar-table.js; the data is window.COD2_DVARS from js/cod2/dvars-data.js.
 */
window.DvarTable({
	data: window.COD2_DVARS,
	panel: "panel-cod2-dvars",
	prefix: "d2",
	sources: { stock: "stock", cod2x: "CoD2x", zpam: "zPAM" },
	defaultFrom: {
		"stock cfg": "Set by the game's default_mp.cfg; the engine does not register it",
		"zpam cfg": "Set by zPAM's default_mp.cfg",
		"cod2x cfg": "Set by CoD2x's config"
	},
	protections: {
		"Engine": { show: "cheat", label: "cheat protected", title: "Cheat flag (stock 1.3)" },
		"CoD2x": { show: "cheat", label: "cheat protected", title: "Cheat flag (CoD2x)" },
		"CoD2x enforced": { show: "enforced", label: "CoD2x enforced", title: "CoD2x enforced" },
		"set by zPAM": { show: "tag", label: "set by zPAM", title: "Set by zPAM" },
		"Read-only": { show: "info", title: "Read-only" },
		"Write-protected": { show: "info", title: "Write-protected" },
		"zPAM rules": { show: "info", title: "zPAM rules" }
	}
});
