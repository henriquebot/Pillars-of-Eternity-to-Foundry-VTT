"""Read-only, optional UnityPy bridge for one explicitly selected source at a time.

No game assembly is executed, no asset is patched, and no source file is saved.
Commercial output is restricted to local/ inside this repository or an external
directory. The Foundry release does not include this optional tool or its output.
"""
from __future__ import annotations

import argparse
import collections
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

REPO = Path(__file__).resolve().parents[1]
UNITYPY_VERSION = "1.25.4"
PILLOW_VERSION = "13.0.0"
TILE_NAME = re.compile(r"^(?P<layer>BKG|HGT|AS|NM)_(?P<area>.+)-R(?P<row>\d{3})_C(?P<column>\d{3})$")
SCENE_TYPES = {"GameObject", "Transform", "Camera", "Light", "RenderSettings", "BoxCollider", "SphereCollider", "MeshCollider", "NavMeshSettings", "NavMeshData", "MonoScript"}
UNITY_LIGHT_TYPES = {0: "spot", 1: "directional", 2: "point", 3: "area"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_file(path: Path, maximum_bytes: int) -> Path:
    path = path.absolute()
    if path.is_symlink() or not path.is_file():
        raise ValueError("Source must be a regular explicitly selected file, not a symlink")
    resolved = path.resolve()
    if resolved.stat().st_size > maximum_bytes:
        raise ValueError("Source exceeds configured input size limit")
    return resolved


def private_output(source: Path, output: Path, *, repository: Path = REPO) -> Path:
    output = output.resolve()
    repository = repository.resolve()
    protected = next((p.parent for p in source.parents if p.name == "PillarsOfEternity_Data"), source.parent)
    if output == protected or output.is_relative_to(protected):
        raise ValueError("Output must be outside the original installation")
    if output.is_relative_to(repository) and not output.is_relative_to(repository / "local"):
        raise ValueError("Commercial outputs inside the repository must stay in ignored local/")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Output must be new or empty; existing data is never overwritten")
    output.mkdir(parents=True, exist_ok=True)
    return output


def read_exact(stream, count: int) -> bytes:
    value = stream.read(count)
    if len(value) != count:
        raise ValueError("Truncated Unity header")
    return value


def cstring(stream, maximum: int = 4096) -> str:
    value = bytearray()
    for _ in range(maximum):
        part = read_exact(stream, 1)
        if part == b"\0":
            return value.decode("utf-8", errors="strict")
        value.extend(part)
    raise ValueError("Unity header string exceeds limit")


def unity_header(path: Path, maximum_uncompressed: int = 512 * 1024 * 1024) -> dict:
    """Preflight only; UnityPy handles actual assets, versions and texture decoding.

    The UnityFS directory format is confirmed against UnityPy's BundleFile.py.
    Encrypted/unknown archive flags are refused rather than decoded or bypassed.
    """
    size = path.stat().st_size
    with path.open("rb") as stream:
        start = read_exact(stream, min(size, 64))
        stream.seek(0)
        if not start.startswith((b"UnityFS\0", b"UnityRaw\0")):
            if size < 20:
                raise ValueError("Not a recognized Unity bundle or serialized file")
            metadata, declared, version, offset = struct.unpack(">4I", read_exact(stream, 16))
            if version not in range(9, 23) or offset > size or metadata > size:
                raise ValueError("Unsupported or invalid serialized-file header")
            endian = read_exact(stream, 4)
            if endian[0] not in (0, 1):
                raise ValueError("Invalid serialized-file endianness")
            engine = cstring(stream, 64)
            if not re.fullmatch(r"\d+\.\d+\.\d+[abfp]\d+", engine):
                raise ValueError("Serialized file has no verified Unity revision")
            return {"signature": "SerializedFile", "formatVersion": version,
                    "unityVersion": engine, "bytes": size, "metadataBytes": metadata,
                    "declaredBytes": declared, "dataOffset": offset}
        signature = cstring(stream, 32)
        version, = struct.unpack(">I", read_exact(stream, 4))
        player, engine = cstring(stream, 64), cstring(stream, 64)
        result = {"signature": signature, "formatVersion": version, "playerVersion": player,
                  "unityVersion": engine, "bytes": size}
        if signature == "UnityRaw":
            if version != 3:
                raise ValueError("Only verified UnityRaw format 3 is preflighted")
            minimum, header_size, streamed, levels = struct.unpack(">4I", read_exact(stream, 16))
            if not 1 <= levels <= 100000 or header_size > size:
                raise ValueError("Invalid UnityRaw streaming header")
            stream.seek(8 * (levels - 1), 1)
            compressed, uncompressed = struct.unpack(">2I", read_exact(stream, 8))
            if uncompressed > maximum_uncompressed or header_size + compressed > size:
                raise ValueError("UnityRaw contents exceed limits or source size")
            return {**result, "headerBytes": header_size, "uncompressedBytes": uncompressed}
        if version not in (6, 7, 8):
            raise ValueError("Unsupported UnityFS archive version")
        declared, compressed, uncompressed, flags = struct.unpack(">Q3I", read_exact(stream, 20))
        if declared != size or flags & ~0x1FF:
            raise ValueError("Unknown/encrypted UnityFS flags or inconsistent archive size; refused")
        if compressed > 8 * 1024 * 1024 or uncompressed > 8 * 1024 * 1024:
            raise ValueError("UnityFS block directory exceeds 8 MiB")
        revision = tuple(int(p) for p in re.match(r"(\d+)\.(\d+)\.(\d+)", engine).groups())
        if version >= 7 or (revision[0] == 2019 and revision >= (2019, 4, 15)):
            stream.seek((stream.tell() + 15) // 16 * 16)
        if flags & 0x80:
            stream.seek(size - compressed)
        packed = read_exact(stream, compressed)
        compression = flags & 0x3F
        if compression == 0:
            info = packed
        elif compression in (2, 3):
            import lz4.block
            info = lz4.block.decompress(packed, uncompressed_size=uncompressed)
        else:
            raise ValueError("Unsupported block-directory compression; no decompression guess")
        if len(info) != uncompressed or len(info) < 20:
            raise ValueError("Invalid UnityFS block-directory length")
        count, = struct.unpack_from(">I", info, 16)
        if count > 100000 or 20 + count * 10 > len(info):
            raise ValueError("Invalid UnityFS block count")
        total = sum(struct.unpack_from(">I", info, 20 + i * 10)[0] for i in range(count))
        if total > maximum_uncompressed:
            raise ValueError("Expanded bundle exceeds configured limit")
        return {**result, "flags": flags, "blockCount": count, "uncompressedBytes": total}


def tile_layout(textures: list[dict], layer: str = "BKG", maximum_pixels: int = 100000000, area: str | None = None, grid_extent=None, allow_sparse: bool = False) -> dict:
    selected, excluded, areas, available = [], [], set(), set()
    if grid_extent is not None and (len(grid_extent) != 2 or any(not isinstance(v, int) or v < 1 or v > 1000 for v in grid_extent)):
        raise ValueError("Explicit grid extent requires positive row and column counts")
    for texture in textures:
        match = TILE_NAME.fullmatch(texture["name"])
        if not match or match["layer"] != layer:
            continue
        available.add(match["area"])
        if area is not None and match["area"] != area:
            continue
        record = {**texture, "row": int(match["row"]), "column": int(match["column"])}
        if grid_extent and (record["row"] >= grid_extent[0] or record["column"] >= grid_extent[1]):
            excluded.append(record)
            continue
        areas.add(match["area"])
        selected.append(record)
    if not selected or len(areas) != 1:
        raise ValueError("A mosaic requires exactly one verified area name and selected layer")
    rows, columns, row_heights, column_tiles = {}, {}, {}, {}
    occupied = set()
    for texture in selected:
        row, column = texture["row"], texture["column"]
        if (row, column) in occupied:
            raise ValueError("Duplicate tile coordinate")
        occupied.add((row, column))
        if any(not isinstance(texture[d], int) or texture[d] <= 0 for d in ("width", "height")):
            raise ValueError("Invalid texture dimensions")
        if column in columns and columns[column] != texture["width"]:
            raise ValueError("Inconsistent tile widths in one column")
        rows[row] = True
        columns[column] = texture["width"]
        row_heights.setdefault(row, set()).add(texture["height"])
        column_tiles.setdefault(column, []).append(texture)
    if sorted(rows) != list(range(len(rows))) or sorted(columns) != list(range(len(columns))):
        raise ValueError("Tile indices must start at zero and be contiguous")
    empty_cells = [[row, column] for row in sorted(rows) for column in sorted(columns) if (row, column) not in occupied]
    if empty_cells and not allow_sparse:
        raise ValueError("Incomplete tile rectangle; missing tiles are not fabricated")
    if any(len(heights) != 1 for heights in row_heights.values()):
        raise ValueError("Inconsistent tile heights in one row")
    if grid_extent and (len(rows), len(columns)) != tuple(grid_extent):
        raise ValueError("Explicit selection does not contain the requested complete rectangle")
    if allow_sparse and grid_extent is None:
        raise ValueError("Sparse grids require an explicit --grid-extent")
    column_heights = {}
    for column, records in column_tiles.items():
        records.sort(key=lambda tile: tile["row"])
        indices = [tile["row"] for tile in records]
        if indices != list(range(len(indices))):
            raise ValueError("Tile rows within each column must start at zero and be contiguous")
        cursor = 0
        for record in records:
            record["y"] = cursor
            cursor += record["height"]
        column_heights[column] = cursor
    width, height = sum(columns.values()), max(column_heights.values())
    if width * height > maximum_pixels:
        raise ValueError("Mosaic exceeds configured pixel limit")
    x, y, cursor = {}, {}, 0
    for column in sorted(columns):
        x[column], cursor = cursor, cursor + columns[column]
    for record in selected:
        y[(record["row"], record["column"])] = record["y"]
    return {"area": next(iter(areas)), "additionalAreas": sorted(available - areas), "layer": layer, "width": width, "height": height,
            "explicitGridExtent": list(grid_extent) if grid_extent else None,
            # Completeness is scoped to the exact selected area. A separate
            # f001/state variant in the same bundle is reported in
            # additionalAreas and does not make this area's tile set partial.
            "unselectedTiles": excluded, "sourceCoverageComplete": not excluded,
            "tileGridComplete": not empty_cells, "emptyCells": empty_cells,
            "rows": len(rows), "columns": len(columns),
            "tiles": [{**t, "x": x[t["column"]], "y": y[(t["row"], t["column"])]} for t in sorted(selected, key=lambda t: (t["row"], t["column"]))]}


def validate_composition_spec(area: str | None, grid_extent) -> None:
    """Require a deliberate area and base-grid crop before composing artwork."""
    if not isinstance(area, str) or not area.strip():
        raise ValueError("Composition requires the exact --area; automatic area discovery is inspection-only")
    if grid_extent is None:
        raise ValueError("Composition requires explicit --grid-extent ROWS COLUMNS; all tiles in a bundle are not assumed to be one map")
    if (not isinstance(grid_extent, (tuple, list)) or len(grid_extent) != 2 or
            any(type(value) is not int or not 1 <= value <= 1000 for value in grid_extent)):
        raise ValueError("Explicit grid extent requires positive row and column counts")


def load_unity(path: Path):
    import UnityPy
    from PIL import __version__ as pillow_version
    from UnityPy.helpers import TypeTreeHelper
    if UnityPy.__version__ != UNITYPY_VERSION or pillow_version != PILLOW_VERSION:
        raise RuntimeError(f"Use the isolated pinned environment: UnityPy {UNITYPY_VERSION}, Pillow {PILLOW_VERSION}")
    # The upstream project warns that the native typetree reader can crash.
    TypeTreeHelper.READ_TYPETREE_BOOST = False
    return UnityPy.load(str(path))


def inspect_textures(environment) -> tuple[list[dict], dict]:
    textures, readers = [], {}
    for reader in environment.objects:
        if reader.type.name != "Texture2D":
            continue
        data = reader.parse_as_object()
        file_name = str(reader.assets_file.name)
        key = hashlib.sha256(f"{file_name}:{reader.path_id}".encode()).hexdigest()[:24]
        record = {"key": key, "pathId": reader.path_id, "serializedFile": file_name,
                  "name": data.m_Name, "width": data.m_Width, "height": data.m_Height,
                  "textureFormat": int(data.m_TextureFormat)}
        stream = getattr(data, "m_StreamData", None)
        if stream:
            record["stream"] = {"path": stream.path, "offset": stream.offset, "size": stream.size}
        textures.append(record)
        readers[key] = reader
    return textures, readers


def compose(environment, textures, readers, output, *, layer="BKG", area=None, grid_extent=None, origin="top", maximum_pixels=100000000, webp=False, allow_sparse=False):
    from PIL import Image
    validate_composition_spec(area, grid_extent)
    layout = tile_layout(textures, layer, maximum_pixels, area, grid_extent, allow_sparse)
    Image.MAX_IMAGE_PIXELS = maximum_pixels
    canvas = Image.new("RGBA", (layout["width"], layout["height"]))
    tile_dir = output / "tiles"
    tile_dir.mkdir()
    for record in layout["tiles"]:
        image = readers[record["key"]].parse_as_object().image
        try:
            if image.size != (record["width"], record["height"]):
                raise ValueError("Decoded tile dimensions differ from serialized metadata")
            file = tile_dir / f"r{record['row']:03d}-c{record['column']:03d}.png"
            image.save(file, format="PNG")
            record["png"] = file.relative_to(output).as_posix()
            record["pngSha256"] = sha256_file(file)
            y = record["y"] if origin == "top" else layout["height"] - record["y"] - record["height"]
            record["outputY"] = y
            canvas.paste(image, (record["x"], y))
        finally:
            image.close()
    filename = f"{layer.lower()}-candidate-{origin}.png"
    target = output / filename
    canvas.save(target, format="PNG")
    result = {**layout, "selectionType": "explicit-base-grid", "excludedTileCount": len(layout["unselectedTiles"]),
              "rowOrigin": origin, "png": filename, "pngSha256": sha256_file(target),
              "assembly": "unscaled sparse tile grid; absent cells left transparent" if layout["emptyCells"] else "unscaled complete tile rectangle", "orientationValidated": False,
              "renderedLightingValidated": False, "combatValidated": False}
    if webp:
        target = output / f"{layer.lower()}-candidate-{origin}.webp"
        canvas.save(target, format="WEBP", lossless=True, exact=True, method=4)
        result.update({"webp": target.name, "webpSha256": sha256_file(target)})
    canvas.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    canvas.save(output / "preview.png", format="PNG")
    canvas.close()
    return result


def scene_structure(environment) -> dict:
    records, mono, failures, externals = [], [], [], {}
    for reader in environment.objects:
        file_name = str(reader.assets_file.name)
        if file_name not in externals:
            externals[file_name] = [{"fileId": i + 1, "path": external.path} for i, external in enumerate(reader.assets_file.externals)]
        if reader.type.name in SCENE_TYPES:
            try:
                records.append({"serializedFile": file_name, "pathId": reader.path_id,
                                "type": reader.type.name, "data": json_metadata(reader.parse_as_dict())})
            except Exception as error:
                failures.append({"pathId": reader.path_id, "type": reader.type.name, "error": str(error)})
        elif reader.type.name == "MonoBehaviour":
            try:
                # Parse only the documented Unity base header, never game-specific fields.
                head = reader.parse_monobehaviour_head()
                mono.append({"serializedFile": file_name, "pathId": reader.path_id,
                             "gameObject": {"fileId": head.m_GameObject.m_FileID, "pathId": head.m_GameObject.m_PathID},
                             "script": {"fileId": head.m_Script.m_FileID, "pathId": head.m_Script.m_PathID},
                             "name": head.m_Name, "byteSize": reader.byte_size, "customFieldsParsed": False})
            except Exception as error:
                failures.append({"pathId": reader.path_id, "type": "MonoBehaviour", "error": str(error)})
    game_objects = {record["pathId"]: record["data"] for record in records if record["type"] == "GameObject"}
    counts = collections.Counter(record["type"] for record in records)
    light_records = []
    collider_counts = collections.Counter()
    trigger_counts = collections.Counter()
    trigger_names = []
    for record in records:
        kind = record["type"]
        data = record["data"]
        if kind == "Light":
            game_object_id = data.get("m_GameObject", {}).get("m_PathID")
            unity_type = data.get("m_Type")
            light_records.append({
                "pathId": record["pathId"],
                "gameObjectPathId": game_object_id,
                "gameObjectName": game_objects.get(game_object_id, {}).get("m_Name"),
                "enabled": bool(data.get("m_Enabled", False)),
                "typeCode": unity_type,
                "type": UNITY_LIGHT_TYPES.get(unity_type, "unknown"),
                "color": data.get("m_Color"),
                "intensity": data.get("m_Intensity"),
                "range": data.get("m_Range"),
                "spotAngle": data.get("m_SpotAngle"),
                "conversion": "pending-review",
            })
        if kind in {"BoxCollider", "SphereCollider", "MeshCollider"}:
            collider_counts[kind] += 1
            if data.get("m_IsTrigger"):
                trigger_counts[kind] += 1
                game_object_id = data.get("m_GameObject", {}).get("m_PathID")
                name = game_objects.get(game_object_id, {}).get("m_Name")
                trigger_names.append({"pathId": record["pathId"], "gameObjectPathId": game_object_id,
                                      "gameObjectName": name, "shape": kind,
                                      "enabled": bool(data.get("m_Enabled", False))})
    feature_inventory = {
        "lights": {"count": len(light_records), "items": light_records,
                   "converted": 0, "reason": "Unity light model has not been visually calibrated against Foundry V14."},
        "collisions": {"countsByShape": dict(sorted(collider_counts.items())),
                       "total": sum(collider_counts.values()), "wallSegmentsConverted": 0,
                       "navigationDecoded": False,
                       "reason": "Collider volumes are preserved as 3D source data; they are not assumed to be 2D walls."},
        "triggers": {"countsByShape": dict(sorted(trigger_counts.items())),
                     "total": sum(trigger_counts.values()), "items": trigger_names,
                     "behavioursInterpreted": 0, "monoBehaviourHeaders": len(mono),
                     "customFieldsParsed": False,
                     "reason": "Trigger names and volumes are metadata only; game-specific event conditions remain uninterpreted."},
        "ambientSettings": {"renderSettingsCount": counts.get("RenderSettings", 0), "converted": False},
    }
    return {"objects": records, "monoBehaviourHeaders": mono, "externalFiles": externals,
            "featureInventory": feature_inventory,
            "failures": failures, "coordinates": "original Unity local transforms; no Foundry projection inferred",
            "navigationConverted": False, "wallsConverted": False, "combatValidated": False}


def json_metadata(value, depth=0, budget=None):
    """Keep native values; summarize opaque binary buffers instead of guessing them."""
    budget = budget if budget is not None else [500000]
    budget[0] -= 1
    if depth > 40 or budget[0] < 0:
        raise ValueError("Native object metadata exceeds structural limits")
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"opaqueBytes": len(value), "sha256": hashlib.sha256(value).hexdigest(), "decoded": False}
    if isinstance(value, dict):
        return {str(k): json_metadata(v, depth + 1, budget) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [json_metadata(v, depth + 1, budget) for v in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise ValueError(f"Unsupported metadata type: {type(value).__name__}")


def run(args) -> dict:
    path = source_file(Path(args.source), args.maximum_mib * 1024 * 1024)
    before = sha256_file(path)
    header = unity_header(path, args.maximum_mib * 1024 * 1024)
    output = private_output(path, Path(args.output))
    environment = load_unity(path)
    objects = list(environment.objects)
    manifest = {"schemaVersion": "1.0.0", "source": {"path": str(path), "sha256": before, **header},
                "extractedAt": datetime.now(timezone.utc).isoformat(), "redistribution": False,
                "tools": {"UnityPy": UNITYPY_VERSION, "Pillow": PILLOW_VERSION, "typetreeReader": "python"},
                "objectTypes": dict(collections.Counter(o.type.name for o in objects)), "combatValidated": False}
    if args.operation == "textures":
        textures, readers = inspect_textures(environment)
        manifest["textures"] = textures
        if args.compose:
            manifest["mosaic"] = compose(environment, textures, readers, output, layer=args.compose,
                                         area=args.area, grid_extent=args.grid_extent, origin=args.row_origin, maximum_pixels=args.maximum_pixels, webp=args.webp, allow_sparse=args.allow_sparse_grid)
    else:
        manifest["scene"] = scene_structure(environment)
    after = sha256_file(path)
    manifest["sourceUnchanged"] = before == after
    if before != after:
        raise RuntimeError("Original file changed during processing; output is not validated")
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"output": str(output), "objectTypes": manifest["objectTypes"], "sourceUnchanged": True,
            "mosaicDimensions": [manifest["mosaic"]["width"], manifest["mosaic"]["height"]] if "mosaic" in manifest else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("textures", "scene"))
    parser.add_argument("--source", required=True, help="One explicit bundle or serialized scene file")
    parser.add_argument("--output", required=True, help="New private output directory (never a public repo folder)")
    parser.add_argument("--maximum-mib", type=int, default=512)
    parser.add_argument("--maximum-pixels", type=int, default=100000000)
    parser.add_argument("--compose", choices=("BKG", "HGT", "AS", "NM"))
    parser.add_argument("--area", help="Exact observed area name; required when a bundle includes variants")
    parser.add_argument("--grid-extent", nargs=2, type=int, metavar=("ROWS", "COLUMNS"), help="Explicit BASE subset starting at zero; excluded tiles stay pending in the manifest")
    parser.add_argument("--allow-sparse-grid", action="store_true", help="Leave source-absent cells transparent; requires --grid-extent and exact --area")
    parser.add_argument("--row-origin", choices=("top", "bottom"), help="Explicit candidate row origin; never inferred silently")
    parser.add_argument("--webp", action="store_true", help="Also export a lossless WebP candidate")
    args = parser.parse_args()
    if not 1 <= args.maximum_mib <= 2048 or not 1 <= args.maximum_pixels <= 268435456:
        parser.error("Limits must be positive; maximum 2048 MiB and 268435456 pixels")
    if args.operation != "textures" and (args.compose or args.webp):
        parser.error("Composition applies only to the textures operation")
    if args.compose and not args.row_origin:
        parser.error("Composition requires an explicit --row-origin, followed by visual validation")
    if args.compose:
        try:
            validate_composition_spec(args.area, args.grid_extent)
        except ValueError as error:
            parser.error(str(error))
    if args.allow_sparse_grid and (args.operation != "textures" or not args.compose or not args.grid_extent or not args.area):
        parser.error("--allow-sparse-grid requires textures, --compose, --grid-extent and exact --area")
    try:
        print(json.dumps(run(args), ensure_ascii=False))
    except (OSError, ValueError, RuntimeError, ImportError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
