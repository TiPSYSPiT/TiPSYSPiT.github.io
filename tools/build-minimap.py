"""Builds the minimap generator's data files from a CoD4 install.

    python tools/build-minimap.py --game C:\\Games\\CoD4 --cod4ff C:\\path\\to\\cod4-ff

Needs Pillow (with WebP) and the cod4-ff project: its Python package decodes
the .iwi textures, and its output folder holds the map scripts and entity
strings that `python python/extract.py --all <game>` wrote.

Writes to assets/minimap/ (or --out):

    maps.js     window.MINIMAP_MAPS: per map the minimap corners, north,
                compass range, S&D spawns and bomb sites
    icons.js    window.MINIMAP_ICONS: the compass frame, tickertape and icons
                as PNG data URLs, unchanged
    <map>.js    window.MINIMAP_IMAGES[<map>]: the minimap texture as a WebP
                data URL, loaded only when that map is picked

Plain scripts rather than JSON or image files, so the page also works when
index.html is opened straight from disk: browsers refuse fetch() and canvas
reads for file:// URLs, but load <script> tags and data URLs.
"""

import argparse
import base64
import io
import json
import math
import re
import sys
from pathlib import Path

# Stock maps, the patch and DLC maps, and the two usermaps of the install, in
# the order the dropdown lists them. The name is the one the game shows.
MAPS = [
    ("mp_convoy", "Ambush"),
    ("mp_backlot", "Backlot"),
    ("mp_bloc", "Bloc"),
    ("mp_bog", "Bog"),
    ("mp_broadcast", "Broadcast"),
    ("mp_carentan", "Chinatown"),
    ("mp_countdown", "Countdown"),
    ("mp_crash", "Crash"),
    ("mp_creek", "Creek"),
    ("mp_crossfire", "Crossfire"),
    ("mp_citystreets", "District"),
    ("mp_farm", "Downpour"),
    ("mp_killhouse", "Killhouse"),
    ("mp_overgrown", "Overgrown"),
    ("mp_pipeline", "Pipeline"),
    ("mp_shipment", "Shipment"),
    ("mp_showdown", "Showdown"),
    ("mp_strike", "Strike"),
    ("mp_vacant", "Vacant"),
    ("mp_cargoship", "Wet Work"),
    ("mp_crash_snow", "Winter Crash"),
    ("mp_backlot_x", "Backlot X (usermap)"),
    ("mp_cluster", "Cluster (usermap)"),
]

# The material each part of the compass is drawn with (ui_mp/compass_old.menu
# and cg_main_mp.cpp) and the image that material uses (from the materials in
# common_mp.ff and localized_common_mp.ff).
ICONS = {
    "minimap_background": "minimap_background",
    "minimap_tickertape_background": "minimap_tickertape_background",
    "minimap_tickertape_mp": "minimap_tickertape_256x16",
    "compassping_player": "compassping_player",
    "compassping_friendly_mp": "compassping_green_hollow_mp",
    "compassping_enemy": "compassping_enemyfiring",
    "compass_waypoint_target_a": "compass_waypoint_red_a",
    "compass_waypoint_target_b": "compass_waypoint_red_b",
    "compass_waypoint_defend_a": "compass_waypoint_green_a",
    "compass_waypoint_defend_b": "compass_waypoint_green_b",
}

# compassMaxRange when a map's script does not set it (cg_compass.cpp, MP).
DEFAULT_MAX_RANGE = 2500.0


def parse_ents(text):
    """Entity string -> list of {key: value} dicts, in file order."""
    ents = []
    for block in re.findall(r"\{(.*?)\}", text, re.S):
        ents.append(dict(re.findall(r'"([^"]*)"\s+"([^"]*)"', block)))
    return ents


def vec(s):
    return [float(v) for v in s.split()]


def minimap_corners(corners, north_yaw):
    """maps/mp/_compass.gsc setupMiniMap: the north-west and south-east corner.

    scr_requiredMapAspectRatio is unset in a normal game, so the area is not
    widened."""
    c0, c1 = corners
    n = (math.cos(math.radians(north_yaw)), math.sin(math.radians(north_yaw)))
    w = (-n[1], n[0])
    diff = (c1[0] - c0[0], c1[1] - c0[1])
    dot_w = diff[0] * w[0] + diff[1] * w[1]
    dot_n = diff[0] * n[0] + diff[1] * n[1]
    side = (n[0] * dot_n, n[1] * dot_n)
    if dot_w > 0:
        if dot_n > 0:
            nw, se = c1, c0
        else:
            nw = (c1[0] - side[0], c1[1] - side[1])
            se = (c0[0] + side[0], c0[1] + side[1])
    else:
        if dot_n > 0:
            nw = (c0[0] + side[0], c0[1] + side[1])
            se = (c1[0] - side[0], c1[1] - side[1])
        else:
            nw, se = c0, c1
    return [round(nw[0], 3), round(nw[1], 3)], [round(se[0], 3), round(se[1], 3)]


def spawn_list(ents, classname):
    out = []
    for e in ents:
        if e.get("classname") == classname and "origin" in e:
            o = vec(e["origin"])
            yaw = vec(e.get("angles", "0 0 0"))[1]
            out.append([round(o[0], 1), round(o[1], 1), round(yaw, 1)])
    return out


def map_data(map_id, name, ff_out):
    raw = ff_out / map_id / "raw" / "maps" / "mp"
    gsc = (raw / (map_id + ".gsc")).read_text(encoding="latin-1")
    ents = parse_ents((raw / (map_id + ".d3dbsp.ents")).read_text(encoding="latin-1"))

    material = re.search(r'setupMiniMap\s*\(\s*"([^"]+)"', gsc).group(1)
    m = re.search(r'setdvar\s*\(\s*"compassmaxrange"\s*,\s*"([0-9.]+)"', gsc, re.I)
    max_range = float(m.group(1)) if m else DEFAULT_MAX_RANGE

    # g_spawn_mp.cpp: a missing northyaw key means 0.
    north_yaw = float(ents[0].get("northyaw", "0") or 0)
    corners = [vec(e["origin"])[:2] for e in ents if e.get("targetname") == "minimap_corner"]
    if len(corners) != 2:
        raise SystemExit("%s: expected 2 minimap_corner entities, found %d" % (map_id, len(corners)))
    upper_left, lower_right = minimap_corners(corners, north_yaw)

    sites = []
    for e in ents:
        if e.get("targetname") == "bombzone" and "origin" in e:
            o = vec(e["origin"])
            label = e.get("script_label", "").lstrip("_").lower()
            sites.append({"label": label, "origin": [round(o[0], 1), round(o[1], 1)]})
    sites.sort(key=lambda s: s["label"])

    return {
        "id": map_id,
        "name": name,
        "material": material,
        "upperLeft": upper_left,
        "lowerRight": lower_right,
        "northYaw": north_yaw,
        "maxRange": max_range,
        "maxRangeSet": m is not None,
        "attackers": spawn_list(ents, "mp_sd_spawn_attacker"),
        "defenders": spawn_list(ents, "mp_sd_spawn_defender"),
        "bombsites": sites,
    }


def load_image(index, name, iwi_surfaces, decode_surface):
    data = index.read("images/%s.iwi" % name)
    if data is None:
        raise SystemExit("image %s not found in the .iwd archives" % name)
    fmt, width, height, _depth, kind, surfaces = iwi_surfaces(data)
    if kind != "2d":
        raise SystemExit("image %s is a %s texture" % (name, kind))
    return decode_surface(fmt, width, height, surfaces[0]).convert("RGBA")


def data_url(img, fmt, **save):
    buf = io.BytesIO()
    img.save(buf, fmt, **save)
    return "data:image/%s;base64,%s" % (fmt.lower(), base64.b64encode(buf.getvalue()).decode("ascii"))


def write_js(path, header, body):
    path.write_text("/*\n * %s\n * Generated by tools/build-minimap.py. Do not edit by hand.\n */\n%s" % (header, body),
                    encoding="utf-8", newline="\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--game", required=True, help="CoD4 install folder (with main/ and usermaps/)")
    ap.add_argument("--cod4ff", required=True, help="cod4-ff project folder (python/ and output/)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "assets" / "minimap"))
    ap.add_argument("--size", type=int, default=1024, help="largest minimap texture size in pixels")
    ap.add_argument("--quality", type=int, default=82, help="WebP quality of the minimap textures")
    args = ap.parse_args()

    cod4ff = Path(args.cod4ff)
    sys.path.insert(0, str(cod4ff / "python"))
    from cod4ff.iwd import IwdIndex
    from cod4ff.imageexport import decode_surface, iwi_surfaces

    game = Path(args.game)
    ff_out = cod4ff / "output"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    main_index = IwdIndex([game / "main"])

    icons = {}
    for material, image in ICONS.items():
        img = load_image(main_index, image, iwi_surfaces, decode_surface)
        icons[material] = data_url(img, "PNG", optimize=True)
        print("icon  %-32s %-30s %dx%d" % (material, image, img.width, img.height))
    write_js(out / "icons.js", "Minimap icons by material name, as the game's images, unchanged.",
             "window.MINIMAP_ICONS = %s;\n" % json.dumps(icons, indent="\t"))

    maps = []
    for map_id, name in MAPS:
        info = map_data(map_id, name, ff_out)
        # A usermap's own .iwd overrides main, as in the game.
        folders = [game / "main"]
        if (game / "usermaps" / map_id).is_dir():
            folders.append(game / "usermaps" / map_id)
        index = IwdIndex(folders) if len(folders) > 1 else main_index
        img = load_image(index, info["material"], iwi_surfaces, decode_surface)
        info["texture"] = [img.width, img.height]
        if max(img.size) > args.size:
            scale = args.size / max(img.size)
            img = img.resize((round(img.width * scale), round(img.height * scale)), resample=3)
        url = data_url(img, "WEBP", quality=args.quality, method=6)
        write_js(out / (map_id + ".js"), "Minimap texture of %s (%s)." % (map_id, info["material"]),
                 "window.MINIMAP_IMAGES = window.MINIMAP_IMAGES || {};\n"
                 "window.MINIMAP_IMAGES[%s] = \"%s\";\n" % (json.dumps(map_id), url))
        maps.append(info)
        print("map   %-16s range %-6g north %-4g %d/%d spawns, sites %s, %d KB" % (
            map_id, info["maxRange"], info["northYaw"], len(info["attackers"]), len(info["defenders"]),
            "".join(s["label"] for s in info["bombsites"]) or "-", len(url) // 1024))
        if index is not main_index:
            index.close()

    write_js(out / "maps.js", "Minimap data per map: corners, north, compass range, S&D spawns, bomb sites.",
             "window.MINIMAP_MAPS = %s;\n" % json.dumps(maps, indent="\t"))
    main_index.close()


if __name__ == "__main__":
    main()
