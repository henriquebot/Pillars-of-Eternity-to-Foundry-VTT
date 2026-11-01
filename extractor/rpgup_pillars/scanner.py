"""Bounded, read-only discovery of installs and source file inventories."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Iterable

DATA_FOLDER = "PillarsOfEternity_Data"
PACKAGES = ("data", "data_expansion1", "data_expansion2", "data_expansion4")
TEXT_EXTENSIONS = {".quest", ".conversation", ".stringtable", ".globalvariables"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tga", ".dds", ".webp"}
BINARY_EXTENSIONS = {".assets", ".assetbundle", ".unity3d", ".bundle", ".ress", ".resource"}


def is_link(path: Path) -> bool:
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def _safe_text(path: Path, maximum: int = 2_000_000) -> str:
    if is_link(path) or path.stat().st_size > maximum:
        raise ValueError("Linked or oversized discovery metadata")
    return path.read_text(encoding="utf-8-sig")


def steam_libraries(steam_root: Path) -> list[Path]:
    """Read both old and current libraryfolders VDF layouts; never execute VDF."""
    paths = [steam_root]
    for location in (steam_root / "steamapps/libraryfolders.vdf", steam_root / "config/libraryfolders.vdf"):
        try:
            content = _safe_text(location)
        except (OSError, ValueError, UnicodeError):
            continue
        for key, raw in re.findall(r'"([^"\r\n]+)"\s*"((?:\\.|[^"\\])*)"', content):
            if key.lower() == "path" or (key.isdigit() and (":" in raw or raw.startswith("/"))):
                # VDF's backslash escaping differs from Python string escapes.
                value = raw.replace("\\\\", "\\").replace('\\"', '"')
                paths.append(Path(value))
    return list(dict.fromkeys(paths))


def _registry_candidates() -> tuple[list[Path], list[Path]]:
    """Windows registry reads only, including Steam, GOG and uninstall records."""
    installs: list[Path] = []
    steam: list[Path] = []
    if os.name != "nt":
        return installs, steam
    import winreg
    for hive, key_name, value_name in (
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
    ):
        try:
            with winreg.OpenKey(hive, key_name) as key:
                steam.append(Path(winreg.QueryValueEx(key, value_name)[0]))
        except OSError:
            pass
    for hive, key_name in (
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\GOG.com\Games"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\GOG.com\Games"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ):
        try:
            with winreg.OpenKey(hive, key_name) as key:
                count = winreg.QueryInfoKey(key)[0]
                for i in range(count):
                    try:
                        with winreg.OpenKey(key, winreg.EnumKey(key, i)) as child:
                            values = {}
                            for j in range(winreg.QueryInfoKey(child)[1]):
                                name, value, _ = winreg.EnumValue(child, j)
                                if isinstance(value, str):
                                    values[name.lower()] = value
                            name = values.get("displayname", values.get("gamename", ""))
                            if "pillars" in name.lower():
                                location = values.get("installlocation", values.get("path", ""))
                                if location:
                                    installs.append(Path(location))
                    except OSError:
                        continue
        except OSError:
            continue
    return installs, steam


def discover(roots: Iterable[str | Path] = (), *, auto: bool = True) -> dict:
    candidates = [Path(p).expanduser() for p in roots]
    steam_roots: list[Path] = []
    warnings: list[str] = []
    if auto:
        registry_installs, registry_steam = _registry_candidates()
        candidates.extend(registry_installs)
        steam_roots.extend(registry_steam)
        if os.environ.get("RPGUP_PILLARS_ROOT"):
            candidates.append(Path(os.environ["RPGUP_PILLARS_ROOT"]))
        for env_name in ("ProgramFiles(x86)", "ProgramFiles"):
            if os.environ.get(env_name):
                steam_roots.append(Path(os.environ[env_name]) / "Steam")
        home = Path.home()
        steam_roots.extend((home / ".steam/steam", home / ".local/share/Steam",
                            home / ".var/app/com.valvesoftware.Steam/.local/share/Steam"))
        candidates.extend((Path("C:/GOG Games/Pillars of Eternity"),
                           home / "GOG Games/Pillars of Eternity"))
    # Explicit roots can also point at a Steam library or its steamapps directory.
    for root in list(candidates):
        if (root / "steamapps").is_dir():
            steam_roots.append(root)
        elif root.name.lower() == "steamapps":
            steam_roots.append(root.parent)
        try:
            if root.is_dir() and not is_link(root):
                candidates.extend(p for p in root.iterdir()
                                  if p.is_dir() and "pillars" in p.name.lower() and not is_link(p))
        except OSError as exc:
            warnings.append(f"Cannot inspect {root}: {exc}")
    for steam_root in dict.fromkeys(steam_roots):
        for library in steam_libraries(steam_root):
            manifest = library / "steamapps/appmanifest_291650.acf"
            try:
                content = _safe_text(manifest)
                match = re.search(r'"installdir"\s*"([^"\r\n]+)"', content, re.IGNORECASE)
                if match:
                    fragment = Path(match.group(1))
                    if fragment.is_absolute() or ".." in fragment.parts or len(fragment.parts) != 1:
                        warnings.append(f"Unsafe installdir ignored in {manifest}")
                    else:
                        candidates.append(library / "steamapps/common" / fragment)
                state = re.search(r'"StateFlags"\s*"([^"\r\n]+)"', content, re.IGNORECASE)
                if state and state.group(1) != "4":
                    warnings.append(f"Steam app 291650 StateFlags={state.group(1)} in {manifest}; "
                                    "installation may be downloading, updating or incomplete. "
                                    "Wait for Steam to finish before extracting.")
                staging = library / "steamapps/downloading/291650"
                if staging.is_dir():
                    warnings.append(f"Steam download staging directory exists at {staging}; "
                                    "do not extract until the download has finished.")
            except (OSError, ValueError, UnicodeError):
                pass
            candidates.append(library / "steamapps/common/Pillars of Eternity")
    found = []
    seen: set[str] = set()
    checked = 0
    for candidate in candidates:
        checked += 1
        try:
            if is_link(candidate):
                continue
            root = candidate.parent if candidate.name == DATA_FOLDER else candidate
            data = root / DATA_FOLDER
            if not data.is_dir() or is_link(data):
                continue
            root = root.resolve()
            key = os.path.normcase(str(root))
            if key in seen:
                continue
            seen.add(key)
            found.append({"root": str(root), "dataRoot": str(root / DATA_FOLDER),
                          "packages": [name for name in PACKAGES if (data / name).is_dir()],
                          "synthetic": (root / ".rpgup-synthetic").is_file()})
            if not (data / "data/conversations").is_dir() or not (data / "data/localized").is_dir():
                warnings.append(f"Expected narrative/localization directories missing in {root}; "
                                "installation may be partial or use an unsupported layout.")
        except OSError as exc:
            warnings.append(f"Cannot inspect candidate {candidate}: {exc}")
    return {"installations": found, "checkedCandidates": checked, "warnings": warnings,
            "scope": "registry, known storefront metadata and explicit roots; no whole-drive recursion"}


def walk_files(root: Path, *, max_files: int = 100_000):
    """Walk an explicitly chosen source root without following links or junctions."""
    count = 0
    if is_link(root):
        raise ValueError("Source root must not be a link or junction")
    def on_error(exc: OSError):
        raise exc
    for directory, folders, filenames in os.walk(root, followlinks=False, onerror=on_error):
        base = Path(directory)
        folders[:] = sorted(p for p in folders if not is_link(base / p))
        for name in sorted(filenames):
            path = base / name
            if is_link(path):
                continue
            count += 1
            if count > max_files:
                raise ValueError(f"Source file limit exceeded ({max_files})")
            yield path


def inventory(root: Path, *, max_files: int = 100_000) -> dict:
    result = {"files": [], "counts": {}, "warnings": []}
    try:
        for path in walk_files(root, max_files=max_files):
            suffix = path.suffix.lower()
            category = ("text" if suffix in TEXT_EXTENSIONS else "image" if suffix in IMAGE_EXTENSIONS
                        else "unity" if suffix in BINARY_EXTENSIONS or path.name.startswith("sharedassets") else "other")
            result["counts"][category] = result["counts"].get(category, 0) + 1
            if category != "other":
                result["files"].append({"path": path.relative_to(root).as_posix(),
                                        "size": path.stat().st_size, "category": category})
    except (OSError, ValueError) as exc:
        result["warnings"].append(str(exc))
    return result
