/*
 * CoD2 and its tabs (the format is described in js/shared/games.js).
 */
window.GAMES.push({
	id: "cod2",
	name: "CoD2",
	title: "CoD2 Tools",
	icon: "assets/cod2/icons/cod2.png",
	favicon: "assets/cod2/icons/cod2.ico",
	tabs: [
		{ id: "tab-cod2-dvars", panel: "panel-cod2-dvars", label: "dvars", slug: "dvars" },
		{ id: "tab-cod2-demos", panel: "panel-cod2-demos", label: "demos", slug: "demos" },
		{ id: "tab-cod2-rcon", panel: "panel-cod2-rcon", label: "rcon", slug: "rcon" },
		{ id: "tab-cod2-name", panel: "panel-cod2-name", label: "name generator", slug: "name-generator" },
		{ id: "tab-cod2-faq", panel: "panel-cod2-faq", label: "FAQ", slug: "faq" }
	]
});
