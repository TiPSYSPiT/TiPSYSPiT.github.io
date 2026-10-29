"""Builds the CoD4 dvar list for the "dvars" tab of the CoD4 section.

    python tools/build-cod4-dvars.py --cod4 C:\\Games\\CoD4 --dasm <CoD4x_Server>/tools/cod4_dasm/src
        --cod4x <CoD4x client source> --promod <Promod X source> --ff-out <cod4-ff output folder>

Python 3.10+, standard library only. Writes js/cod4/dvars-data.js (or --out):
window.COD4_DVARS, one entry per dvar; js/cod4/dvars-proof.json: where
each dvar was found; and prints a summary.

Only CoD4 sources are read; no CoD2 data. A dvar is listed only with proof
from them: a registration, a config line, a script or menu that uses it, or
its name as a whole string in the CoD4 executable.

Sources and what each one gives:

stock CoD4 1.7
  cod4_dasm          the disassembly of the stock 1.7 binary that CoD4x keeps
                     (tools/cod4_dasm/src/*.asm): every Dvar_Register* call
                     with its arguments: name, default, min, max, flags and
                     the game's own description. Read by following the
                     argument stores ([esp+N]) and the registers they come
                     from. Dvars registered in a loop (con_gameMsgWindow0..3*,
                     bg_shock_volume_<sound channel>, customclass1..5) are
                     listed once per index, with that index's default.
                     Names the engine reads or writes without registering
                     them (Dvar_GetInt("x"), Dvar_Set*ByName) are listed too.
  iw3mp.exe          the original 1.7 executable: names as whole strings, and
                     names its own register functions are called with in code
                     the disassembly lacks (their flags are not read).
  fast files         the multiplayer fast files of the install (zone/*), as
                     cod4-ff exported them (--ff-out): menus, scripts and
                     configs that use a dvar; default_mp.cfg also gives
                     defaults.
CoD4x               Cvar_Register* calls in the client source (and the
                     server source, --cod4x-server, if given), and
                     Cvar_AddFlags / Cvar_ClearFlags on a dvar.
Promod X            scripts, menus and configs; ui_mp/hud.menu's ENFORCE
                     conditions, which block the screen while a dvar has the
                     wrong value.

Nothing is guessed: a field the source does not state stays empty. The cheat
flag comes only from registration flags (CVAR_CHEAT = 0x80, src/cvar.h).
"""

import argparse
import glob
import json
import math
import os
import re
import struct
from collections import OrderedDict

CHEAT, ROM, INIT = 0x80, 0x40, 0x10
NAME_RE = r"[A-Za-z_][A-Za-z0-9_]*"
FLAG_NAMES = {"CVAR_ARCHIVE": 0x1, "CVAR_USERINFO": 0x2, "CVAR_SERVERINFO": 0x4, "CVAR_SYSTEMINFO": 0x8,
              "CVAR_INIT": 0x10, "CVAR_LATCH": 0x20, "CVAR_ROM": 0x40, "CVAR_CHEAT": 0x80, "CVAR_CONFIG": 0x100,
              "CVAR_SAVED": 0x1000, "CVAR_NORESTART": 0x400, "CVAR_USER_CREATED": 0x4000, "CVAR_TEMP": 0}

ROOTS = []      # (absolute folder, label for proofs)


def rel(path):
    full = os.path.abspath(path)
    for root, label in ROOTS:
        if full.lower().startswith(root.lower() + os.sep) or full.lower() == root.lower():
            return (label + "/" + os.path.relpath(full, root)).replace("\\", "/")
    return full.replace("\\", "/")


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def f32(bits):
    return struct.unpack("<f", struct.pack("<I", bits & 0xFFFFFFFF))[0]


def num(v):
    if v is None:
        return None
    if isinstance(v, float):
        if math.isinf(v) or abs(v) >= 3.4e38:
            return "inf" if v > 0 else "-inf"
        if math.isnan(v):
            return None
        r = float("%.6g" % v)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    if v >= 0x7FFFFFFF:
        return "inf"
    if v <= -0x80000000:
        return "-inf"
    return v


def s32(v):
    return v - (1 << 32) if v & 0x80000000 else v


class Store:
    def __init__(self):
        self.items = OrderedDict()

    def add(self, source, name, proof=None, **fields):
        if not re.fullmatch(NAME_RE, name) or len(name) < 2:
            return
        key = name.lower()
        e = self.items.setdefault(key, {"name": name, "src": OrderedDict(), "proof": []})
        s = e["src"].setdefault(source, {})
        for k, v in fields.items():
            if v is not None and s.get(k) is None:
                s[k] = v
        if fields.get("reg") and not e.get("named"):
            e["name"], e["named"] = name, True
        for pr in ([proof] if isinstance(proof, tuple) else proof or []):
            if pr not in e["proof"]:
                e["proof"].append(pr)


# --------------------------------------------------------------------------
# stock: the 1.7 disassembly
# --------------------------------------------------------------------------

# Stack layout of each register function (from the mangled signature):
# offsets of name, the values, flags and description.
SIGS = {
    "_Z17Dvar_RegisterBoolPKchtS0_": ("bool", ["name", "v0", "flags", "desc"]),
    "_Z16Dvar_RegisterIntPKciiitS0_": ("int", ["name", "v0", "min", "max", "flags", "desc"]),
    "_Z18Dvar_RegisterFloatPKcffftS0_": ("float", ["name", "v0", "min", "max", "flags", "desc"]),
    "_Z19Dvar_RegisterStringPKcS0_tS0_": ("string", ["name", "v0", "flags", "desc"]),
    "_Z17Dvar_RegisterEnumPKcPS0_itS0_": ("enum", ["name", "list", "v0", "flags", "desc"]),
    "_Z18Dvar_RegisterColorPKcfffftS0_": ("color", ["name", "v0", "v1", "v2", "v3", "flags", "desc"]),
    "_Z17Dvar_RegisterVec2PKcfffftS0_": ("vec2", ["name", "v0", "v1", "min", "max", "flags", "desc"]),
    "_Z17Dvar_RegisterVec3PKcffffftS0_": ("vec3", ["name", "v0", "v1", "v2", "min", "max", "flags", "desc"]),
    "_Z17Dvar_RegisterVec4PKcfffffftS0_": ("vec4", ["name", "v0", "v1", "v2", "v3", "min", "max", "flags", "desc"]),
}
FLOAT_KINDS = ("float", "color", "vec2", "vec3", "vec4")

DB_RE = re.compile(r"^(\w+):\s*db\s+(.+)$", re.M)
DD_RE = re.compile(r"^(\w+):\s*dd\s+(.+)$", re.M)


def parse_db(body):
    """db "abc", 0xa, "def", 0 -> the C string."""
    out = ""
    # NASM numbers: 0x27, 27h (hex) or 39 (decimal)
    for part in re.findall(r'"(?:[^"\\]|\\.)*"|0x[0-9a-fA-F]+|[0-9][0-9a-fA-F]*h\b|\d+', body):
        if part.startswith('"'):
            out += part[1:-1]
        else:
            if part.startswith("0x"):
                v = int(part, 16)
            elif part.endswith("h"):
                v = int(part[:-1], 16)
            else:
                v = int(part, 10)
            if v == 0:
                break
            out += chr(v)
    return out


class Dasm:
    def __init__(self, folder):
        self.folder = folder
        self.files = sorted(glob.glob(os.path.join(folder, "*.asm")))
        self.global_strings = {}
        self.global_dd = {}
        self.bss = set()        # resb buffers: names sprintf'd at runtime
        self.texts = {}
        for f in self.files:
            t = open(f, encoding="latin-1").read()
            self.texts[f] = t
            self.bss.update(re.findall(r"^(\w+):\s*resb\b", t, re.M))
            for m in DB_RE.finditer(t):
                self.global_strings.setdefault(m.group(1), parse_db(m.group(2)))
            for m in DD_RE.finditer(t):
                self.global_dd.setdefault(m.group(1), [x.strip() for x in m.group(2).split(",")])

    def registrations(self):
        """Every register call: (file, line, kind, args by role)."""
        IMM = r"(-?0x[0-9a-fA-F]+|-?\d+|\w+)"
        for f in self.files:
            t = self.texts[f]
            strings = {m.group(1): parse_db(m.group(2)) for m in DB_RE.finditer(t)}
            dds = {m.group(1): [x.strip() for x in m.group(2).split(",")] for m in DD_RE.finditer(t)}
            floats = {}
            for name, vals in dds.items():
                if len(vals) == 1 and re.fullmatch(r"0x[0-9a-fA-F]+", vals[0]):
                    floats[name] = int(vals[0], 16)
            # Dvars registered in a loop, once per index:
            #   ("fmt", pattern, index register)  a name sprintf'd into a buffer
            #   ("arr", symbol)                   element i of a dd array of names
            #                                     or defaults
            #   ("imm", v, {i: v2})               a default that a "cmp index, i"
            #                                     branch replaces for one index
            # local: [ebp-N] slots holding such a buffer or an array pointer.
            regs, stack, xmm, local, src_reg = {}, {}, {}, {}, {}
            cond = prev_call = None
            lines = t.split("\n")
            for ln, line in enumerate(lines, 1):
                s = line.strip()
                if not s or s.startswith(";"):
                    continue
                m = re.match(r"mov (?:dword )?\[esp(?:\+(0x[0-9a-f]+|\d+))?\],\s*" + IMM + r"$", s)
                if m:
                    off = int(m.group(1), 0) if m.group(1) else 0
                    src = m.group(2)
                    stack[off] = regs.get(src, ("unknown",)) if src in ("eax", "ebx", "ecx", "edx", "esi", "edi", "ebp") \
                        else self.value(src, strings, floats)
                    src_reg[off] = src
                    continue
                m = re.match(r"mov dword \[ebp([+-]0x[0-9a-f]+)\],\s*([A-Za-z_]\w*)$", s)
                if m and m.group(2) in self.global_dd:
                    local[m.group(1)] = ("ptr", m.group(2))
                    continue
                m = re.match(r"mov (e[a-d]x|e[sd]i),\s*(?:dword )?\[(?:e\w\w\+([A-Za-z_]\w*)|([A-Za-z_]\w*)\+e\w\w)\]$", s)
                if m and (m.group(2) or m.group(3)) in self.global_dd:
                    regs[m.group(1)] = ("arr", m.group(2) or m.group(3))
                    continue
                m = re.match(r"mov (e[a-d]x|e[sd]i),\s*(?:dword )?\[(e[a-d]x|e[sd]i)\]$", s)
                if m and regs.get(m.group(2), ("",))[0] == "ptr":
                    regs[m.group(1)] = ("arr", regs[m.group(2)][1])
                    continue
                m = re.match(r"add (e[sd]i|ebx),\s*([A-Za-z_]\w*)$", s)
                if m and m.group(2) in self.bss:
                    regs[m.group(1)] = ("buf", m.group(2))
                    continue
                m = re.match(r"cmp (e[sd]i|ebx),\s*(0x[0-9a-f]+|\d+)$", s)
                if m and ln < len(lines) and re.match(r"\s*jz (\w+)$", lines[ln]):
                    cond = (int(m.group(2), 0), re.match(r"\s*jz (\w+)$", lines[ln]).group(1))
                    continue
                m = re.match(r"mov (eax),\s*(0x[0-9a-f]+)$", s)
                if m and cond:
                    alt = self.branch_value(lines, cond[1])
                    regs["eax"] = ("imm", int(m.group(2), 16), {cond[0]: alt}) if alt is not None \
                        else ("imm", int(m.group(2), 16))
                    cond = None
                    continue
                m = re.match(r"movss \[esp(?:\+(0x[0-9a-f]+|\d+))?\],\s*(xmm\d)$", s)
                if m:
                    stack[int(m.group(1), 0) if m.group(1) else 0] = xmm.get(m.group(2), ("unknown",))
                    continue
                m = re.match(r"movss (xmm\d),\s*(?:dword )?\[(\w+)\]$", s)
                if m:
                    xmm[m.group(1)] = ("imm", floats[m.group(2)]) if m.group(2) in floats else ("unknown",)
                    continue
                m = re.match(r"mov (e[a-d]x|e[sd]i),\s*(?:dword )?\[ebp([+-]0x[0-9a-f]+)\]$", s)
                if m:
                    regs[m.group(1)] = local.get(m.group(2), ("local", m.group(2)))
                    continue
                m = re.match(r"mov (e[a-d]x|e[sd]i|ebp),\s*" + IMM + r"$", s)
                if m:
                    src = m.group(2)
                    regs[m.group(1)] = regs.get(src, ("unknown",)) if src in ("eax", "ebx", "ecx", "edx", "esi", "edi", "ebp") \
                        else self.value(src, strings, floats)
                    if regs[m.group(1)][0] == "sym" and src in self.bss:
                        regs[m.group(1)] = ("buf", src)
                    continue
                m = re.match(r"xor (e\w\w),\s*(e\w\w)$", s)
                if m and m.group(1) == m.group(2):
                    regs[m.group(1)] = ("imm", 0)
                    continue
                m = re.match(r"(?:mov|lea|add|sub|and|or|inc|dec|imul|shl|shr|sar|pop|movzx|movsx|cvt\w+|not|neg) (e\w\w|xmm\d)\b", s)
                if m:
                    regs.pop(m.group(1), None)
                    xmm.pop(m.group(1), None)
                m = re.match(r"(?:fstp|fst) (?:dword )?\[esp(?:\+(0x[0-9a-f]+|\d+))?\]", s)
                if m:
                    stack[int(m.group(1), 0) if m.group(1) else 0] = ("unknown",)
                    continue
                m = re.match(r"call (\w+)", s)
                if m:
                    if m.group(1) == "sprintf" and stack.get(4, ("",))[0] == "str" \
                            and stack.get(0, ("",))[0] in ("local", "buf"):
                        # the index: a loop register, or a channel name just fetched
                        idx = src_reg.get(8)
                        if idx == "eax" and prev_call == "_Z21SND_GetEntChannelNamei":
                            idx = "channel"
                        name = ("fmt", stack[4][1], idx)
                        if stack[0][0] == "local":
                            local[stack[0][1]] = name
                        elif src_reg.get(0) in ("ebx", "esi", "edi"):
                            regs[src_reg[0]] = name
                    if m.group(1) in SIGS:
                        kind, roles = SIGS[m.group(1)]
                        args = {role: stack.get(4 * i, ("unknown",)) for i, role in enumerate(roles)}
                        yield f, ln, kind, args, lines
                    prev_call, cond = m.group(1), None
                    stack, src_reg = {}, {}
                    for r in ("eax", "ecx", "edx"):
                        regs.pop(r, None)
                    xmm = {}
                    continue
                if s.startswith(("ret", "leave")):
                    regs, stack, xmm, local, src_reg = {}, {}, {}, {}, {}

    @staticmethod
    def branch_value(lines, label):
        """`label: mov eax, IMM` -> IMM."""
        for i, line in enumerate(lines):
            if line.strip() == label + ":":
                m = re.match(r"\s*mov eax,\s*(0x[0-9a-f]+)$", lines[i + 1])
                return int(m.group(1), 16) if m else None
        return None

    @staticmethod
    def loop_count(lines, ln, reg):
        """The bound of the loop around line ln: `cmp reg, N` then jnz/jl back."""
        for i in range(ln, min(len(lines), ln + 400)):
            m = re.match(r"\s*cmp %s,\s*(0x[0-9a-f]+|\d+)$" % reg, lines[i])
            if m and i + 1 < len(lines) and re.match(r"\s*j(?:nz|ne|l|b)\s", lines[i + 1]):
                return int(m.group(1), 0)
        return None

    def value(self, src, strings, floats):
        if re.fullmatch(r"-?0x[0-9a-fA-F]+|-?\d+", src):
            return ("imm", int(src, 0) & 0xFFFFFFFF)
        if src in strings:
            return ("str", strings[src])
        if src in self.global_strings:
            return ("str", self.global_strings[src])
        if src in self.global_dd or src in floats:
            return ("sym", src)
        return ("sym", src)

    def enum_list(self, sym):
        vals = self.global_dd.get(sym)
        if not vals:
            return None
        out = []
        for v in vals:
            if v in ("0x0", "0"):
                break
            s = self.global_strings.get(v)
            if s is None:
                return None
            out.append(s)
        return out or None


def instances(dasm, a, lines, ln, channels):
    """A register call made in a loop -> one (args, extra proof) per index."""
    name = a["name"]
    if name[0] == "str":
        return [(a, None)]
    if name[0] == "arr":
        count = len(dasm.enum_list(name[1]) or [])
        indices = list(range(count))
    elif name[0] == "fmt" and name[2] == "channel" and channels:
        indices = list(range(len(channels[0])))
    elif name[0] == "fmt" and name[2] in ("ebx", "esi", "edi"):
        n = Dasm.loop_count(lines, ln, name[2])
        indices = list(range(n)) if n else []
    else:
        return []
    out = []
    for i in indices:
        b = {}
        for role, v in a.items():
            if v[0] == "fmt":
                b[role] = ("str", v[1].replace("%s", channels[0][i]) if v[2] == "channel" else v[1] % i)
            elif v[0] == "arr":
                el = dasm.global_dd[v[1]][i] if i < len(dasm.global_dd[v[1]]) else None
                if el in dasm.global_strings:
                    b[role] = ("str", dasm.global_strings[el])
                elif el and re.fullmatch(r"0x[0-9a-fA-F]+", el):
                    b[role] = ("imm", int(el, 16))
                else:
                    b[role] = ("unknown",)
            elif v[0] == "imm" and len(v) > 2:
                b[role] = ("imm", v[2].get(i, v[1]))
            else:
                b[role] = v
        extra = channels[1] if name[0] == "fmt" and name[2] == "channel" else None
        out.append((b, extra))
    return out


def stock_dasm(store, dasm, channels=None):
    count = 0
    by_name = OrderedDict()
    for f, ln, kind, a0, lines in dasm.registrations():
        for a, extra in instances(dasm, a0, lines, ln, channels):
            if a["name"][0] != "str" or not re.fullmatch(NAME_RE, a["name"][1]):
                continue
            name = a["name"][1]
            rec = {"reg": "dasm", "type": kind}
            if a["flags"][0] == "imm":
                rec["flags"] = a["flags"][1] & 0xFFFF
            if a["desc"][0] == "str":
                rec["desc"] = a["desc"][1]

            def fl(role):
                v = a.get(role)
                return f32(v[1]) if v and v[0] == "imm" else None

            def it(role):
                v = a.get(role)
                return s32(v[1]) if v and v[0] == "imm" else None

            if kind == "bool":
                v = it("v0")
                rec["default"] = None if v is None else (1 if v & 0xFF else 0)
            elif kind == "int":
                rec.update(default=it("v0"), min=num(it("min")), max=num(it("max")))
            elif kind == "float":
                rec.update(default=num(fl("v0")), min=num(fl("min")), max=num(fl("max")))
            elif kind == "string":
                rec["default"] = a["v0"][1] if a["v0"][0] == "str" else None
            elif kind == "enum":
                values = dasm.enum_list(a["list"][1]) if a["list"][0] == "sym" else None
                idx = it("v0")
                rec["values"] = values
                if values and idx is not None and 0 <= idx < len(values):
                    rec["default"] = values[idx]
            else:
                n = {"color": 4, "vec2": 2, "vec3": 3, "vec4": 4}[kind]
                vals = [fl("v%d" % i) for i in range(n)]
                if None not in vals:
                    rec["default"] = " ".join(str(num(v)) for v in vals)
                if kind != "color":
                    rec.update(min=num(fl("min")), max=num(fl("max")))
            rec["proof"] = [("registration", rel(f), "line %d" % ln)] + ([extra] if extra else [])
            by_name.setdefault(name.lower(), []).append((name, rec))
            count += 1
    for key, lst in by_name.items():
        # re-registering adds flags, as Dvar_Reregister does
        name, rec = lst[0]
        rec = dict(rec)
        flags = [r.get("flags") for _, r in lst if r.get("flags") is not None]
        if flags:
            rec["flags"] = 0
            for x in flags:
                rec["flags"] |= x
        proofs = [pr for _, r in lst for pr in r["proof"]]
        rec.pop("proof")
        store.add("stock", name, proof=proofs, **rec)
    return count


BY_NAME_RE = re.compile(r"call (_Z\d+Dvar_(?:Get\w*|FindVar|FindMalleableVar|Set\w*ByName|SetFromStringByName\w*|"
                        r"Reset\w*)PKc\w*)")


def stock_by_name(store, dasm):
    """Dvars the engine reads or writes by name (Dvar_GetInt("x"), Dvar_FindVar,
    Dvar_Set*ByName) without registering them: scripts or the player create
    them, so they have no registration flags."""
    count = 0
    for f, t in dasm.texts.items():
        lines = t.split("\n")
        for i, line in enumerate(lines):
            m = re.match(r"\s*mov dword \[esp\],\s*(_cstring_\w+)$", line)
            if not m or m.group(1) not in dasm.global_strings:
                continue
            for nxt in lines[i + 1:i + 3]:
                c = BY_NAME_RE.search(nxt)
                if c:
                    name = dasm.global_strings[m.group(1)]
                    if re.fullmatch(NAME_RE, name):
                        store.add("stock", name, proof=("engine use", rel(f), "line %d (%s)" % (
                            i + 1, re.sub(r"^_Z\d+|PKc\w*$", "", c.group(1)))))
                        count += 1
                    break
                if nxt.strip().startswith("call"):
                    break
    return count


def stock_runtime(store, dasm):
    """ui_lastServerRefresh_<source>: written with Dvar_SetStringByName(va(
    "ui_lastServerRefresh_%i", ui_netSource), ...), one per server source; never
    registered, so it has no flags. The sources are ui_netSource's range."""
    src = store.items.get("ui_netsource", {}).get("src", {}).get("stock", {})
    if src.get("min") is None or src.get("max") is None:
        return 0
    count = 0
    for f, t in dasm.texts.items():
        lines = t.split("\n")
        for i, line in enumerate(lines):
            if not re.search(r"\], _cstring_ui_lastserverref$", line):
                continue
            if not any("Dvar_SetStringByName" in x for x in lines[i:i + 30]):
                continue
            if dasm.global_strings.get("_cstring_ui_lastserverref") != "ui_lastServerRefresh_%i":
                continue
            for n in range(src["min"], src["max"] + 1):
                store.add("stock", "ui_lastServerRefresh_%d" % n, type="string",
                          proof=("engine use", rel(f), "line %d (set by name, one per ui_netSource)" % (i + 1)))
                count += 1
    return count


def pe_sections(data):
    """(virtual address, raw offset, raw size) of each section, and the image base."""
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    count = struct.unpack_from("<H", data, pe + 6)[0]
    opt = struct.unpack_from("<H", data, pe + 20)[0]
    base = struct.unpack_from("<I", data, pe + 24 + 28)[0]
    out = []
    for i in range(count):
        o = pe + 24 + opt + 40 * i
        _, va, size, raw = struct.unpack_from("<IIII", data, o + 8)
        out.append((base + va, raw, size))
    return base, out


def exe_registrations(store, exe, label):
    """Names the executable itself registers in code the disassembly lacks.

    MSVC passes the name as an immediate (push / mov reg) a few bytes before
    the call. A function is taken as a register function when it is called
    with at least 20 names and 95 % of them are registered in the dasm; any
    other name it is called with is registered too. Its flags are not read
    from the machine code."""
    _, sections = pe_sections(exe)

    def off2va(off):
        for va, raw, size in sections:
            if raw <= off < raw + size:
                return va + off - raw
        return None

    def va2off(v):
        for va, raw, size in sections:
            if va <= v < va + size:
                return v - va + raw
        return None

    def name_at(v):
        o = va2off(v)
        if o is None or o == 0 or exe[o - 1] != 0:
            return None
        end = exe.find(b"\0", o, o + 80)
        s = exe[o:end].decode("latin-1") if end > 0 else ""
        return s if re.fullmatch(NAME_RE, s) else None

    _, text_raw, text_size = sections[0]
    calls = {}
    for i in range(text_raw, text_raw + text_size - 5):
        if exe[i] not in (0x68, 0xB8, 0xB9, 0xBA, 0xBB, 0xBE, 0xBF):
            continue
        name = name_at(struct.unpack_from("<I", exe, i + 1)[0])
        if name is None:
            continue
        k = exe.find(b"\xE8", i + 5, i + 17)
        if k < 0:
            continue
        target = (off2va(k) + 5 + struct.unpack_from("<i", exe, k + 1)[0]) & 0xFFFFFFFF
        calls.setdefault(target, []).append((name, off2va(i)))
    count = 0
    for target, names in calls.items():
        registered = [n for n, _ in names if any(p[0] == "registration" for p in
                                                  store.items.get(n.lower(), {}).get("proof", []))]
        if len(names) < 20 or len(registered) < 0.95 * len(names):
            continue
        for name, at in names:
            e = store.items.get(name.lower())
            if e and any(p[0] == "registration" for p in e["proof"]):
                continue
            store.add("stock", name, proof=("exe registration", label, "code at 0x%X: name passed to the register "
                                            "function at 0x%X" % (at, target)))
            count += 1
    return count


def string_proof(path, data, name, label):
    o = data.find(b"\0" + name.encode() + b"\0")
    if o < 0:
        return None
    return ("string", label, "file offset 0x%X" % (o + 1))


# --------------------------------------------------------------------------
# text: menus, scripts, configs
# --------------------------------------------------------------------------

MENU_RES = [
    r'\b(?:dvartest|dvarfloat|dvarint|dvarstring|dvarbool|dvarenumlist|dvarfloatlist|dvarstrlist|dvar)\b\s*"('
    + NAME_RE + r')"',
    r'\bdvar(?:int|float|string|bool)\s*\(\s*"?(' + NAME_RE + r')"?\s*\)',
    r'\b(?:setfromdvar|openmenuondvar|openmenuondvarnot|setdvar|execondvar\w*)\b\s+"?(' + NAME_RE + r')"?',
    r'\b(?:exec|uiscript)\s+"[^"]*?\b(?:seta?|sets|setu|toggle)\s+(' + NAME_RE + r')',
]
GSC_RES = [
    r'\b(?:getDvar|getDvarInt|getDvarFloat|setDvar|setClientDvar|setSavedDvar|makeDvarServerInfo|'
    r'setDvarIfUninitialized)\s*\(\s*"(' + NAME_RE + r')"(?!\s*\+)',
    r'\bsetClientDvars\s*\(([^;]*)\)',
]
CFG_RE = re.compile(r'^\s*(?:seta|sets|setu|set)\s+(' + NAME_RE + r')\s*(.*?)\s*$', re.I | re.M)


def blank_comments(text):
    text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    return re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), text)


def menu_text(text):
    """Comments and key binding items blanked (their "dvar" is the command the
    key runs). Exported menus write the item type as a number: 14 is
    ITEM_TYPE_BIND."""
    text = blank_comments(text)
    parts = re.split(r"(?=\bitemDef\b)", text, flags=re.I)
    bind = re.compile(r"\bITEM_TYPE_BIND\b|^\s*type\s+14\s*$", re.M)
    return "".join(re.sub(r"[^\n]", " ", p) if bind.search(p) else p for p in parts)


KEYWORDS = {"if", "and", "or", "not", "set", "seta", "exec", "true", "false", "menu", "focus", "self", "local",
            "name", "team", "int", "float", "string", "bool"}


def scan_text(store, source, text, kind, label, cfg_defaults=False):
    names = OrderedDict()
    proof_kind = {"menu": "menu", "gsc": "script", "cfg": "config"}[kind]
    if kind == "menu":
        text = menu_text(text)
        for rx in MENU_RES:
            for m in re.finditer(rx, text, re.I):
                names.setdefault(m.group(1), line_of(text, m.start()))
    elif kind == "gsc":
        text = blank_comments(text)
        for m in re.finditer(GSC_RES[0], text):
            names.setdefault(m.group(1), line_of(text, m.start()))
        for m in re.finditer(GSC_RES[1], text):           # setClientDvars( "a", 1, "b", 2 )
            args = re.findall(r'"([^"]*)"|[^,]+', m.group(1))
            parts = [p.strip() for p in m.group(1).split(",")]
            for i in range(0, len(parts), 2):
                if re.fullmatch(r'"' + NAME_RE + r'"', parts[i]):
                    names.setdefault(parts[i][1:-1], line_of(text, m.start()))
    elif kind == "cfg":
        for m in CFG_RE.finditer(text):
            name = m.group(1)
            names.setdefault(name, line_of(text, m.start()))
            if cfg_defaults:
                value = m.group(2).strip()
                if value.startswith('"'):
                    end = value.find('"', 1)
                    value = value[1:end] if end > 0 else value[1:]
                else:
                    value = value.split("//")[0].strip()
                store.add(source, name, cfgDefault=value, proof=(proof_kind, label, "line %d" % line_of(text, m.start())))
    for n, line in names.items():
        if n.lower() not in KEYWORDS and not n.startswith("_"):
            store.add(source, n, seen=kind, proof=(proof_kind, label, "line %d" % line))
    return len(names)


# Multiplayer fast files of a stock install; the singleplayer ones use dvars
# the multiplayer binary does not have.
STOCK_MP_FF = re.compile(r"^(common_mp|localized_common_mp|code_post_gfx_mp|localized_code_post_gfx_mp|ui_mp|mp_\w+)$")
COD4X_FF = re.compile(r"^cod4x_")


def find_ff(cod4, name):
    hits = glob.glob(os.path.join(cod4, "zone", "*", name + ".ff")) + glob.glob(os.path.join(cod4, "**", name + ".ff"),
                                                                                 recursive=True)
    return hits[0] if hits else None


def channel_list(ff_out, cod4):
    """The sound channels of code_post_gfx_mp.ff's soundaliases/channels.def:
    BG_RegisterDvars registers one bg_shock_volume_<channel> per channel."""
    path = os.path.join(ff_out, "code_post_gfx_mp", "raw", "soundaliases", "channels.def")
    ff_path = find_ff(cod4, "code_post_gfx_mp")
    if not os.path.isfile(path) or ff_path is None:
        return None
    names = []
    for line in open(path, encoding="latin-1"):
        line = line.split("#")[0].strip()
        if line:
            names.append(line.split(",")[0].strip())
    return names, ("channel list", rel(ff_path) + ":soundaliases/channels.def", "%d channels" % len(names))


def scan_ff_exports(store, ff_out, cod4):
    stats = OrderedDict([("stock", 0), ("cod4x", 0)])
    for folder in sorted(glob.glob(os.path.join(ff_out, "*"))):
        ff = os.path.basename(folder)
        if STOCK_MP_FF.match(ff) and not ff.endswith(("_load",)):
            source = "stock"
        elif COD4X_FF.match(ff):
            source = "cod4x"
        else:
            continue
        ff_path = find_ff(cod4, ff)
        if ff_path is None or (source == "stock" and "usermaps" in ff_path.lower()):
            continue
        raw = os.path.join(folder, "raw")
        for p in glob.glob(os.path.join(raw, "**", "*"), recursive=True):
            low = p.lower()
            inner = os.path.relpath(p, raw).replace("\\", "/")
            label = rel(ff_path) + ":" + inner
            if low.endswith(".menu"):
                kind = "menu"
            elif low.endswith(".gsc") and inner.lower().startswith("maps/mp/"):
                kind = "gsc"
            elif low.endswith(".cfg"):
                kind = "cfg"
            else:
                continue
            text = open(p, encoding="latin-1").read()
            stats[source] += scan_text(store, source, text, kind, label,
                                       cfg_defaults=(kind == "cfg" and os.path.basename(low) == "default_mp.cfg"))
    return stats


# --------------------------------------------------------------------------
# CoD4x (C source)
# --------------------------------------------------------------------------

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


def c_flags(expr):
    expr = re.sub(r"\(\s*(?:unsigned\s+)?(?:short|int|uint16_t)\s*\)", "", expr)
    total = 0
    for tok in re.findall(r"[A-Za-z_]\w*|0x[0-9A-Fa-f]+|\d+", expr):
        if tok in FLAG_NAMES:
            total |= FLAG_NAMES[tok]
        elif re.fullmatch(r"0x[0-9A-Fa-f]+|\d+", tok):
            total |= int(tok, 0)
        elif tok in ("u", "U"):
            continue
        else:
            return None
    return total


def c_value(tok):
    tok = tok.strip()
    if tok in ("qtrue", "true"):
        return 1
    if tok in ("qfalse", "false"):
        return 0
    m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', tok)
    if m:
        return m.group(1)
    t2 = re.sub(r"[fF]$", "", tok)
    if re.fullmatch(r"-?\d+\.\d*(e[+-]?\d+)?|-?\.\d+", t2):
        return num(float(t2))
    if re.fullmatch(r"-?(0x[0-9A-Fa-f]+|\d+)[uU]?", tok):
        # an int argument: 0x80000000 is INT_MIN, as the compiler passes it
        return num(s32(int(tok.rstrip("uU"), 0) & 0xFFFFFFFF))
    return {"FLT_MAX": "inf", "-FLT_MAX": "-inf", "INT_MAX": "inf", "INT_MIN": "-inf"}.get(tok)


C_KINDS = {"Bool": ("bool", 4), "Int": ("int", 6), "Float": ("float", 6), "String": ("string", 4),
           "Enum": ("enum", 5), "Color": ("color", 7), "Vec2": ("vec2", 7), "Vec3": ("vec3", 8), "Vec4": ("vec4", 9)}


def cod4x_source(store, root, flag_changes):
    count = 0
    for p in glob.glob(os.path.join(root, "**", "*.c"), recursive=True):
        t = open(p, encoding="latin-1").read()
        for m in re.finditer(r"\bCvar_Register(Bool|Int|Float|String|Enum|Color|Vec2|Vec3|Vec4)\s*\(", t):
            args_text, end = call_args(t, m.end() - 1)
            if args_text is None:
                continue
            a = split_args(args_text)
            kind, n = C_KINDS[m.group(1)]
            if len(a) != n or not re.fullmatch(r'"' + NAME_RE + r'"', a[0]):
                continue
            rec = {"reg": "cod4x", "type": kind, "flags": c_flags(a[-2]), "desc": c_value(a[-1])}
            if kind in ("bool", "string"):
                rec["default"] = c_value(a[1])
            elif kind in ("int", "float"):
                rec.update(default=c_value(a[1]), min=c_value(a[2]), max=c_value(a[3]))
            store.add("cod4x", a[0][1:-1], proof=("registration", rel(p), "line %d" % line_of(t, m.start())), **rec)
            count += 1
        # Cvar_AddFlags(var, CVAR_ROM) / Cvar_ClearFlags(var, ...): which dvar is
        # the variable? Its registration in the same file says.
        for m in re.finditer(r"\bCvar_(AddFlags|ClearFlags)\s*\(\s*(\w+)\s*,\s*([^)]+)\)", t):
            reg = re.search(r"\b" + re.escape(m.group(2)) + r"\s*=\s*Cvar_Register\w*\s*\(\s*\"(" + NAME_RE + r")\"", t)
            if reg:
                flag_changes.append((reg.group(1), m.group(1), c_flags(m.group(3)),
                                     (rel(p), "line %d" % line_of(t, m.start()))))
    return count


# --------------------------------------------------------------------------
# Promod X
# --------------------------------------------------------------------------

def promod_source(store, root, enforce):
    count = 0
    for p in glob.glob(os.path.join(root, "**", "*"), recursive=True):
        low = p.lower()
        if low.endswith(".gsc"):
            kind = "gsc"
        elif low.endswith(".menu"):
            kind = "menu"
        elif low.endswith(".cfg"):
            kind = "cfg"
        else:
            continue
        t = open(p, encoding="latin-1").read()
        count += scan_text(store, "promod", t, kind, rel(p))
        if kind == "menu":
            # the enforcer conditions: dvarint( x ) / dvarfloat( x ) inside them
            for m in re.finditer(r"#define\s+(\w*ENFORCER\w*)\s+(.+)", t):
                for d in re.finditer(r"dvar(?:int|float|string|bool)\s*\(\s*(" + NAME_RE + r")\s*\)", m.group(2)):
                    if d.group(1).lower() == "sv_cheats":
                        continue
                    enforce.setdefault(d.group(1).lower(), (d.group(1), m.group(1), rel(p),
                                                            "line %d" % line_of(t, m.start())))
                    store.add("promod", d.group(1), seen="menu",
                              proof=("menu", rel(p), "line %d" % line_of(t, m.start())))
    return count


# --------------------------------------------------------------------------
# merge
# --------------------------------------------------------------------------

PROOF_ORDER = ["registration", "exe registration", "channel list", "engine use", "config", "script", "menu", "string"]
MAX_PROOFS = 3


def protection(e, flags, stock_flags, cod4x_flags, flag_changes, enforce):
    """(type, reason, reference) for the dvar, or None when it has none."""
    name = e["name"]
    reg_proof = next((p for p in e["proof"] if p[0] == "registration"), None)
    ref = (reg_proof[1] + ":" + reg_proof[2].replace("line ", "")) if reg_proof else None
    stock_reg = next((p for p in e["proof"] if p[0] == "registration" and "cod4_dasm" in p[1]), None)
    stock_ref = (stock_reg[1] + ":" + stock_reg[2].replace("line ", "")) if stock_reg else None
    x_reg = next((p for p in e["proof"] if p[0] == "registration" and p[1].startswith("cod4x")), None)
    x_ref = (x_reg[1] + ":" + x_reg[2].replace("line ", "")) if x_reg else None
    changes = [c for c in flag_changes if c[0].lower() == name.lower()]
    notes = []

    if stock_flags is not None and stock_flags & CHEAT:
        if cod4x_flags is not None and not cod4x_flags & CHEAT:
            return ("CoD4x", "Registered with CVAR_CHEAT (0x80) in stock 1.7, but CoD4x registers it without the "
                             "flag: changeable without sv_cheats on CoD4x.", x_ref)
        return ("Engine", "Registered with CVAR_CHEAT (0x80) in the stock 1.7 binary. Only works with sv_cheats 1.",
                stock_ref)
    if cod4x_flags is not None and cod4x_flags & CHEAT:
        return ("CoD4x", "Registered with CVAR_CHEAT (0x80) by CoD4x. Only works with sv_cheats 1.", x_ref)
    if name.lower() in enforce:
        _, macro, path, line = enforce[name.lower()]
        return ("Promod", "Promod X blocks the screen (%s in hud.menu) while this has the wrong value; "
                          "no cheat flag." % macro, path + ":" + line.replace("line ", ""))
    for c in changes:
        if c[1] == "AddFlags" and c[2] is not None and c[2] & ROM:
            return ("Read-only", "CoD4x makes it read-only (CVAR_ROM).", c[3][0] + ":" + c[3][1].replace("line ", ""))
    if flags is not None and flags & ROM:
        return ("Read-only", "Registered read-only (CVAR_ROM): only the game itself sets it.", ref)
    if flags is not None and flags & INIT:
        return ("Init only", "Registered with CVAR_INIT: can only be set on the command line at start.", ref)
    if flags is None:
        if any(p[0] == "exe registration" for p in e["proof"]):
            return ("unknown", "Registered by iw3mp.exe in code the disassembly does not cover; its flags "
                               "are not known.", None)
        if any(p[0] in ("string", "engine use") for p in e["proof"]):
            return ("unknown", "The stock binary uses this name, but no registration with flags was found "
                               "in the CoD4 sources.", None)
        return ("unknown", "Only scripts, menus or configs use this name; no registration with flags was "
                           "found in the CoD4 sources.", None)
    return None


def build(args):
    ROOTS[:] = [(os.path.abspath(args.cod4), "cod4"), (os.path.abspath(args.dasm), "cod4_dasm"),
                (os.path.abspath(args.cod4x), "cod4x"), (os.path.abspath(args.promod), "promod_x")]
    if args.cod4x_server:
        ROOTS.append((os.path.abspath(args.cod4x_server), "cod4x_server"))
    store = Store()
    report = OrderedDict()
    dasm = Dasm(args.dasm)
    report["stock dasm registrations"] = stock_dasm(store, dasm, channel_list(args.ff_out, args.cod4))
    report["stock runtime names"] = stock_runtime(store, dasm)
    report["stock names used by the engine"] = stock_by_name(store, dasm)
    report["fast file names (stock / cod4x)"] = scan_ff_exports(store, args.ff_out, args.cod4)
    flag_changes = []
    report["cod4x client registrations"] = cod4x_source(store, args.cod4x, flag_changes)
    if args.cod4x_server:
        report["cod4x server registrations"] = cod4x_source(store, os.path.join(args.cod4x_server, "src"), flag_changes)
    enforce = OrderedDict()
    report["promod names"] = promod_source(store, args.promod, enforce)

    exe_path = os.path.join(args.cod4, "iw3mp.exe.73a846.org")
    if not os.path.exists(exe_path):
        exe_path = os.path.join(args.cod4, "iw3mp.exe")
    exe = open(exe_path, "rb").read()
    report["stock exe registrations (not in the dasm)"] = exe_registrations(store, exe, rel(exe_path))
    for key, e in store.items.items():
        if not any(p[0] in ("registration",) for p in e["proof"]):
            sp = string_proof(exe_path, exe, e["name"], rel(exe_path))
            if sp:
                e["proof"].append(sp)

    entries, proofs, removed = [], OrderedDict(), []
    for key, e in sorted(store.items.items()):
        if not e["proof"]:
            removed.append(e["name"])
            continue
        src = e["src"]
        order = [s for s in ("stock", "cod4x", "promod") if s in src and src[s].get("reg")]
        main = src[order[0]] if order else {}
        stock_flags = src.get("stock", {}).get("flags")
        cod4x_flags = src.get("cod4x", {}).get("flags")
        flags = stock_flags if stock_flags is not None else cod4x_flags
        prot = protection(e, flags, stock_flags, cod4x_flags, flag_changes, enforce)
        default = main.get("default")
        default_from = order[0] if default is not None and order else None
        if default is None:
            for s in ("stock", "promod", "cod4x"):
                if src.get(s, {}).get("cfgDefault") is not None:
                    default, default_from = src[s]["cfgDefault"], s + " cfg"
                    break
        alt = {}
        for s in order[1:]:
            other = {k: src[s].get(k) for k in ("default", "min", "max") if src[s].get(k) is not None}
            if other and any(other.get(k) != main.get(k) for k in other):
                alt[s] = other
        item = OrderedDict()
        item["n"] = e["name"]
        item["s"] = [s for s in ("stock", "cod4x", "promod") if s in src]
        item["t"] = main.get("type")
        item["d"] = default
        item["dn"] = default_from
        item["mn"] = main.get("min")
        item["mx"] = main.get("max")
        item["v"] = main.get("values")
        item["f"] = flags
        item["c"] = None if flags is None else bool(flags & CHEAT) or bool(cod4x_flags and cod4x_flags & CHEAT)
        if prot and prot[0] == "CoD4x" and "without the flag" in prot[1]:
            item["c"] = False
        item["x"] = alt or None
        item["ds"] = main.get("desc") or next((src[s].get("desc") for s in order if src[s].get("desc")), None)
        if prot:
            item["p"] = [prot[0], prot[1], prot[2]]
        entries.append(OrderedDict((k, v) for k, v in item.items() if v is not None))
        pr = sorted(e["proof"], key=lambda p: PROOF_ORDER.index(p[0]))
        # one of each kind first, so the proof behind the protection reason stays
        first = [p for i, p in enumerate(pr) if i == 0 or p[0] != pr[i - 1][0]]
        keep = first + [p for p in pr if p not in first]
        proofs[e["name"]] = [list(p) for p in sorted(keep[:max(MAX_PROOFS, len(first))],
                                                     key=lambda p: PROOF_ORDER.index(p[0]))]
    report["removed (no proof)"] = removed
    return entries, proofs, report


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cod4", required=True, help="CoD4 install (iw3mp.exe, zone/)")
    ap.add_argument("--dasm", required=True, help="cod4_dasm/src of the CoD4x server repository")
    ap.add_argument("--cod4x", required=True, help="CoD4x client source")
    ap.add_argument("--cod4x-server", help="CoD4x server repository (optional: its src/ registrations)")
    ap.add_argument("--promod", required=True, help="Promod X source")
    ap.add_argument("--ff-out", required=True, help="cod4-ff output folder with the install's fast files exported")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "cod4",
                                                  "dvars-data.js"))
    ap.add_argument("--proof-out", help="where the proofs go (default: dvars-proof.json next to --out)")
    ap.add_argument("--summary")
    args = ap.parse_args()
    entries, proofs, report = build(args)
    body = json.dumps(entries, ensure_ascii=False, separators=(",", ":")).replace("},{", "},\n{")
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/*\n * CoD4 dvars: stock 1.7, CoD4x and Promod X. Generated by tools/build-cod4-dvars.py;\n"
                 " * do not edit by hand.\n *\n"
                 " * n name, s sources, t type, d default (dn: where it comes from), mn / mx min / max\n"
                 " * (\"inf\" / \"-inf\" where the engine sets no limit), v enum values, f flags,\n"
                 " * c cheat protected (from registration flags only; missing: unknown),\n"
                 " * x other sources' default / min / max where they differ, ds description (the game's own),\n"
                 " * p protection: [type, reason, source reference]. Proofs: dvars-proof.json.\n */\n")
        fh.write("window.COD4_DVARS = " + body + ";\n")
    proof_out = args.proof_out or os.path.join(os.path.dirname(os.path.abspath(args.out)), "dvars-proof.json")
    with open(proof_out, "w", encoding="utf-8", newline="\n") as fh:
        doc = OrderedDict([("about", "Where each dvar of dvars-data.js was found: [kind, file, place], strongest "
                                     "first, at most %d (more when needed for one of each kind)." % MAX_PROOFS), ("dvars", proofs)])
        fh.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).replace('],"', '],\n"') + "\n")
    if args.summary:
        json.dump(report, open(args.summary, "w", encoding="utf-8"), indent=1)
    print(json.dumps(report, indent=1, ensure_ascii=False)[:3000])


if __name__ == "__main__":
    main()
