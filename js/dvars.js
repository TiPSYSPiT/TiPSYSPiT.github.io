/*
 * CoD4 dvar reference.
 *
 * Transcribed from cod4_dvars.csv: 1196 entries, sorted by name, case
 * insensitive. The table is one string with "|" between name and description.
 * That separator needs no escaping because neither "|" nor a backtick nor
 * "${" occurs anywhere in the source data, and 25 descriptions contain a
 * semicolon, which is why the CSV quoted them and a plain split would not do.
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
actionSlotsHide|Hide the actionslots.
activeAction|Action to execute in first frame
aim_accel_turnrate_debug|Turn on debugging info for the acceleration
aim_accel_turnrate_enabled|Enable/disable acceleration of the turnrates
aim_accel_turnrate_lerp|The acceleration of the turnrates
aim_autoaim_debug|Turn on auto aim debugging
aim_autoaim_enabled|Turn on auto aim
aim_autoaim_lerp|The rate in degrees per second that the auto aim will converge to its target
aim_autoaim_region_height|The height of the auto aim region in virtual screen coordinates (0 - 480)
aim_autoaim_region_width|The width of the auto aim region in virtual screen coordinates (0 - 640)
aim_automelee_debug|Turn on auto melee debugging
aim_automelee_enabled|Turn on auto melee
aim_automelee_lerp|The rate in degrees per second that the auto melee will converge to its target
aim_automelee_range|The range of the auto melee
aim_automelee_region_height|The height of the auto melee region in virtual screen coordinates (0 - 480)
aim_automelee_region_width|The width of the auto melee region in virtual screen coordinates (0 - 640)
aim_input_graph_debug|Debug the view input graphs
aim_input_graph_enabled|Use graph for adjusting view input
aim_input_graph_index|Which input graph to use
aim_lockon_debug|Turn on debugging info for aim lock on
aim_lockon_deflection|The amount of stick deflection for the lockon to activate
aim_lockon_enabled|Aim lock on helps the player to stay on target
aim_lockon_region_height|The height of the auto aim region in virtual screen coordinates(0-480)
aim_lockon_region_width|The width of the auto aim region in virtual screen coordinates(0-640)
aim_lockon_strength|The amount of aim assistance given by the target lock on
aim_scale_view_axis|Scale the influence of each input axis so that the major axis has more influence on the control
aim_slowdown_debug|Turn on debugging info for aim slowdown
aim_slowdown_enabled|Slowdown the turn rate when the cross hair passes over a target
aim_slowdown_pitch_scale|The vertical aim assist slowdown ratio from the hip
aim_slowdown_pitch_scale_ads|The vertical aim assist slowdown ratio when aiming down the sight
aim_slowdown_region_height|The screen height of the aim assist slowdown region
aim_slowdown_region_width|The screen width of the aim slowdown region
aim_slowdown_yaw_scale|The horizontal aim assist slowdown ratio from the hip
aim_slowdown_yaw_scale_ads|The horizontal aim assist slowdown ratio when aiming down the sight
aim_target_sentient_radius|The radius used to calculate target bounds for a sentient(actor or player)
aim_turnrate_pitch|The vertical turn rate for aim assist when firing from the hip
aim_turnrate_pitch_ads|The turn rate up and down for aim assist when aiming down the sight
aim_turnrate_yaw|The horizontal turn rate for aim assist when firing from the hip
aim_turnrate_yaw_ads|The horizontal turn rate for aim assist when aiming down the sight
ammoCounterHide|Hide the Ammo Counter
authPort|Auth server port
authServerName|Authentication server name for listing public inet games
bg_aimSpreadMoveSpeedThreshold|When player is moving faster than this speed, the aim spread will increase
bg_bobAmplitudeDucked|The multiplier to apply to the player's speed to get the bob amplitude while ducking
bg_bobAmplitudeProne|The multiplier to apply to the player's speed to get the bob amplitude while prone
bg_bobAmplitudeSprinting|The multiplier to apply to the player's speed to get the bob amplitude while sprinting
bg_bobAmplitudeStanding|The multiplier to apply to the player's speed to get the bob amplitude while standing
bg_bobMax|The maximum allowed bob amplitude
bg_fallDamageMaxHeight|The height that a player will take maximum damage when falling
bg_fallDamageMinHeight|The height that a player will start to take minimum damage if they fall
bg_foliagesnd_fastinterval|The time between each foliage sound when moving quickly
bg_foliagesnd_maxspeed|The speed that a player must be going to make maximum noise while moving through foliage
bg_foliagesnd_minspeed|The speed that a player must be going to make minimum noise while moving through foliage
bg_foliagesnd_resetinterval|The time interval before foliage sounds are reset after the player has stopped moving
bg_foliagesnd_slowinterval|The time between each foliage sound when moving slowly
bg_ladder_yawcap|The maximum angle that a player can look around while on a ladder
bg_legYawTolerance|The amount the player's leg yaw can differ from his torso before moving ta match
bg_maxGrenadeIndicatorSpeed|Maximum speed of grenade that will show up in indicator and can be thrown back.
bg_prone_yawcap|The maximum angle that a player can look around quickly while prone
bg_shock_lookControl|Alter player control during shellshock
bg_shock_lookControl_fadeTime|The time for the shellshock player control to fade in seconds
bg_shock_lookControl_maxpitchspeed|Maximum pitch movement rate while shellshocked in degrees per second
bg_shock_lookControl_maxyawspeed|Maximum yaw movement rate while shell shocked in degrees per second
bg_shock_lookControl_mousesensitivityscale|Sensitivity scale to apply to a shellshocked player
bg_shock_movement|Affect player's movement speed duringi shellshock
bg_shock_screenBlurBlendFadeTime|The amount of time in seconds for the shellshock effect to fade
bg_shock_screenBlurBlendTime|The amount of time in seconds for the shellshock effect to blend
bg_shock_screenFlashShotFadeTime|In seconds, how soon from the end of the effect to start blending out the screengrab layer.
bg_shock_screenFlashWhiteFadeTime|In seconds, how soon from the end of the effect to start blending out the whiteout layer.
bg_shock_screenType|Shell shock screen effect type
bg_shock_sound|Play shell shock sound
bg_shock_soundDryLevel|Shell shock sound dry level
bg_shock_soundEnd|Shellshock end sound alias
bg_shock_soundEndAbort|Shellshock aborted end sound alias
bg_shock_soundFadeInTime|Shell shock sound fade in time in seconds
bg_shock_soundFadeOutTime|Shell shock sound fade out time in seconds
bg_shock_soundLoop|Shellshock loop alias
bg_shock_soundLoopEndDelay|Sound loop end offset time from the end of the shellshock in seconds
bg_shock_soundLoopFadeTime|Shell shock sound loop fade time in seconds
bg_shock_soundLoopSilent|The sound that gets blended with the shellshock loop alias
bg_shock_soundModEndDelay|The delay from the end of the shell shock to the end of the sound modification
bg_shock_soundRoomType|Shell shock sound room type
bg_shock_soundWetLevel|Shell shock sound wet level
bg_shock_viewKickFadeTime|The time for the shellshock kick effect to fade
bg_shock_viewKickPeriod|The period of the shellshock view kick effect
bg_shock_viewKickRadius|Shell shock kick radius
bg_shock_volume_%s|
bg_swingSpeed|The rate at which the player's legs swing around when strafing(multi-player only)
bg_viewKickMax|The maximum view kick
bg_viewKickMin|The minimum view kick
bg_viewKickRandom|The random direction scale view kick
bg_viewKickScale|The scale to apply to the damage done to caluclate damage view kick
bullet_penetrationEnabled|Enable/Disable bullet penetration.
bullet_penetrationMinFxDist|Min distance a penetrated bullet must travel before it'll trigger the effects
cg_airstrikeKillCamCloseXYDist|Airstrike kill camera closest distance in front of the bomb.
cg_airstrikeKillCamCloseZDist|Airstrike kill camera closest distance above the target.
cg_airstrikeKillCamDist|Airstrike kill camera distance.
cg_airstrikeKillCamFarBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480
cg_airstrikeKillCamFarBlurDist|Airstrike kill camera distance above the airplane.
cg_airstrikeKillCamFarBlurStart|Airstrike kill camera distance above the airplane.
cg_airstrikeKillCamFov|Airstrike kill camera field of view.
cg_airstrikeKillCamNearBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480
cg_airstrikeKillCamNearBlurEnd|Airstrike kill camera distance above the airplane.
cg_airstrikeKillCamNearBlurStart|Airstrike kill camera distance above the airplane.
cg_blood|Show Blood
cg_brass|Weapons eject brass
cg_centertime|The time for a center printed message to fade
cg_chatHeight|The font height of a chat message
cg_chatTime|The amount of time that a chat message is visible
cg_connectionIconSize|Size of the connection icon
cg_constantSizeHeadIcons|Head icons are the same size regardless of distance from the player
cg_crosshairAlpha|The alpha value of the crosshair
cg_crosshairAlphaMin|The minimum alpha value of the crosshair when it fades in
cg_crosshairDynamic|Crosshair is Dynamic
cg_crosshairEnemyColor|The crosshair color when over an enemy
cg_cursorHints|Draw cursor hints where: 0: no hints 1: sin size pulse 2: one way size pulse 3: alpha pulse 4: static image
cg_debug_overlay_viewport|Remove the sniper overlay so you can check that the scissor window is correct.
cg_debugevents|Output event debug information
cg_debugInfoCornerOffset|Offset from top-right corner, for cg_drawFPS, etc
cg_debugposition|Output position debugging information
cg_descriptiveText|Draw descriptive spectator messages
cg_draw2D|Draw 2D screen elements
cg_drawBreathHint|Draw a 'hold breath to steady' hint
cg_drawCrosshair|Turn on weapon crosshair
cg_drawCrosshairNames|Draw the name of an enemy under the crosshair
cg_drawCrosshairNamesPosX|Virtual screen space position of the crosshair name
cg_drawCrosshairNamesPosY|Virtual screen space position of the crosshair name
cg_drawFPS|Draw frames per second
cg_drawFPSLabels|Draw FPS Info Labels
cg_drawFriendlyNames|Whether to show friendly names in game
cg_drawGun|Draw the view model
cg_drawHealth|Draw health bar
cg_drawLagometer|Enable the 'lagometer'
cg_drawMantleHint|Draw a 'press key to mantle' hint
cg_drawMaterial|Draw debugging information for materials
cg_drawpaused|Draw paused screen
cg_drawScriptUsage|Draw debugging information for scripts
cg_drawShellshock|Draw shellshock & flashbang screen effects.
cg_drawSnapshot|Draw debugging information for snapshots
cg_drawSpectatorMessages|Enables drawing of spectator HUD messages.
cg_drawTalk|Controls which icons CG_TALKER ownerdraw draws
cg_drawThroughWalls|Whether to draw friendly names through walls or not
cg_drawTurretCrosshair|Draw a cross hair when using a turret
cg_dumpAnims|Output animation info for the given entity id
cg_enemyNameFadeIn|Time in milliseconds to fade in enemy names
cg_enemyNameFadeOut|Time in milliseconds to fade out enemy names
cg_errordecay|Decay for predicted error
cg_firstPersonTracerChance|The probability that a bullet is a tracer round for your bullets
cg_footsteps|Play footstep sounds
cg_fov|The field of view angle in degrees
cg_fovMin|The minimum possible field of view
cg_fovScale|Scale applied to the field of view
cg_friendlyNameFadeIn|Time in milliseconds to fade in friendly names
cg_friendlyNameFadeOut|Time in milliseconds to fade out friendly names
cg_gameBoldMessageWidth|The maximum character width of the bold game messages
cg_gameMessageWidth|The maximum character width of the game messages
cg_gun_move_f|Weapon movement forward due to player movement
cg_gun_move_minspeed|The minimum weapon movement rate
cg_gun_move_r|Weapon movement right due to player movement
cg_gun_move_rate|The base weapon movement rate
cg_gun_move_u|Weapon movement up due to player movement
cg_gun_ofs_f|Forward weapon offset when prone/ducked
cg_gun_ofs_r|Right weapon offset when prone/ducked
cg_gun_ofs_u|Up weapon offset when prone/ducked
cg_gun_x|x position of the viewmodel
cg_gun_y|y position of the viewmodel
cg_gun_z|z position of the viewmodel
cg_headIconMinScreenRadius|The minumum radius of a head icon on the screen
cg_heliKillCamDist|Helicopter kill camera distance from helicopter.
cg_heliKillCamFarBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480
cg_heliKillCamFarBlurDist|Helicopter kill camera distance above the helicopter.
cg_heliKillCamFarBlurStart|Helicopter kill camera distance above the helicopter.
cg_heliKillCamFov|Helicopter kill camera field of view.
cg_heliKillCamNearBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480
cg_heliKillCamNearBlurEnd|Helicopter kill camera distance above the helicopter.
cg_heliKillCamNearBlurStart|Helicopter kill camera distance above the helicopter.
cg_heliKillCamZDist|Helicopter kill camera distance above the helicopter.
cg_hintFadeTime|Time in milliseconds for the cursor hint to fade
cg_hudChatIntermissionPosition|Position of the HUD chat box during intermission
cg_hudChatPosition|Position of the HUD chat box
cg_hudDamageIconHeight|The height of the damage icon
cg_hudDamageIconInScope|Draw damage icons when aiming down the sight of a scoped weapon
cg_hudDamageIconOffset|The offset from the center of the damage icon
cg_hudDamageIconTime|The amount of time for the damage icon to stay on screen after damage is taken
cg_hudDamageIconWidth|The width of the damage icon
cg_hudGrenadeIconEnabledFlash|Show the grenade indicator for flash grenades
cg_hudGrenadeIconHeight|The height of the grenade indicator icon
cg_hudGrenadeIconInScope|Show the grenade indicator when aiming down the sight of a scoped weapon
cg_hudGrenadeIconMaxHeight|The minimum height difference between a player and a grenade for the grenade to be shown on the grenade indicator
cg_hudGrenadeIconMaxRangeFlash|The minimum distance that a flashbang has to be from a player in order to be shown on the grenade indicator
cg_hudGrenadeIconMaxRangeFrag|The minimum distance that a grenade has to be from a player in order to be shown on the grenade indicator
cg_hudGrenadeIconOffset|The offset from the center of the screen for a grenade icon
cg_hudGrenadeIconWidth|The width of the grenade indicator icon
cg_hudGrenadePointerHeight|The height of the grenade indicator pointer
cg_hudGrenadePointerPivot|The pivot point of th grenade indicator pointer
cg_hudGrenadePointerPulseFreq|The number of times per second that the grenade indicator flashes in Hertz
cg_hudGrenadePointerPulseMax|The maximum alpha of the grenade indicator pulse. Values higher than 1 will cause the indicator to remain at full brightness for longer
cg_hudGrenadePointerPulseMin|The minimum alpha of the grenade indicator pulse. Values lower than 0 will cause the indicator to remain at full transparency for longer
cg_hudGrenadePointerWidth|The width of the grenade indicator pointer
cg_hudMapBorderWidth|The size of the full map's border, filled by the CG_PLAYER_FULLMAP_BORDER ownerdraw
cg_hudMapFriendlyHeight|The size of the friendly icon on the full map
cg_hudMapFriendlyWidth|The size of the friendly icon on the full map
cg_hudMapPlayerHeight|The size of the player's icon on the full map
cg_hudMapPlayerWidth|The size of the player's icon on the full map
cg_hudMapRadarLineThickness|Thickness, relative to the map width, of the radar texture that sweeps across the full screen map
cg_hudProneY|Virtual screen y coordinate of the prone blocked message
cg_hudSayPosition|Position of the HUD say box
cg_hudStanceFlash|The background color of the flash when the stance changes
cg_hudStanceHintPrints|Draw helpful text to say how to change stances
cg_hudVotePosition|Position of the HUD vote box
cg_invalidCmdHintBlinkInterval|Blink rate of an invalid command hint
cg_invalidCmdHintDuration|Duration of an invalid command hint
cg_laserEndOffset|How far from the point of collision the end of the beam is.
cg_laserFlarePct|Percentage laser widens over distance from viewer.
cg_laserForceOn|Force laser sights on in all possible places (for debug purposes).
cg_laserLight|Whether to draw the light emitted from a laser (not the laser itself)
cg_laserLightBeginOffset|How far from the true beginning of the beam the light at the beginning is.
cg_laserLightBodyTweak|Amount to add to length of beam for light when laser hits a body (for hitboxes).
cg_laserLightEndOffset|How far from the true end of the beam the light at the end is.
cg_laserLightRadius|The radius of the light at the far end of a laser beam
cg_laserRadius|The size (radius) of a laser beam
cg_laserRange|The maximum range of a laser beam
cg_laserRangePlayer|The maximum range of the player's laser beam
cg_mapLocationSelectionCursorSpeed|Speed of the cursor when selecting a location on the map
cg_marks_ents_player_only|Marks on entities from players' bullets only.
cg_nopredict|Don't do client side prediction
cg_overheadIconSize|The maximum size to show overhead icons like 'rank'
cg_overheadNamesFarDist|The far distance at which name sizes are scaled by cg_overheadNamesFarScale
cg_overheadNamesFarScale|The amount to scale overhead name sizes at cg_overheadNamesFarDist
cg_overheadNamesFont|Font for overhead names ( see menudefinition.h )
cg_overheadNamesGlow|Glow color for overhead names
cg_overheadNamesMaxDist|The maximum distance for showing friendly player names
cg_overheadNamesNearDist|The near distance at which names are full size
cg_overheadNamesSize|The maximum size to show overhead names
cg_overheadRankSize|The size to show rank text
cg_predictItems|Turn on client side prediction for item pickup
cg_scoreboardBannerHeight|Banner height of the scoreboard
cg_scoreboardFont|Scoreboard font enum ( see menudefinition.h )
cg_scoreboardHeaderFontScale|Scoreboard header font scale
cg_scoreboardHeight|Height of the scoreboard
cg_scoreboardItemHeight|Item height of each item
cg_scoreboardMyColor|The local player's font color when shown in scoreboard
cg_scoreboardPingGraph|Whether to show graphical ping
cg_scoreboardPingHeight|Height of the ping graph as a % of the scoreboard row height
cg_scoreboardPingText|Whether to show numeric ping value
cg_scoreboardPingWidth|Width of the ping graph as a % of the scoreboard
cg_scoreboardRankFontScale|Scale of rank font
cg_scoreboardScrollStep|Scroll step amount for the scoreboard
cg_scoreboardTextOffset|Scoreboard text offset
cg_scoreboardWidth|Width of the scoreboard
cg_ScoresPing_BgColor|Background color of ping
cg_ScoresPing_HighColor|Color for high ping
cg_ScoresPing_Interval|Number of milliseconds each bar represents
cg_ScoresPing_LowColor|Color for low ping
cg_ScoresPing_MaxBars|Number of bars to show in ping graph
cg_ScoresPing_MedColor|Color for medium ping
cg_scriptIconSize|Size of Icons defined by script
cg_showmiss|Show prediction errors
cg_sprintMeterDisabledColor|The color of the sprint meter when the sprint meter is disabled
cg_sprintMeterEmptyColor|The color of the sprint meter when the sprint meter is empty
cg_sprintMeterFullColor|The color of the sprint meter when the sprint meter is full
cg_subtitleMinTime|The minimum time that the subtitles are displayed on screen in seconds
cg_subtitles|Show subtitles
cg_subtitleWidthStandard|The width of the subtitles in non wide-screen
cg_subtitleWidthWidescreen|The width of the subtitles in wide-screen
cg_teamChatsOnly|Allow chatting only on the same team
cg_thirdPerson|Use third person view
cg_thirdPersonAngle|The angle of the camera from the player in third person view
cg_thirdPersonRange|The range of the camera from the player in third person view
cg_tracerchance|The probability that a bullet is a tracer round
cg_tracerlength|The length of a tracer round
cg_tracerScale|Scale the tracer at a distance, so it's still visible
cg_tracerScaleDistRange|The range at which a tracer is scaled to its maximum amount
cg_tracerScaleMinDist|The minimum distance to scale a tracer
cg_tracerScrewDist|The length a tracer goes as it completes a full corkscrew revolution
cg_tracerScrewRadius|The radius of a tracer's corkscrew motion
cg_tracerSpeed|The speed of a tracer round in units per second
cg_tracerwidth|The width of the tracer round
cg_viewZSmoothingMax|Threshhold for the maximum smoothing distance we'll do
cg_viewZSmoothingMin|Threshhold for the minimum smoothing distance it must move to smooth
cg_viewZSmoothingTime|Amount of time to spread the smoothing over
cg_voiceIconSize|Size of the 'voice' icon
cg_weaponCycleDelay|The delay after cycling to a new weapon to prevent holding down the cycle weapon button from cycling too fast
cg_weaponHintsCoD1Style|Draw weapon hints in CoD1 style: with the weapon name, and with the icon below
cg_weaponleftbone|Left hand weapon bone name
cg_weaponrightbone|Right handed weapon bone name
cg_youInKillCamSize|Size of the 'you' Icon in the kill cam
cl_allowDownload|Allow client downloads from the server
cl_analog_attack_threshold|The threshold before firing
cl_anglespeedkey|Multiplier for max angle speed for game pad and keyboard
cl_anonymous|Allow anonymous log in
cl_avidemo|AVI demo frames per second
cl_bypassMouseInput|Bypass UI mouse input and send directly to the game
cl_connectionAttempts|Maximum number of connection attempts before aborting
cl_connectTimeout|Timeout time in seconds while connecting to a server
cl_forceavidemo|Record AVI demo even if client is not active
cl_freelook|Enable looking with mouse
cl_freezeDemo|cl_freezeDemo is used to lock a demo in place for single frame advances
cl_hudDrawsBehindUI|Should the HUD draw when the UI is up?
cl_ingame|True if the game is active
cl_maxpackets|Maximum number of packets sent per frame
cl_maxPing|Maximum ping for the client
cl_maxppf|Maximum servers to ping per frame in server browser
cl_motdString|Message of the day
cl_mouseAccel|Mouse acceleration
cl_nodelta|The server does not send snapshot deltas
cl_noprint|Print nothing to the console
cl_packetdup|Enable packet duplication
cl_paused|Pause the game
cl_pitchspeed|Max pitch speed in degrees for game pad
cl_punkbuster|Determines whether PunkBuster is enabled
cl_serverStatusResendTime|Time in milliseconds to resend a server status message
cl_showmouserate|Print mouse rate debugging information to the console
cl_shownet|Display network debugging information
cl_shownuments|Show the number of entities
cl_showSend|Enable debugging information for sent commands
cl_showServerCommands|Enable debugging information for server commands
cl_showTimeDelta|Enable debugging information for time delta
cl_stanceHoldTime|The time to hold the stance button before the player goes prone
cl_talking|Client is talking
cl_timeout|Seconds with no received packets until a timeout occurs
cl_updateavailable|True if there is an available update
cl_updatefiles|The file that is being updated
cl_updateoldversion|The version before update
cl_updateversion|The updated version
cl_voice|Use voice communications
cl_wwwDownload|Download files via HTTP
cl_yawspeed|Max yaw speed in degrees for game pad and keyboard
clientSideEffects|Enable loading _fx.gsc files on the client
codkey|
com_animCheck|Check anim tree
com_errorMessage|Most recent error message
com_errorTitle|Title of the most recent error message
com_filter_output|Use console filters for filtering output.
com_introPlayed|Intro movie has been played
com_maxfps|Cap frames per second
com_maxFrameTime|Time slows down if a frame takes longer than this many milliseconds
com_playerProfile|Player profile
com_recommendedSet|Use recommended settings
com_statmon|Draw stats monitor
com_timescale|Scale time of each frame
compass|
compassClampIcons|If true, friendlies and enemy pings clamp to the edge of the radar. If false, they disappear off the edge.
compassCoords|x = North-South coord base value, y = East-West coord base value, z = scale (game units per coord unit)
compassECoordCutoff|Left cutoff for the scrolling east-west coords
compassEnemyFootstepEnabled|Enables enemies showing on the compass because of moving rapidly nearby.
compassEnemyFootstepMaxRange|The maximum distance at which an enemy may appear on the compass due to 'footsteps'
compassEnemyFootstepMaxZ|The maximum vertical distance enemy may be from the player and appear on the compass due to 'footsteps'
compassEnemyFootstepMinSpeed|The minimum speed an enemy must be moving to appear on the compass due to 'footsteps'
compassFriendlyHeight|The size of the friendly icon on the compass
compassFriendlyWidth|The size of the friendly icon on the compass
compassMaxRange|The maximum range from the player in world space that objects will be shown on the compass
compassMinRadius|The minimum radius from the center of the compass that objects will appear.
compassMinRange|The minimum range from the player in world space that objects will appear on the compass
compassObjectiveArrowHeight|The size of the objective arrow on the compass
compassObjectiveArrowOffset|The offset of the objective arrow inward from the edge of the compass map
compassObjectiveArrowRotateDist|Distance from the corner of the compass map at which the objective arrow rotates to 45 degrees
compassObjectiveArrowWidth|The size of the objective arrow on the compass
compassObjectiveDetailDist|When an objective is closer than this distance (in meters), the icon will not be drawn on the tickertape.
compassObjectiveDrawLines|Draw horizontal and vertical lines to the active target, if it is within the minimap boundries
compassObjectiveHeight|The size of the objective on the compass
compassObjectiveIconHeight|The size of the objective on the full map
compassObjectiveIconWidth|The size of the objective on the full map
compassObjectiveMaxHeight|The maximum height that an objective is considered to be on this level
compassObjectiveMaxRange|The maximum range at which an objective is visible on the compass
compassObjectiveMinAlpha|The minimum alpha for an objective at the edge of the compass
compassObjectiveMinDistRange|The distance that objective transition effects play over, centered on compassObjectiveNearbyDist.
compassObjectiveMinHeight|The minimum height that an objective is considered to be on this level
compassObjectiveNearbyDist|When an objective is closer than this distance (in meters), an "Objective Nearby" type of indicator is shown.
compassObjectiveNumRings|The number of rings when a new objective appears
compassObjectiveRingSize|The maximum objective ring sige when a new objective appears on the compass
compassObjectiveRingTime|The amount of time between each ring when an objective appears
compassObjectiveTextHeight|Objective text height
compassObjectiveTextScale|Scale to apply to hud objectives
compassObjectiveWidth|The size of the objective on the compass
compassPlayerHeight|The size of the player's icon on the compass
compassPlayerWidth|The size of the player's icon on the compass
compassRadarLineThickness|Thickness, relative to the compass size, of the radar texture that sweeps across the map
compassRadarPingFadeTime|How long an enemy is visible on the compass after it is detected by radar
compassRadarUpdateTime|Time between radar updates
compassRotation|Style of compass
compassSize|Scale the compass
compassSoundPingFadeTime|The time in seconds for the sound overlay on the compass to fade
compassTickertapeStretch|How far the tickertape should stretch from its center.
con_default_console_filter|Default channel filter for the console destination.
con_errormessagetime|Onscreen time for error messages in seconds
con_gameMsgWindow%dFadeInTime|Time to fade in new messages in game message window %d
con_gameMsgWindow%dFadeOutTime|Time to fade out old messages in game message window %d
con_gameMsgWindow%dLineCount|Maximum number of lines of text visible at once in game message window %d
con_gameMsgWindow%dMsgTime|On screen time for game messages in seconds in game message window %d
con_gameMsgWindow%dScrollTime|Time to scroll messages when the oldest message is removed in game message window %d
con_gameMsgWindow%dSplitscreenScale|Scaling of game message window %d in splitscreen
con_inputBoxColor|Color of the console input box
con_inputHintBoxColor|Color of the console input hint box
con_matchPrefixOnly|Only match the prefix when listing matching Dvars
con_minicon|Display the mini console on screen
con_miniconlines|Number of lines in the minicon message window
con_minicontime|Onscreen time for minicon messages in seconds
con_outputBarColor|Color of the console output slider bar
con_outputSliderColor|Color of the console slider
con_outputWindowColor|Color of the console output
con_typewriterColorBase|Base color of typewritten objective text.
con_typewriterColorGlowCheckpoint|Color of typewritten objective text.
con_typewriterColorGlowCompleted|Color of typewritten objective text.
con_typewriterColorGlowFailed|Color of typewritten objective text.
con_typewriterColorGlowUpdated|Color of typewritten objective text.
con_typewriterDecayDuration|Time (in milliseconds) to spend disolving the line away.
con_typewriterDecayStartTime|Time (in milliseconds) to spend between the build and disolve phases.
con_typewriterPrintSpeed|Time (in milliseconds) to print each letter in the line.
createserver_maps|
debug_protocol|
dedicated|Dedicated server
developer|Enable development options
developer_script|Enable developer script comments
dynEnt_active|Disable/enable dynent reactions
dynEnt_bulletForce|Force applied from bullet hit
dynEnt_explodeForce|Force applied from explosion hit
dynEnt_explodeMaxEnts|The maximum number of dynents that can be awakened by one explosion
dynEnt_explodeMinForce|Force below which dynents won't even bother waking up
dynEnt_explodeSpinScale|Scale of the random offset from the center of mass for explosion forces.
dynEnt_explodeUpbias|Upward bias applied to force directions from explosion hits
dynEntPieces_angularVelocity|Initial breakable pieces angular velocity
dynEntPieces_impactForce|Force applied when breakable is destroyed
dynEntPieces_velocity|Initial breakable pieces velocity
fixedtime|Use a fixed time rate for each frame
friction|Player friction
fs_basegame|Base game name
fs_basepath|Base game path
fs_cdpath|CD path
fs_copyfiles|Copy all used files to another location
fs_debug|Enable file system debugging information
fs_game|game name
fs_homepath|Game home path
fs_ignoreLocalized|Ignore localized assets
fs_restrict|Restrict file access for demos etc.
fs_usedevdir|Use development directories.
fx_count|Debug effects count
fx_cull_effect_spawn|Culls entire effects for spawning
fx_cull_elem_draw|Culls effect elems for drawing
fx_cull_elem_spawn|Culls effect elems for spawning
fx_debugBolt|Debug effects bolt
fx_draw|Toggles drawing of effects after processing
fx_drawClouds|Toggles the drawing of particle clouds
fx_enable|Toggles all effects processing
fx_freeze|Freeze effects
fx_mark_profile|Turn on FX profiling for marks (specify which local client, with '1' being the first.)
fx_marks|Toggles whether bullet hits leave marks
fx_marks_ents|Toggles whether bullet hits leave marks on entities
fx_marks_smodels|Toggles whether bullet hits leave marks on static models
fx_profile|Turn on FX profiling (specify which local client, with '1' being the first.)
fx_visMinTraceDist|Minimum visibility trace size
g_allowVote|Enable voting on this server
g_allowvote|
g_antilag|Turn on antilag checks for weapon hits
g_banIPs|IP addresses to ban from playing
g_clonePlayerMaxVelocity|Maximum velocity in each axis of a cloned player (for death animations)
g_compassShowEnemies|Whether enemies are visible on the compass at all times
g_deadChat|Allow dead players to chat with living players
g_debugBullets|Show debug information for bullets
g_debugDamage|Show debug information for damage
g_debugLocDamage|Turn on debugging information for locational damage
g_dropForwardSpeed|Forward speed of a dropped item
g_dropHorzSpeedRand|Random component of the initial horizontal speed of a dropped item
g_dropUpSpeedBase|Base component of the initial vertical speed of a dropped item
g_dropUpSpeedRand|Random component of the initial vertical speed of a dropped item
g_dumpAnims|Animation debugging info for the given character number
g_entinfo|Display entity information
g_fogColorReadOnly|Fog color that was set in the most recent call to "setexpfog"
g_fogHalfDistReadOnly|Fog start distance that was set in the most recent call to "setexpfog"
g_fogStartDistReadOnly|Fog start distance that was set in the most recent call to "setexpfog"
g_friendlyfireDist|Maximum range for disabling fire at a friendly
g_friendlyNameDist|Maximum range for seeing a friendly's name
g_gametype|Setting state to CA_LOADING in CL_DownloadsComplete
g_gravity|Game gravity in inches per second per second
g_inactivity|Time delay before player is kicked for inactivity
g_knockback|Maximum knockback
g_listEntity|List the entities
g_log|Log file name
g_logSync|Enable synchronous logging
g_mantleBlockTimeBuffer|Time that the client think is delayed after mantling
g_maxDroppedWeapons|Maximum number of dropped weapons
g_minGrenadeDamageSpeed|Minimum speed at which getting hit be a grenade will do damage (not the grenade explosion damage)
g_motd|The message of the day
g_no_script_spam|Turn off script debugging info
g_oldVoting|Use old voting method
g_password|
g_playerCollisionEjectSpeed|Speed at which to push intersecting players away from each other
g_redCrosshairs|Whether red crosshairs are enabled
g_ScoresColor_Allies|Allies team color on scoreboard
g_ScoresColor_Axis|Axis team color on scoreboard
g_ScoresColor_EnemyTeam|Enemy team color on scoreboard
g_ScoresColor_Free|Free Team color on scoreboard
g_ScoresColor_MyTeam|Player team color on scoreboard
g_ScoresColor_Spectator|Spectator team color on scoreboard
g_smoothClients|Enable extrapolation between client states
g_speed|Player speed
g_synchronousClients|Client is synchronized to the server - allows smooth demos
g_TeamColor_Allies|Allies team color
g_TeamColor_Axis|Axis team color
g_TeamColor_EnemyTeam|Enemy team color
g_TeamColor_Free|Free Team color
g_TeamColor_MyTeam|Player team color
g_TeamColor_Spectator|Spectator team color
g_TeamIcon_Allies|Shader name for the allied scores banner
g_TeamIcon_Axis|Shader name for the axis scores banner
g_TeamIcon_Free|Shader name for the scores of players with no team
g_TeamIcon_Spectator|Shader name for the scores of players who are spectators
g_TeamName_Allies|Allied team name
g_TeamName_Axis|Axis team name
g_useholdspawndelay|Time in milliseconds that the player is unable to 'use' after spawning
g_useholdtime|Time to hold the 'use' button to activate use
g_voiceChatTalkingDuration|Time after the last talk packet was received that the player is considered by the server to still be talking in milliseconds
g_voteAbstainWeight|How much an abstained vote counts as a 'no' vote
gamedate|May 1 2018
gamename|Call of Duty 4
heli_barrelMaxVelocity|
heli_barrelRotation|How much to rotate the turret barrel when a helicopter fires
heli_barrelSlowdown|
hiDef|True if the game video is running in high-def.
hud_deathQuoteFadeTime|The time for the death quote to fade
hud_enable|Enable hud elements
hud_fade_ammodisplay|The time for the ammo display to fade in seconds
hud_fade_compass|The time for the compass to fade in seconds
hud_fade_healthbar|The time for the health bar to fade in seconds
hud_fade_offhand|The time for the offhand weapons to fade in seconds
hud_fade_sprint|The time for the sprint meter to fade in seconds
hud_fade_stance|The time for the stance to fade in seconds
hud_fadeout_speed|The speed that the HUD will fade at
hud_flash_period_offhand|Offhand weapons flash period on changing weapon
hud_flash_time_offhand|Offhand weapons flash duration on changing weapon
hud_health_pulserate_critical|The pulse rate of the 'critical' pulse effect
hud_health_pulserate_injured|The pulse rate of the 'injured' pulse effect
hud_health_startpulse_critical|The health level at which to start the 'critical' pulse effect
hud_health_startpulse_injured|The health level at which to start the 'injured' pulse effect
hud_healthOverlay_phaseEnd_pulseDuration|Time in milliseconds to fade out the health overlay after it is done flashing
hud_healthOverlay_phaseEnd_toAlpha|Alpha multiplier to fade to before turning off the overlay (percentage of the pulse peak)
hud_healthOverlay_phaseOne_pulseDuration|Time in milliseconds to ramp up to the first alpha value (the peak of the pulse)
hud_healthOverlay_phaseThree_pulseDuration|Time in milliseconds to fade the alpha to hud_healthOverlay_phaseThree_toAlphaMultiplier
hud_healthOverlay_phaseThree_toAlphaMultiplier|Alpha multiplier for the third health overlay phase (percentage of the pulse peak)
hud_healthOverlay_phaseTwo_pulseDuration|Time in milliseconds to fade the alpha to hud_healthOverlay_phaseTwo_toAlphaMultiplier
hud_healthOverlay_phaseTwo_toAlphaMultiplier|Alpha multiplier for the second health overlay phase (percentage of the pulse peak)
hud_healthOverlay_pulseStart|The percentage of full health at which the low-health warning overlay begins flashing
hud_healthOverlay_regenPauseTime|The time in milliseconds before the health regeneration kicks in
hudElemPausedBrightness|Brightness of the hudelems when the game is paused.
in_mouse|Initialize the mouse drivers
inertiaAngle|The cosine of the angle at which inertia occurs
inertiaDebug|Show inertia debug information
inertiaMax|Maximum player inertia
jump_height|The maximum height of a player's jump
jump_ladderPushVel|The velocity of a jump off of a ladder
jump_slowdownEnable|Slow player movement after jumping
jump_spreadAdd|The amount of spread scale to add as a side effect of jumping
jump_stepSize|The maximum step up to the top of a jump arc
loc_forceEnglish|Force english localized strings
loc_language|The current language locale
loc_translate|Turn on string translation
loc_warnings|Enable localization warnings
loc_warningsAsErrors|Throw an error for any unlocalized string
logfile|Write to log file - 0 = disabled, 1 = async file write, 2 = Sync every write
lowAmmoWarningColor1|Color 1 of 2 to oscilate between
lowAmmoWarningColor2|Color 2 of 2 to oscilate between
lowAmmoWarningNoAmmoColor1|Like lowAmmoWarningColor1, but when no ammo.
lowAmmoWarningNoAmmoColor2|lowAmmoWarningColor2, but when no ammo.
lowAmmoWarningNoReloadColor1|Like lowAmmoWarningColor1, but when no ammo to reload with.
lowAmmoWarningNoReloadColor2|lowAmmoWarningColor2, but when no ammo to reload with.
lowAmmoWarningPulseFreq|Frequency of the pulse (oscilation between the 2 colors)
lowAmmoWarningPulseMax|Min of oscilation range: 0 is color1 and 1.0 is color2. Can be < 0, and the wave will clip at 0.
lowAmmoWarningPulseMin|Max of oscilation range: 0 is color1 and 1.0 is color2. Can be > 1.0, and the wave will clip at 1.0.
m_filter|Allow mouse movement smoothing
m_forward|Forward speed in units per second
m_pitch|External Dvar
m_side|Sideways motion in units per second
m_yaw|Default yaw
mantle_check_angle|The minimum angle from the player to a mantle surface to allow a mantle
mantle_check_radius|The player radius to test against while mantling
mantle_check_range|The minimum distance from a player to a mantle surface to allow a mantle
mantle_debug|Show debug information for mantling
mantle_enable|Enable player mantling
mantle_view_yawcap|The angle at which to restrict a sideways turn while mantling
mapname|The current map name
masterPort|Master server port
masterServerName|Master server name for listing public inet games
melee_debug|Turn on debug lines for melee traces
missileDebugAttractors|Draw the attractors and repulsors. Attractors are green, and repulsors are yellow.
missileDebugDraw|Draw guided missile trajectories.
missileDebugText|Print debug missile info to console.
missileHellfireMaxSlope|This limits how steeply the hellfire missile can turn upward when climbing
missileHellfireUpAccel|The rate at which the hellfire missile curves upward
missileJavAccelClimb|Rocket acceleration when climbing.
missileJavAccelDescend|Rocket acceleration when descending towards target.
missileJavClimbAngleDirect|In direct-fire mode, the minimum angle between the rocket and target until the rocket stops climbing. Smaller angles make for higher climbs.
missileJavClimbAngleTop|In top-fire mode, the minimum angle between the rocket and target until the rocket stops climbing. Smaller angles make for higher climbs.
missileJavClimbCeilingDirect|In direct-fire mode, how high the missile needs to reach before it descends.
missileJavClimbCeilingTop|In top-fire mode, how high the missile needs to reach before it descends.
missileJavClimbHeightDirect|In direct-fire mode, how far above the target the rocket will aim for when climbing.
missileJavClimbHeightTop|In top-fire mode, how far above the target the rocket will aim for when climbing.
missileJavClimbToOwner|
missileJavSpeedLimitClimb|Rocket's speed limit when climbing.
missileJavSpeedLimitDescend|Rocket's speed limit when descending towards target.
missileJavTurnDecel|
missileJavTurnRateDirect|In direct-fire mode, how sharp the rocket can turn, in angles/sec.
missileJavTurnRateTop|In top-fire mode, how sharp the rocket can turn, in angles/sec.
missileWaterMaxDepth|If a missile explodes deeper under water than this, they explosion effect/sound will not play.
mod|----- Initializing Renderer ----
monkeytoy|Restrict console access
motd|Message of the day
msg_dumpEnts|Print snapshot entity info
msg_hudelemspew|Debug hudelem fields changing
msg_printEntityNums|Print entity numbers
name|Player name
net_ip|Network IP Address
net_lanauthorize|Authorise CD keys when using a LAN
net_noipx|Disable IPX
net_noudp|Disable UDP
net_port|Network port
net_profile|Profile network performance
net_showprofile|Show network profiling display
net_socksEnabled|Enable network sockets
net_socksPassword|Network socket password
net_socksPort|Network socket port
net_socksServer|Network socket server
net_socksUsername|Network socket username
nextdemo|The next demo to play
nextmap|Next map to play
nightVisionDisableEffects|
nightVisionFadeInOutTime|How long the fade to/from black lasts when putting on or removing night vision goggles.
nightVisionPowerOnTime|How long the black-to-nightvision fade lasts when turning on the goggles.
onlinegame|Current game is an online game with stats, custom classes, unlocks
overrideNVGModelWithKnife|When true, nightvision animations will attach the weapDef's knife model instead of the night vision goggles.
packetDebug|Enable packet debugging information
password|
perk_bulletPenetrationMultiplier|Multiplier for extra bullet penetration
perk_extraBreath|Number of extra seconds a player can hold his breath
perk_grenadeDeath|Name of the grenade weapon to drop
perk_parabolicAngle|Eavesdrop perk's effective FOV angle
perk_parabolicIcon|Eavesdrop icon to use when displaying eavesdropped voice chats
perk_parabolicRadius|Eavesdrop perk's effective radius
perk_sprintMultiplier|Multiplier for player_sprinttime
perk_weapRateMultiplier|Percentage of weapon firing rate to use
perk_weapReloadMultiplier|Percentage of weapon reload time to use
perk_weapSpreadMultiplier|Percentage of weapon spread to use
phys_autoDisableAngular|A body must have angular velocity less than this to be considered idle.
phys_autoDisableLinear|A body must have linear velocity less than this to be considered idle.
phys_autoDisableTime|The amount of time a body must be idle for it to go to sleep.
phys_bulletSpinScale|Scale of the effective offset from the center of mass for the bullet impacts.
phys_bulletUpBias|Up Bias for the direction of the bullet impact.
phys_cfm|Physics constraint force mixing magic parameter.
phys_collUseEntities|Disable to turn off testing for collision against entities
phys_contact_cfm|Physics constraint force mixing magic parameter for contacts.
phys_contact_cfm_ragdoll|Physics constraint force mixing magic parameter for contacts.
phys_contact_erp|Physics error reduction magic parameter for contacts.
phys_contact_erp_ragdoll|Physics error reduction magic parameter for contacts.
phys_csl|Physics contact surface level magic parameter.
phys_dragAngular|The amount of angular drag, applied globally
phys_dragLinear|The amount of linear drag, applied globally
phys_drawAwake|Debug draw a box indicating which bodies are disabled
phys_drawAwakeTooLong|Draw an indicator showing where the objects are that have been awake too long.
phys_drawCollisionObj|Debug draw collision geometry for each physics object
phys_drawCollisionWorld|Debug draw collision brushes and terrain triangles
phys_drawcontacts|Debug draw contact points
phys_drawDebugInfo|Print info about the physics objects
phys_dumpcontacts|Set to true to dump all constraints in next physics frame.
phys_erp|Physics error reduction magic parameter.
phys_frictionScale|Scales the amount of physics friction globally.
phys_gravity|Physics gravity in units/sec^2.
phys_gravityChangeWakeupRadius|The radius around the player within which objects get awakened when gravity changes
phys_interBodyCollision|Disable to turn off all inter-body collisions
phys_jitterMaxMass|Maximum mass to jitter - jitter will fall off up to this mass
phys_joint_cfm|Physics constraint force mixing magic parameter for joints.
phys_joint_stop_cfm|Physics constraint force mixing magic parameter for joints at their limits.
phys_joint_stop_erp|Physics error reduction magic parameter for joints at their limits.
phys_mcv|Physics maximum correcting velocity magic parameter.
phys_mcv_ragdoll|Physics maximum correcting velocity magic parameter (for ragdoll).
phys_minImpactMomentum|The minimum momentum required to trigger impact sounds
phys_narrowObjMaxLength|If a geom has a dimension less than this, then extra work will be done to prevent it from falling into cracks (like between the wall and the floor)
phys_noIslands|Make all contacts joints between an object and the world: no object-object contacts
phys_qsi|Number of iterations that QuickStep performs per step.
phys_reorderConst|ODE solver reorder constraints
phys_visibleTris|Visible triangles are used for collision
pickupPrints|Print a message to the game window when picking up ammo, etc.
player_adsExitDelay|Delay before exiting aim down sight
player_backSpeedScale|The scale applied to the player speed when moving backwards
player_breath_fire_delay|The amount of time subtracted from the player remaining breath time when a weapon is fired
player_breath_gasp_lerp|The interpolation rate for the target waver amplitude when gasping
player_breath_gasp_scale|Scale value to apply to the target waver during a gasp
player_breath_gasp_time|The amount of time a player will gasp once they can breath again
player_breath_hold_lerp|The interpolation rate for the target waver amplitude when holding breath
player_breath_hold_time|The maximum time a player can hold his breath
player_breath_snd_delay|The delay before playing the breathe in sound
player_breath_snd_lerp|The interpolation rate for the player hold breath sound
player_burstFireCooldown|Seconds after a burst fire before weapons can be fired again.
player_debugHealth|Turn on debugging info for player health
player_dmgtimer_flinchTime|Maximum time to play flinch animations
player_dmgtimer_maxTime|The maximum time that the player is slowed due to damage
player_dmgtimer_minScale|The minimum scale value to slow the player by when damaged
player_dmgtimer_stumbleTime|Maximum time to play stumble animations
player_dmgtimer_timePerPoint|The time in milliseconds that the player is slowed down per point of damage
player_footstepsThreshhold|The minimum speed at which the player makes loud footstep noises
player_lean_rotate_crouch_left|Amount to rotate the player 3rd person model when crouch leaning left
player_lean_rotate_crouch_right|Amount to rotate the player 3rd person model when crouch leaning right
player_lean_rotate_left|Amount to rotate the player 3rd person model when leaning left
player_lean_rotate_right|Amount to rotate the player 3rd person model when leaning right
player_lean_shift_crouch_left|Amount to shift the player 3rd person model when crouch leaning left
player_lean_shift_crouch_right|Amount to shift the player 3rd person model when crouch leaning right
player_lean_shift_left|Amount to shift the player 3rd person model when leaning left
player_lean_shift_right|Amount to shift the player 3rd person model when leaning right
player_meleeChargeFriction|Friction used during melee charge
player_meleeHeight|The height of the player's melee attack
player_meleeRange|The maximum range of the player's mellee attack
player_meleeWidth|The width of the player's melee attack
player_MGUseRadius|The radius within which a player can mount a machine gun
player_move_factor_on_torso|The contribution movement direction has on player torso direction(multi-player only)
player_moveThreshhold|The speed at which the player is considered to be moving for the purposes of view model bob and multiplayer model movement
player_scopeExitOnDamage|Exit the scope if the player takes damage
player_spectateSpeedScale|The scale applied to the player speed when spectating
player_sprintCameraBob|The speed the camera bobs while you sprint
player_sprintForwardMinimum|The minimum forward deflection required to maintain a sprint
player_sprintMinTime|The minimum sprint time needed in order to start sprinting
player_sprintRechargePause|The length of time the meter will pause before starting to recharge after a player sprints
player_sprintSpeedScale|The scale applied to the player speed when sprinting
player_sprintStrafeSpeedScale|The speed at which you can strafe while sprinting
player_sprintTime|The base length of time a player can sprint
player_strafeAnimCosAngle|Cosine of the angle which player starts using strafe animations
player_strafeSpeedScale|The scale applied to the player speed when strafing
player_sustainAmmo|Firing weapon will not decrease clip ammo.
player_throwbackInnerRadius|The radius to a live grenade player must be within initially to do a throwback
player_throwbackOuterRadius|The radius player is allow to throwback a grenade once the player has been in the inner radius
player_turnAnims|Use animations to turn a player's model in multiplayer
player_view_pitch_down|Maximum angle that the player can look down
player_view_pitch_up|Maximum angle that the player can look up
profile_delete_fail_popmenu|Could not find menu '%s'
profile_exists_popmenu|Could not find menu '%s'
protocol|Protocol version
r_aaAlpha|Transparency anti-aliasing method
r_aaSamples|Anti-aliasing sample count; 1 disables anti-aliasing
r_altModelLightingUpdate|Use alternate model lighting update technique
r_aspectRatio|Screen aspect ratio. Most widescreen monitors are 16:10 instead of 16:9.
r_autopriority|Automatically set the priority of the windows process when the game is minimized
r_blur|Dev tweak to blur the screen
r_brightness|Brightness adjustment
r_cacheModelLighting|Speed up model lighting by caching previous results
r_cacheSModelLighting|Speed up static model lighting by caching previous results
r_clear|Controls how the color buffer is cleared
r_clearColor|Color to clear the screen to when clearing the frame buffer
r_clearColor2|Color to clear every second frame to (for use during development)
r_colorMap|Replace all color maps with pure black or pure white
r_contrast|Contrast adjustment
r_customMode|Special resolution mode for the remote debugger
r_debugLineWidth|Width of server side debug lines
r_debugShader|Enable shader debugging information
r_depthPrepass|Enable depth prepass (usually improves performance)
r_desaturation|Desaturation adjustment
r_detail|Allows shaders to use detail textures
r_diffuseColorScale|Globally scale the diffuse color of all point lights
r_displayRefresh|Refresh rate
r_distortion|Enable distortion
r_dlightLimit|Maximum number of dynamic lights drawn simultaneously
r_dof_bias|Depth of field bias as a power function (like gamma); less than 1 is sharper
r_dof_enable|Enable the depth of field effect
r_dof_farBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480
r_dof_farEnd|Depth of field far end distance, in inches
r_dof_farStart|Depth of field far start distance, in inches
r_dof_nearBlur|Sets the radius of the gaussian blur used by depth of field, in pixels at 640x480
r_dof_nearEnd|Depth of field near end distance, in inches
r_dof_nearStart|Depth of field near start distance, in inches
r_dof_tweak|Use dvars to set the depth of field effect; overrides r_dof_enable
r_dof_viewModelEnd|Depth of field viewmodel end distance, in inches
r_dof_viewModelStart|Depth of field viewmodel start distance, in inches
r_drawDecals|Enable world decal rendering
r_drawSun|Enable sun effects
r_drawWater|Enable water animation
r_envMapExponent|Reflection exponent.
r_envMapMaxIntensity|Max reflection intensity based on glancing angle.
r_envMapMinIntensity|Min reflection intensity based on glancing angle.
r_envMapOverride|Min reflection intensity based on glancing angle.
r_envMapSpecular|Enables environment map specular lighting
r_envMapSunIntensity|Max sun specular intensity intensity with env map materials.
r_fastSkin|Enable fast model skinning
r_filmTweakBrightness|Tweak dev var; film color brightness
r_filmTweakContrast|Tweak dev var; film color contrast
r_filmTweakDarkTint|Tweak dev var; film color dark tint color
r_filmTweakDesaturation|Tweak dev var; Desaturation applied after all 3D drawing
r_filmTweakEnable|Tweak dev var; enable film color effects
r_filmTweakInvert|Tweak dev var; enable inverted video
r_filmTweakLightTint|Tweak dev var; film color light tint color
r_filmUseTweaks|Overide film effects with tweak dvar values.
r_floatz|Allocate a float z buffer (required for effects such as floatz, dof, and laser light)
r_fog|Set to 0 to disable fog
r_forceLod|Force all level of detail to this level
r_fullbright|Toggles rendering without lighting
r_fullscreen|Display game full screen
r_gamma|Gamma value
r_glow|Enable glow.
r_glow_allowed|Allow glow.
r_glow_allowed_script_forced|Force 'allow glow' to be treated as true, by script.
r_glowTweakBloomCutoff|Tweak dev var; Glow bloom cut off fraction
r_glowTweakBloomDesaturation|Tweak dev var; Glow bloom desaturation
r_glowTweakBloomIntensity0|Tweak dev var; Glow bloom intensity
r_glowTweakEnable|Tweak dev var; Enable glow
r_glowTweakRadius0|Tweak dev var; Glow radius in pixels at 640x480
r_glowUseTweaks|Overide glow with tweak dvar values.
r_gpuSync|GPU synchronization type (used to improve mouse responsiveness)
r_highLodDist|Distance for high level of detail
r_ignore|used for debugging anything
r_ignorehwgamma|Ignore hardware gamma
r_inGameVideo|Allow in game cinematics
r_lightMap|Replace all lightmaps with pure black or pure white
r_lightTweakAmbient|Ambient light strength
r_lightTweakAmbientColor|Light ambient color
r_lightTweakDiffuseFraction|diffuse light fraction
r_lightTweakSunColor|Sun color
r_lightTweakSunDiffuseColor|Sun diffuse color
r_lightTweakSunDirection|Sun direction in degrees
r_lightTweakSunLight|Sunlight strength
r_loadForRenderer|Set to false to disable dx allocations (for dedicated server mode)
r_lockPvs|Lock the viewpoint used for determining what is visible to the current position and direction
r_lodBiasRigid|Bias the level of detail distance for rigid models (negative increases detail)
r_lodBiasSkinned|Bias the level of detail distance for skinned models (negative increases detail)
r_lodScaleRigid|Scale the level of detail distance for rigid models (larger reduces detail)
r_lodScaleSkinned|Scale the level of detail distance for skinned models (larger reduces detail)
r_logFile|Write all graphics hardware calls for this many frames to a logfile
r_lowestLodDist|Distance for lowest level of detail
r_lowLodDist|Distance for low level of detail
r_mediumLodDist|Distance for medium level of detail
r_mode|Direct X resolution mode
r_modelVertColor|Set to 0 to replace all model vertex colors with white when loaded
r_monitor|Index of the monitor to use in a multi monitor system; 0 picks automatically.
r_multiGpu|Use multiple GPUs
r_norefresh|Skips all rendering. Useful for benchmarking.
r_normal|Allows shaders to use normal maps
r_normalMap|Replace all normal maps with a flat normal map
r_outdoor|Prevents snow from going indoors
r_outdoorAwayBias|Affects the height map lookup for making sure snow doesn't go indoors
r_outdoorDownBias|Affects the height map lookup for making sure snow doesn't go indoors
r_outdoorFeather|Outdoor z-feathering value
r_picmip|Picmip level of color maps. If r_picmip_manual is 0, this is read-only.
r_picmip_bump|Picmip level of normal maps. If r_picmip_manual is 0, this is read-only.
r_picmip_manual|If 0, picmip is set automatically. If 1, picmip is set based on the other r_picmip dvars.
r_picmip_spec|Picmip level of specular maps. If r_picmip_manual is 0, this is read-only.
r_picmip_water|Picmip level of water maps.
r_polygonOffsetBias|Offset bias for decal polygons; bigger values z-fight less but poke through walls more
r_polygonOffsetScale|Offset scale for decal polygons; bigger values z-fight less but poke through walls more
r_portalBevels|Helps cull geometry by angles of portals that are acute when projected onto the screen, value is the cosine of the angle
r_portalBevelsOnly|Use screen-space bounding box of portals rather than the actual shape of the portal projected onto the screen
r_portalMinClipArea|Don't clip child portals by a parent portal smaller than this fraction of the screen area.
r_portalMinRecurseDepth|Ignore r_portalMinClipArea for portals with fewer than this many parent portals.
r_portalWalkLimit|Stop portal recursion after this many iterations. Useful for debugging portal errors.
r_preloadShaders|Force D3D to draw dummy geometry with all shaders during level load; may fix long pauses at level start.
r_pretess|Batch surfaces to reduce primitive count
r_reflectionProbeGenerate|Generate cube maps for reflection probes.
r_reflectionProbeGenerateExit|Exit when done generating reflection cubes.
r_reflectionProbeRegenerateAll|Regenerate cube maps for all reflection probes.
r_rendererInUse|The renderer currently used
r_rendererPreference|Preferred renderer; unsupported renderers will never be used.
r_resampleScene|Upscale the frame buffer with sharpen filter and color correction.
r_scaleViewport|Scale 3D viewports by this fraction. Use this to see if framerate is pixel shader bound.
r_showFbColorDebug|Show front buffer color debugging information
r_showFloatZDebug|Show float z buffer used to eliminate hard edges on particles near geometry
r_showLightGrid|Show light grid debugging information
r_showMissingLightGrid|Use rainbow colors for entities that are outside the light grid
r_showPixelCost|Shows how expensive it is to draw every pixel on the screen
r_showPortals|Show portals for debugging
r_singleCell|Only draw things in the same cell as the camera. Most useful for seeing how big the current cell is.
r_skinCache|Enable cache for vertices of animated models
r_skipPvs|Skipt the determination of what is in the potentially visible set (disables most drawing)
r_smc_enable|Enable static model cache
r_smp_backend|Process renderer back end in a separate thread
r_smp_worker|Process renderer front end in a separate thread
r_specular|Allows shaders to use phong specular lighting
r_specularColorScale|Set greater than 1 to brighten specular highlights
r_specularMap|Replace all specular maps with pure black (off) or pure white (super shiny)
r_spotLightBrightness|Brightness scale for spot light to get overbrightness from the 0-1 particle color range.
r_spotLightEndRadius|Radius of the circle at the end of the spot light in inches.
r_spotLightEntityShadows|Enable entity shadows for spot lights.
r_spotLightFovInnerFraction|Relative Inner FOV angle for the dynamic spot light. 0 is full fade 0.99 is almost no fade.
r_spotLightShadows|Enable shadows for spot lights.
r_spotLightSModelShadows|Enable static model shadows for spot lights.
r_spotLightStartRadius|Radius of the circle at the start of the spot light in inches.
r_sse_skinning|Use Streaming SIMD Extensions for skinning
r_sun_from_dvars|Set sun flare values from dvars rather than the level
r_sun_fx_position|Position in degrees of the sun effect
r_sunblind_fadein|time in seconds to fade blind from 0% to 100%
r_sunblind_fadeout|time in seconds to fade blind from 100% to 0%
r_sunblind_max_angle|angle from sun in degrees inside which blinding is max
r_sunblind_max_darken|0-1 fraction for how black the world is at max blind
r_sunblind_min_angle|angle from sun in degrees outside which blinding is 0
r_sunflare_fadein|time in seconds to fade alpha from 0% to 100%
r_sunflare_fadeout|time in seconds to fade alpha from 100% to 0%
r_sunflare_max_alpha|0-1 vertex color and alpha of sun at max effect
r_sunflare_max_angle|angle from sun in degrees inside which effect is max
r_sunflare_max_size|largest size of flare effect in pixels at 640x480
r_sunflare_min_angle|angle from sun in degrees outside which effect is 0
r_sunflare_min_size|smallest size of flare effect in pixels at 640x480
r_sunflare_shader|name for flare effect; can be any material
r_sunglare_fadein|time in seconds to fade glare from 0% to 100%
r_sunglare_fadeout|time in seconds to fade glare from 100% to 0%
r_sunglare_max_angle|angle from sun in degrees inside which glare is minimum
r_sunglare_max_lighten|0-1 fraction for how white the world is at max glare
r_sunglare_min_angle|angle from sun in degrees inside which glare is maximum
r_sunsprite_shader|name for static sprite; can be any material
r_sunsprite_size|diameter in pixels at 640x480 and 80 fov
r_texFilterAnisoMax|Maximum anisotropy to use for texture filtering
r_texFilterAnisoMin|Minimum anisotropy to use for texture filtering (overridden by max)
r_texFilterDisable|Disables all texture filtering (uses nearest only.)
r_texFilterMipBias|Change the mipmap bias
r_texFilterMipMode|Forces all mipmaps to use a particular blend between levels (or disables mipping.)
r_useLayeredMaterials|Set to true to use layered materials on shader model 3 hardware
r_vc_compile|
r_vc_makelog|Enable logging of light grid points for the vis cache. 1 starts from scratch, 2 appends.
r_vc_showlog|Show this many rows of light grid points for the vis cache
r_vsync|Enable v-sync before drawing the next frame to avoid 'tearing' artifacts.
r_warningRepeatDelay|Number of seconds after displaying a "per-frame" warning before it will display again
r_zfar|Change the distance at which culling fog reaches 100% opacity; 0 is off
r_zFeather|Enable z feathering (fixes particles clipping into geometry)
r_znear|Things closer than this aren't drawn. Reducing this increases z-fighting in the distance.
r_znear_depthhack|Viewmodel near clip plane
radius_damage_debug|Turn on debug lines for radius damage traces
ragdoll_baselerp_time|Default time ragdoll baselerp bones take to reach the base pose
ragdoll_bullet_force|Bullet force applied to ragdolls
ragdoll_bullet_upbias|Upward bias applied to ragdoll bullet effects
ragdoll_debug|Draw ragdoll debug info (bitflags)
ragdoll_dump_anims|Dump animation data when ragdoll fails
ragdoll_enable|Turn on ragdoll death animations
ragdoll_explode_force|Explosive force applied to ragdolls
ragdoll_explode_upbias|Upwards bias applied to ragdoll explosion effects
ragdoll_fps|Ragdoll update frames per second
ragdoll_jitter_scale|Scale up or down the effect of physics jitter on ragdolls
ragdoll_jointlerp_time|Default time taken to lerp down ragdoll joint friction
ragdoll_max_life|Max lifetime of a ragdoll system in msec
ragdoll_max_simulating|Max number of simultaneous active ragdolls
ragdoll_rotvel_scale|Ragdoll rotational velocity estimate scale
ragdoll_self_collision_scale|Scale the size of the collision capsules used to prevent ragdoll limbs from interpenetrating
rate|Player's preferred baud rate
rcon_password|Password for the rcon command
sc_blur|Enable shadow cookie blur
sc_count|Number of shadow cookies
sc_debugCasterCount|Show debugging information for the shadow cookie caster count
sc_debugReceiverCount|Show debugging information for the shadow cookie receiver count
sc_enable|Enable shadow cookies
sc_fadeRange|Shadow cookie fade range
sc_length|Shadow cookie length
sc_offscreenCasterLodBias|Shadow cookie off-screen caster level of detail bias
sc_offscreenCasterLodScale|Shadow cookie off-screen caster level of detail scale
sc_shadowInRate|Rate at which the shadow cookie horizon moves inwards
sc_shadowOutRate|Rate at which the shadow cookie horizon moves outwards
sc_showDebug|Show debug information for shadow cookies
sc_showOverlay|Show shadow overlay for shadow cookies
sc_wantCount|Number of desired shadows
sc_wantCountMargin|Margin of error on number of desired shadows
scr_%s_roundlimit|
scr_%s_scorelimit|
scr_friendlyfire|
scr_game_allowkillcam|
scr_hardcore|
scr_oldschool|
scr_team_fftype|
sensitivity|Mouse sensitivity
server1|Server display
server10|Server display
server11|Server display
server12|Server display
server13|Server display
server14|Server display
server15|Server display
server16|Server display
server2|Server display
server3|Server display
server4|Server display
server5|Server display
server6|Server display
server7|Server display
server8|Server display
server9|Server display
shortversion|Short game version
showdrop|Show dropped packets
showpackets|Show packets
sm_enable|Enable shadow mapping
sm_fastSunShadow|Fast sun shadow
sm_lightScore_eyeProjectDist|When picking shadows for primary lights, measure distance from a point this far in front of the camera.
sm_lightScore_spotProjectFrac|When picking shadows for primary lights, measure distance to a point this fraction of the light's radius along it's shadow direction.
sm_maxLights|Limits how many primary lights can have shadow maps
sm_polygonOffsetBias|Shadow map offset bias
sm_polygonOffsetScale|Shadow map offset scale
sm_qualitySpotShadow|Fast spot shadow
sm_spotEnable|Enable spot shadow mapping from script
sm_spotShadowFadeTime|How many seconds it takes for a primary light shadow map to fade in or out
sm_strictCull|Strict shadow map cull
sm_sunEnable|Enable sun shadow mapping from script
sm_sunSampleSizeNear|Shadow sample size
sm_sunShadowCenter|Sun shadow center, 0 0 0 means don't override
sm_sunShadowScale|Sun shadow scale optimization
snaps|Snapshot rate
snd_cinematicVolumeScale|Scales the volume of Bink videos.
snd_draw3D|Draw the position and info of world sounds
snd_drawInfo|Draw debugging information for sounds
snd_enable2D|Enable 2D sounds
snd_enable3D|Enable 3D sounds
snd_enableEq|Enable equalization filter
snd_enableReverb|Enable sound reverberation
snd_enableStream|Enable streamed sounds
snd_errorOnMissing|Cause a Com_Error if a sound file is missing.
snd_khz|The game sound frequency.
snd_levelFadeTime|The amout of time in milliseconds for all audio to fade in at the start of a level
snd_outputConfiguration|Sound output configuration
snd_slaveFadeTime|The amount of time in milliseconds for a 'slave' sound to fade its volumes when a master sound starts or stops
snd_touchStreamFilesOnLoad|Check whether stream sound files exist while loading
snd_volume|Game sound master volume
stat_version|Stats version number
stopspeed|The player deceleration
sv_allowAnonymous|Allow anonymous access
sv_allowDownload|Allow auto download of files
sv_allowedClan1|Allow this clan to join the server
sv_allowedClan2|Allow this clan to join the server
sv_botsPressAttackBtn|Allow testclients to press attack button
sv_cheats|Enable cheats
sv_clientArchive|Have the clients archive data to save bandwidth on the server
sv_clientSideBullets|If true, clients will synthesize tracers and bullet impacts
sv_connectTimeout|seconds without any message when a client is loading
sv_debugRate|Enable snapshot rate debugging info
sv_debugReliableCmds|Enable debugging information for 'reliable' commands
sv_disableClientConsole|Disallow remote clients from accessing the console
sv_FFCheckSums|Fast File server checksums
sv_FFNames|Names of Fast Files used by the server
sv_floodprotect|Prevent malicious lagging by flooding the server with commands. Is the number of client commands the server will process per 800ms. 0 means no flood protection.
sv_fps|Server frames per second
sv_hostname|Host name of the server
sv_iwdNames|Names of IWD files used by the server
sv_iwds|IWD server checksums
sv_keywords|Server keywords
sv_kickBanTime|Time in seconds for a player to be banned from the server after being kicked
sv_mapname|The current map name
sv_mapRotation|List of maps for the server to play
sv_mapRotationCurrent|Current map in the map rotation
sv_maxclients|The maximum number of clients that can connect to a server
sv_maxPing|Maximum ping allowed on the server
sv_maxRate|Maximum bit rate
sv_minPing|Minimum ping allowed on the server
sv_packet_info|Enable packet info debugging information
sv_padPackets|add nop bytes to messages
sv_paused|Pause the server
sv_privateClients|Maximum number of private clients allowed on the server
sv_privatePassword|password for the privateClient slots
sv_punkbuster|Enable PunkBuster on this server
sv_pure|Cannot use modified IWD files
sv_reconnectlimit|minimum seconds between connect messages
sv_referencedFFCheckSums|Checksum of all referenced Fast Files
sv_referencedFFNames|Names of all referenced Fast Files
sv_referencedIwdNames|Names of all referenced IWD files
sv_referencedIwds|Checksum of all referenced IWD files
sv_running|Server is running
sv_serverId|
sv_serverid|Server identification
sv_showAverageBPS|Show average bytes per second for net debugging
sv_showCommands|Print client commands in the log file
sv_timeout|seconds without any message
sv_voice|Use server side voice communications
sv_voiceQuality|Voice quality
sv_wwwBaseURL|The base url for files downloaded via http
sv_wwwDlDisconnected|Should clients stay connected while downloading?
sv_wwwDownload|Enable http downloads
sv_zombietime|seconds to sync messages after disconnect
sys_configSum|Configuration checksum
sys_configureGHz|Normalized total CPU power, based on cpu type, count, and speed; used in autoconfigure
sys_cpuGHz|Measured CPU speed
sys_cpuName|CPU name description
sys_gpu|GPU description
sys_lockThreads|Prevents specified threads from changing CPUs; improves profiling and may fix some bugs, but can hurt performance
sys_smp_allowed|Allow multi-threading
sys_SSE|Operating system allows Streaming SIMD Extensions
sys_sysMB|Physical memory in the system
timescale|Scale time of each frame
ui_allow_classchange|Whether the UI should allow changing class
ui_allow_teamchange|Whether the UI should allow changing team
ui_bigFont|Big font scale
ui_borderLowLightScale|Scales the border color for the lowlight color on certain UI borders
ui_browserFriendlyfire|Friendly fire is active
ui_browserHardcore|Hardcore mode
ui_browserKillcam|Kill cam is active
ui_browserMod|UI Mod value
ui_browserOldSchool|Oldschool mode
ui_browserShowDedicated|Show dedicated servers only
ui_browserShowEmpty|Show empty servers
ui_browserShowFull|Show full servers
ui_browserShowPassword|Show servers that are password protected
ui_browserShowPunkBuster|Only show PunkBuster servers?
ui_browserShowPure|Show pure servers only
ui_buildLocation|Where to draw the build number
ui_buildSize|Font size to use for the build number
ui_cinematicsTimestamp|Shows cinematics timestamp on subtitle UI elements.
ui_connectScreenTextGlowColor|Glow color applied to the mode and map name strings on the connect screen.
ui_currentMap|Current map index
ui_currentNetMap|Currently running map
ui_customClassName|Custom Class name
ui_customModeEditName|Name to give the currently edited custom game mode when editing is complete
ui_customModeName|Custom game mode name
ui_dedicated|True if this is a dedicated server
ui_drawCrosshair|Whether to draw crosshairs.
ui_extraBigFont|Extra big font scale
ui_gametype|Game type
ui_hud_hardcore|Whether the HUD should be suppressed for hardcore mode
ui_joinGametype|Game join type
ui_language|
ui_languagechanged|External Dvar
ui_lastServerRefresh_%i|
ui_maxclients|The maximum number of clients that can connect to a server
ui_multiplayer|True if the game is multiplayer
ui_Name|
ui_netGametype|Game type
ui_netGametypeName|Displayed game type name
ui_netSource|The network source where: 0:Local 1:Internet 2:Favourites
ui_playerProfileAlreadyChosen|true if player profile has been selected.
ui_playerProfileCount|Number of player profiles
ui_playerProfileNameNew|New player profile name
ui_playerProfileSelected|Selected player profile name
ui_serverStatusTimeOut|Time in milliseconds before a server status request times out
ui_showEndOfGame|Currently showing the end of game menu.
ui_showList|Show onscreen list of currently visible menus
ui_showMenuOnly|If set, only menus using this name will draw.
ui_smallFont|Small font scale
ui_uav_allies|Whether the UI should show UAV to allies
ui_uav_axis|Whether the UI should show UAV to axis
ui_uav_client|Whether the UI should show UAV to this client
uiscript_debug|spam debug info for the ui script
useFastFile|Enables loading data from fast files. Only tools can run without fast files.
vehDebugClient|Turn on debug information for vehicles
vehDebugServer|Turn on debug information for vehicles
vehDriverViewDist|How far away the driver's view is from the focus point
vehDriverViewFocusRange|How far the driver's view focus will travel vertically
vehDriverViewHeightMax|Max orbit altitude for driver's view
vehDriverViewHeightMin|Min orbit altitude for driver's view
vehHelicopterDecelerationFwd|Set the deceleration of the player helicopter (as a fraction of acceleration) in the direction the chopper is facing. So 1.0 makes it equal to the acceleration.
vehHelicopterDecelerationSide|Set the side-to-side deceleration of the player helicopter (as a fraction of acceleration). So 1.0 makes it equal to the acceleration.
vehHelicopterHeadSwayDontSwayTheTurret|If set, the turret will not fire through the crosshairs, but straight ahead of the vehicle, when the player is not freelooking.
vehHelicopterHoverSpeedThreshold|The speed below which the player helicopter begins to jitter the tilt, for hovering
vehHelicopterInvertUpDown|Invert the altitude control on the player helicopter.
vehHelicopterJitterJerkyness|Specifies how jerky the tilt jitter should be
vehHelicopterLookaheadTime|How far ahead (in seconds) the player helicopter looks ahead, to avoid hard collisions. (Like driving down the highway, you should keep 2 seconds distance between you and the vehicle in front of you)
vehHelicopterMaxAccel|Maximum horizontal acceleration of the player helicopter (in MPH per second)
vehHelicopterMaxAccelVertical|Maximum vertical acceleration of the player helicopter (in MPH per second)
vehHelicopterMaxPitch|Maximum pitch of the player helicopter
vehHelicopterMaxRoll|Maximum roll of the player helicopter
vehHelicopterMaxSpeed|Maximum horizontal speed of the player helicopter (in MPH)
vehHelicopterMaxSpeedVertical|Maximum vertical speed of the player helicopter (in MPH)
vehHelicopterMaxYawAccel|Maximum yaw acceleration of the player helicopter
vehHelicopterMaxYawRate|Maximum yaw speed of the player helicopter
vehHelicopterRightStickDeadzone|Dead-zone for the axes of the right thumbstick. This helps to better control the two axes separately.
vehHelicopterScaleMovement|Scales down the smaller of the left stick axes.
vehHelicopterSoftCollisions|Player helicopters have soft collisions (slow down before they collide).
vehHelicopterStrafeDeadzone|Dead-zone so that you can fly straight forward easily without accidentally strafing (and thus rolling).
vehHelicopterTiltFromAcceleration|The amount of tilt caused by acceleration
vehHelicopterTiltFromControllerAxes|The amount of tilt caused by the desired velocity (i.e., the amount of controller stick deflection)
vehHelicopterTiltFromDeceleration|The amount of tilt caused by deceleration
vehHelicopterTiltFromFwdAndYaw|The amount of roll caused by yawing while moving forward.
vehHelicopterTiltFromFwdAndYaw_VelAtMaxTilt|The forward speed (as a fraction of top speed) at which the tilt due to yaw reaches is maximum value.
vehHelicopterTiltFromVelocity|The amount of tilt caused by the current velocity
vehHelicopterTiltMomentum|The amount of rotational momentum the helicopter has with regards to tilting.
vehHelicopterTiltSpeed|The rate at which the player helicopter's tilt responds
vehHelicopterYawOnLeftStick|The yaw speed created by the left stick when pushing the stick diagonally (e.g., moving forward and strafing slightly).
vehTestHorsepower|
vehTestMaxMPH|
vehTestWeight|
vehTextureScrollScale|Scale vehicle texture scroll scale by this amount (debug only)
version|Game version
vid_xpos|Game window horizontal position
vid_ypos|game window vertical position
voice_deadChat|Allow dead players to talk to living players
voice_global|Send voice messages to everybody
voice_localEcho|Echo voice chat back to the player
waypointDebugDraw|Event %s (%i)
waypointDistScaleRangeMax|Distance from player that icon distance scaling ends.
waypointDistScaleRangeMin|Distance from player that icon distance scaling starts.
waypointDistScaleSmallest|Smallest scale that the distance effect uses.
waypointIconHeight|Height of the offscreen pointer.
waypointIconWidth|Width of the offscreen pointer.
waypointOffscreenCornerRadius|Size of the rounded corners.
waypointOffscreenDistanceThresholdAlpha|Distance from the threshold over which offscreen objective icons lerp their alpha.
waypointOffscreenPadBottom|Offset from the edge.
waypointOffscreenPadLeft|Offset from the edge.
waypointOffscreenPadRight|Offset from the edge.
waypointOffscreenPadTop|Offset from the edge.
waypointOffscreenPointerDistance|Distance from the center of the offscreen objective icon to the center its arrow.
waypointOffscreenPointerHeight|Height of the offscreen pointer.
waypointOffscreenPointerWidth|Width of the offscreen pointer.
waypointOffscreenRoundedCorners|Off-screen icons take rounded corners when true. 90-degree corners when false.
waypointOffscreenScaleLength|How far the offscreen icon scale travels from full to smallest scale.
waypointOffscreenScaleSmallest|Smallest scale that the offscreen effect uses.
waypointPlayerOffsetCrouch|For waypoints pointing to players, how high to offset off of their origin when they are crouching.
waypointPlayerOffsetProne|For waypoints pointing to players, how high to offset off of their origin when they are prone.
waypointPlayerOffsetStand|For waypoints pointing to players, how high to offset off of their origin when they are standing.
waypointSplitscreenScale|Scale applied to waypoint icons in splitscreen views.
waypointTweakY|
wideScreen|True if the game video is running in 16x9 aspect, false if 4x3.
winvoice_mic_mute|Mute the microphone
winvoice_mic_reclevel|Microphone recording level
winvoice_mic_scaler|Microphone scaler value
winvoice_save_voice|Write voice data to a file
`;

	function escapeHtml(text)
	{
		return String(text).replace(/[&<>"']/g, function (ch) { return HTML_ESCAPES[ch]; });
	}

	// name|description per line. Only the first separator counts, so a
	// description may contain anything except a line break.
	function parseTable()
	{
		var lines = DVAR_TABLE.split("\n");

		for (var i = 0; i < lines.length; i++)
		{
			var line = lines[i];
			if (line === "")
			{
				continue;
			}

			var cut = line.indexOf("|");
			var name = cut === -1 ? line : line.slice(0, cut);
			var desc = cut === -1 ? "" : line.slice(cut + 1);

			entries.push({
				name: name,
				desc: desc,
				haystack: (name + " " + desc).toLowerCase()
			});
		}
	}

	function render()
	{
		var html = [];

		for (var i = 0; i < entries.length; i++)
		{
			html.push('<div class="dv-row"><code class="dv-name">' + escapeHtml(entries[i].name) +
				'</code><p class="dv-desc">' +
				(entries[i].desc === "" ? "&mdash;" : escapeHtml(entries[i].desc)) +
				"</p></div>");
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
