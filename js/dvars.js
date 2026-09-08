/*
 * CoD4 dvar reference.
 *
 * 1196 entries, sorted by name, case insensitive. One line per dvar:
 *
 *   name|description|type|default|min|max|enum values
 *
 * Descriptions come from the CSV export. Type, default, range and the enum
 * value names were read out of the KisakCOD sources by parsing the
 * Dvar_Register* calls, the domain structs some of them keep their bounds in,
 * the bounds a few pack into a single 64 bit literal, and the const char *
 * arrays the enums point at. Where a name is defined twice the multiplayer
 * version wins. 1163 of the 1196 were found.
 *
 * FLT_MAX and INT_MAX are reported as no limit rather than as a number, bool
 * keeps only its default because true or false already states the domain, and
 * an enum with a known list is bounded by that list.
 *
 * "|" and "," need no escaping: neither occurs in any field, and neither does
 * a backtick or "${".
 */
(function ()
{
	"use strict";

	var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

	var entries = [];
	var rows = [];
	var listBox = null;
	var searchBox = null;
	var countBox = null;
	var emptyBox = null;

	var DVAR_TABLE = `
actionSlotsHide|Hide the actionslots.|bool|false|||
activeAction|Action to execute in first frame|string|""|||
aim_accel_turnrate_debug|Turn on debugging info for the acceleration|bool|false|||
aim_accel_turnrate_enabled|Enable/disable acceleration of the turnrates|bool|true|||
aim_accel_turnrate_lerp|The acceleration of the turnrates|float|1200|0|4000|
aim_autoaim_debug|Turn on auto aim debugging|bool|false|||
aim_autoaim_enabled|Turn on auto aim|bool|false|||
aim_autoaim_lerp|The rate in degrees per second that the auto aim will converge to its target|float|40|0|100|
aim_autoaim_region_height|The height of the auto aim region in virtual screen coordinates (0 - 480)|float|120|0|480|
aim_autoaim_region_width|The width of the auto aim region in virtual screen coordinates (0 - 640)|float|160|0|640|
aim_automelee_debug|Turn on auto melee debugging|bool|false|||
aim_automelee_enabled|Turn on auto melee|bool|true|||
aim_automelee_lerp|The rate in degrees per second that the auto melee will converge to its target|float|40|0|100|
aim_automelee_range|The range of the auto melee|float|128|0|255|
aim_automelee_region_height|The height of the auto melee region in virtual screen coordinates (0 - 480)|float|240|0|480|
aim_automelee_region_width|The width of the auto melee region in virtual screen coordinates (0 - 640)|float|320|0|640|
aim_input_graph_debug|Debug the view input graphs|bool|false|||
aim_input_graph_enabled|Use graph for adjusting view input|bool|true|||
aim_input_graph_index|Which input graph to use|int|3|0|3|
aim_lockon_debug|Turn on debugging info for aim lock on|bool|false|||
aim_lockon_deflection|The amount of stick deflection for the lockon to activate|float|0.05|0|1|
aim_lockon_enabled|Aim lock on helps the player to stay on target|bool|true|||
aim_lockon_region_height|The height of the auto aim region in virtual screen coordinates(0-480)|float|90|0|480|
aim_lockon_region_width|The width of the auto aim region in virtual screen coordinates(0-640)|float|90|0|640|
aim_lockon_strength|The amount of aim assistance given by the target lock on|float|0.6|0|1|
aim_scale_view_axis|Scale the influence of each input axis so that the major axis has more influence on the control|bool|true|||
aim_slowdown_debug|Turn on debugging info for aim slowdown|bool|false|||
aim_slowdown_enabled|Slowdown the turn rate when the cross hair passes over a target|bool|true|||
aim_slowdown_pitch_scale|The vertical aim assist slowdown ratio from the hip|float|0.4|0|1|
aim_slowdown_pitch_scale_ads|The vertical aim assist slowdown ratio when aiming down the sight|float|0.5|0|1|
aim_slowdown_region_height|The screen height of the aim assist slowdown region|float|90|0|480|
aim_slowdown_region_width|The screen width of the aim slowdown region|float|90|0|640|
aim_slowdown_yaw_scale|The horizontal aim assist slowdown ratio from the hip|float|0.4|0|1|
aim_slowdown_yaw_scale_ads|The horizontal aim assist slowdown ratio when aiming down the sight|float|0.5|0|1|
aim_target_sentient_radius|The radius used to calculate target bounds for a sentient(actor or player)|float|10|0|128|
aim_turnrate_pitch|The vertical turn rate for aim assist when firing from the hip|float|90|0|1080|
aim_turnrate_pitch_ads|The turn rate up and down for aim assist when aiming down the sight|float|55|0|1080|
aim_turnrate_yaw|The horizontal turn rate for aim assist when firing from the hip|float|260|0|1080|
aim_turnrate_yaw_ads|The horizontal turn rate for aim assist when aiming down the sight|float|90|0|1080|
ammoCounterHide|Hide the Ammo Counter|bool|false|||
authPort|Auth server port|int|20800|0||
authServerName|Authentication server name for listing public inet games|string|cod4master.activision.com|||
bg_aimSpreadMoveSpeedThreshold|When player is moving faster than this speed, the aim spread will increase|float|11|0|300|
bg_bobAmplitudeDucked|The multiplier to apply to the player's speed to get the bob amplitude while ducking|vec2|0.0075 0.0075|0|1|
bg_bobAmplitudeProne|The multiplier to apply to the player's speed to get the bob amplitude while prone|vec2|0.02 0.005|0|1|
bg_bobAmplitudeSprinting|The multiplier to apply to the player's speed to get the bob amplitude while sprinting|vec2|0.02 0.014|0|1|
bg_bobAmplitudeStanding|The multiplier to apply to the player's speed to get the bob amplitude while standing|vec2|0.007 0.007|0|1|
bg_bobMax|The maximum allowed bob amplitude|float|8|0|36|
bg_fallDamageMaxHeight|The height that a player will take maximum damage when falling|float|300|1||
bg_fallDamageMinHeight|The height that a player will start to take minimum damage if they fall|float|128|1||
bg_foliagesnd_fastinterval|The time between each foliage sound when moving quickly|int|500|0||
bg_foliagesnd_maxspeed|The speed that a player must be going to make maximum noise while moving through foliage|float|180|0||
bg_foliagesnd_minspeed|The speed that a player must be going to make minimum noise while moving through foliage|float|40|0||
bg_foliagesnd_resetinterval|The time interval before foliage sounds are reset after the player has stopped moving|int|500|0||
bg_foliagesnd_slowinterval|The time between each foliage sound when moving slowly|int|1500|0||
bg_ladder_yawcap|The maximum angle that a player can look around while on a ladder|float|100|0|360|
bg_legYawTolerance|The amount the player's leg yaw can differ from his torso before moving ta match|float|20|0|180|
bg_maxGrenadeIndicatorSpeed|Maximum speed of grenade that will show up in indicator and can be thrown back.|float|20|0|1000|
bg_prone_yawcap|The maximum angle that a player can look around quickly while prone|float|85|0|360|
bg_shock_lookControl|Alter player control during shellshock|bool|true|||
bg_shock_lookControl_fadeTime|The time for the shellshock player control to fade in seconds|float|2|0.001|1000|
bg_shock_lookControl_maxpitchspeed|Maximum pitch movement rate while shellshocked in degrees per second|float|90|0||
bg_shock_lookControl_maxyawspeed|Maximum yaw movement rate while shell shocked in degrees per second|float|90|0||
bg_shock_lookControl_mousesensitivityscale|Sensitivity scale to apply to a shellshocked player|float|0.5|0|2|
bg_shock_movement|Affect player's movement speed duringi shellshock|bool|true|||
bg_shock_screenBlurBlendFadeTime|The amount of time in seconds for the shellshock effect to fade|float|1|0.001|1000|
bg_shock_screenBlurBlendTime|The amount of time in seconds for the shellshock effect to blend|float|0.4|0.001|10|
bg_shock_screenFlashShotFadeTime|In seconds, how soon from the end of the effect to start blending out the screengrab layer.|float|1|0|1000|
bg_shock_screenFlashWhiteFadeTime|In seconds, how soon from the end of the effect to start blending out the whiteout layer.|float|1|0|1000|
bg_shock_screenType|Shell shock screen effect type|enum|0|0|2|blurred,flashed,none
bg_shock_sound|Play shell shock sound|bool|true|||
bg_shock_soundDryLevel|Shell shock sound dry level|float|1|0|1|
bg_shock_soundEnd|Shellshock end sound alias|string|shellshock_end|||
bg_shock_soundEndAbort|Shellshock aborted end sound alias|string|shellshock_end_abort|||
bg_shock_soundFadeInTime|Shell shock sound fade in time in seconds|float|0.25|0.001|1000|
bg_shock_soundFadeOutTime|Shell shock sound fade out time in seconds|float|2.5|0.001|1000|
bg_shock_soundLoop|Shellshock loop alias|string|shellshock_loop|||
bg_shock_soundLoopEndDelay|Sound loop end offset time from the end of the shellshock in seconds|float|-3|-10|1000|
bg_shock_soundLoopFadeTime|Shell shock sound loop fade time in seconds|float|1.5|0.001|1000|
bg_shock_soundLoopSilent|The sound that gets blended with the shellshock loop alias|string|shellshock_loop_silent|||
bg_shock_soundModEndDelay|The delay from the end of the shell shock to the end of the sound modification|float|2|-1000|1000|
bg_shock_soundRoomType|Shell shock sound room type|enum|0|0|24|generic,paddedcell,room,bathroom,livingroom,stoneroom,auditorium,concerthall,cave,arena,hangar,carpetedhallway,stonecorridor,alley,forest,city,mountains,quarry,plain,parkinglot,sewerpipe,underwater,drugged,dizzy,psychotic
bg_shock_soundWetLevel|Shell shock sound wet level|float|0.5|0|1|
bg_shock_viewKickFadeTime|The time for the shellshock kick effect to fade|float|3|0.001|1000|
bg_shock_viewKickPeriod|The period of the shellshock view kick effect|float|0.75|0.001|1000|
bg_shock_viewKickRadius|Shell shock kick radius|float|0.05|0|1|
bg_shock_volume_%s||||||
bg_swingSpeed|The rate at which the player's legs swing around when strafing(multi-player only)|float|0.2|0|1|
bg_viewKickMax|The maximum view kick|float|90|0|90|
bg_viewKickMin|The minimum view kick|float|5|0|90|
bg_viewKickRandom|The random direction scale view kick|float|0.4|0|1|
bg_viewKickScale|The scale to apply to the damage done to caluclate damage view kick|float|0.2|0|10|
bullet_penetrationEnabled|Enable/Disable bullet penetration.|bool|true|||
bullet_penetrationMinFxDist|Min distance a penetrated bullet must travel before it'll trigger the effects|float|30|0|1024|
cg_airstrikeKillCamCloseXYDist|Airstrike kill camera closest distance in front of the bomb.|float|24|0||
cg_airstrikeKillCamCloseZDist|Airstrike kill camera closest distance above the target.|float|24|0||
cg_airstrikeKillCamDist|Airstrike kill camera distance.|float|200|0||
cg_airstrikeKillCamFarBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480|float|2|0|10|
cg_airstrikeKillCamFarBlurDist|Airstrike kill camera distance above the airplane.|float|300|0||
cg_airstrikeKillCamFarBlurStart|Airstrike kill camera distance above the airplane.|float|100|0||
cg_airstrikeKillCamFov|Airstrike kill camera field of view.|float|80|0.1|160|
cg_airstrikeKillCamNearBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480|float|4|4|10|
cg_airstrikeKillCamNearBlurEnd|Airstrike kill camera distance above the airplane.|float|100|0|10000|
cg_airstrikeKillCamNearBlurStart|Airstrike kill camera distance above the airplane.|float|0|0||
cg_blood|Show Blood|bool|true|||
cg_brass|Weapons eject brass|bool|true|||
cg_centertime|The time for a center printed message to fade|float|3|0||
cg_chatHeight|The font height of a chat message|int|8|0|8|
cg_chatTime|The amount of time that a chat message is visible|int|12000|0|60000|
cg_connectionIconSize|Size of the connection icon|float|0|0|100|
cg_constantSizeHeadIcons|Head icons are the same size regardless of distance from the player|bool|false|||
cg_crosshairAlpha|The alpha value of the crosshair|float|1|0|1|
cg_crosshairAlphaMin|The minimum alpha value of the crosshair when it fades in|float|0.5|0|1|
cg_crosshairDynamic|Crosshair is Dynamic|bool|false|||
cg_crosshairEnemyColor|The crosshair color when over an enemy|bool|true|||
cg_cursorHints|Draw cursor hints where: 0: no hints 1: sin size pulse 2: one way size pulse 3: alpha pulse 4: static image|int|3|0|4|
cg_debug_overlay_viewport|Remove the sniper overlay so you can check that the scissor window is correct.|bool|false|||
cg_debugevents|Output event debug information|bool|false|||
cg_debugInfoCornerOffset|Offset from top-right corner, for cg_drawFPS, etc|vec2|5 -5|-200|640|
cg_debugposition|Output position debugging information|bool|false|||
cg_descriptiveText|Draw descriptive spectator messages|bool|true|||
cg_draw2D|Draw 2D screen elements|bool|true|||
cg_drawBreathHint|Draw a 'hold breath to steady' hint|bool|true|||
cg_drawCrosshair|Turn on weapon crosshair|bool|true|||
cg_drawCrosshairNames|Draw the name of an enemy under the crosshair|bool|true|||
cg_drawCrosshairNamesPosX|Virtual screen space position of the crosshair name|int|300|0|640|
cg_drawCrosshairNamesPosY|Virtual screen space position of the crosshair name|int|180|0|480|
cg_drawFPS|Draw frames per second|enum|1|0|3|Off,Simple,SimpleRanges,Verbose
cg_drawFPSLabels|Draw FPS Info Labels|bool|true|||
cg_drawFriendlyNames|Whether to show friendly names in game|bool|true|||
cg_drawGun|Draw the view model|bool|true|||
cg_drawHealth|Draw health bar|bool|false|||
cg_drawLagometer|Enable the 'lagometer'|bool|false|||
cg_drawMantleHint|Draw a 'press key to mantle' hint|bool|true|||
cg_drawMaterial|Draw debugging information for materials|enum|0|0|3|Off,CONTENTS_SOLID,MASK_SHOT,MASK_PLAYERSOLID
cg_drawpaused|Draw paused screen|bool|true|||
cg_drawScriptUsage|Draw debugging information for scripts|bool|false|||
cg_drawShellshock|Draw shellshock & flashbang screen effects.|bool|true|||
cg_drawSnapshot|Draw debugging information for snapshots|bool|false|||
cg_drawSpectatorMessages|Enables drawing of spectator HUD messages.|bool|true|||
cg_drawTalk|Controls which icons CG_TALKER ownerdraw draws|enum|1|0|3|NONE,ALL,FRIENDLY,ENEMY
cg_drawThroughWalls|Whether to draw friendly names through walls or not|bool|false|||
cg_drawTurretCrosshair|Draw a cross hair when using a turret|bool|true|||
cg_dumpAnims|Output animation info for the given entity id|int|-1|-1|1023|
cg_enemyNameFadeIn|Time in milliseconds to fade in enemy names|int|250|0||
cg_enemyNameFadeOut|Time in milliseconds to fade out enemy names|int|250|0||
cg_errordecay|Decay for predicted error|float|100|0||
cg_firstPersonTracerChance|The probability that a bullet is a tracer round for your bullets|float|0.5|0|1|
cg_footsteps|Play footstep sounds|bool|true|||
cg_fov|The field of view angle in degrees|float|65|1|160|
cg_fovMin|The minimum possible field of view|float|10|1|160|
cg_fovScale|Scale applied to the field of view|float|1|0.2|2|
cg_friendlyNameFadeIn|Time in milliseconds to fade in friendly names|int|0|0||
cg_friendlyNameFadeOut|Time in milliseconds to fade out friendly names|int|1500|0||
cg_gameBoldMessageWidth|The maximum character width of the bold game messages|int|390|130|1664|
cg_gameMessageWidth|The maximum character width of the game messages|int|500|130|1664|
cg_gun_move_f|Weapon movement forward due to player movement|float|0|||
cg_gun_move_minspeed|The minimum weapon movement rate|float|0|||
cg_gun_move_r|Weapon movement right due to player movement|float|0|||
cg_gun_move_rate|The base weapon movement rate|float|0|||
cg_gun_move_u|Weapon movement up due to player movement|float|0|||
cg_gun_ofs_f|Forward weapon offset when prone/ducked|float|0|||
cg_gun_ofs_r|Right weapon offset when prone/ducked|float|0|||
cg_gun_ofs_u|Up weapon offset when prone/ducked|float|0|||
cg_gun_x|x position of the viewmodel|float|0|||
cg_gun_y|y position of the viewmodel|float|0|||
cg_gun_z|z position of the viewmodel|float|0|||
cg_headIconMinScreenRadius|The minumum radius of a head icon on the screen|float|0.02|0|1|
cg_heliKillCamDist|Helicopter kill camera distance from helicopter.|float|1000|0||
cg_heliKillCamFarBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480|float|2|0|10|
cg_heliKillCamFarBlurDist|Helicopter kill camera distance above the helicopter.|float|300|0||
cg_heliKillCamFarBlurStart|Helicopter kill camera distance above the helicopter.|float|100|0||
cg_heliKillCamFov|Helicopter kill camera field of view.|float|15|0.1|160|
cg_heliKillCamNearBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480|float|4|4|10|
cg_heliKillCamNearBlurEnd|Helicopter kill camera distance above the helicopter.|float|100|0|10000|
cg_heliKillCamNearBlurStart|Helicopter kill camera distance above the helicopter.|float|0|0||
cg_heliKillCamZDist|Helicopter kill camera distance above the helicopter.|float|50|0||
cg_hintFadeTime|Time in milliseconds for the cursor hint to fade|int|100|0|7|
cg_hudChatIntermissionPosition|Position of the HUD chat box during intermission|vec2|5 110|0|640|
cg_hudChatPosition|Position of the HUD chat box|vec2|5 204|0|640|
cg_hudDamageIconHeight|The height of the damage icon|float|64|0|512|
cg_hudDamageIconInScope|Draw damage icons when aiming down the sight of a scoped weapon|bool|false|||
cg_hudDamageIconOffset|The offset from the center of the damage icon|float|128|0|512|
cg_hudDamageIconTime|The amount of time for the damage icon to stay on screen after damage is taken|int|2000|0|7|
cg_hudDamageIconWidth|The width of the damage icon|float|128|0|512|
cg_hudGrenadeIconEnabledFlash|Show the grenade indicator for flash grenades|bool|false|||
cg_hudGrenadeIconHeight|The height of the grenade indicator icon|float|25|0|512|
cg_hudGrenadeIconInScope|Show the grenade indicator when aiming down the sight of a scoped weapon|bool|true|||
cg_hudGrenadeIconMaxHeight|The minimum height difference between a player and a grenade for the grenade to be shown on the grenade indicator|float|104|0|1000|
cg_hudGrenadeIconMaxRangeFlash|The minimum distance that a flashbang has to be from a player in order to be shown on the grenade indicator|float|500|0|2000|
cg_hudGrenadeIconMaxRangeFrag|The minimum distance that a grenade has to be from a player in order to be shown on the grenade indicator|float|256|0|1000|
cg_hudGrenadeIconOffset|The offset from the center of the screen for a grenade icon|float|50|0|512|
cg_hudGrenadeIconWidth|The width of the grenade indicator icon|float|25|0|512|
cg_hudGrenadePointerHeight|The height of the grenade indicator pointer|float|12|0|512|
cg_hudGrenadePointerPivot|The pivot point of th grenade indicator pointer|vec2|12 27|0|512|
cg_hudGrenadePointerPulseFreq|The number of times per second that the grenade indicator flashes in Hertz|float|1.7|0.1|50|
cg_hudGrenadePointerPulseMax|The maximum alpha of the grenade indicator pulse. Values higher than 1 will cause the indicator to remain at full brightness for longer|float|1.85|0|3|
cg_hudGrenadePointerPulseMin|The minimum alpha of the grenade indicator pulse. Values lower than 0 will cause the indicator to remain at full transparency for longer|float|0.3|-3|1|
cg_hudGrenadePointerWidth|The width of the grenade indicator pointer|float|25|0|512|
cg_hudMapBorderWidth|The size of the full map's border, filled by the CG_PLAYER_FULLMAP_BORDER ownerdraw|float|2|0||
cg_hudMapFriendlyHeight|The size of the friendly icon on the full map|float|15|0||
cg_hudMapFriendlyWidth|The size of the friendly icon on the full map|float|15|0||
cg_hudMapPlayerHeight|The size of the player's icon on the full map|float|20|0||
cg_hudMapPlayerWidth|The size of the player's icon on the full map|float|20|0||
cg_hudMapRadarLineThickness|Thickness, relative to the map width, of the radar texture that sweeps across the full screen map|float|0.15|0.01|10|
cg_hudProneY|Virtual screen y coordinate of the prone blocked message|float|-160|-10000|10000|
cg_hudSayPosition|Position of the HUD say box|vec2|5 180|0|640|
cg_hudStanceFlash|The background color of the flash when the stance changes|color|1 1 1 1|0|1|
cg_hudStanceHintPrints|Draw helpful text to say how to change stances|bool|false|||
cg_hudVotePosition|Position of the HUD vote box|vec2|5 220|0|640|
cg_invalidCmdHintBlinkInterval|Blink rate of an invalid command hint|int|600|1|7|
cg_invalidCmdHintDuration|Duration of an invalid command hint|int|1800|0|7|
cg_laserEndOffset|How far from the point of collision the end of the beam is.|float|0.5|||
cg_laserFlarePct|Percentage laser widens over distance from viewer.|float|0.2|0||
cg_laserForceOn|Force laser sights on in all possible places (for debug purposes).|bool|false|||
cg_laserLight|Whether to draw the light emitted from a laser (not the laser itself)|bool|true|||
cg_laserLightBeginOffset|How far from the true beginning of the beam the light at the beginning is.|float|13|||
cg_laserLightBodyTweak|Amount to add to length of beam for light when laser hits a body (for hitboxes).|float|15|||
cg_laserLightEndOffset|How far from the true end of the beam the light at the end is.|float|-3|||
cg_laserLightRadius|The radius of the light at the far end of a laser beam|float|3|0.001||
cg_laserRadius|The size (radius) of a laser beam|float|0.8|0.001||
cg_laserRange|The maximum range of a laser beam|float|1500|1||
cg_laserRangePlayer|The maximum range of the player's laser beam|float|1500|1||
cg_mapLocationSelectionCursorSpeed|Speed of the cursor when selecting a location on the map|float|0.6|0.001|1|
cg_marks_ents_player_only|Marks on entities from players' bullets only.|bool|false|||
cg_nopredict|Don't do client side prediction|bool|false|||
cg_overheadIconSize|The maximum size to show overhead icons like 'rank'|float|0.7|0|100|
cg_overheadNamesFarDist|The far distance at which name sizes are scaled by cg_overheadNamesFarScale|float|1024|0||
cg_overheadNamesFarScale|The amount to scale overhead name sizes at cg_overheadNamesFarDist|float|0.6|0||
cg_overheadNamesFont|Font for overhead names ( see menudefinition.h )|int|2|0|6|
cg_overheadNamesGlow|Glow color for overhead names|color|0 0 0 1|0|1|
cg_overheadNamesMaxDist|The maximum distance for showing friendly player names|float|10000|0||
cg_overheadNamesNearDist|The near distance at which names are full size|float|256|0||
cg_overheadNamesSize|The maximum size to show overhead names|float|0.5|0|100|
cg_overheadRankSize|The size to show rank text|float|0.5|0||
cg_predictItems|Turn on client side prediction for item pickup|bool|true|||
cg_scoreboardBannerHeight|Banner height of the scoreboard|int|35|1|100|
cg_scoreboardFont|Scoreboard font enum ( see menudefinition.h )|int|0|0|6|
cg_scoreboardHeaderFontScale|Scoreboard header font scale|float|0.35|0||
cg_scoreboardHeight|Height of the scoreboard|float|435|0||
cg_scoreboardItemHeight|Item height of each item|int|18|1|1000|
cg_scoreboardMyColor|The local player's font color when shown in scoreboard|color|1 0.8 0.4 1|0|1|
cg_scoreboardPingGraph|Whether to show graphical ping|bool|false|||
cg_scoreboardPingHeight|Height of the ping graph as a % of the scoreboard row height|float|0.7|0|1|
cg_scoreboardPingText|Whether to show numeric ping value|bool|true|||
cg_scoreboardPingWidth|Width of the ping graph as a % of the scoreboard|float|0.036|0|1|
cg_scoreboardRankFontScale|Scale of rank font|float|0.25|0||
cg_scoreboardScrollStep|Scroll step amount for the scoreboard|int|3|1|8|
cg_scoreboardTextOffset|Scoreboard text offset|float|0.5|0||
cg_scoreboardWidth|Width of the scoreboard|float|500|0||
cg_ScoresPing_BgColor|Background color of ping|color|0.25 0.25 0.25 0.5|0|1|
cg_ScoresPing_HighColor|Color for high ping|color|0.8 0 0 1|0|1|
cg_ScoresPing_Interval|Number of milliseconds each bar represents|int|100|1|500|
cg_ScoresPing_LowColor|Color for low ping|color|0 0.75 0 1|0|1|
cg_ScoresPing_MaxBars|Number of bars to show in ping graph|int|4|1|10|
cg_ScoresPing_MedColor|Color for medium ping|color|0.8 0.8 0 1|0|1|
cg_scriptIconSize|Size of Icons defined by script|float|0|0|100|
cg_showmiss|Show prediction errors|int|0|0|2|
cg_sprintMeterDisabledColor|The color of the sprint meter when the sprint meter is disabled|vec4|0.8 0.1 0.1 0.2|0|1|
cg_sprintMeterEmptyColor|The color of the sprint meter when the sprint meter is empty|vec4|0.7 0.5 0.2 0.8|0|1|
cg_sprintMeterFullColor|The color of the sprint meter when the sprint meter is full|vec4|0.8 0.8 0.8 0.8|0|1|
cg_subtitleMinTime|The minimum time that the subtitles are displayed on screen in seconds|float|3|0||
cg_subtitles|Show subtitles|bool|true|||
cg_subtitleWidthStandard|The width of the subtitles in non wide-screen|int|306|130|1664|
cg_subtitleWidthWidescreen|The width of the subtitles in wide-screen|int|468|130|1664|
cg_teamChatsOnly|Allow chatting only on the same team|bool|false|||
cg_thirdPerson|Use third person view|bool|false|||
cg_thirdPersonAngle|The angle of the camera from the player in third person view|float|0|-180|360|
cg_thirdPersonRange|The range of the camera from the player in third person view|float|120|0|1024|
cg_tracerchance|The probability that a bullet is a tracer round|float|0.2|0|1|
cg_tracerlength|The length of a tracer round|float|160|0||
cg_tracerScale|Scale the tracer at a distance, so it's still visible|float|1|1||
cg_tracerScaleDistRange|The range at which a tracer is scaled to its maximum amount|float|25000|0||
cg_tracerScaleMinDist|The minimum distance to scale a tracer|float|5000|0||
cg_tracerScrewDist|The length a tracer goes as it completes a full corkscrew revolution|float|100|0||
cg_tracerScrewRadius|The radius of a tracer's corkscrew motion|float|0.5|0||
cg_tracerSpeed|The speed of a tracer round in units per second|float|7500|0||
cg_tracerwidth|The width of the tracer round|float|4|0||
cg_viewZSmoothingMax|Threshhold for the maximum smoothing distance we'll do|float|16|0||
cg_viewZSmoothingMin|Threshhold for the minimum smoothing distance it must move to smooth|float|1|0||
cg_viewZSmoothingTime|Amount of time to spread the smoothing over|float|0.1|0||
cg_voiceIconSize|Size of the 'voice' icon|float|0|0|100|
cg_weaponCycleDelay|The delay after cycling to a new weapon to prevent holding down the cycle weapon button from cycling too fast|int|0|0|7|
cg_weaponHintsCoD1Style|Draw weapon hints in CoD1 style: with the weapon name, and with the icon below|bool|true|||
cg_weaponleftbone|Left hand weapon bone name|string|tag_weapon_left|||
cg_weaponrightbone|Right handed weapon bone name|string|tag_weapon_right|||
cg_youInKillCamSize|Size of the 'you' Icon in the kill cam|float|6|0|100|
cl_allowDownload|Allow client downloads from the server|bool|true|||
cl_analog_attack_threshold|The threshold before firing|float|0.8|0.0001|1|
cl_anglespeedkey|Multiplier for max angle speed for game pad and keyboard|float|1.5|0||
cl_anonymous|Allow anonymous log in|||||
cl_avidemo|AVI demo frames per second|int|0|0|7|
cl_bypassMouseInput|Bypass UI mouse input and send directly to the game|bool|false|||
cl_connectionAttempts|Maximum number of connection attempts before aborting|int|10|0||
cl_connectTimeout|Timeout time in seconds while connecting to a server|float|200|0|3600|
cl_forceavidemo|Record AVI demo even if client is not active|bool|false|||
cl_freelook|Enable looking with mouse|bool|true|||
cl_freezeDemo|cl_freezeDemo is used to lock a demo in place for single frame advances|bool|false|||
cl_hudDrawsBehindUI|Should the HUD draw when the UI is up?|bool|true|||
cl_ingame|True if the game is active|bool|false|||
cl_maxpackets|Maximum number of packets sent per frame|int|30|15|100|
cl_maxPing|Maximum ping for the client|int|800|20|2000|
cl_maxppf|Maximum servers to ping per frame in server browser|||||
cl_motdString|Message of the day|string|""|||
cl_mouseAccel|Mouse acceleration|float|0|0|100|
cl_nodelta|The server does not send snapshot deltas|bool|false|||
cl_noprint|Print nothing to the console|bool|false|||
cl_packetdup|Enable packet duplication|int|1|0|5|
cl_paused|Pause the game|int|0|0|2|
cl_pitchspeed|Max pitch speed in degrees for game pad|float|140|||
cl_punkbuster|Determines whether PunkBuster is enabled|bool|true|||
cl_serverStatusResendTime|Time in milliseconds to resend a server status message|int|750|0|3600|
cl_showmouserate|Print mouse rate debugging information to the console|bool|false|||
cl_shownet|Display network debugging information|int|0|-2|4|
cl_shownuments|Show the number of entities|bool|false|||
cl_showSend|Enable debugging information for sent commands|bool|false|||
cl_showServerCommands|Enable debugging information for server commands|bool|false|||
cl_showTimeDelta|Enable debugging information for time delta|bool|false|||
cl_stanceHoldTime|The time to hold the stance button before the player goes prone|int|300|0|1000|
cl_talking|Client is talking|bool|false|||
cl_timeout|Seconds with no received packets until a timeout occurs|float|40|0|3600|
cl_updateavailable|True if there is an available update|bool|false|||
cl_updatefiles|The file that is being updated|string|""|||
cl_updateoldversion|The version before update|string|""|||
cl_updateversion|The updated version|string|""|||
cl_voice|Use voice communications|bool|true|||
cl_wwwDownload|Download files via HTTP|bool|true|||
cl_yawspeed|Max yaw speed in degrees for game pad and keyboard|float|140|||
clientSideEffects|Enable loading _fx.gsc files on the client|bool|true|||
codkey||||||
com_animCheck|Check anim tree|bool|false|||
com_errorMessage|Most recent error message|string||||
com_errorTitle|Title of the most recent error message|string||||
com_filter_output|Use console filters for filtering output.|bool|false|||
com_introPlayed|Intro movie has been played|bool|false|||
com_maxfps|Cap frames per second|int|85|0|1000|
com_maxFrameTime|Time slows down if a frame takes longer than this many milliseconds|int|100|50|5000|
com_playerProfile|Player profile|string||||
com_recommendedSet|Use recommended settings|bool|false|||
com_statmon|Draw stats monitor|bool|false|||
com_timescale|Scale time of each frame|float|1|0.001|1000|
compass||bool|true|||
compassClampIcons|If true, friendlies and enemy pings clamp to the edge of the radar. If false, they disappear off the edge.|bool|true|||
compassCoords|x = North-South coord base value, y = East-West coord base value, z = scale (game units per coord unit)|vec3|740 3590 400|0||
compassECoordCutoff|Left cutoff for the scrolling east-west coords|float|37|0||
compassEnemyFootstepEnabled|Enables enemies showing on the compass because of moving rapidly nearby.|bool|false|||
compassEnemyFootstepMaxRange|The maximum distance at which an enemy may appear on the compass due to 'footsteps'|float|500|0||
compassEnemyFootstepMaxZ|The maximum vertical distance enemy may be from the player and appear on the compass due to 'footsteps'|float|100|0||
compassEnemyFootstepMinSpeed|The minimum speed an enemy must be moving to appear on the compass due to 'footsteps'|float|140|0||
compassFriendlyHeight|The size of the friendly icon on the compass|float|18.75|0||
compassFriendlyWidth|The size of the friendly icon on the compass|float|18.75|0||
compassMaxRange|The maximum range from the player in world space that objects will be shown on the compass|float|2500|0.0001||
compassMinRadius|The minimum radius from the center of the compass that objects will appear.|float|0.0001|0.0001||
compassMinRange|The minimum range from the player in world space that objects will appear on the compass|float|0.0001|0.0001||
compassObjectiveArrowHeight|The size of the objective arrow on the compass|float|20|0||
compassObjectiveArrowOffset|The offset of the objective arrow inward from the edge of the compass map|float|2|0||
compassObjectiveArrowRotateDist|Distance from the corner of the compass map at which the objective arrow rotates to 45 degrees|float|5|0||
compassObjectiveArrowWidth|The size of the objective arrow on the compass|float|20|0||
compassObjectiveDetailDist|When an objective is closer than this distance (in meters), the icon will not be drawn on the tickertape.|float|10|0.01||
compassObjectiveDrawLines|Draw horizontal and vertical lines to the active target, if it is within the minimap boundries|bool|true|||
compassObjectiveHeight|The size of the objective on the compass|float|20|0||
compassObjectiveIconHeight|The size of the objective on the full map|float|16|0||
compassObjectiveIconWidth|The size of the objective on the full map|float|16|0||
compassObjectiveMaxHeight|The maximum height that an objective is considered to be on this level|float|70|0||
compassObjectiveMaxRange|The maximum range at which an objective is visible on the compass|float|2048|0||
compassObjectiveMinAlpha|The minimum alpha for an objective at the edge of the compass|float|1|0|1|
compassObjectiveMinDistRange|The distance that objective transition effects play over, centered on compassObjectiveNearbyDist.|float|1|0.01||
compassObjectiveMinHeight|The minimum height that an objective is considered to be on this level|float|-70||0|
compassObjectiveNearbyDist|When an objective is closer than this distance (in meters), an "Objective Nearby" type of indicator is shown.|float|4|0.01||
compassObjectiveNumRings|The number of rings when a new objective appears|int|10|0|20|
compassObjectiveRingSize|The maximum objective ring sige when a new objective appears on the compass|float|80|0||
compassObjectiveRingTime|The amount of time between each ring when an objective appears|int|10000|0||
compassObjectiveTextHeight|Objective text height|float|18|1e-05||
compassObjectiveTextScale|Scale to apply to hud objectives|float|0.3|1e-05||
compassObjectiveWidth|The size of the objective on the compass|float|20|0||
compassPlayerHeight|The size of the player's icon on the compass|float|25|0||
compassPlayerWidth|The size of the player's icon on the compass|float|25|0||
compassRadarLineThickness|Thickness, relative to the compass size, of the radar texture that sweeps across the map|float|0.4|0.01|10|
compassRadarPingFadeTime|How long an enemy is visible on the compass after it is detected by radar|float|4|0.01|60|
compassRadarUpdateTime|Time between radar updates|float|4|0.01|60|
compassRotation|Style of compass|bool|true|||
compassSize|Scale the compass|float|1|0||
compassSoundPingFadeTime|The time in seconds for the sound overlay on the compass to fade|float|2|0|10|
compassTickertapeStretch|How far the tickertape should stretch from its center.|float|0.5|0.01|1|
con_default_console_filter|Default channel filter for the console destination.|string|*|||
con_errormessagetime|Onscreen time for error messages in seconds|float|8|0||
con_gameMsgWindow%dFadeInTime|Time to fade in new messages in game message window %d|||||
con_gameMsgWindow%dFadeOutTime|Time to fade out old messages in game message window %d|||||
con_gameMsgWindow%dLineCount|Maximum number of lines of text visible at once in game message window %d|||||
con_gameMsgWindow%dMsgTime|On screen time for game messages in seconds in game message window %d|||||
con_gameMsgWindow%dScrollTime|Time to scroll messages when the oldest message is removed in game message window %d|||||
con_gameMsgWindow%dSplitscreenScale|Scaling of game message window %d in splitscreen|||||
con_inputBoxColor|Color of the console input box|vec4|0.25 0.25 0.2 1|0|1|
con_inputHintBoxColor|Color of the console input hint box|vec4|0.4 0.4 0.35 1|0|1|
con_matchPrefixOnly|Only match the prefix when listing matching Dvars|bool|true|||
con_minicon|Display the mini console on screen|bool|false|||
con_miniconlines|Number of lines in the minicon message window|int|5|0|100|
con_minicontime|Onscreen time for minicon messages in seconds|float|4|0||
con_outputBarColor|Color of the console output slider bar|vec4|1 1 0.95 0.6|0|1|
con_outputSliderColor|Color of the console slider|vec4|0.15 0.15 0.1 0.6|0|1|
con_outputWindowColor|Color of the console output|vec4|0.35 0.35 0.3 0.75|0|1|
con_typewriterColorBase|Base color of typewritten objective text.|vec3|1 1 1|0|1|
con_typewriterColorGlowCheckpoint|Color of typewritten objective text.|vec4|0.6 0.5 0.6 1|0|1|
con_typewriterColorGlowCompleted|Color of typewritten objective text.|vec4|0 0.3 0.8 1|0|1|
con_typewriterColorGlowFailed|Color of typewritten objective text.|vec4|0.8 0 0 1|0|1|
con_typewriterColorGlowUpdated|Color of typewritten objective text.|vec4|0 0.6 0.18 1|0|1|
con_typewriterDecayDuration|Time (in milliseconds) to spend disolving the line away.|int|700|0||
con_typewriterDecayStartTime|Time (in milliseconds) to spend between the build and disolve phases.|int|6000|0||
con_typewriterPrintSpeed|Time (in milliseconds) to print each letter in the line.|int|50|0||
createserver_maps||||||
debug_protocol||||||
dedicated|Dedicated server|enum|2|0|2|listen server,dedicated LAN server,dedicated internet server
developer|Enable development options|int|0|0|2|
developer_script|Enable developer script comments|bool|false|||
dynEnt_active|Disable/enable dynent reactions|bool|true|||
dynEnt_bulletForce|Force applied from bullet hit|float|1000|0|1e+06|
dynEnt_explodeForce|Force applied from explosion hit|float|12500|0|1e+06|
dynEnt_explodeMaxEnts|The maximum number of dynents that can be awakened by one explosion|int|20|0|4096|
dynEnt_explodeMinForce|Force below which dynents won't even bother waking up|float|40|0||
dynEnt_explodeSpinScale|Scale of the random offset from the center of mass for explosion forces.|float|3|0|100|
dynEnt_explodeUpbias|Upward bias applied to force directions from explosion hits|float|0.5|0|2|
dynEntPieces_angularVelocity|Initial breakable pieces angular velocity|vec3|0 0 0|-180|180|
dynEntPieces_impactForce|Force applied when breakable is destroyed|float|1000|0|1e+06|
dynEntPieces_velocity|Initial breakable pieces velocity|vec3|0 0 0|-1000|1000|
fixedtime|Use a fixed time rate for each frame|int|0|0|1000|
friction|Player friction|float|5.5|0|100|
fs_basegame|Base game name|string||||
fs_basepath|Base game path|string||||
fs_cdpath|CD path|string||||
fs_copyfiles|Copy all used files to another location|bool|false|||
fs_debug|Enable file system debugging information|int|0|0|2|
fs_game|game name|string|""|||
fs_homepath|Game home path|string||||
fs_ignoreLocalized|Ignore localized assets|bool|false|||
fs_restrict|Restrict file access for demos etc.|bool|false|||
fs_usedevdir|Use development directories.|||||
fx_count|Debug effects count|bool|false|||
fx_cull_effect_spawn|Culls entire effects for spawning|bool|false|||
fx_cull_elem_draw|Culls effect elems for drawing|bool|true|||
fx_cull_elem_spawn|Culls effect elems for spawning|bool|true|||
fx_debugBolt|Debug effects bolt|float|0|0|100|
fx_draw|Toggles drawing of effects after processing|bool|true|||
fx_drawClouds|Toggles the drawing of particle clouds|bool|true|||
fx_enable|Toggles all effects processing|bool|true|||
fx_freeze|Freeze effects|bool|false|||
fx_mark_profile|Turn on FX profiling for marks (specify which local client, with '1' being the first.)|int|0|0|1|
fx_marks|Toggles whether bullet hits leave marks|bool|true|||
fx_marks_ents|Toggles whether bullet hits leave marks on entities|bool|true|||
fx_marks_smodels|Toggles whether bullet hits leave marks on static models|bool|true|||
fx_profile|Turn on FX profiling (specify which local client, with '1' being the first.)|int|0|0|1|
fx_visMinTraceDist|Minimum visibility trace size|float|80|0|1000|
g_allowVote|Enable voting on this server|bool|true|||
g_allowvote||bool|true|||
g_antilag|Turn on antilag checks for weapon hits|bool|true|||
g_banIPs|IP addresses to ban from playing|string||||
g_clonePlayerMaxVelocity|Maximum velocity in each axis of a cloned player (for death animations)|float|80|0||
g_compassShowEnemies|Whether enemies are visible on the compass at all times|bool|false|||
g_deadChat|Allow dead players to chat with living players|bool|false|||
g_debugBullets|Show debug information for bullets|int|0|-3|6|
g_debugDamage|Show debug information for damage|bool|false|||
g_debugLocDamage|Turn on debugging information for locational damage|bool|false|||
g_dropForwardSpeed|Forward speed of a dropped item|float|10|0|1000|
g_dropHorzSpeedRand|Random component of the initial horizontal speed of a dropped item|float|100|0|1000|
g_dropUpSpeedBase|Base component of the initial vertical speed of a dropped item|float|10|0|1000|
g_dropUpSpeedRand|Random component of the initial vertical speed of a dropped item|float|5|0|1000|
g_dumpAnims|Animation debugging info for the given character number|int|-1|-1|1023|
g_entinfo|Display entity information|enum|0|0|1|off,all ents
g_fogColorReadOnly|Fog color that was set in the most recent call to "setexpfog"|color|1 0 0 1|0|1|
g_fogHalfDistReadOnly|Fog start distance that was set in the most recent call to "setexpfog"|float|0.1|0||
g_fogStartDistReadOnly|Fog start distance that was set in the most recent call to "setexpfog"|float|0|0||
g_friendlyfireDist|Maximum range for disabling fire at a friendly|float|175|0|15000|
g_friendlyNameDist|Maximum range for seeing a friendly's name|float|15000|0|15000|
g_gametype|Setting state to CA_LOADING in CL_DownloadsComplete|string|war|||
g_gravity|Game gravity in inches per second per second|float|800|1||
g_inactivity|Time delay before player is kicked for inactivity|int|0|0||
g_knockback|Maximum knockback|float|1000|||
g_listEntity|List the entities|bool|false|||
g_log|Log file name|string|games_mp.log|||
g_logSync|Enable synchronous logging|bool|false|||
g_mantleBlockTimeBuffer|Time that the client think is delayed after mantling|int|500|0|60000|
g_maxDroppedWeapons|Maximum number of dropped weapons|int|16|2|32|
g_minGrenadeDamageSpeed|Minimum speed at which getting hit be a grenade will do damage (not the grenade explosion damage)|float|400|0||
g_motd|The message of the day|string||||
g_no_script_spam|Turn off script debugging info|bool|false|||
g_oldVoting|Use old voting method|bool|true|||
g_password||string||||
g_playerCollisionEjectSpeed|Speed at which to push intersecting players away from each other|int|25|0|32000|
g_redCrosshairs|Whether red crosshairs are enabled|bool|true|||
g_ScoresColor_Allies|Allies team color on scoreboard|color|0.09 0.46 0.07 1|0|1|
g_ScoresColor_Axis|Axis team color on scoreboard|color|0.69 0.07 0.05 1|0|1|
g_ScoresColor_EnemyTeam|Enemy team color on scoreboard|color|0.69 0.07 0.05 1|0|1|
g_ScoresColor_Free|Free Team color on scoreboard|color|0.76 0.78 0.1 1|0|1|
g_ScoresColor_MyTeam|Player team color on scoreboard|color|0.25 0.72 0.25 1|0|1|
g_ScoresColor_Spectator|Spectator team color on scoreboard|color|0.25 0.25 0.25 1|0|1|
g_smoothClients|Enable extrapolation between client states|bool|true|||
g_speed|Player speed|int|190||7|
g_synchronousClients|Client is synchronized to the server - allows smooth demos|bool|false|||
g_TeamColor_Allies|Allies team color|color|0.6 0.64 0.69 1|0|1|
g_TeamColor_Axis|Axis team color|color|0.65 0.57 0.41 1|0|1|
g_TeamColor_EnemyTeam|Enemy team color|color|0.75 0.25 0.25 1|0|1|
g_TeamColor_Free|Free Team color|color|0.75 0.25 0.25 1|0|1|
g_TeamColor_MyTeam|Player team color|color|0.4 0.6 0.85 1|0|1|
g_TeamColor_Spectator|Spectator team color|color|0.25 0.25 0.25 1|0|1|
g_TeamIcon_Allies|Shader name for the allied scores banner|string|faction_128_usmc|||
g_TeamIcon_Axis|Shader name for the axis scores banner|string|faction_128_arab|||
g_TeamIcon_Free|Shader name for the scores of players with no team|string||||
g_TeamIcon_Spectator|Shader name for the scores of players who are spectators|string||||
g_TeamName_Allies|Allied team name|string|GAME_ALLIES|||
g_TeamName_Axis|Axis team name|string|GAME_AXIS|||
g_useholdspawndelay|Time in milliseconds that the player is unable to 'use' after spawning|int||0|1000|
g_useholdtime|Time to hold the 'use' button to activate use|int|0|0||
g_voiceChatTalkingDuration|Time after the last talk packet was received that the player is considered by the server to still be talking in milliseconds|int|500|0|10000|
g_voteAbstainWeight|How much an abstained vote counts as a 'no' vote|float|0.5|0|1|
gamedate|May 1 2018|string|Sep  7 2007|||
gamename|Call of Duty 4|string|main|||
heli_barrelMaxVelocity||float|1250|-360||
heli_barrelRotation|How much to rotate the turret barrel when a helicopter fires|float|70|-360|360|
heli_barrelSlowdown||float|360|-360||
hiDef|True if the game video is running in high-def.|bool|true|||
hud_deathQuoteFadeTime|The time for the death quote to fade|int|1000|0|100000|
hud_enable|Enable hud elements|bool|true|||
hud_fade_ammodisplay|The time for the ammo display to fade in seconds|float|8|0|30|
hud_fade_compass|The time for the compass to fade in seconds|float|8|0|30|
hud_fade_healthbar|The time for the health bar to fade in seconds|float|2|0|30|
hud_fade_offhand|The time for the offhand weapons to fade in seconds|float|8|0|30|
hud_fade_sprint|The time for the sprint meter to fade in seconds|float|1.7|0|30|
hud_fade_stance|The time for the stance to fade in seconds|float|1.7|0|30|
hud_fadeout_speed|The speed that the HUD will fade at|float|0.1|0|1|
hud_flash_period_offhand|Offhand weapons flash period on changing weapon|float|0.5|0|30|
hud_flash_time_offhand|Offhand weapons flash duration on changing weapon|float|2|0|30|
hud_health_pulserate_critical|The pulse rate of the 'critical' pulse effect|float|0.5|0.1|3|
hud_health_pulserate_injured|The pulse rate of the 'injured' pulse effect|float|1|0.1|3|
hud_health_startpulse_critical|The health level at which to start the 'critical' pulse effect|float|0.33|0|1.1|
hud_health_startpulse_injured|The health level at which to start the 'injured' pulse effect|float|1|0|1.1|
hud_healthOverlay_phaseEnd_pulseDuration|Time in milliseconds to fade out the health overlay after it is done flashing|int|700|0|1000|
hud_healthOverlay_phaseEnd_toAlpha|Alpha multiplier to fade to before turning off the overlay (percentage of the pulse peak)|float|0|0|1|
hud_healthOverlay_phaseOne_pulseDuration|Time in milliseconds to ramp up to the first alpha value (the peak of the pulse)|int|150|0|1000|
hud_healthOverlay_phaseThree_pulseDuration|Time in milliseconds to fade the alpha to hud_healthOverlay_phaseThree_toAlphaMultiplier|int|400|0|1000|
hud_healthOverlay_phaseThree_toAlphaMultiplier|Alpha multiplier for the third health overlay phase (percentage of the pulse peak)|float|0.6|0|1|
hud_healthOverlay_phaseTwo_pulseDuration|Time in milliseconds to fade the alpha to hud_healthOverlay_phaseTwo_toAlphaMultiplier|int|320|0|1000|
hud_healthOverlay_phaseTwo_toAlphaMultiplier|Alpha multiplier for the second health overlay phase (percentage of the pulse peak)|float|0.7|0|1|
hud_healthOverlay_pulseStart|The percentage of full health at which the low-health warning overlay begins flashing|float|0.35|0|1|
hud_healthOverlay_regenPauseTime|The time in milliseconds before the health regeneration kicks in|int|8000|0|10000|
hudElemPausedBrightness|Brightness of the hudelems when the game is paused.|float|0.4|0|1|
in_mouse|Initialize the mouse drivers|bool|true|||
inertiaAngle|The cosine of the angle at which inertia occurs|float|0|-1|1|
inertiaDebug|Show inertia debug information|bool|false|||
inertiaMax|Maximum player inertia|float|50|0|1000|
jump_height|The maximum height of a player's jump|float|39|0|1000|
jump_ladderPushVel|The velocity of a jump off of a ladder|float|128|0|1024|
jump_slowdownEnable|Slow player movement after jumping|bool|true|||
jump_spreadAdd|The amount of spread scale to add as a side effect of jumping|float|64|0|512|
jump_stepSize|The maximum step up to the top of a jump arc|float|18|0|64|
loc_forceEnglish|Force english localized strings|bool|false|||
loc_language|The current language locale|int|0|0|14|
loc_translate|Turn on string translation|bool|true|||
loc_warnings|Enable localization warnings|bool|false|||
loc_warningsAsErrors|Throw an error for any unlocalized string|bool|false|||
logfile|Write to log file - 0 = disabled, 1 = async file write, 2 = Sync every write|int|1|0|2|
lowAmmoWarningColor1|Color 1 of 2 to oscilate between|color|0.9 0.9 0.9 0.8|0|1|
lowAmmoWarningColor2|Color 2 of 2 to oscilate between|color|1 1 1 1|0|1|
lowAmmoWarningNoAmmoColor1|Like lowAmmoWarningColor1, but when no ammo.|color|0.8 0 0 0.8|0|1|
lowAmmoWarningNoAmmoColor2|lowAmmoWarningColor2, but when no ammo.|color|1 0 0 1|0|1|
lowAmmoWarningNoReloadColor1|Like lowAmmoWarningColor1, but when no ammo to reload with.|color|0.7 0.7 0 0.8|0|1|
lowAmmoWarningNoReloadColor2|lowAmmoWarningColor2, but when no ammo to reload with.|color|1 1 0 1|0|1|
lowAmmoWarningPulseFreq|Frequency of the pulse (oscilation between the 2 colors)|float|1.7|0||
lowAmmoWarningPulseMax|Min of oscilation range: 0 is color1 and 1.0 is color2. Can be < 0, and the wave will clip at 0.|float|1.5|0||
lowAmmoWarningPulseMin|Max of oscilation range: 0 is color1 and 1.0 is color2. Can be > 1.0, and the wave will clip at 1.0.|float|0||1|
m_filter|Allow mouse movement smoothing|bool|false|||
m_forward|Forward speed in units per second|float|0.25|-1|1|
m_pitch|External Dvar|float|0.022|-1|1|
m_side|Sideways motion in units per second|float|0.25|-1|1|
m_yaw|Default yaw|float|0.022|-1|1|
mantle_check_angle|The minimum angle from the player to a mantle surface to allow a mantle|float|60|0|180|
mantle_check_radius|The player radius to test against while mantling|float|0.1|0|15|
mantle_check_range|The minimum distance from a player to a mantle surface to allow a mantle|float|20|0|128|
mantle_debug|Show debug information for mantling|bool|false|||
mantle_enable|Enable player mantling|bool|true|||
mantle_view_yawcap|The angle at which to restrict a sideways turn while mantling|float|60|0|180|
mapname|The current map name|string|""|||
masterPort|Master server port|int|20810|0||
masterServerName|Master server name for listing public inet games|string|cod4master.activision.com|||
melee_debug|Turn on debug lines for melee traces|bool|false|||
missileDebugAttractors|Draw the attractors and repulsors. Attractors are green, and repulsors are yellow.|bool|false|||
missileDebugDraw|Draw guided missile trajectories.|bool|false|||
missileDebugText|Print debug missile info to console.|bool|false|||
missileHellfireMaxSlope|This limits how steeply the hellfire missile can turn upward when climbing|float|0.5|0||
missileHellfireUpAccel|The rate at which the hellfire missile curves upward|float|1000|0.1||
missileJavAccelClimb|Rocket acceleration when climbing.|float|300|0||
missileJavAccelDescend|Rocket acceleration when descending towards target.|float|3000|0||
missileJavClimbAngleDirect|In direct-fire mode, the minimum angle between the rocket and target until the rocket stops climbing. Smaller angles make for higher climbs.|float|85|0||
missileJavClimbAngleTop|In top-fire mode, the minimum angle between the rocket and target until the rocket stops climbing. Smaller angles make for higher climbs.|float|50|0||
missileJavClimbCeilingDirect|In direct-fire mode, how high the missile needs to reach before it descends.|float|0|0||
missileJavClimbCeilingTop|In top-fire mode, how high the missile needs to reach before it descends.|float|3000|0||
missileJavClimbHeightDirect|In direct-fire mode, how far above the target the rocket will aim for when climbing.|float|10000|0||
missileJavClimbHeightTop|In top-fire mode, how far above the target the rocket will aim for when climbing.|float|15000|0||
missileJavClimbToOwner||float|700|0||
missileJavSpeedLimitClimb|Rocket's speed limit when climbing.|float|1000|0||
missileJavSpeedLimitDescend|Rocket's speed limit when descending towards target.|float|6000|0||
missileJavTurnDecel||float|0.05|0|1|
missileJavTurnRateDirect|In direct-fire mode, how sharp the rocket can turn, in angles/sec.|float|60|0||
missileJavTurnRateTop|In top-fire mode, how sharp the rocket can turn, in angles/sec.|float|100|0||
missileWaterMaxDepth|If a missile explodes deeper under water than this, they explosion effect/sound will not play.|float|60|0||
mod|----- Initializing Renderer ----|||||
monkeytoy|Restrict console access|bool|true|||
motd|Message of the day|string|""|||
msg_dumpEnts|Print snapshot entity info|bool|false|||
msg_hudelemspew|Debug hudelem fields changing|bool|false|||
msg_printEntityNums|Print entity numbers|bool|false|||
name|Player name|string|""|||
net_ip|Network IP Address|string|localhost|||
net_lanauthorize|Authorise CD keys when using a LAN|bool|false|||
net_noipx|Disable IPX|bool|false|||
net_noudp|Disable UDP|bool|false|||
net_port|Network port|int|28960|0|65535|
net_profile|Profile network performance|int|0|0|2|
net_showprofile|Show network profiling display|int|0|0|3|
net_socksEnabled|Enable network sockets|bool|false|||
net_socksPassword|Network socket password|string|""|||
net_socksPort|Network socket port|int|1080|0|65535|
net_socksServer|Network socket server|string|""|||
net_socksUsername|Network socket username|string|""|||
nextdemo|The next demo to play|string|""|||
nextmap|Next map to play|string|""|||
nightVisionDisableEffects||bool|false|||
nightVisionFadeInOutTime|How long the fade to/from black lasts when putting on or removing night vision goggles.|float|0.1|0|10000|
nightVisionPowerOnTime|How long the black-to-nightvision fade lasts when turning on the goggles.|float|0.3|0|10000|
onlinegame|Current game is an online game with stats, custom classes, unlocks|bool|true|||
overrideNVGModelWithKnife|When true, nightvision animations will attach the weapDef's knife model instead of the night vision goggles.|bool|false|||
packetDebug|Enable packet debugging information|bool|false|||
password||string|""|||
perk_bulletPenetrationMultiplier|Multiplier for extra bullet penetration|float|2|0|30|
perk_extraBreath|Number of extra seconds a player can hold his breath|float|5|0||
perk_grenadeDeath|Name of the grenade weapon to drop|string|frag_grenade_short_mp|||
perk_parabolicAngle|Eavesdrop perk's effective FOV angle|float|180|0|180|
perk_parabolicIcon|Eavesdrop icon to use when displaying eavesdropped voice chats|string|specialty_parabolic|||
perk_parabolicRadius|Eavesdrop perk's effective radius|float|400|0||
perk_sprintMultiplier|Multiplier for player_sprinttime|float|2|0||
perk_weapRateMultiplier|Percentage of weapon firing rate to use|float|0.75|0|1|
perk_weapReloadMultiplier|Percentage of weapon reload time to use|float|0.5|0|1|
perk_weapSpreadMultiplier|Percentage of weapon spread to use|float|0.65|0|1|
phys_autoDisableAngular|A body must have angular velocity less than this to be considered idle.|float|1|0||
phys_autoDisableLinear|A body must have linear velocity less than this to be considered idle.|float|20|0||
phys_autoDisableTime|The amount of time a body must be idle for it to go to sleep.|float|0.9|0||
phys_bulletSpinScale|Scale of the effective offset from the center of mass for the bullet impacts.|float|3|-1|100|
phys_bulletUpBias|Up Bias for the direction of the bullet impact.|float|0.5|0|2|
phys_cfm|Physics constraint force mixing magic parameter.|float|0.0001|0|1|
phys_collUseEntities|Disable to turn off testing for collision against entities|bool|false|||
phys_contact_cfm|Physics constraint force mixing magic parameter for contacts.|float|1e-05|0|1|
phys_contact_cfm_ragdoll|Physics constraint force mixing magic parameter for contacts.|float|0.001|0|1|
phys_contact_erp|Physics error reduction magic parameter for contacts.|float|0.8|0|1|
phys_contact_erp_ragdoll|Physics error reduction magic parameter for contacts.|float|0.3|0|1|
phys_csl|Physics contact surface level magic parameter.|float|1|||
phys_dragAngular|The amount of angular drag, applied globally|float|0.5|0||
phys_dragLinear|The amount of linear drag, applied globally|float|0.03|0||
phys_drawAwake|Debug draw a box indicating which bodies are disabled|bool|false|||
phys_drawAwakeTooLong|Draw an indicator showing where the objects are that have been awake too long.|bool|false|||
phys_drawCollisionObj|Debug draw collision geometry for each physics object|bool|false|||
phys_drawCollisionWorld|Debug draw collision brushes and terrain triangles|bool|false|||
phys_drawcontacts|Debug draw contact points|bool|false|||
phys_drawDebugInfo|Print info about the physics objects|bool|false|||
phys_dumpcontacts|Set to true to dump all constraints in next physics frame.|bool|false|||
phys_erp|Physics error reduction magic parameter.|float|0.8|0|1|
phys_frictionScale|Scales the amount of physics friction globally.|float|1|0||
phys_gravity|Physics gravity in units/sec^2.|float|-800|||
phys_gravityChangeWakeupRadius|The radius around the player within which objects get awakened when gravity changes|float|120|0||
phys_interBodyCollision|Disable to turn off all inter-body collisions|bool|false|||
phys_jitterMaxMass|Maximum mass to jitter - jitter will fall off up to this mass|float|200|0.1||
phys_joint_cfm|Physics constraint force mixing magic parameter for joints.|float|0.0001|0|1|
phys_joint_stop_cfm|Physics constraint force mixing magic parameter for joints at their limits.|float|0.0001|0|1|
phys_joint_stop_erp|Physics error reduction magic parameter for joints at their limits.|float|0.8|0|1|
phys_mcv|Physics maximum correcting velocity magic parameter.|float|20|||
phys_mcv_ragdoll|Physics maximum correcting velocity magic parameter (for ragdoll).|float|1000|||
phys_minImpactMomentum|The minimum momentum required to trigger impact sounds|float|250|0||
phys_narrowObjMaxLength|If a geom has a dimension less than this, then extra work will be done to prevent it from falling into cracks (like between the wall and the floor)|float|4|0||
phys_noIslands|Make all contacts joints between an object and the world: no object-object contacts|bool|false|||
phys_qsi|Number of iterations that QuickStep performs per step.|int|15|1||
phys_reorderConst|ODE solver reorder constraints|bool|true|||
phys_visibleTris|Visible triangles are used for collision|bool|false|||
pickupPrints|Print a message to the game window when picking up ammo, etc.|bool|false|||
player_adsExitDelay|Delay before exiting aim down sight|int|0|0|1000|
player_backSpeedScale|The scale applied to the player speed when moving backwards|float|0.7|0|20|
player_breath_fire_delay|The amount of time subtracted from the player remaining breath time when a weapon is fired|float|0|0|30|
player_breath_gasp_lerp|The interpolation rate for the target waver amplitude when gasping|float|6|0|50|
player_breath_gasp_scale|Scale value to apply to the target waver during a gasp|float|4.5|0|50|
player_breath_gasp_time|The amount of time a player will gasp once they can breath again|float|1|0|30|
player_breath_hold_lerp|The interpolation rate for the target waver amplitude when holding breath|float|1|0|50|
player_breath_hold_time|The maximum time a player can hold his breath|float|4.5|0|30|
player_breath_snd_delay|The delay before playing the breathe in sound|float|1|0|2|
player_breath_snd_lerp|The interpolation rate for the player hold breath sound|float|2|0|100|
player_burstFireCooldown|Seconds after a burst fire before weapons can be fired again.|float|0.2|0|60|
player_debugHealth|Turn on debugging info for player health|bool|false|||
player_dmgtimer_flinchTime|Maximum time to play flinch animations|int|500|0|2000|
player_dmgtimer_maxTime|The maximum time that the player is slowed due to damage|float|750|0||
player_dmgtimer_minScale|The minimum scale value to slow the player by when damaged|float|0|0|1|
player_dmgtimer_stumbleTime|Maximum time to play stumble animations|int|500|0|2000|
player_dmgtimer_timePerPoint|The time in milliseconds that the player is slowed down per point of damage|float|100|0||
player_footstepsThreshhold|The minimum speed at which the player makes loud footstep noises|float|0|0|50000|
player_lean_rotate_crouch_left|Amount to rotate the player 3rd person model when crouch leaning left|float|1.25|0|3|
player_lean_rotate_crouch_right|Amount to rotate the player 3rd person model when crouch leaning right|float|1|0|3|
player_lean_rotate_left|Amount to rotate the player 3rd person model when leaning left|float|1.25|0|3|
player_lean_rotate_right|Amount to rotate the player 3rd person model when leaning right|float|1.25|0|3|
player_lean_shift_crouch_left|Amount to shift the player 3rd person model when crouch leaning left|float|12.5|0|20|
player_lean_shift_crouch_right|Amount to shift the player 3rd person model when crouch leaning right|float|13|0|20|
player_lean_shift_left|Amount to shift the player 3rd person model when leaning left|float|5|0|20|
player_lean_shift_right|Amount to shift the player 3rd person model when leaning right|float|2.5|0|20|
player_meleeChargeFriction|Friction used during melee charge|float|1200|1|5000|
player_meleeHeight|The height of the player's melee attack|float|10|0|1000|
player_meleeRange|The maximum range of the player's mellee attack|float|64|0|1000|
player_meleeWidth|The width of the player's melee attack|float|10|0|1000|
player_MGUseRadius|The radius within which a player can mount a machine gun|float|128|0||
player_move_factor_on_torso|The contribution movement direction has on player torso direction(multi-player only)|float|0|0|1|
player_moveThreshhold|The speed at which the player is considered to be moving for the purposes of view model bob and multiplayer model movement|float|10|1e-08|20|
player_scopeExitOnDamage|Exit the scope if the player takes damage|bool|false|||
player_spectateSpeedScale|The scale applied to the player speed when spectating|float|1|0|20|
player_sprintCameraBob|The speed the camera bobs while you sprint|float|0.5|0|2|
player_sprintForwardMinimum|The minimum forward deflection required to maintain a sprint|int|105|0|255|
player_sprintMinTime|The minimum sprint time needed in order to start sprinting|float|1|0|12.8|
player_sprintRechargePause|The length of time the meter will pause before starting to recharge after a player sprints|float|0|0|9000|
player_sprintSpeedScale|The scale applied to the player speed when sprinting|float|1.5|0|5|
player_sprintStrafeSpeedScale|The speed at which you can strafe while sprinting|float|0.667|0|5000|
player_sprintTime|The base length of time a player can sprint|float|4|0|12.8|
player_strafeAnimCosAngle|Cosine of the angle which player starts using strafe animations|float|0.5|0|1|
player_strafeSpeedScale|The scale applied to the player speed when strafing|float|0.8|0|20|
player_sustainAmmo|Firing weapon will not decrease clip ammo.|bool|false|||
player_throwbackInnerRadius|The radius to a live grenade player must be within initially to do a throwback|float|72|0||
player_throwbackOuterRadius|The radius player is allow to throwback a grenade once the player has been in the inner radius|float|192|0||
player_turnAnims|Use animations to turn a player's model in multiplayer|bool|false|||
player_view_pitch_down|Maximum angle that the player can look down|float|85|0|90|
player_view_pitch_up|Maximum angle that the player can look up|float|85|0|90|
profile_delete_fail_popmenu|Could not find menu '%s'|||||
profile_exists_popmenu|Could not find menu '%s'|||||
protocol|Protocol version|int|1|1|1|
r_aaAlpha|Transparency anti-aliasing method|enum|1|0|2|off,dither (fast),supersample (nice)
r_aaSamples|Anti-aliasing sample count; 1 disables anti-aliasing|int|1|1|16|
r_altModelLightingUpdate|Use alternate model lighting update technique|bool|true|||
r_aspectRatio|Screen aspect ratio. Most widescreen monitors are 16:10 instead of 16:9.|enum||||
r_autopriority|Automatically set the priority of the windows process when the game is minimized|bool|false|||
r_blur|Dev tweak to blur the screen|float|0|0|32|
r_brightness|Brightness adjustment|float|0|-1|1|
r_cacheModelLighting|Speed up model lighting by caching previous results|bool|true|||
r_cacheSModelLighting|Speed up static model lighting by caching previous results|bool|true|||
r_clear|Controls how the color buffer is cleared|enum|1|0|4|never,dev-only blink,blink,steady,fog color
r_clearColor|Color to clear the screen to when clearing the frame buffer|color|0.5 0.75 1 1|0|1|
r_clearColor2|Color to clear every second frame to (for use during development)|color|1 0.5 0 1|0|1|
r_colorMap|Replace all color maps with pure black or pure white|enum|1|0|3|Black,Unchanged,White,Gray
r_contrast|Contrast adjustment|float|1|0|4|
r_customMode|Special resolution mode for the remote debugger|string||||
r_debugLineWidth|Width of server side debug lines|float|1|0|16|
r_debugShader|Enable shader debugging information|enum|0|0|4|none,normal,basisTangent,basisBinormal,basisNormal
r_depthPrepass|Enable depth prepass (usually improves performance)|bool|false|||
r_desaturation|Desaturation adjustment|float|1|0|4|
r_detail|Allows shaders to use detail textures|bool|true|||
r_diffuseColorScale|Globally scale the diffuse color of all point lights|float|1|0|100|
r_displayRefresh|Refresh rate|enum||||
r_distortion|Enable distortion|bool|true|||
r_dlightLimit|Maximum number of dynamic lights drawn simultaneously|int|4|0|4|
r_dof_bias|Depth of field bias as a power function (like gamma); less than 1 is sharper|float|0.5|0.1|3|
r_dof_enable|Enable the depth of field effect|bool|true|||
r_dof_farBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480|float|1.8|0|10|
r_dof_farEnd|Depth of field far end distance, in inches|float|7000|0|20000|
r_dof_farStart|Depth of field far start distance, in inches|float|1000|0|20000|
r_dof_nearBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480|float|6|4|10|
r_dof_nearEnd|Depth of field near end distance, in inches|float|60|0|1000|
r_dof_nearStart|Depth of field near start distance, in inches|float|10|0|1000|
r_dof_tweak|Use dvars to set the depth of field effect; overrides r_dof_enable|bool|false|||
r_dof_viewModelEnd|Depth of field viewmodel end distance, in inches|float|8|0|128|
r_dof_viewModelStart|Depth of field viewmodel start distance, in inches|float|2|0|128|
r_drawDecals|Enable world decal rendering|bool|true|||
r_drawSun|Enable sun effects|bool|true|||
r_drawWater|Enable water animation|bool|true|||
r_envMapExponent|Reflection exponent.|float|5|0.05|20|
r_envMapMaxIntensity|Max reflection intensity based on glancing angle.|float|0.5|0.01|2|
r_envMapMinIntensity|Min reflection intensity based on glancing angle.|float|0.2|0|2|
r_envMapOverride|Min reflection intensity based on glancing angle.|bool|false|||
r_envMapSpecular|Enables environment map specular lighting|bool|true|||
r_envMapSunIntensity|Max sun specular intensity intensity with env map materials.|float|2|0|4|
r_fastSkin|Enable fast model skinning|bool|false|||
r_filmTweakBrightness|Tweak dev var; film color brightness|float|0|-1|1|
r_filmTweakContrast|Tweak dev var; film color contrast|float|1.4|0|4|
r_filmTweakDarkTint|Tweak dev var; film color dark tint color|vec3|0.7 0.85 1|0|2|
r_filmTweakDesaturation|Tweak dev var; Desaturation applied after all 3D drawing|float|0.2|0|1|
r_filmTweakEnable|Tweak dev var; enable film color effects|bool|false|||
r_filmTweakInvert|Tweak dev var; enable inverted video|bool|false|||
r_filmTweakLightTint|Tweak dev var; film color light tint color|vec3|1.1 1.05 0.85|0|2|
r_filmUseTweaks|Overide film effects with tweak dvar values.|bool|false|||
r_floatz|Allocate a float z buffer (required for effects such as floatz, dof, and laser light)|bool|true|||
r_fog|Set to 0 to disable fog|bool|true|||
r_forceLod|Force all level of detail to this level|enum|4|0|4|high,medium,low,lowest,none
r_fullbright|Toggles rendering without lighting|bool|false|||
r_fullscreen|Display game full screen|bool|false|||
r_gamma|Gamma value|float|0.8|0.5|3|
r_glow|Enable glow.|bool|true|||
r_glow_allowed|Allow glow.|bool|true|||
r_glow_allowed_script_forced|Force 'allow glow' to be treated as true, by script.|bool|false|||
r_glowTweakBloomCutoff|Tweak dev var; Glow bloom cut off fraction|float|0.5|0|1|
r_glowTweakBloomDesaturation|Tweak dev var; Glow bloom desaturation|float|0|0|1|
r_glowTweakBloomIntensity0|Tweak dev var; Glow bloom intensity|float|1|0|20|
r_glowTweakEnable|Tweak dev var; Enable glow|bool|false|||
r_glowTweakRadius0|Tweak dev var; Glow radius in pixels at 640x480|float|5|0|32|
r_glowUseTweaks|Overide glow with tweak dvar values.|bool|false|||
r_gpuSync|GPU synchronization type (used to improve mouse responsiveness)|enum|1|0|2|off,adaptive,aggressive
r_highLodDist|Distance for high level of detail|float|-1|-1||
r_ignore|used for debugging anything|int|0|||
r_ignorehwgamma|Ignore hardware gamma|bool|false|||
r_inGameVideo|Allow in game cinematics|bool|true|||
r_lightMap|Replace all lightmaps with pure black or pure white|enum|1|0|3|Black,Unchanged,White,Gray
r_lightTweakAmbient|Ambient light strength|float|0.1|0|4|
r_lightTweakAmbientColor|Light ambient color|color|1 0 0 1|0|1|
r_lightTweakDiffuseFraction|diffuse light fraction|float|0.5|0|1|
r_lightTweakSunColor|Sun color|color|0 1 0 1|0|1|
r_lightTweakSunDiffuseColor|Sun diffuse color|color|0 0 1 1|0|1|
r_lightTweakSunDirection|Sun direction in degrees|vec3|0 0 0|-360|360|
r_lightTweakSunLight|Sunlight strength|float|1|0|4|
r_loadForRenderer|Set to false to disable dx allocations (for dedicated server mode)|bool|true|||
r_lockPvs|Lock the viewpoint used for determining what is visible to the current position and direction|bool|false|||
r_lodBiasRigid|Bias the level of detail distance for rigid models (negative increases detail)|float|0|||
r_lodBiasSkinned|Bias the level of detail distance for skinned models (negative increases detail)|float|0|||
r_lodScaleRigid|Scale the level of detail distance for rigid models (larger reduces detail)|float|1|0||
r_lodScaleSkinned|Scale the level of detail distance for skinned models (larger reduces detail)|float|1|0||
r_logFile|Write all graphics hardware calls for this many frames to a logfile|int|0|0||
r_lowestLodDist|Distance for lowest level of detail|float|-1|-1||
r_lowLodDist|Distance for low level of detail|float|-1|-1||
r_mediumLodDist|Distance for medium level of detail|float|-1|-1||
r_mode|Direct X resolution mode|enum||||
r_modelVertColor|Set to 0 to replace all model vertex colors with white when loaded|bool|true|||
r_monitor|Index of the monitor to use in a multi monitor system; 0 picks automatically.|int|0|0|8|
r_multiGpu|Use multiple GPUs|bool|false|||
r_norefresh|Skips all rendering. Useful for benchmarking.|bool|false|||
r_normal|Allows shaders to use normal maps|bool|true|||
r_normalMap|Replace all normal maps with a flat normal map|enum|1|0|1|Flat,Unchanged
r_outdoor|Prevents snow from going indoors|bool|true|||
r_outdoorAwayBias|Affects the height map lookup for making sure snow doesn't go indoors|float|32|||
r_outdoorDownBias|Affects the height map lookup for making sure snow doesn't go indoors|float|0|||
r_outdoorFeather|Outdoor z-feathering value|float|8|||
r_picmip|Picmip level of color maps. If r_picmip_manual is 0, this is read-only.|int|0|0|3|
r_picmip_bump|Picmip level of normal maps. If r_picmip_manual is 0, this is read-only.|int|0|0|3|
r_picmip_manual|If 0, picmip is set automatically. If 1, picmip is set based on the other r_picmip dvars.|bool|false|||
r_picmip_spec|Picmip level of specular maps. If r_picmip_manual is 0, this is read-only.|int|0|0|3|
r_picmip_water|Picmip level of water maps.|int|0|0|1|
r_polygonOffsetBias|Offset bias for decal polygons; bigger values z-fight less but poke through walls more|float|-1|-16|0|
r_polygonOffsetScale|Offset scale for decal polygons; bigger values z-fight less but poke through walls more|float|-1|-4|0|
r_portalBevels|Helps cull geometry by angles of portals that are acute when projected onto the screen, value is the cosine of the angle|float|0.7|0|1|
r_portalBevelsOnly|Use screen-space bounding box of portals rather than the actual shape of the portal projected onto the screen|bool|false|||
r_portalMinClipArea|Don't clip child portals by a parent portal smaller than this fraction of the screen area.|float|0.02|0|1|
r_portalMinRecurseDepth|Ignore r_portalMinClipArea for portals with fewer than this many parent portals.|int|2|0|100|
r_portalWalkLimit|Stop portal recursion after this many iterations. Useful for debugging portal errors.|int|0|0|100|
r_preloadShaders|Force D3D to draw dummy geometry with all shaders during level load; may fix long pauses at level start.|bool|false|||
r_pretess|Batch surfaces to reduce primitive count|bool|true|||
r_reflectionProbeGenerate|Generate cube maps for reflection probes.|bool|false|||
r_reflectionProbeGenerateExit|Exit when done generating reflection cubes.|bool|false|||
r_reflectionProbeRegenerateAll|Regenerate cube maps for all reflection probes.|bool|false|||
r_rendererInUse|The renderer currently used|enum|2|0|2|Shader Model 2.0,Shader Model 3.0,Default
r_rendererPreference|Preferred renderer; unsupported renderers will never be used.|enum|2|0|2|Shader Model 2.0,Shader Model 3.0,Default
r_resampleScene|Upscale the frame buffer with sharpen filter and color correction.|bool|true|||
r_scaleViewport|Scale 3D viewports by this fraction. Use this to see if framerate is pixel shader bound.|float|1|0|1|
r_showFbColorDebug|Show front buffer color debugging information|enum|0|0|2|None,Screen,Feedback
r_showFloatZDebug|Show float z buffer used to eliminate hard edges on particles near geometry|bool|false|||
r_showLightGrid|Show light grid debugging information|bool|false|||
r_showMissingLightGrid|Use rainbow colors for entities that are outside the light grid|bool|true|||
r_showPixelCost|Shows how expensive it is to draw every pixel on the screen|enum|0|0|3|off,timing,use depth,ignore depth
r_showPortals|Show portals for debugging|int|0|0|3|
r_singleCell|Only draw things in the same cell as the camera. Most useful for seeing how big the current cell is.|bool|false|||
r_skinCache|Enable cache for vertices of animated models|bool|true|||
r_skipPvs|Skipt the determination of what is in the potentially visible set (disables most drawing)|bool|false|||
r_smc_enable|Enable static model cache|bool|true|||
r_smp_backend|Process renderer back end in a separate thread|bool|true|||
r_smp_worker|Process renderer front end in a separate thread|bool|true|||
r_specular|Allows shaders to use phong specular lighting|bool|true|||
r_specularColorScale|Set greater than 1 to brighten specular highlights|float|1|0|100|
r_specularMap|Replace all specular maps with pure black (off) or pure white (super shiny)|enum|1|0|3|Black,Unchanged,White,Gray
r_spotLightBrightness|Brightness scale for spot light to get overbrightness from the 0-1 particle color range.|float|14|0|16|
r_spotLightEndRadius|Radius of the circle at the end of the spot light in inches.|float|196|1|1200|
r_spotLightEntityShadows|Enable entity shadows for spot lights.|bool|true|||
r_spotLightFovInnerFraction|Relative Inner FOV angle for the dynamic spot light. 0 is full fade 0.99 is almost no fade.|float|0.7|0|0.99|
r_spotLightShadows|Enable shadows for spot lights.|bool|true|||
r_spotLightSModelShadows|Enable static model shadows for spot lights.|bool|true|||
r_spotLightStartRadius|Radius of the circle at the start of the spot light in inches.|float|36|0|1200|
r_sse_skinning|Use Streaming SIMD Extensions for skinning|bool|true|||
r_sun_from_dvars|Set sun flare values from dvars rather than the level|bool|false|||
r_sun_fx_position|Position in degrees of the sun effect|vec3|0 0 0|-360|360|
r_sunblind_fadein|time in seconds to fade blind from 0% to 100%|float|0.5|0|60|
r_sunblind_fadeout|time in seconds to fade blind from 100% to 0%|float|3|0|60|
r_sunblind_max_angle|angle from sun in degrees inside which blinding is max|float|5|0|90|
r_sunblind_max_darken|0-1 fraction for how black the world is at max blind|float|0.75|0|1|
r_sunblind_min_angle|angle from sun in degrees outside which blinding is 0|float|30|0|90|
r_sunflare_fadein|time in seconds to fade alpha from 0% to 100%|float|1|0|60|
r_sunflare_fadeout|time in seconds to fade alpha from 100% to 0%|float|1|0|60|
r_sunflare_max_alpha|0-1 vertex color and alpha of sun at max effect|float|1|0|1|
r_sunflare_max_angle|angle from sun in degrees inside which effect is max|float|2|0|90|
r_sunflare_max_size|largest size of flare effect in pixels at 640x480|float|2500|0|10000|
r_sunflare_min_angle|angle from sun in degrees outside which effect is 0|float|45|0|90|
r_sunflare_min_size|smallest size of flare effect in pixels at 640x480|float|0|0|10000|
r_sunflare_shader|name for flare effect; can be any material|string|sun_flare|||
r_sunglare_fadein|time in seconds to fade glare from 0% to 100%|float|0.5|0|60|
r_sunglare_fadeout|time in seconds to fade glare from 100% to 0%|float|3|0|60|
r_sunglare_max_angle|angle from sun in degrees inside which glare is minimum|float|5|0|90|
r_sunglare_max_lighten|0-1 fraction for how white the world is at max glare|float|0.75|0|1|
r_sunglare_min_angle|angle from sun in degrees inside which glare is maximum|float|30|0|90|
r_sunsprite_shader|name for static sprite; can be any material|string|sun|||
r_sunsprite_size|diameter in pixels at 640x480 and 80 fov|float|16|1|1000|
r_texFilterAnisoMax|Maximum anisotropy to use for texture filtering|int|16|1|16|
r_texFilterAnisoMin|Minimum anisotropy to use for texture filtering (overridden by max)|int|1|1|16|
r_texFilterDisable|Disables all texture filtering (uses nearest only.)|bool|false|||
r_texFilterMipBias|Change the mipmap bias|float|0|-16|15.99|
r_texFilterMipMode|Forces all mipmaps to use a particular blend between levels (or disables mipping.)|enum|0|0|3|Unchanged,Force Trilinear,Force Bilinear,Force MipMaps Off
r_useLayeredMaterials|Set to true to use layered materials on shader model 3 hardware|bool|false|||
r_vc_compile||||||
r_vc_makelog|Enable logging of light grid points for the vis cache. 1 starts from scratch, 2 appends.|int|0|0|2|
r_vc_showlog|Show this many rows of light grid points for the vis cache|int|0|0|1024|
r_vsync|Enable v-sync before drawing the next frame to avoid 'tearing' artifacts.|bool|true|||
r_warningRepeatDelay|Number of seconds after displaying a "per-frame" warning before it will display again|float|5|0|30|
r_zfar|Change the distance at which culling fog reaches 100% opacity; 0 is off|float|0|0||
r_zFeather|Enable z feathering (fixes particles clipping into geometry)|bool|true|||
r_znear|Things closer than this aren't drawn. Reducing this increases z-fighting in the distance.|float|4|0.001|10000|
r_znear_depthhack|Viewmodel near clip plane|float|0.1|0.001|16|
radius_damage_debug|Turn on debug lines for radius damage traces|bool|false|||
ragdoll_baselerp_time|Default time ragdoll baselerp bones take to reach the base pose|int|1000|100|6000|
ragdoll_bullet_force|Bullet force applied to ragdolls|float|500|0|10000|
ragdoll_bullet_upbias|Upward bias applied to ragdoll bullet effects|float|0.5|0|10000|
ragdoll_debug|Draw ragdoll debug info (bitflags)|int|0|0||
ragdoll_dump_anims|Dump animation data when ragdoll fails|bool|false|||
ragdoll_enable|Turn on ragdoll death animations|bool|true|||
ragdoll_explode_force|Explosive force applied to ragdolls|float|18000|0|60000|
ragdoll_explode_upbias|Upwards bias applied to ragdoll explosion effects|float|0.8|0|2|
ragdoll_fps|Ragdoll update frames per second|int|20|0|100|
ragdoll_jitter_scale|Scale up or down the effect of physics jitter on ragdolls|float|1|0|10|
ragdoll_jointlerp_time|Default time taken to lerp down ragdoll joint friction|int|3000|100|6000|
ragdoll_max_life|Max lifetime of a ragdoll system in msec|int|4500|0||
ragdoll_max_simulating|Max number of simultaneous active ragdolls|int|16|0|32|
ragdoll_rotvel_scale|Ragdoll rotational velocity estimate scale|float|1|0|2000|
ragdoll_self_collision_scale|Scale the size of the collision capsules used to prevent ragdoll limbs from interpenetrating|float|1.2|0.1|10|
rate|Player's preferred baud rate|int|25000|1000|25000|
rcon_password|Password for the rcon command|string||||
sc_blur|Enable shadow cookie blur|int|2|0|4|
sc_count|Number of shadow cookies|int|24|0|24|
sc_debugCasterCount|Show debugging information for the shadow cookie caster count|int|24|0|24|
sc_debugReceiverCount|Show debugging information for the shadow cookie receiver count|int|24|0|24|
sc_enable|Enable shadow cookies|bool|false|||
sc_fadeRange|Shadow cookie fade range|float|0.25|0|1|
sc_length|Shadow cookie length|float|400|1|2000|
sc_offscreenCasterLodBias|Shadow cookie off-screen caster level of detail bias|float|0|||
sc_offscreenCasterLodScale|Shadow cookie off-screen caster level of detail scale|float|20|0||
sc_shadowInRate|Rate at which the shadow cookie horizon moves inwards|float|2|0|20|
sc_shadowOutRate|Rate at which the shadow cookie horizon moves outwards|float|5|0|20|
sc_showDebug|Show debug information for shadow cookies|bool|false|||
sc_showOverlay|Show shadow overlay for shadow cookies|bool|false|||
sc_wantCount|Number of desired shadows|int|12|0|24|
sc_wantCountMargin|Margin of error on number of desired shadows|int|1|0|24|
scr_%s_roundlimit||||||
scr_%s_scorelimit||||||
scr_friendlyfire||||||
scr_game_allowkillcam||||||
scr_hardcore||||||
scr_oldschool||||||
scr_team_fftype||||||
sensitivity|Mouse sensitivity|float|5|0.01|100|
server1|Server display|string||||
server10|Server display|string||||
server11|Server display|string||||
server12|Server display|string||||
server13|Server display|string||||
server14|Server display|string||||
server15|Server display|string||||
server16|Server display|string||||
server2|Server display|string||||
server3|Server display|string||||
server4|Server display|string||||
server5|Server display|string||||
server6|Server display|string||||
server7|Server display|string||||
server8|Server display|string||||
server9|Server display|string||||
shortversion|Short game version|string|1.0|||
showdrop|Show dropped packets|bool|false|||
showpackets|Show packets|int|0|0|2|
sm_enable|Enable shadow mapping|bool|true|||
sm_fastSunShadow|Fast sun shadow|bool|true|||
sm_lightScore_eyeProjectDist|When picking shadows for primary lights, measure distance from a point this far in front of the camera.|float|64|0|1024|
sm_lightScore_spotProjectFrac|When picking shadows for primary lights, measure distance to a point this fraction of the light's radius along it's shadow direction.|float|0.125|0|1|
sm_maxLights|Limits how many primary lights can have shadow maps|int|4|0|4|
sm_polygonOffsetBias|Shadow map offset bias|float|0.5|0|32|
sm_polygonOffsetScale|Shadow map offset scale|float|2|0|8|
sm_qualitySpotShadow|Fast spot shadow|bool|true|||
sm_spotEnable|Enable spot shadow mapping from script|bool|true|||
sm_spotShadowFadeTime|How many seconds it takes for a primary light shadow map to fade in or out|float|1|0.01|5|
sm_strictCull|Strict shadow map cull|bool|true|||
sm_sunEnable|Enable sun shadow mapping from script|bool|true|||
sm_sunSampleSizeNear|Shadow sample size|float|0.25|0.0625|32|
sm_sunShadowCenter|Sun shadow center, 0 0 0 means don't override|vec3|0 0 0|||
sm_sunShadowScale|Sun shadow scale optimization|float|1|0.25|1|
snaps|Snapshot rate|int|20|1|30|
snd_cinematicVolumeScale|Scales the volume of Bink videos.|float|0.85|0|1|
snd_draw3D|Draw the position and info of world sounds|enum|0|0|3|Off,Targets,Names,Verbose
snd_drawInfo|Draw debugging information for sounds|enum|0|0|3|None,3D,Stream,2D
snd_enable2D|Enable 2D sounds|bool|true|||
snd_enable3D|Enable 3D sounds|bool|true|||
snd_enableEq|Enable equalization filter|bool|false|||
snd_enableReverb|Enable sound reverberation|bool|true|||
snd_enableStream|Enable streamed sounds|bool|true|||
snd_errorOnMissing|Cause a Com_Error if a sound file is missing.|bool|false|||
snd_khz|The game sound frequency.|int|44|11|44|
snd_levelFadeTime|The amout of time in milliseconds for all audio to fade in at the start of a level|int|250|0|5000|
snd_outputConfiguration|Sound output configuration|enum|0|0|4|Windows default,Mono,Stereo,4 speakers,5.1 speakers
snd_slaveFadeTime|The amount of time in milliseconds for a 'slave' sound to fade its volumes when a master sound starts or stops|int|500|0|5000|
snd_touchStreamFilesOnLoad|Check whether stream sound files exist while loading|bool|false|||
snd_volume|Game sound master volume|float|0.8|0|1|
stat_version|Stats version number|int|10|0|255|
stopspeed|The player deceleration|float|100|0|1000|
sv_allowAnonymous|Allow anonymous access|bool|false|||
sv_allowDownload|Allow auto download of files|bool|true|||
sv_allowedClan1|Allow this clan to join the server|string||||
sv_allowedClan2|Allow this clan to join the server|string||||
sv_botsPressAttackBtn|Allow testclients to press attack button|bool|true|||
sv_cheats|Enable cheats|bool|true|||
sv_clientArchive|Have the clients archive data to save bandwidth on the server|bool|true|||
sv_clientSideBullets|If true, clients will synthesize tracers and bullet impacts|bool|true|||
sv_connectTimeout|seconds without any message when a client is loading|int|45|0|1800|
sv_debugRate|Enable snapshot rate debugging info|bool|false|||
sv_debugReliableCmds|Enable debugging information for 'reliable' commands|bool|false|||
sv_disableClientConsole|Disallow remote clients from accessing the console|bool|false|||
sv_FFCheckSums|Fast File server checksums|string||||
sv_FFNames|Names of Fast Files used by the server|string||||
sv_floodprotect|Prevent malicious lagging by flooding the server with commands. Is the number of client commands the server will process per 800ms. 0 means no flood protection.|||||
sv_fps|Server frames per second|int|20|10|1000|
sv_hostname|Host name of the server|string|CoD4Host|||
sv_iwdNames|Names of IWD files used by the server|string||||
sv_iwds|IWD server checksums|string||||
sv_keywords|Server keywords|string||||
sv_kickBanTime|Time in seconds for a player to be banned from the server after being kicked|float|300|0|3600|
sv_mapname|The current map name|string|""|||
sv_mapRotation|List of maps for the server to play|string||||
sv_mapRotationCurrent|Current map in the map rotation|string||||
sv_maxclients|The maximum number of clients that can connect to a server|int|32|||
sv_maxPing|Maximum ping allowed on the server|int|0|0|999|
sv_maxRate|Maximum bit rate|int|5000|0|25000|
sv_minPing|Minimum ping allowed on the server|int|0|0|999|
sv_packet_info|Enable packet info debugging information|bool|false|||
sv_padPackets|add nop bytes to messages|int|0|0||
sv_paused|Pause the server|int|0|0|2|
sv_privateClients|Maximum number of private clients allowed on the server|int|0|0|64|
sv_privatePassword|password for the privateClient slots|string||||
sv_punkbuster|Enable PunkBuster on this server|bool|true|||
sv_pure|Cannot use modified IWD files|bool|false|||
sv_reconnectlimit|minimum seconds between connect messages|int|3|0|1800|
sv_referencedFFCheckSums|Checksum of all referenced Fast Files|string||||
sv_referencedFFNames|Names of all referenced Fast Files|string||||
sv_referencedIwdNames|Names of all referenced IWD files|string||||
sv_referencedIwds|Checksum of all referenced IWD files|string||||
sv_running|Server is running|bool|false|||
sv_serverId||||||
sv_serverid|Server identification|int|0|||
sv_showAverageBPS|Show average bytes per second for net debugging|bool|false|||
sv_showCommands|Print client commands in the log file|bool|false|||
sv_timeout|seconds without any message|int|240|0|1800|
sv_voice|Use server side voice communications|bool|false|||
sv_voiceQuality|Voice quality|int|3|0|9|
sv_wwwBaseURL|The base url for files downloaded via http|string||||
sv_wwwDlDisconnected|Should clients stay connected while downloading?|bool|false|||
sv_wwwDownload|Enable http downloads|bool|false|||
sv_zombietime|seconds to sync messages after disconnect|int|2|0|1800|
sys_configSum|Configuration checksum|int|0|||
sys_configureGHz|Normalized total CPU power, based on cpu type, count, and speed; used in autoconfigure|float|0|||
sys_cpuGHz|Measured CPU speed|float||||
sys_cpuName|CPU name description|string||||
sys_gpu|GPU description|string|""|||
sys_lockThreads|Prevents specified threads from changing CPUs; improves profiling and may fix some bugs, but can hurt performance|enum|0|0|2|none,minimal,all
sys_smp_allowed|Allow multi-threading|bool|false|||
sys_SSE|Operating system allows Streaming SIMD Extensions|bool|false|||
sys_sysMB|Physical memory in the system|int|0|||
timescale|Scale time of each frame|float|1|0.001|1000|
ui_allow_classchange|Whether the UI should allow changing class|bool|false|||
ui_allow_teamchange|Whether the UI should allow changing team|bool|false|||
ui_bigFont|Big font scale|float|0.4|0|1|
ui_borderLowLightScale|Scales the border color for the lowlight color on certain UI borders|float|0.6|0|1|
ui_browserFriendlyfire|Friendly fire is active|int|-1|||
ui_browserHardcore|Hardcore mode|||||
ui_browserKillcam|Kill cam is active|int|-1|||
ui_browserMod|UI Mod value|int|0|-1|1|
ui_browserOldSchool|Oldschool mode|||||
ui_browserShowDedicated|Show dedicated servers only|bool|false|||
ui_browserShowEmpty|Show empty servers|bool|true|||
ui_browserShowFull|Show full servers|bool|true|||
ui_browserShowPassword|Show servers that are password protected|int|-1|-1|1|
ui_browserShowPunkBuster|Only show PunkBuster servers?|int|-1|||
ui_browserShowPure|Show pure servers only|bool|true|||
ui_buildLocation|Where to draw the build number|vec2|-100 52|-10000|10000|
ui_buildSize|Font size to use for the build number|float|0.3|0|1|
ui_cinematicsTimestamp|Shows cinematics timestamp on subtitle UI elements.|bool|false|||
ui_connectScreenTextGlowColor|Glow color applied to the mode and map name strings on the connect screen.|vec4|0.3 0.6 0.3 1|0|1|
ui_currentMap|Current map index|int|0|0||
ui_currentNetMap|Currently running map|int|0|0||
ui_customClassName|Custom Class name|string||||
ui_customModeEditName|Name to give the currently edited custom game mode when editing is complete|string||||
ui_customModeName|Custom game mode name|string||||
ui_dedicated|True if this is a dedicated server|int|0|0|2|
ui_drawCrosshair|Whether to draw crosshairs.|bool|true|||
ui_extraBigFont|Extra big font scale|float|0.55|0|1|
ui_gametype|Game type|int|3|0||
ui_hud_hardcore|Whether the HUD should be suppressed for hardcore mode|bool|false|||
ui_joinGametype|Game join type|int|0|0||
ui_language||||||
ui_languagechanged|External Dvar|||||
ui_lastServerRefresh_%i||||||
ui_maxclients|The maximum number of clients that can connect to a server|||||
ui_multiplayer|True if the game is multiplayer|bool|false|||
ui_Name||||||
ui_netGametype|Game type|int|0|||
ui_netGametypeName|Displayed game type name|string||||
ui_netSource|The network source where: 0:Local 1:Internet 2:Favourites|int|1|0|2|
ui_playerProfileAlreadyChosen|true if player profile has been selected.|int|0|0|1|
ui_playerProfileCount|Number of player profiles|int|0||7|
ui_playerProfileNameNew|New player profile name|string|""|||
ui_playerProfileSelected|Selected player profile name|string|""|||
ui_serverStatusTimeOut|Time in milliseconds before a server status request times out|int|7000|0||
ui_showEndOfGame|Currently showing the end of game menu.|bool|false|||
ui_showList|Show onscreen list of currently visible menus|bool|false|||
ui_showMenuOnly|If set, only menus using this name will draw.|string|""|||
ui_smallFont|Small font scale|float|0.25|0|1|
ui_uav_allies|Whether the UI should show UAV to allies|bool|false|||
ui_uav_axis|Whether the UI should show UAV to axis|bool|false|||
ui_uav_client|Whether the UI should show UAV to this client|bool|false|||
uiscript_debug|spam debug info for the ui script|int|0|0|2|
useFastFile|Enables loading data from fast files. Only tools can run without fast files.|bool|true|||
vehDebugClient|Turn on debug information for vehicles|bool|false|||
vehDebugServer|Turn on debug information for vehicles|bool|false|||
vehDriverViewDist|How far away the driver's view is from the focus point|float|300|1|1000|
vehDriverViewFocusRange|How far the driver's view focus will travel vertically|float|50|0|1000|
vehDriverViewHeightMax|Max orbit altitude for driver's view|float|50|-80|80|
vehDriverViewHeightMin|Min orbit altitude for driver's view|float|-15|-80|80|
vehHelicopterDecelerationFwd|Set the deceleration of the player helicopter (as a fraction of acceleration) in the direction the chopper is facing. So 1.0 makes it equal to the acceleration.|float|0.5|0||
vehHelicopterDecelerationSide|Set the side-to-side deceleration of the player helicopter (as a fraction of acceleration). So 1.0 makes it equal to the acceleration.|float|1|0||
vehHelicopterHeadSwayDontSwayTheTurret|If set, the turret will not fire through the crosshairs, but straight ahead of the vehicle, when the player is not freelooking.|bool|true|||
vehHelicopterHoverSpeedThreshold|The speed below which the player helicopter begins to jitter the tilt, for hovering|float|400|0.01||
vehHelicopterInvertUpDown|Invert the altitude control on the player helicopter.|bool|false|||
vehHelicopterJitterJerkyness|Specifies how jerky the tilt jitter should be|float|0.3|0.0001||
vehHelicopterLookaheadTime|How far ahead (in seconds) the player helicopter looks ahead, to avoid hard collisions. (Like driving down the highway, you should keep 2 seconds distance between you and the vehicle in front of you)|float|1|0.01||
vehHelicopterMaxAccel|Maximum horizontal acceleration of the player helicopter (in MPH per second)|float|45|0.01||
vehHelicopterMaxAccelVertical|Maximum vertical acceleration of the player helicopter (in MPH per second)|float|30|0.01||
vehHelicopterMaxPitch|Maximum pitch of the player helicopter|float|10|0.01||
vehHelicopterMaxRoll|Maximum roll of the player helicopter|float|35|0.01||
vehHelicopterMaxSpeed|Maximum horizontal speed of the player helicopter (in MPH)|float|150|0.01||
vehHelicopterMaxSpeedVertical|Maximum vertical speed of the player helicopter (in MPH)|float|65|0.01||
vehHelicopterMaxYawAccel|Maximum yaw acceleration of the player helicopter|float|90|0.01||
vehHelicopterMaxYawRate|Maximum yaw speed of the player helicopter|float|120|0.01||
vehHelicopterRightStickDeadzone|Dead-zone for the axes of the right thumbstick. This helps to better control the two axes separately.|float|0.3|0.01|1|
vehHelicopterScaleMovement|Scales down the smaller of the left stick axes.|bool|true|||
vehHelicopterSoftCollisions|Player helicopters have soft collisions (slow down before they collide).|bool|false|||
vehHelicopterStrafeDeadzone|Dead-zone so that you can fly straight forward easily without accidentally strafing (and thus rolling).|float|0.3|0.01|1|
vehHelicopterTiltFromAcceleration|The amount of tilt caused by acceleration|float|2|0.01||
vehHelicopterTiltFromControllerAxes|The amount of tilt caused by the desired velocity (i.e., the amount of controller stick deflection)|float|0|0||
vehHelicopterTiltFromDeceleration|The amount of tilt caused by deceleration|float|2|0||
vehHelicopterTiltFromFwdAndYaw|The amount of roll caused by yawing while moving forward.|float|0|0||
vehHelicopterTiltFromFwdAndYaw_VelAtMaxTilt|The forward speed (as a fraction of top speed) at which the tilt due to yaw reaches is maximum value.|float|1|0||
vehHelicopterTiltFromVelocity|The amount of tilt caused by the current velocity|float|1|0||
vehHelicopterTiltMomentum|The amount of rotational momentum the helicopter has with regards to tilting.|float|0.4|0.0001||
vehHelicopterTiltSpeed|The rate at which the player helicopter's tilt responds|float|1.2|0.01||
vehHelicopterYawOnLeftStick|The yaw speed created by the left stick when pushing the stick diagonally (e.g., moving forward and strafing slightly).|float|5|0||
vehTestHorsepower||float|200|0||
vehTestMaxMPH||float|40|0||
vehTestWeight||float|5200|0||
vehTextureScrollScale|Scale vehicle texture scroll scale by this amount (debug only)|float|0|0||
version|Game version|string|""|||
vid_xpos|Game window horizontal position|int|3|-4096|4096|
vid_ypos|game window vertical position|int|22|-4096|4096|
voice_deadChat|Allow dead players to talk to living players|bool|false|||
voice_global|Send voice messages to everybody|bool|false|||
voice_localEcho|Echo voice chat back to the player|bool|false|||
waypointDebugDraw|Event %s (%i)|bool|false|||
waypointDistScaleRangeMax|Distance from player that icon distance scaling ends.|float|3000|0||
waypointDistScaleRangeMin|Distance from player that icon distance scaling starts.|float|1000|0||
waypointDistScaleSmallest|Smallest scale that the distance effect uses.|float|0.8|0||
waypointIconHeight|Height of the offscreen pointer.|float|36|1.17549e-38||
waypointIconWidth|Width of the offscreen pointer.|float|36|1.17549e-38||
waypointOffscreenCornerRadius|Size of the rounded corners.|float|105|0||
waypointOffscreenDistanceThresholdAlpha|Distance from the threshold over which offscreen objective icons lerp their alpha.|float|30|0||
waypointOffscreenPadBottom|Offset from the edge.|float|30|0||
waypointOffscreenPadLeft|Offset from the edge.|float|103|0||
waypointOffscreenPadRight|Offset from the edge.|float|0|0||
waypointOffscreenPadTop|Offset from the edge.|float|0|0||
waypointOffscreenPointerDistance|Distance from the center of the offscreen objective icon to the center its arrow.|float|30|1.17549e-38||
waypointOffscreenPointerHeight|Height of the offscreen pointer.|float|12|1.17549e-38||
waypointOffscreenPointerWidth|Width of the offscreen pointer.|float|25|1.17549e-38||
waypointOffscreenRoundedCorners|Off-screen icons take rounded corners when true. 90-degree corners when false.|bool|true|||
waypointOffscreenScaleLength|How far the offscreen icon scale travels from full to smallest scale.|float|500|1.17549e-38||
waypointOffscreenScaleSmallest|Smallest scale that the offscreen effect uses.|float|1|0||
waypointPlayerOffsetCrouch|For waypoints pointing to players, how high to offset off of their origin when they are crouching.|float|56|0||
waypointPlayerOffsetProne|For waypoints pointing to players, how high to offset off of their origin when they are prone.|float|30|0||
waypointPlayerOffsetStand|For waypoints pointing to players, how high to offset off of their origin when they are standing.|float|74|0||
waypointSplitscreenScale|Scale applied to waypoint icons in splitscreen views.|float|1.8|0.1||
waypointTweakY||float|-17|||
wideScreen|True if the game video is running in 16x9 aspect, false if 4x3.|bool|true|||
winvoice_mic_mute|Mute the microphone|bool|true|||
winvoice_mic_reclevel|Microphone recording level|float|65535|0|65535|
winvoice_mic_scaler|Microphone scaler value|float|1|0.25|2|
winvoice_save_voice|Write voice data to a file|bool|false|||
`;

	function escapeHtml(text)
	{
		return String(text).replace(/[&<>"']/g, function (ch) { return HTML_ESCAPES[ch]; });
	}

	function parseTable()
	{
		var lines = DVAR_TABLE.split("\n");

		for (var i = 0; i < lines.length; i++)
		{
			if (lines[i] === "")
			{
				continue;
			}

			var f = lines[i].split("|");

			var values = f[6] ? f[6].split(",") : [];

			entries.push({
				name: f[0],
				desc: f[1] || "",
				type: f[2] || "",
				def: f[3] || "",
				min: f[4] || "",
				max: f[5] || "",
				values: values,
				haystack: (f[0] + " " + (f[1] || "") + " " + (f[6] || "")).toLowerCase()
			});
		}
	}

	// Type, default and range, whichever of them the sources gave up. A range
	// with only one end means the other one is unbounded.
	function metaHtml(entry)
	{
		var parts = [];

		if (entry.type !== "")
		{
			parts.push('<span class="dv-type">' + escapeHtml(entry.type) + "</span>");
		}

		if (entry.def !== "")
		{
			// For an enum the default is an index, so name it as well.
			var named = entry.values[Number(entry.def)];
			parts.push("default <b>" + escapeHtml(entry.def) + "</b>" +
				(named === undefined ? "" : " (" + escapeHtml(named) + ")"));
		}

		if (entry.min !== "" && entry.max !== "")
		{
			parts.push("range <b>" + escapeHtml(entry.min) + "</b> to <b>" + escapeHtml(entry.max) + "</b>");
		}
		else if (entry.min !== "")
		{
			parts.push("min <b>" + escapeHtml(entry.min) + "</b>");
		}
		else if (entry.max !== "")
		{
			parts.push("max <b>" + escapeHtml(entry.max) + "</b>");
		}

		var html = parts.length === 0 ? "" : '<p class="dv-meta">' + parts.join(" &middot; ") + "</p>";

		if (entry.values.length > 0)
		{
			var list = [];
			for (var i = 0; i < entry.values.length; i++)
			{
				list.push("<b>" + i + "</b> " + escapeHtml(entry.values[i]));
			}
			html += '<p class="dv-meta dv-values">' + list.join(" &middot; ") + "</p>";
		}

		return html;
	}

	function render()
	{
		var html = [];

		for (var i = 0; i < entries.length; i++)
		{
			html.push('<div class="dv-row"><code class="dv-name">' + escapeHtml(entries[i].name) +
				'</code><div class="dv-body"><p class="dv-desc">' +
				(entries[i].desc === "" ? "&mdash;" : escapeHtml(entries[i].desc)) +
				"</p>" + metaHtml(entries[i]) + "</div></div>");
		}

		listBox.innerHTML = html.join("");
		rows = listBox.querySelectorAll(".dv-row");
	}

	function setCount(shown)
	{
		if (countBox === null)
		{
			return;
		}

		countBox.textContent = shown === entries.length
			? entries.length + " dvars"
			: shown + " of " + entries.length + " dvars";
	}

	// Rows are only toggled, never rebuilt, so typing stays cheap with 1196 of them.
	function applyFilter()
	{
		var query = searchBox === null ? "" : searchBox.value.trim().toLowerCase();
		var shown = 0;

		for (var i = 0; i < rows.length; i++)
		{
			var match = query === "" || entries[i].haystack.indexOf(query) !== -1;
			rows[i].hidden = !match;
			if (match)
			{
				shown++;
			}
		}

		setCount(shown);

		if (emptyBox !== null)
		{
			emptyBox.hidden = shown !== 0;
			if (shown === 0)
			{
				emptyBox.textContent = 'No dvar matches "' + query + '".';
			}
		}
	}

	function init()
	{
		listBox = document.getElementById("dv-list");
		searchBox = document.getElementById("dv-search");
		countBox = document.getElementById("dv-count");
		emptyBox = document.getElementById("dv-empty");

		if (listBox === null)
		{
			return;
		}

		parseTable();
		render();
		setCount(entries.length);

		if (searchBox !== null)
		{
			searchBox.addEventListener("input", applyFilter);
			searchBox.addEventListener("search", applyFilter);
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
