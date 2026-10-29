"""Builds the CoD2 dvar list for the "dvars" tab of the CoD2 section.

    python tools/build-cod2-dvars.py --cod2 C:\\Games\\CoD2 --cod2x C:\\path\\to\\CoD2x --zpam C:\\path\\to\\zpam3

Python 3.10+, standard library only. Writes js/cod2/dvars-data.js (or --out):
window.COD2_DVARS, one entry per dvar; js/cod2/dvars-proof.json (or
--proof-out): where each dvar was found; and prints a summary.

Only these three folders are read; no CoD4 data. A dvar is listed only with
proof from them: a registration, a config line, a script or menu that uses
it, or its name as a whole string in a CoD2 binary.

Sources and what each one gives:

stock CoD2 1.3
  CoD2MP_s.exe       the registrations, read from CoD2x's decompile of this
                     executable (<cod2x>/src/other/CoD2MP_s.c): type,
                     default, min, max, flags. Strings, enum lists and
                     anything else the decompile names by address are read
                     from the executable itself.
  gfx_d3d_mp_x86_s.dll
                     the renderer's registrations, read straight from its
                     machine code: the DLL calls the engine's register
                     functions through a pointer table with the arguments
                     pushed as constants.
  cvarlist dump      <cod2x>/src/other/cvars.xlsx, a "cvarlist" of a running
                     game. Only a cross-check of the cheat flag, and a name
                     only it knows is kept only if a CoD2 binary has that
                     name as a string. Its values are the values at the
                     time, not defaults, so they are not used.
  main/*.iwd         multiplayer menus (ui_mp), scripts (maps/mp) and configs:
                     the names of the dvars they use; default_mp.cfg also
                     gives the default of dvars the engine does not register.
CoD2x               Dvar_Register* calls in <cod2x>/src, and its menu.
zPAM                registerCvar / registerCvarEx and [[var]](...) calls in
                     <zpam>/source (type, default, min, max, comment), and the
                     names its scripts, menus and config read or set.

What does not count as proof: a piece of a name a menu macro glues together
("ui_x_line_" line_id "_team"); script code in /# #/ blocks, in comments or in
zPAM functions no live code reaches; the settings menus of gametypes the game
does not ship (settings_hqt, settings_sw); and, on its own, a line in a config
the game runs only in special cases (safe mode, first start, server_*.cfg).

Nothing is guessed: a field the source does not state stays empty. The cheat
flag comes only from the registration flags (DVAR_CHEAT = 0x80, as CoD2x's
cod2_dvars.h defines it).
"""

import argparse
import glob
import json
import math
import os
import re
import struct
import sys
import zipfile
from collections import OrderedDict

DVAR_CHEAT = 0x80
FLAG_NAMES = OrderedDict([
    ("DVAR_NOFLAG", 0x0), ("DVAR_ARCHIVE", 0x1), ("DVAR_USERINFO", 0x2), ("DVAR_SERVERINFO", 0x4),
    ("DVAR_SYSTEMINFO", 0x8), ("DVAR_NOWRITE", 0x10), ("DVAR_LATCH", 0x20), ("DVAR_ROM", 0x40),
    ("DVAR_CHEAT", 0x80), ("DVAR_CONFIG", 0x100), ("DVAR_SAVED", 0x200), ("DVAR_SCRIPTINFO", 0x400),
    ("DVAR_CHANGEABLE_RESET", 0x1000), ("DVAR_RENDERER", 0x2000), ("DVAR_EXTERNAL", 0x4000),
    ("DVAR_AUTOEXEC", 0x8000),
])
TYPE_NAMES = {0: "bool", 1: "float", 2: "vec2", 3: "vec3", 4: "vec4", 5: "int", 6: "enum", 7: "string", 8: "color"}

NAME_RE = r"[A-Za-z_][A-Za-z0-9_]*"


# --------------------------------------------------------------------------
# PE files
# --------------------------------------------------------------------------

class PE:
    def __init__(self, path):
        self.path = path
        self.data = open(path, "rb").read()
        d = self.data
        off = struct.unpack_from("<I", d, 0x3C)[0]
        nsec = struct.unpack_from("<H", d, off + 6)[0]
        opt = struct.unpack_from("<H", d, off + 20)[0]
        self.base = struct.unpack_from("<I", d, off + 24 + 28)[0]
        self.secs = []
        p = off + 24 + opt
        for _ in range(nsec):
            vsize, va, rsize, raw = struct.unpack_from("<IIII", d, p + 8)
            self.secs.append((va, vsize, raw, rsize))
            p += 40

    def off2va(self, o):
        for va, vs, raw, rs in self.secs:
            if raw <= o < raw + rs:
                return self.base + va + o - raw
        return None

    def va2off(self, v):
        for va, vs, raw, rs in self.secs:
            rel = v - self.base - va
            if 0 <= rel < min(vs, rs):
                return raw + rel
        return None

    def u32(self, v):
        o = self.va2off(v)
        return None if o is None else struct.unpack_from("<I", self.data, o)[0]

    def cstr(self, v, strict=False):
        o = self.va2off(v)
        if o is None:
            return None
        e = self.data.find(b"\0", o, o + 512)
        if e < 0:
            return None
        s = self.data[o:e]
        if any(c < 32 or c > 126 for c in s):
            return None
        if strict and not re.fullmatch(NAME_RE, s.decode()):
            return None
        return s.decode()

    def strings(self):
        """Every printable string of 3+ characters (for "is this name in the file")."""
        return set(m.decode() for m in re.findall(rb"[A-Za-z_][A-Za-z0-9_]{2,}", self.data))


def f32(bits):
    return struct.unpack("<f", struct.pack("<I", bits & 0xFFFFFFFF))[0]


def num(v):
    """A float from the game as the short number it was written as."""
    if v is None:
        return None
    if isinstance(v, float):
        if math.isinf(v) or abs(v) >= 3.4e38:
            return "inf" if v > 0 else "-inf"
        r = float("%.6g" % v)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    if v >= 0x7FFFFFFF:
        return "inf"
    if v <= -0x80000000:
        return "-inf"
    return v


# --------------------------------------------------------------------------
# collecting
# --------------------------------------------------------------------------

class Store:
    def __init__(self):
        self.items = OrderedDict()

    def get(self, name):
        key = name.lower()
        if key not in self.items:
            self.items[key] = {"name": name, "src": OrderedDict(), "desc": None}
        return self.items[key]

    def add(self, source, name, proof=None, **fields):
        """source: stock / cod2x / zpam. Fields that are None are not stated.

        proof: where the name was found, (kind, file, place) or a list of them;
        kind is registration, config, script, menu, string or cvarlist."""
        if not re.fullmatch(NAME_RE, name) or len(name) < 2:
            return
        e = self.get(name)
        for pr in ([proof] if isinstance(proof, tuple) else proof or []):
            if pr not in e.setdefault("proof", []):
                e["proof"].append(pr)
        s = e["src"].setdefault(source, {})
        for k, v in fields.items():
            if v is not None and s.get(k) is None:
                s[k] = v
        # The case a registration uses is the name's real spelling.
        if fields.get("reg") and not e.get("named"):
            e["name"] = name
            e["named"] = True


ROOTS = []      # (absolute folder, the name proofs show for it)


def rel(path):
    """A path as "<source folder>/<path inside it>", e.g. cod2x/src/mss32/radar.cpp."""
    full = os.path.abspath(path)
    for root, label in ROOTS:
        if full.lower().startswith(root.lower() + os.sep) or full.lower() == root.lower():
            return (label + "/" + os.path.relpath(full, root)).replace("\\", "/")
    return full.replace("\\", "/")


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def split_args(s):
    out, depth, cur, q = [], 0, "", False
    i = 0
    while i < len(s):
        c = s[i]
        if q:
            cur += c
            if c == "\\" and i + 1 < len(s):
                cur += s[i + 1]
                i += 1
            elif c == '"':
                q = False
        elif c == '"':
            q = True
            cur += c
        elif c in "([{":
            depth += 1
            cur += c
        elif c in ")]}":
            depth -= 1
            cur += c
        elif c == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += c
        i += 1
    if cur.strip():
        out.append(cur.strip())
    return out


def call_args(text, start):
    """The argument text of the call whose '(' is at text[start]."""
    depth, q = 0, False
    for i in range(start, min(len(text), start + 4000)):
        c = text[i]
        if q:
            if c == "\\":
                continue
            if c == '"' and text[i - 1] != "\\":
                q = False
            continue
        if c == '"':
            q = True
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i
    return None, start


# ---------- stock: executable (decompile + binary) ----------

def c_int(tok):
    tok = tok.strip()
    tok = re.sub(r"^\((?:int|signed int|unsigned int|_DWORD|char|unsigned __int8|__int16)\)\s*", "", tok)
    m = re.fullmatch(r"(-?)(0x[0-9A-Fa-f]+|\d+)[uUlL]*", tok)
    if not m:
        return None
    v = int(m.group(2), 0)
    return -v if m.group(1) else v


def c_float(tok):
    tok = tok.strip()
    m = re.fullmatch(r"-?\d+\.\d*(?:e[+-]?\d+)?", tok)
    if m:
        return float(tok)
    v = c_int(tok)
    return None if v is None else f32(v)


def c_str(tok, pe):
    tok = tok.strip()
    tok = re.sub(r"^\((?:int|const char \*|char \*)\)\s*", "", tok)
    m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', tok)
    if m:
        return m.group(1).encode().decode("unicode_escape")
    m = re.fullmatch(r"&?(?:byte|unk|asc|a[A-Za-z0-9_]*?|off|dword)_([0-9A-Fa-f]{5,8})", tok)
    if m:
        return pe.cstr(int(m.group(1), 16))
    return None


def c_enum(tok, pe):
    m = re.search(r"off_([0-9A-Fa-f]{5,8})", tok)
    if not m:
        return None
    va = int(m.group(1), 16)
    out = []
    for i in range(64):
        p = pe.u32(va + 4 * i)
        if not p:
            break
        s = pe.cstr(p)
        if s is None:
            return None
        out.append(s)
    return out or None


def stock_exe(store, decompile, pe):
    """Registrations from the decompile, then from the machine code (which
    also has the calls the decompile names through a variable)."""
    regs = OrderedDict()
    count = stock_exe_decompile(regs, decompile, pe)
    count += stock_exe_binary(regs, pe)
    for key, lst in regs.items():
        add_merged(store, lst)
    return count


def add_merged(store, lst):
    """One dvar registered by several calls: a call with DVAR_EXTERNAL only
    sets a value when nothing else created the dvar, so the real
    registrations win; re-registering adds flags, so they are OR'ed."""
    real = [r for r in lst if r.get("flags") is None or not r["flags"] & 0x4000] or lst
    rec = dict(real[0])
    flags = [r["flags"] for r in real if r.get("flags") is not None]
    rec["flags"] = None
    if flags:
        rec["flags"] = 0
        for f in flags:
            rec["flags"] |= f
    for r in real[1:]:
        for k, v in r.items():
            if rec.get(k) is None and v is not None and r.get("type") == rec.get("type"):
                rec[k] = v
    name = rec.pop("name")
    rec.pop("proof", None)
    store.add("stock", name, proof=[r["proof"] for r in lst if r.get("proof")], **rec)


EXE_FUNCS = {0x438040: ("bool", 3), 0x4380A0: ("int", 5), 0x438100: ("float", 5), 0x438340: ("string", 3),
             0x4383A0: ("enum", 4), 0x438410: ("color", 6), 0x438180: ("vec2", 6), 0x438210: ("vec3", 7),
             0x4382A0: ("vec4", 8),
             0x437DE0: ("new", 6)}


def stock_exe_binary(regs, pe):
    d = pe.data
    count = 0
    for va, vs, raw, rs in pe.secs[:1]:            # .text
        for i in range(raw, raw + rs - 5):
            if d[i] != 0xE8:
                continue
            tgt = (pe.off2va(i) + 5 + struct.unpack_from("<i", d, i + 1)[0]) & 0xFFFFFFFF
            if tgt not in EXE_FUNCS:
                continue
            kind, n = EXE_FUNCS[tgt]
            a = pushes_before(d, i, n)
            if len(a) != n:
                continue
            name = pe.cstr(a[0], strict=True)
            if not name:
                continue
            rec = {"name": name, "reg": "exe",
                   "proof": ("registration", rel(pe.path), "call at 0x%X" % pe.off2va(i))}
            if kind == "new":
                t = TYPE_NAMES.get(a[1])
                rec.update(type=t, flags=a[2])
                if t == "int":
                    rec.update(default=s32(a[3]), min=num(s32(a[4])), max=num(s32(a[5])))
                elif t == "bool":
                    rec["default"] = 1 if a[3] else 0
                elif t == "string":
                    rec["default"] = pe.cstr(a[3])
            else:
                rec.update(gfx_record(kind, a, pe))
            regs.setdefault(name.lower(), []).append(rec)
            count += 1
    return count


def stock_exe_decompile(regs, decompile, pe):
    text = open(decompile, encoding="latin-1").read()
    count = 0
    for m in re.finditer(r"\b(sub_437DE0|sub_438100|sub_438040|sub_438340|sub_4380A0|sub_4383A0|sub_438410|sub_438180|sub_438210|sub_4382A0)\(", text):
        args_text, _ = call_args(text, m.end() - 1)
        if args_text is None:
            continue
        a = split_args(args_text)
        name = c_str(a[0], pe) if a else None
        if not name or not re.fullmatch(NAME_RE, name):
            continue
        f = m.group(1)
        rec = {"reg": "exe"}
        try:
            if f == "sub_438040" and len(a) == 3:                       # Bool(name, value, flags)
                rec.update(type="bool", default=c_int(a[1]), flags=c_int(a[2]))
            elif f == "sub_4380A0" and len(a) == 5:                     # Int(name, value, min, max, flags)
                rec.update(type="int", default=c_int(a[1]), min=num(c_int(a[2])), max=num(c_int(a[3])), flags=c_int(a[4]))
            elif f == "sub_438100" and len(a) == 5:                     # Float(name, value, min, max, flags)
                rec.update(type="float", default=num(c_float(a[1])), min=num(c_float(a[2])),
                           max=num(c_float(a[3])), flags=c_int(a[4]))
            elif f == "sub_438340" and len(a) == 3:                     # String(name, value, flags)
                rec.update(type="string", default=c_str(a[1], pe), flags=c_int(a[2]))
            elif f == "sub_4383A0" and len(a) == 4:                     # Enum(name, list, index, flags)
                values = c_enum(a[1], pe)
                idx = c_int(a[2])
                rec.update(type="enum", values=values, flags=c_int(a[3]),
                           default=values[idx] if values and idx is not None and idx < len(values) else None)
            elif f == "sub_438410" and len(a) == 6:                     # Color(name, r, g, b, a, flags)
                ch = [c_float(x) for x in a[1:5]]
                rec.update(type="color", flags=c_int(a[5]),
                           default=" ".join(str(num(x)) for x in ch) if None not in ch else None)
            elif f == "sub_438180" and len(a) == 6:                     # Vec2(name, x, y, min, max, flags)
                v = [c_float(x) for x in a[1:3]]
                rec.update(type="vec2", min=num(c_float(a[3])), max=num(c_float(a[4])), flags=c_int(a[5]),
                           default=" ".join(str(num(x)) for x in v) if None not in v else None)
            elif f == "sub_438210" and len(a) == 7:                     # Vec3(name, x, y, z, min, max, flags)
                v = [c_float(x) for x in a[1:4]]
                rec.update(type="vec3", min=num(c_float(a[4])), max=num(c_float(a[5])), flags=c_int(a[6]),
                           default=" ".join(str(num(x)) for x in v) if None not in v else None)
            elif f == "sub_4382A0" and len(a) == 8:                     # Vec4(name, x, y, z, w, min, max, flags)
                v = [c_float(x) for x in a[1:5]]
                rec.update(type="vec4", min=num(c_float(a[5])), max=num(c_float(a[6])), flags=c_int(a[7]),
                           default=" ".join(str(num(x)) for x in v) if None not in v else None)
            elif f == "sub_437DE0" and len(a) == 6:                     # RegisterNew(name, type, flags, value, min, max)
                t = c_int(a[1])
                rec.update(type=TYPE_NAMES.get(t), flags=c_int(a[2]))
                if t == 5:
                    rec.update(default=c_int(a[3]), min=num(c_int(a[4])), max=num(c_int(a[5])))
                elif t == 0:
                    rec.update(default=c_int(a[3]))
                elif t == 7:
                    rec.update(default=c_str(a[3], pe))
            else:
                continue
        except (IndexError, ValueError):
            continue
        if rec.get("type") == "bool" and rec.get("default") is not None:
            rec["default"] = 1 if rec["default"] else 0
        rec["name"] = name
        rec["proof"] = ("registration", rel(decompile), "line %d" % line_of(text, m.start()))
        regs.setdefault(name.lower(), []).append(rec)
        count += 1
    return count


# ---------- stock: renderer DLL (machine code) ----------

# Slots of the DLL's table of engine functions, by what is passed to them.
GFX_SLOTS = {
    0x101D4A40: ("bool", 3),     # (name, value, flags)
    0x101D4A44: ("int", 5),      # (name, value, min, max, flags)
    0x101D4A48: ("float", 5),    # (name, value, min, max, flags)
    0x101D4A4C: ("string", 3),   # (name, value, flags)
    0x101D4A50: ("enum", 4),     # (name, list, index, flags)
    0x101D4A54: ("color", 6),    # (name, r, g, b, a, flags)
    0x101D4A5C: ("vec3", 7),     # (name, x, y, z, min, max, flags)
}


def pushes_before(data, i, n):
    """The n arguments pushed before the call at i, first argument first.

    Only accepts push imm32 / push imm8 and skips "mov [abs], eax" (storing
    the result of the call before). Anything else ends the walk: the result
    is then shorter than n and the call is not used."""
    out = []
    j = i
    while len(out) < n and j > i - 100:
        if data[j - 5] == 0x68:
            out.append(struct.unpack_from("<I", data, j - 4)[0])
            j -= 5
        elif data[j - 5] == 0xA3:
            j -= 5
        elif data[j - 2] == 0x6A:
            out.append(struct.unpack_from("<b", data, j - 1)[0] & 0xFFFFFFFF)
            j -= 2
        else:
            break
    return out


def s32(v):
    return v - (1 << 32) if v & 0x80000000 else v


def stock_gfx(store, pe):
    d = pe.data
    count = 0
    regs = OrderedDict()
    for i in range(len(d) - 6):
        if d[i] != 0xFF or d[i + 1] != 0x15:
            continue
        slot = struct.unpack_from("<I", d, i + 2)[0]
        if slot not in GFX_SLOTS:
            continue
        kind, n = GFX_SLOTS[slot]
        a = pushes_before(d, i, n)
        if len(a) != n:
            continue
        name = pe.cstr(a[0], strict=True)
        if not name:
            continue
        rec = {"name": name, "reg": "gfx", "proof": ("registration", rel(pe.path), "call at 0x%X" % pe.off2va(i))}
        rec.update(gfx_record(kind, a, pe))
        regs.setdefault(name.lower(), []).append(rec)
        count += 1
    for key, lst in regs.items():
        add_merged(store, lst)
    return count


def gfx_record(kind, a, pe):
    """Type, default, limits and flags from the pushed arguments of one call."""
    rec = {"type": kind, "flags": a[-1]}
    if kind == "bool":
        rec["default"] = 1 if a[1] else 0
    elif kind == "int":
        rec.update(default=s32(a[1]), min=num(s32(a[2])), max=num(s32(a[3])))
    elif kind == "float":
        rec.update(default=num(f32(a[1])), min=num(f32(a[2])), max=num(f32(a[3])))
    elif kind == "string":
        rec["default"] = pe.cstr(a[1])
    elif kind == "enum":
        values = []
        for k in range(64):
            p = pe.u32(a[1] + 4 * k)
            if not p:
                break
            s = pe.cstr(p)
            if s is None:
                values = None
                break
            values.append(s)
        rec["values"] = values or None
        if values and a[2] < len(values):
            rec["default"] = values[a[2]]
    elif kind == "color":
        rec["default"] = " ".join(str(num(f32(x))) for x in a[1:5])
    elif kind == "vec2":
        rec.update(default=" ".join(str(num(f32(x))) for x in a[1:3]), min=num(f32(a[3])), max=num(f32(a[4])))
    elif kind == "vec3":
        rec.update(default=" ".join(str(num(f32(x))) for x in a[1:4]), min=num(f32(a[4])), max=num(f32(a[5])))
    elif kind == "vec4":
        rec.update(default=" ".join(str(num(f32(x))) for x in a[1:5]), min=num(f32(a[5])), max=num(f32(a[6])))
    return rec


# ---------- stock: cvarlist dump ----------

def read_dump(path):
    """{lowercase name: (name, set of flag letters, sheet row)} from the cvarlist sheet."""
    z = zipfile.ZipFile(path)
    ss = z.read("xl/sharedStrings.xml").decode("utf-8")
    strings = [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    rows = re.findall(r"<row[^>]*>(.*?)</row>", sheet, re.S)
    header = {}
    out = {}
    for ri, row in enumerate(rows):
        cells = {}
        for col, attrs, v in re.findall(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<f>.*?</f>)?<v>(.*?)</v></c>', row):
            cells[col] = strings[int(v)] if 't="s"' in attrs else v
        if ri == 0:
            header = cells
            continue
        line = cells.get("I", "").strip()
        m = re.match(r"(" + NAME_RE + r")", line)
        if not m:
            continue
        letters = set()
        for col in "BCDEFGH":
            val = cells.get(col, "").strip()
            if len(val) == 1 and val.isalpha():
                letters.add(val)
        out[m.group(1).lower()] = (m.group(1), letters, ri + 1)
    return out


# ---------- text sources: menus, scripts, configs ----------

# Item keywords take the name in quotes (an unquoted word there is a macro
# parameter); the action commands take it bare or quoted.
MENU_RES = [
    r'\b(?:dvartest|dvarfloat|dvarint|dvarstring|dvarbool|dvarenumlist|dvarfloatlist|dvarstrlist|cvartest|'
    r'dvar|cvar)\b\s*"(' + NAME_RE + r')"',
    r'\b(?:setfromdvar|openmenuondvar|openmenuondvarnot|setdvar|setcvar)\b\s+"?(' + NAME_RE + r')"?',
    r'\b(?:exec|uiscript)\s+"[^"]*?\b(?:seta?|sets|setu|toggle)\s+(' + NAME_RE + r')',
]


def menu_text(text):
    """A menu without comments and without key binding items, whose "dvar"
    is the command the key runs."""
    text = blank_comments(text)
    parts = re.split(r"(?=\bitemDef\b)", text, flags=re.I)
    # a bind item is blanked, not cut out, so the lines after it keep their numbers
    return "".join(re.sub(r"[^\n]", " ", p) if re.search(r"\bITEM_TYPE_BIND\b", p) else p for p in parts)


# A quoted name followed by "+" is only the start of a name built at run time.
GSC_RES = [
    r'\b(?:getCvar|getCvarInt|getCvarFloat|setCvar|setCvarIfChanged|setCvarQuiet|setClientCvar|'
    r'setClientCvarIfChanged|makeCvarServerInfo|addCvarToChange)\s*\(\s*"(' + NAME_RE + r')"(?!\s*\+)',
]
CFG_RE = re.compile(r'^\s*(?:seta|sets|setu|set|setcvar)\s+(' + NAME_RE + r')\s*(.*?)\s*$', re.I | re.M)


def blank_comments(text):
    """Comments replaced by spaces, so positions and line numbers stay."""
    text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    return re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), text)


def blank_dev_blocks(text):
    """Script code between /# and #/ only runs with developer_script 1: blanked
    like a comment."""
    return re.sub(r"/#.*?#/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)


# A menu macro glues a name together from pieces: "ui_x_line_" line_id "_team".
# The first piece alone is no dvar.
GLUED = re.compile(r'[ \t]+#?[A-Za-z_]\w*[ \t]+"')


def scan_text(store, source, text, kind, label, cfg_defaults=False):
    """label: the file, as proofs show it."""
    names = OrderedDict()     # name -> first line
    proof_kind = {"menu": "menu", "gsc": "script", "cfg": "config"}[kind]
    if kind == "menu":
        text = menu_text(text)
        for rx in MENU_RES:
            for m in re.finditer(rx, text, re.I):
                if text[m.end() - 1] == '"' and GLUED.match(text, m.end()):
                    continue
                names.setdefault(m.group(1), line_of(text, m.start()))
    elif kind == "gsc":
        text = blank_dev_blocks(blank_comments(text))
        # the stock scripts write the functions in lower case: getcvarint(...)
        for rx in GSC_RES:
            for m in re.finditer(rx, text, re.I):
                names.setdefault(m.group(1), line_of(text, m.start()))
    elif kind == "cfg":
        for m in CFG_RE.finditer(text):
            name = m.group(1)
            names.setdefault(name, line_of(text, m.start()))
            if cfg_defaults:
                value = m.group(2).strip()
                if value.startswith('"'):
                    value = value[1:value.find('"', 1)] if value.find('"', 1) > 0 else value[1:]
                else:
                    value = value.split("//")[0].strip()
                store.add(source, name, cfgDefault=value,
                          proof=(proof_kind, label, "line %d" % line_of(text, m.start())))
    keywords = {"if", "and", "or", "not", "set", "seta", "exec", "true", "false", "menu", "focus", "self", "local"}
    for n, line in names.items():
        if n.lower() not in keywords and not n.startswith("_"):
            store.add(source, n, seen=kind, proof=(proof_kind, label, "line %d" % line))
    return len(names)


# Configs the game runs only in special cases (safe mode, first start, the
# example server configs): a name only they set needs a second proof.
EXTRA_CFG = re.compile(r"(?:^|:)(?:configure_mp|safemode_mp|safemode_mp_server|server_\w+)\.cfg$", re.I)


def stock_iwds(store, main_dir):
    stats = {"menu": 0, "gsc": 0, "cfg": 0}
    # CoD2x's and zPAM's archives are read from their own sources.
    paths = [p for p in sorted(glob.glob(os.path.join(main_dir, "*.iwd")))
             if os.path.basename(p).lower().startswith(("iw_", "localized_")) and "cod2x" not in p.lower()]
    # The gametypes the game ships; the settings menus of the others
    # (settings_hqt, settings_sw) are leftovers that no script reads.
    gametypes = set()
    for path in paths:
        for n in zipfile.ZipFile(path).namelist():
            m = re.match(r"maps/mp/gametypes/([a-z]+)\.gsc$", n.lower().replace("\\", "/"))
            if m:
                gametypes.add(m.group(1))
    for path in paths:
        z = zipfile.ZipFile(path)
        for n in z.namelist():
            low = n.lower().replace("\\", "/")
            label = rel(path) + ":" + n
            settings = re.match(r"ui_mp/settings_([a-z]+)\.menu$", low)
            if settings and settings.group(1) not in gametypes:
                continue
            if low.endswith(".menu") and low.startswith("ui_mp/"):
                stats["menu"] += scan_text(store, "stock", z.read(n).decode("latin-1"), "menu", label)
            elif low.endswith(".gsc") and low.startswith("maps/mp/"):
                stats["gsc"] += scan_text(store, "stock", z.read(n).decode("latin-1"), "gsc", label)
            elif low.endswith(".cfg") and "/" not in low:
                # the shipped multiplayer configs; the developers' own ones are left out
                if low == "default_mp.cfg":
                    stats["cfg"] += scan_text(store, "stock", z.read(n).decode("latin-1"), "cfg", label,
                                              cfg_defaults=True)
                elif low in ("configure_mp.cfg", "safemode_mp.cfg", "safemode_mp_server.cfg") or low.startswith("server_"):
                    stats["cfg"] += scan_text(store, "stock", z.read(n).decode("latin-1"), "cfg", label)
    return stats


# ---------- CoD2x ----------

def cod2x_flag_sets(expr, defines, depth=0):
    """Every flag value the expression can have in a release build, or None.

    A local flag variable may be "cond ? A : B"; both branches count, the
    condition does not."""
    if depth > 4:
        return None
    expr = re.sub(r"\((?:enum\s+)?dvarFlags_e\)", "", expr)
    expr = re.sub(r"DEBUG_RELEASE\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)", r"\2", expr)   # release build
    m = re.fullmatch(r"\s*(?:\(?[^?]*\)?)\s*\?\s*([^:]+):\s*(.+)", expr)
    if m:
        out = set()
        for branch in (m.group(1), m.group(2)):
            sub = cod2x_flag_sets(branch, defines, depth + 1)
            if sub is None:
                return None
            out |= sub
        return out
    results = {0}
    for tok in re.findall(r"[A-Za-z_][A-Za-z0-9_]*|0x[0-9A-Fa-f]+|\d+", expr):
        if tok in FLAG_NAMES:
            results = {r | FLAG_NAMES[tok] for r in results}
        elif re.fullmatch(r"0x[0-9A-Fa-f]+|\d+", tok):
            results = {r | int(tok, 0) for r in results}
        elif tok in defines:
            sub = cod2x_flag_sets(defines[tok], defines, depth + 1)
            if sub is None:
                return None
            results = {r | s for r in results for s in sub}
        else:
            return None
    return results


def cod2x_flags(expr, defines):
    """(flags or None when they depend on the build, cheat or None)."""
    sets = cod2x_flag_sets(expr, defines)
    if not sets:
        return None, None
    cheats = {bool(f & DVAR_CHEAT) for f in sets}
    return (next(iter(sets)) if len(sets) == 1 else None), (cheats.pop() if len(cheats) == 1 else None)


def cod2x_value(tok, defines):
    tok = tok.strip()
    if tok in ("true", "false"):
        return 1 if tok == "true" else 0
    m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', tok)
    if m:
        return m.group(1)
    tok2 = re.sub(r"[fF]$", "", tok)
    if re.fullmatch(r"-?\d+\.\d*|-?\.\d+|-?\d+\.?\d*e[+-]?\d+", tok2):
        return num(float(tok2))
    if re.fullmatch(r"-?(0x[0-9A-Fa-f]+|\d+)", tok):
        return int(tok, 0)
    consts = {"FLT_MAX": "inf", "-FLT_MAX": "-inf", "INT32_MAX": "inf", "INT32_MIN": "-inf",
              "INT_MAX": "inf", "INT_MIN": "-inf"}
    if tok in consts:
        return consts[tok]
    if tok in defines and defines[tok] != tok:
        return cod2x_value(defines[tok], {})
    return None


def cod2x_source(store, root):
    src = os.path.join(root, "src")
    files = [p for p in glob.glob(os.path.join(src, "**", "*.*"), recursive=True)
             if p.endswith((".cpp", ".h", ".c")) and os.sep + "other" + os.sep not in p]
    defines = {}
    for p in files:
        t = open(p, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r"#define\s+([A-Z_][A-Z0-9_]*)\s+([^\n/]+)", t):
            defines.setdefault(m.group(1), m.group(2).strip())
        # local flag variables such as "dvarFlags_e nowrite = DVAR_NOWRITE;"
        for m in re.finditer(r"dvarFlags_e\s+([a-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);", t):
            defines.setdefault(m.group(1), m.group(2))
    count = 0
    for p in files:
        t = open(p, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r"\bDvar_Register(Bool|Int|Float|String|Enum|Vec2|Vec3|Vec4|Color)\s*\(", t):
            line_start = t.rfind("\n", 0, m.start()) + 1
            if t[line_start:m.start()].strip().startswith("//") or "inline dvar_t*" in t[line_start:m.start()]:
                continue
            args_text, end = call_args(t, m.end() - 1)
            if args_text is None:
                continue
            a = split_args(args_text)
            if not a or not re.fullmatch(r'"' + NAME_RE + r'"', a[0]):
                continue
            name = a[0][1:-1]
            kind = m.group(1).lower()
            flags, cheat = cod2x_flags(a[-1], defines)
            rec = {"reg": "cod2x", "type": kind, "flags": flags, "cheat": cheat}
            if kind in ("bool", "string") and len(a) == 3:
                rec["default"] = cod2x_value(a[1], defines)
            elif kind in ("int", "float") and len(a) == 5:
                rec.update(default=cod2x_value(a[1], defines), min=cod2x_value(a[2], defines),
                           max=cod2x_value(a[3], defines))
            elif kind == "enum" and len(a) == 4:
                arr = re.search(re.escape(a[1].strip()) + r"\s*\[\s*\]\s*=\s*\{([^}]*)\}", t)
                if arr:
                    values = [v.strip()[1:-1] for v in split_args(arr.group(1)) if v.strip().startswith('"')]
                    rec["values"] = values
                    idx = cod2x_value(a[2], defines)
                    if isinstance(idx, int) and idx < len(values):
                        rec["default"] = values[idx]
            # a comment at the end of the registration line describes it
            line_end = t.find("\n", end)
            tail = t[end + 1:line_end]
            cm = re.search(r"//\s*(.+)$", tail)
            if cm:
                rec["comment"] = cm.group(1).strip()
            store.add("cod2x", name, proof=("registration", rel(p), "line %d" % line_of(t, m.start())), **rec)
            count += 1
    menu = os.path.join(src, "embedded", "iw_CoD2x_01", "ui_mp")
    for p in glob.glob(os.path.join(menu, "*.menu")):
        scan_text(store, "cod2x", open(p, encoding="latin-1").read(), "menu", rel(p))
    return count


# ---------- zPAM ----------

ZPAM_TYPES = {"INT": "int", "FLOAT": "float", "BOOL": "bool", "STRING": "string"}

# Comments that are notes to the code rather than descriptions, or not English.
NOT_ENGLISH = re.compile(r"\b(musi|jinak|nefunguje|ne vsechny|prikazy|zpracovany|neni|kdyz|pokud|hrac|hraci|jestli|"
                         r"nastav|zmena|zatim|uz|aby|protoze|tady|toto|tento)\b", re.I)


def zpam_comment(c):
    c = c.strip()
    if not c or c.startswith(("level.", "game[", "[[", "TODO", "ZPAM_RENAME")) or NOT_ENGLISH.search(c):
        return None
    if re.fullmatch(r"[\w\.\[\]\"]+", c) or len(c) < 6:
        return None
    return c[0].upper() + c[1:]


def zpam_value(tok, kind):
    tok = tok.strip()
    if tok == "undefined" or tok == "":
        return None
    m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', tok)
    if m:
        return m.group(1)
    if re.fullmatch(r"-?\d+(\.\d+)?|-?\.\d+", tok):
        v = float(tok)
        return int(v) if v == int(v) and kind != "float" else num(v)
    return None


FUNC_RE = re.compile(r"^([A-Za-z_]\w*)\s*\([^)]*\)\s*\{", re.M)


def unreachable_functions(texts):
    """{path: [(start, end)]} of the script functions no live code reaches.

    The game starts a mod's scripts at main() and the CodeCallback_*
    functions; from there a function reaches every name it calls or takes
    with ::name, in any file (by bare name, so a name used anywhere counts
    for all functions of that name). Calls in comments and in /# #/ blocks
    do not count: zPAM keeps test functions whose every call is commented out."""
    funcs = {}           # path -> [(name, start, end)]
    for path, t in texts.items():
        clean = blank_dev_blocks(blank_comments(t))
        lst = []
        for m in FUNC_RE.finditer(clean):
            depth, i = 1, m.end()
            while i < len(clean) and depth:
                depth += {"{": 1, "}": -1}.get(clean[i], 0)
                i += 1
            refs = {a or b for a, b in re.findall(r"\b([A-Za-z_]\w*)\s*\(|::\s*([A-Za-z_]\w*)", clean[m.end():i])}
            lst.append((m.group(1), m.start(), i, refs))
        funcs[path] = lst
    by_name = {}
    for path, lst in funcs.items():
        for name, a, b, refs in lst:
            by_name.setdefault(name.lower(), []).append(refs)
    seen = set()
    todo = [n for n in by_name if n == "main" or n.startswith("codecallback_")]
    while todo:
        n = todo.pop()
        if n in seen:
            continue
        seen.add(n)
        for refs in by_name.get(n, []):
            todo.extend(r.lower() for r in refs if r.lower() in by_name and r.lower() not in seen)
    return {path: [(a, b) for name, a, b, refs in lst if name.lower() not in seen] for path, lst in funcs.items()}


def blank_spans(text, spans):
    for a, b in spans:
        text = text[:a] + re.sub(r"[^\n]", " ", text[a:b]) + text[b:]
    return text


def zpam_source(store, root):
    src = os.path.join(root, "source")
    count = 0
    paths = glob.glob(os.path.join(src, "**", "*.gsc"), recursive=True)
    texts = {p: open(p, encoding="latin-1").read() for p in paths}
    dead = unreachable_functions(texts)
    for p in paths:
        t = blank_spans(texts[p], dead[p])
        clean = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), t, flags=re.S)
        for m in re.finditer(r"(?:\[\[\s*\w+\s*\]\]|\bregisterCvar(?:Ex)?)\s*\(", clean):
            line_start = clean.rfind("\n", 0, m.start()) + 1
            if "//" in clean[line_start:m.start()]:
                continue
            args_text, end = call_args(clean, m.end() - 1)
            if args_text is None:
                continue
            a = split_args(args_text)
            # registerCvar(name, TYPE, default, min, max) or registerCvarEx(method, name, TYPE, ...)
            pos = next((i for i in range(min(3, len(a))) if a[i].strip('"') in ZPAM_TYPES and a[i].startswith('"')), None)
            if pos is None or pos == 0 or not re.fullmatch(r'"' + NAME_RE + r'"', a[pos - 1]):
                continue
            name = a[pos - 1][1:-1]
            kind = ZPAM_TYPES[a[pos][1:-1]]
            rest = a[pos + 1:]
            rec = {"reg": "zpam", "type": kind}
            if rest:
                rec["default"] = zpam_value(rest[0], kind)
            if kind != "string":
                if len(rest) > 1:
                    rec["min"] = zpam_value(rest[1], kind)
                if len(rest) > 2:
                    rec["max"] = zpam_value(rest[2], kind)
            if kind == "bool" and rec.get("default") is not None:
                rec["default"] = 1 if rec["default"] else 0
            line_end = t.find("\n", end)
            cm = re.search(r"//\s*(.+)$", t[end + 1:line_end])
            if cm:
                rec["comment"] = zpam_comment(cm.group(1))
            store.add("zpam", name, proof=("registration", rel(p), "line %d" % line_of(t, m.start())), **rec)
            count += 1
        scan_text(store, "zpam", t, "gsc", rel(p))
    for p in glob.glob(os.path.join(src, "ui_mp", "**", "*.menu"), recursive=True):
        scan_text(store, "zpam", open(p, encoding="latin-1").read(), "menu", rel(p))
    cfg = os.path.join(src, "default_mp.cfg")
    if os.path.exists(cfg):
        scan_text(store, "zpam", open(cfg, encoding="latin-1").read(), "cfg", rel(cfg))
    return count


# ---------- what CoD2x and zPAM do to a dvar besides registering it ----------

def function_body(text, name):
    """The body of `name(...) { ... }` in a script or C++ file, and its offset."""
    m = re.search(r"^\s*" + re.escape(name) + r"\s*\([^)]*\)\s*\{", text, re.M)
    if not m:
        return None, 0
    depth, i = 1, m.end()
    while i < len(text) and depth:
        depth += {"{": 1, "}": -1}.get(text[i], 0)
        i += 1
    return text[m.end():i - 1], m.end()


def cod2x_protections(root):
    """{name: [(kind, data, reference)]}

    flags   CoD2x patches the flags of a stock registration:
            patch_int32(addr, (DVAR_...)); // <name> flags, originally DVAR_...
    limit   g_competitive 1 locks it (competitive.cpp): its limits and the
            value it is set back to."""
    out = {}
    src = os.path.join(root, "src")
    for p in glob.glob(os.path.join(src, "**", "*.cpp"), recursive=True):
        t = open(p, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r"patch_int32\([^;]*?,\s*\(?([A-Z_ |]+?)\)?\);\s*//\s*(" + NAME_RE +
                             r") flags, originally ([A-Z_ |]+)", t):
            new = cod2x_flags(m.group(1), {})[0]
            old = cod2x_flags(m.group(3).strip(), {})[0]
            out.setdefault(m.group(2).lower(), []).append(
                ("flags", (old, new), rel(p) + ":%d" % line_of(t, m.start())))
        if "g_competitive->value.boolean" not in t:
            continue
        names = dict(re.findall(r"dvar_t\*\s*(\w+)\s*=\s*Dvar_GetDvarByName\(\"(" + NAME_RE + r")\"\)", t))
        start = t.index("if (g_competitive->value.boolean)")
        end = t.find("} else {", start)
        block = t[start:end]
        for var, name in names.items():
            limits = dict((k, int(v)) for k, v in re.findall(re.escape(var) + r"->limits\.integer\.(min|max)\s*=\s*(-?\d+)", block))
            sets = re.findall(r"Dvar_SetInt\(" + re.escape(var) + r",\s*(-?\d+)\)", block)
            first = re.search(re.escape(var) + r"->limits", block)
            if not limits or not first:
                continue
            fixed = limits.get("min") == limits.get("max") or (
                "max" not in limits and re.search(re.escape(var) + r"->value\.integer\s*!=", block))
            data = {"fixed": int(sets[0]) if sets else limits["min"]} if fixed else limits
            out.setdefault(name.lower(), []).append(
                ("limit", data, rel(p) + ":%d" % line_of(t, start + first.start())))
    return out


def zpam_protections(root):
    """{name: [(kind, value, reference)]}

    join    set once on every player after the first team selection
            (competitiveQuality in _cvar_forces.gsc)
    reset   reset at every map start (ResetCheatCvars in cvars.gsc)
    rules   registerCvarEx("C", ...): always reset to the rules' value
    The reference of zPAM turning on g_competitive comes as "competitive"."""
    out = {"competitive": None}
    src = os.path.join(root, "source")
    for p in glob.glob(os.path.join(src, "**", "*.gsc"), recursive=True):
        t = open(p, encoding="latin-1").read()
        m = re.search(r'setCvar\(\s*"g_competitive"\s*,\s*"1"\s*\)', t)
        if m:
            out["competitive"] = rel(p) + ":%d" % line_of(t, m.start())
        for func, kind, call in (("competitiveQuality", "join", "setClientCvar2"), ("ResetCheatCvars", "reset", "setCvar")):
            body, at = function_body(t, func)
            if body is None:
                continue
            for m in re.finditer(r"\b" + call + r'\(\s*"(' + NAME_RE + r')"\s*,\s*"?([^")]*)"?\s*\)', body):
                out.setdefault(m.group(1).lower(), []).append(
                    (kind, m.group(2), rel(p) + ":%d" % line_of(t, at + m.start())))
        for m in re.finditer(r'\bregisterCvarEx\(\s*"C"\s*,\s*"(' + NAME_RE + r')"', t):
            out.setdefault(m.group(1).lower(), []).append(("rules", None, rel(p) + ":%d" % line_of(t, m.start())))
    return out


DECOMPILE = "cod2x/src/other/"


def reg_ref(e, source):
    """The first registration proof of a source, as a reference. The stock
    game's: the executable or DLL first, then CoD2x's decompile of it."""
    regs = [p for p in e.get("proof", []) if p[0] == "registration"]
    if source == "stock":
        regs = [p for p in regs if p[1].startswith("cod2/")] + [p for p in regs if p[1].startswith(DECOMPILE)]
    else:
        regs = [p for p in regs if p[1].startswith("cod2x/") and not p[1].startswith(DECOMPILE)]
    if not regs:
        return None
    pr = regs[0]
    return pr[1] + (":" + pr[2][5:] if pr[2].startswith("line ") else " (" + pr[2] + ")")


def protection(e, flags, cheat, x_prot, z_prot):
    """[type, reason, reference] of the dvar, or None when nothing protects it.
    Notes on what CoD2x or zPAM also do are added to the reason."""
    src = e["src"]
    key = e["name"].lower()
    stock_flags = src.get("stock", {}).get("flags")
    x = src.get("cod2x", {})
    x_cheat = x.get("cheat") if x.get("flags") is None else bool(x["flags"] & DVAR_CHEAT)
    notes = []
    for kind, data, ref in x_prot.get(key, []):
        if kind == "flags" and data[0] & DVAR_CHEAT and not data[1] & DVAR_CHEAT:
            notes.append("CoD2x 1.4 removes the flag (%s), so it can be changed there without sv_cheats." % ref)
    for kind, value, ref in z_prot.get(key, []):
        if kind == "reset":
            notes.append("zPAM resets it to %s at every map start (%s)." % (value, ref))
        elif kind == "join":
            notes.append("zPAM sets it to %s once after a player joins (%s)." % (value, ref))

    def result(kind, reason, ref):
        return [kind, " ".join([reason] + notes), ref]

    if stock_flags is not None and stock_flags & DVAR_CHEAT:
        return result("Engine", "Registered with the cheat flag (0x80) by the stock 1.3 game. Only works with "
                                "sv_cheats 1.", reg_ref(e, "stock"))
    if x_cheat:
        return result("CoD2x", "Registered with the cheat flag (0x80) by CoD2x. Only works with sv_cheats 1.",
                      reg_ref(e, "cod2x"))
    for kind, data, ref in x_prot.get(key, []):
        if kind == "limit":
            what = ("keeps it at %d" % data["fixed"]) if "fixed" in data else \
                "keeps it between %d and %d" % (data["min"], data["max"])
            by = (" zPAM turns it on (%s)." % z_prot["competitive"]) if z_prot.get("competitive") else ""
            return result("CoD2x enforced", "While the server sets g_competitive 1, CoD2x %s; the player cannot "
                                            "change it.%s" % (what, by), ref)
    joins = [p for p in z_prot.get(key, []) if p[0] == "join"]
    if joins:
        notes[:] = [n for n in notes if not n.startswith("zPAM sets it")]
        return result("set by zPAM", "zPAM sets it to %s once, after the player first picks a team. It does not "
                                     "check it again: the player can change it afterwards." % joins[0][1], joins[0][2])
    if flags is not None and flags & 0x40:
        return result("Read-only", "Registered read-only (DVAR_ROM): only the game itself sets it.",
                      reg_ref(e, "stock") or reg_ref(e, "cod2x"))
    if flags is not None and flags & 0x10:
        return result("Write-protected", "Registered with DVAR_NOWRITE: only the server or the game itself "
                                         "may set it.", reg_ref(e, "stock") or reg_ref(e, "cod2x"))
    rules = [p for p in z_prot.get(key, []) if p[0] == "rules"]
    if rules:
        return result("zPAM rules", "zPAM registers it as not customizable (\"C\"): it is always reset to "
                                    "the value of the rules.", rules[0][2])
    if cheat is None:
        return result("unknown", "No registration with flags was found in the CoD2 sources.", None)
    return None


# ---------- descriptions from the mods' own documentation ----------

def clean_md(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)            # images
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)         # links
    text = text.replace("**", "").replace("`", "")
    text = re.sub(r"<br\s*/?>", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -;:")
    return text[0].upper() + text[1:] if text else text


def readme_descriptions(path):
    """{lowercase name: text} for the dvars a README documents itself.

    Recognised forms (CoD2x and zPAM write them like this):
      - `name` - text
      - `name 1` - text            (one line per value: "1: text; 2: text")
      - New cvar `name` to text / ... via new cvar `name` / ... using new cvar `name`
      - Text (`name`)
      | **Title** - text<br>`name` | ...   (zPAM's settings table)
    """
    if not os.path.exists(path):
        return {}
    out = OrderedDict()
    values = OrderedDict()
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.rstrip()
        m = re.match(r"\s*[-*]\s*`(" + NAME_RE + r")`\s+-\s+(.+)$", line)
        if m:
            out.setdefault(m.group(1).lower(), clean_md(m.group(2)))
            continue
        m = re.match(r"\s*[-*]\s*`(" + NAME_RE + r") (-?[\w.]+)`(?: \(default\))?\s+-\s+(.+)$", line)
        if m:
            values.setdefault(m.group(1).lower(), []).append(m.group(2) + ": " + clean_md(m.group(3)))
            continue
        m = re.match(r"\s*[-*]\s*New cvar `(" + NAME_RE + r")`\s+(?:to\s+)?(.+)$", line)
        if m:
            out.setdefault(m.group(1).lower(), clean_md(m.group(2)))
            continue
        m = re.match(r"\s*[-*]\s*(.+?)\s+(?:via|using) new cvar `(" + NAME_RE + r")`(.*)$", line)
        if m:
            out.setdefault(m.group(2).lower(), clean_md(m.group(1) + m.group(3)))
            continue
        m = re.match(r"\s*[-*]\s*(.+?)\s*\(`(" + NAME_RE + r")`\);?$", line)
        if m:
            out.setdefault(m.group(2).lower(), clean_md(m.group(1)))
            continue
        m = re.match(r"\|\s*\*\*([^*]+)\*\*\s*-\s*(.+?)<br>`(" + NAME_RE + r")`\s*\|", line)
        if m:
            out.setdefault(m.group(3).lower(), clean_md(m.group(1) + " - " + m.group(2)))
    for name, parts in values.items():
        out.setdefault(name, "; ".join(parts))
    # "Changeable via new cvar x" says nothing about x: too short to keep.
    return OrderedDict((k, v) for k, v in out.items() if len(v) >= 12)


# --------------------------------------------------------------------------
# merging and output
# --------------------------------------------------------------------------

# Comments that note a version or a question rather than describe the dvar.
NOT_A_DESCRIPTION = re.compile(r"^(CoD2x since|since \d|NOTE:|TODO)|\?\?|^\W*$", re.I)


PROOF_ORDER = ["registration", "config", "script", "menu", "string", "cvarlist"]
MAX_PROOFS = 3


def string_proof(pe, name):
    """The name as a whole string in a binary: ("string", file, offset)."""
    o = pe.data.find(b"\0" + name.encode() + b"\0")
    if o < 0:
        return None
    va = pe.off2va(o + 1)
    return ("string", rel(pe.path), ("offset 0x%X" % va) if va else ("file offset 0x%X" % (o + 1)))


def cheat_of(flags):
    return None if flags is None else bool(flags & DVAR_CHEAT)


def build(args):
    ROOTS[:] = [(os.path.abspath(args.cod2), "cod2"), (os.path.abspath(args.cod2x), "cod2x"),
                (os.path.abspath(args.zpam), "cod2-zpam3")]
    store = Store()
    cod2 = args.cod2
    other = os.path.join(args.cod2x, "src", "other")
    exe = PE(os.path.join(cod2, "CoD2MP_s.exe"))
    gfx = PE(os.path.join(cod2, "gfx_d3d_mp_x86_s.dll"))

    report = OrderedDict()
    report["stock exe registrations"] = stock_exe(store, os.path.join(other, "CoD2MP_s.c"), exe)
    report["stock gfx dll registrations"] = stock_gfx(store, gfx)
    report["stock iwd names (menu/gsc/cfg)"] = stock_iwds(store, os.path.join(cod2, "main"))
    report["cod2x registrations"] = cod2x_source(store, args.cod2x)
    report["zpam registrations"] = zpam_source(store, args.zpam)
    x_prot = cod2x_protections(args.cod2x)
    z_prot = zpam_protections(args.zpam)
    docs = OrderedDict([("CoD2x README", readme_descriptions(os.path.join(args.cod2x, "README.md"))),
                        ("zPAM README", readme_descriptions(os.path.join(args.zpam, "README.md")))])
    report["README descriptions"] = OrderedDict((k, len(v)) for k, v in docs.items())

    # The cvarlist dump: a cross-check of the cheat flag; a name only it knows
    # is kept only if a CoD2 binary has it as a whole string.
    dump_path = os.path.join(other, "cvars.xlsx")
    dump = read_dump(dump_path)
    mss_path = os.path.join(cod2, "mss32.dll")
    mss = PE(mss_path) if os.path.exists(mss_path) else None
    unattributed = []
    for key, (name, letters, row) in dump.items():
        e = store.items.get(key)
        if e is None:
            found = None
            for pe, source in ((exe, "stock"), (gfx, "stock"), (mss, "cod2x")):
                hit = string_proof(pe, name) if pe is not None else None
                if hit:
                    found = (source, hit)
                    break
            if found is None:
                unattributed.append(name)
                continue
            store.add(found[0], name, seen="dump", proof=found[1])
            e = store.items[key]
        e["dump"] = "".join(sorted(letters))
        store.add(next(iter(e["src"])), e["name"], proof=("cvarlist", rel(dump_path), "row %d" % row))

    entries = []
    proof_map = OrderedDict()
    unproven = []
    stats = OrderedDict((k, 0) for k in ("stock", "cod2x", "zpam"))
    cheat_true = cheat_unknown = 0
    kinds = OrderedDict()
    cheat_from = OrderedDict([("registration", 0)])
    mismatch = []
    missing = OrderedDict((k, 0) for k in ("type", "default", "min/max (int/float)", "description", "cheat flag"))
    extra_only = []
    for key, e in list(store.items.items()):
        pr = e.get("proof", [])
        if pr and all(p[0] == "config" and EXTRA_CFG.search(p[1]) for p in pr):
            extra_only.append(e["name"])
            del store.items[key]
    for key, e in sorted(store.items.items()):
        src = e["src"]
        for s in src:
            stats[s] += 1
        # Main values: the engine's registration first, then CoD2x's, then zPAM's.
        order = [s for s in ("stock", "cod2x", "zpam") if s in src and src[s].get("reg")]
        main = src[order[0]] if order else {}
        alt = {}
        for s in order[1:]:
            other_vals = {k: src[s].get(k) for k in ("default", "min", "max") if src[s].get(k) is not None}
            if other_vals and any(other_vals.get(k) != main.get(k) for k in other_vals):
                alt[s] = other_vals

        flags = next((src[s]["flags"] for s in order if src[s].get("flags") is not None), None)
        cheat = cheat_of(flags)
        if cheat is None:
            # flags that depend on the build, but agree on the cheat bit
            cheat = next((src[s]["cheat"] for s in order if src[s].get("cheat") is not None), None)
        if cheat is not None:
            cheat_from["registration"] += 1
        # The cvarlist dump only cross-checks: a cheat flag it alone knows
        # stays unknown.
        if "dump" in e and cheat is not None and cheat != ("C" in e["dump"]):
            mismatch.append(e["name"])
        if cheat:
            cheat_true += 1
        if cheat is None:
            cheat_unknown += 1

        default = main.get("default")
        default_from = order[0] if default is not None and order else None
        if default is None:
            for s in ("stock", "zpam", "cod2x"):
                if s in src and src[s].get("cfgDefault") is not None:
                    default, default_from = src[s]["cfgDefault"], s + " cfg"
                    break

        # Descriptions only from the game's own side: CoD2 1.3 registers
        # its dvars without one, so they come from CoD2x's and zPAM's
        # documentation, then from the comments on their registrations.
        desc, desc_from = None, None
        for label, table in docs.items():
            if key in table:
                desc, desc_from = table[key], label
                break
        if desc is None:
            for s, label in (("cod2x", "CoD2x source"), ("zpam", "zPAM source")):
                comment = src.get(s, {}).get("comment")
                if comment and not NOT_A_DESCRIPTION.search(comment):
                    desc, desc_from = comment, label
                    break

        item = OrderedDict()
        item["n"] = e["name"]
        item["s"] = [s for s in ("stock", "cod2x", "zpam") if s in src]
        item["t"] = main.get("type")
        item["d"] = default
        item["dn"] = default_from
        item["mn"] = main.get("min")
        item["mx"] = main.get("max")
        item["v"] = main.get("values")
        item["f"] = flags
        item["c"] = cheat
        item["x"] = alt or None
        item["ds"] = desc
        item["dsn"] = desc_from
        item["p"] = protection(e, flags, cheat, x_prot, z_prot)
        proofs = sorted(e.get("proof", []), key=lambda pr: PROOF_ORDER.index(pr[0]))
        if not proofs:
            unproven.append(e["name"])
            continue
        proof_map[e["name"]] = [list(pr) for pr in proofs[:MAX_PROOFS]]
        entries.append(OrderedDict((k, v) for k, v in item.items() if v is not None))
        kind = item["p"][0] if item["p"] else "none"
        kinds[kind] = kinds.get(kind, 0) + 1

        if item["t"] is None:
            missing["type"] += 1
        if default is None:
            missing["default"] += 1
        if item["t"] in ("int", "float") and (item["mn"] is None or item["mx"] is None):
            missing["min/max (int/float)"] += 1
        if desc is None:
            missing["description"] += 1
        if cheat is None:
            missing["cheat flag"] += 1

    summary = OrderedDict()
    summary["dvars"] = len(entries)
    summary["by source (a dvar can have several)"] = stats
    summary["cheat protected"] = cheat_true
    summary["cheat flag from"] = cheat_from
    summary["protection"] = kinds
    summary["not determined"] = missing
    summary["registration vs cvarlist dump disagree on cheat"] = mismatch
    summary["dump names no source knows (left out)"] = unattributed
    summary["no proof in a CoD2 source (left out)"] = unproven
    summary["only set by a special-case config (left out)"] = extra_only
    summary["read"] = report
    return entries, proof_map, summary


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cod2", required=True, help="CoD2 1.3 install (CoD2MP_s.exe, gfx_d3d_mp_x86_s.dll, main/)")
    ap.add_argument("--cod2x", required=True, help="CoD2x source checkout")
    ap.add_argument("--zpam", required=True, help="zPAM (zpam3) source checkout")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "cod2",
                                                  "dvars-data.js"))
    ap.add_argument("--proof-out", help="where the proofs go (default: dvars-proof.json next to --out)")
    ap.add_argument("--summary", help="also write the summary as JSON to this file")
    args = ap.parse_args()

    entries, proofs, summary = build(args)
    body = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    body = body.replace("},{", "},\n{")
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/*\n * CoD2 dvars: stock 1.3, CoD2x and zPAM. Generated by tools/build-cod2-dvars.py;\n"
                 " * do not edit by hand.\n *\n"
                 " * n name, s sources, t type, d default (dn: where the default comes from),\n"
                 " * mn / mx min / max (\"inf\" / \"-inf\" where the engine sets no limit),\n"
                 " * v enum values, f registration flags, c cheat protected (missing: unknown),\n"
                 " * x other sources' default / min / max where they differ,\n"
                 " * ds description (dsn: where it comes from; stock CoD2 has none of its own),\n"
                 " * p protection: [type, reason, source reference].\n"
                 " * c comes only from registration flags (0x80). Every dvar has a proof\n"
                 " * in a CoD2 source; they are in dvars-proof.json.\n */\n")
        fh.write("window.COD2_DVARS = " + body + ";\n")

    # The proofs stay out of the page: a file of their own that nothing loads.
    proof_out = args.proof_out or os.path.join(os.path.dirname(os.path.abspath(args.out)), "dvars-proof.json")
    proof_doc = OrderedDict()
    proof_doc["about"] = ("Where each dvar of dvars-data.js was found, by tools/build-cod2-dvars.py: "
                          "[kind, file, place], strongest first, at most %d. kind: %s. Files are relative to "
                          "the CoD2 install (cod2/), the CoD2x source (cod2x/) and the zPAM source "
                          "(cod2-zpam3/)." % (MAX_PROOFS, ", ".join(PROOF_ORDER)))
    proof_doc["dvars"] = proofs
    with open(proof_out, "w", encoding="utf-8", newline="\n") as fh:
        body = json.dumps(proof_doc, ensure_ascii=False, indent=None, separators=(",", ":"))
        fh.write(body.replace('],"', '],\n"') + "\n")
    if args.summary:
        json.dump(summary, open(args.summary, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
