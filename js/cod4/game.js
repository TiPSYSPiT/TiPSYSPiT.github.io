/*
 * CoD4 and its tabs (the format is described in js/shared/games.js). Links
 * from before the games existed (#killfeed-colors) lead to these tabs.
 */
window.GAMES.push({
	id: "cod4",
	name: "CoD4",
	title: "CoD4 Tools",
	icon: "assets/cod4/icons/cod4.png",
	favicon: "assets/cod4/icons/cod4.ico",
	legacyLinks: true,
	tabs: [
		{ id: "tab-checker", panel: "panel-checker", label: "config checker", slug: "config-checker" },
		{ id: "tab-rcon", panel: "panel-rcon", label: "rcon commands", slug: "rcon-commands" },
		{ id: "tab-srv", panel: "panel-srv", label: "server configuration", slug: "server-configuration" },
		{ id: "tab-dvars", panel: "panel-dvars", label: "dvars", slug: "dvars" },
		{ id: "tab-killfeed", panel: "panel-killfeed", label: "killfeed colors", slug: "killfeed-colors" },
		{ id: "tab-sb", panel: "panel-sb", label: "scoreboard generator", slug: "scoreboard-generator" },
		{ id: "tab-mm", panel: "panel-mm", label: "minimap generator", slug: "minimap-generator" },
		{ id: "tab-demos", panel: "panel-demos", label: "demos", slug: "demos" },
		{ id: "tab-faq", panel: "panel-faq", label: "FAQ", slug: "faq" }
	]
});
