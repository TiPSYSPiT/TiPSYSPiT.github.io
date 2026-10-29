/*
 * The list of games. Each game folder adds itself with js/<game>/game.js,
 * loaded right after this file; js/shared/tabs.js then builds the game
 * switcher and one tab bar per game from the list, and links every tab as
 * #<game>/<slug>. The games show in the order their game.js files load.
 *
 * A game:
 *   id           the game's name in the URL (#<id>/<slug>)
 *   name         the switcher button's text
 *   title        the page title and heading while the game is open
 *   icon         the switcher button's icon
 *   favicon      the browser tab's icon while the game is open
 *   legacyLinks  true for the one game whose tabs links from before the
 *                games existed (#<slug> alone) lead to
 *   tabs         the tab bar, in order:
 *     id      tab button id (the panel's aria-labelledby points at it)
 *     panel   id of the panel the tab shows
 *     label   the tab's text
 *     slug    the tab's name in the URL
 *
 * To add a tool:
 *   1. add a <section class="panel" id="panel-..." ...> to index.html
 *      (hidden, role="tabpanel", aria-labelledby the tab id)
 *   2. add an entry to that game's tabs in js/<game>/game.js
 *   3. add the tool's script to index.html, if it has one
 * The navigation itself needs no change.
 *
 * The first game is the default for a missing or unknown hash, and the first
 * tab of a game opens when a link names only the game.
 */
window.GAMES = [];
