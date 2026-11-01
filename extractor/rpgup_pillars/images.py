"""Header-only external image cataloguing; this module is not an image decoder."""
from __future__ import annotations

import hashlib
import struct
import zlib
from pathlib import Path

from . import __version__
from .parsers import SourceError
from .pipeline import now, stable_id
from .scanner import IMAGE_EXTENSIONS, is_link, walk_files

HEADER_LIMIT = 1024 * 1024
FILE_LIMIT = 512 * 1024 * 1024
TOTAL_LIMIT = 8 * 1024 * 1024 * 1024
DIMENSION_LIMIT = 1_048_576
SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def _dimensions(width: int, height: int) -> tuple[int, int]:
    if not (0 < width <= DIMENSION_LIMIT and 0 < height <= DIMENSION_LIMIT):
        raise SourceError(f"Header dimensions out of catalogue bounds: {width}x{height}")
    return width, height


def _png(data: bytes) -> tuple[int, int]:
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[8:16] != b"\x00\x00\x00\rIHDR":
        raise SourceError("PNG signature or IHDR is missing/truncated")
    if zlib.crc32(data[12:29]) & 0xFFFFFFFF != struct.unpack(">I", data[29:33])[0]:
        raise SourceError("PNG IHDR checksum mismatch")
    width, height, bits, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", data[16:29])
    allowed = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
    if bits not in allowed.get(colour, set()) or compression or filtering or interlace not in {0, 1}:
        raise SourceError("Unsupported or invalid PNG IHDR fields")
    return _dimensions(width, height)


def _jpeg(data: bytes) -> tuple[int, int]:
    if data[:2] != b"\xff\xd8":
        raise SourceError("JPEG SOI signature missing")
    offset = 2
    while offset < len(data):
        if data[offset] != 0xFF:
            raise SourceError("Invalid JPEG marker before frame header")
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in {0x00, 0xD8}:
            raise SourceError("Invalid JPEG marker sequence")
        if marker in {0xDA, 0xD9}:
            raise SourceError("JPEG scan/end appears before a supported frame header")
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        length = struct.unpack(">H", data[offset:offset + 2])[0]
        if length < 2:
            raise SourceError("Invalid JPEG segment length")
        end = offset + length
        if end > len(data):
            raise SourceError("JPEG header truncated or exceeds 1 MiB scan limit")
        if marker in SOF_MARKERS:
            payload = data[offset + 2:end]
            if len(payload) < 6:
                raise SourceError("Truncated JPEG SOF")
            precision, height, width, components = struct.unpack(">BHHB", payload[:6])
            if not components or len(payload) != 6 + 3 * components or not 2 <= precision <= 16:
                raise SourceError("Invalid JPEG frame component description")
            if height == 0:
                raise SourceError("JPEG uses deferred DNL height; dimensions require unsupported scan parsing")
            return _dimensions(width, height)
        offset = end
    raise SourceError("No supported JPEG SOF within the 1 MiB header scan limit")


def _webp(data: bytes, file_size: int) -> tuple[int, int]:
    if len(data) < 20 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise SourceError("WebP RIFF signature missing/truncated")
    riff_end = struct.unpack("<I", data[4:8])[0] + 8
    if riff_end > file_size or riff_end < 20:
        raise SourceError("WebP RIFF declares a truncated or invalid container size")
    offset = 12
    while offset + 8 <= min(len(data), riff_end):
        tag = data[offset:offset + 4]
        size = struct.unpack("<I", data[offset + 4:offset + 8])[0]
        begin, end = offset + 8, offset + 8 + size
        if end > riff_end:
            raise SourceError("WebP chunk exceeds RIFF container")
        if tag == b"VP8X":
            if size != 10 or begin + 10 > len(data):
                raise SourceError("Invalid/truncated WebP VP8X dimensions")
            width = int.from_bytes(data[begin + 4:begin + 7], "little") + 1
            height = int.from_bytes(data[begin + 7:begin + 10], "little") + 1
            if width * height > 0xFFFFFFFF:
                raise SourceError("WebP canvas pixel count exceeds container limit")
            return _dimensions(width, height)
        if tag == b"VP8L":
            if size < 5 or begin + 5 > len(data) or data[begin] != 0x2F:
                raise SourceError("Invalid/truncated WebP VP8L dimensions")
            bits = int.from_bytes(data[begin + 1:begin + 5], "little")
            if bits >> 29:
                raise SourceError("Unsupported WebP lossless version")
            return _dimensions((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
        if tag == b"VP8 ":
            if size < 10 or begin + 10 > len(data) or data[begin] & 1 or data[begin + 3:begin + 6] != b"\x9d\x01\x2a":
                raise SourceError("Invalid/truncated WebP VP8 key-frame header")
            width, height = struct.unpack("<HH", data[begin + 6:begin + 10])
            return _dimensions(width & 0x3FFF, height & 0x3FFF)
        offset = end + (size & 1)
    raise SourceError("No supported WebP dimension header within 1 MiB")


def _dds(data: bytes) -> tuple[int, int]:
    if len(data) < 128 or data[:4] != b"DDS " or struct.unpack("<I", data[4:8])[0] != 124:
        raise SourceError("DDS magic or 124-byte header missing/truncated")
    if struct.unpack("<I", data[76:80])[0] != 32:
        raise SourceError("Invalid DDS pixel-format header size")
    height, width = struct.unpack("<II", data[12:20])
    if data[84:88] == b"DX10" and len(data) < 148:
        raise SourceError("Truncated DDS DX10 extension header")
    return _dimensions(width, height)


def header_dimensions(data: bytes, suffix: str, file_size: int) -> dict:
    suffix = suffix.lower()
    if suffix == ".png":
        width, height = _png(data)
        name = "PNG"
    elif suffix in {".jpg", ".jpeg"}:
        width, height = _jpeg(data)
        name = "JPEG"
    elif suffix == ".webp":
        width, height = _webp(data, file_size)
        name = "WebP"
    elif suffix == ".dds":
        width, height = _dds(data)
        name = "DDS"
    else:
        raise SourceError(f"Dimension parser not supported for {suffix}; bytes may still be catalogued")
    return {"width": width, "height": height, "format": name, "basis": "file-header-only"}


def catalog_images(root: Path, *, max_files: int = 100_000, max_file_bytes: int = FILE_LIMIT,
                   max_total_bytes: int = TOTAL_LIMIT) -> dict:
    if is_link(root) or not root.is_dir():
        raise SourceError("Image source must be an existing regular directory, not a link/junction")
    if min(max_files, max_file_bytes, max_total_bytes) <= 0:
        raise SourceError("Catalogue limits must be positive")
    root = root.resolve()
    timestamp = now()
    records, diagnostics = [], []
    digests: dict[str, list[str]] = {}
    consumed = 0
    synthetic = any((p / ".rpgup-synthetic").is_file() for p in (root, *root.parents))
    for path in walk_files(root, max_files=max_files):
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        relative = path.relative_to(root).as_posix()
        record = {"id": stable_id("unclassified-image", relative), "path": str(path), "relativePath": relative,
                  "classification": "unclassified-image", "quality": "unassessed",
                  "imageDecodeValidated": False, "foundryLoadValidated": False,
                  "dimensions": None, "sha256": None, "headerStatus": "not-read"}
        try:
            before = path.stat()
            record["sizeBytes"] = before.st_size
            if before.st_size > max_file_bytes or consumed + before.st_size > max_total_bytes:
                raise SourceError("Image hashing file/total byte limit exceeded; source was not read")
            digest = hashlib.sha256()
            total = 0
            with path.open("rb") as stream:
                header = stream.read(min(HEADER_LIMIT, max_file_bytes))
                digest.update(header)
                total += len(header)
                consumed += len(header)
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    total += len(chunk)
                    consumed += len(chunk)
                    if total > max_file_bytes or consumed > max_total_bytes:
                        raise SourceError("Image grew beyond hashing byte limits while being read")
                    digest.update(chunk)
            after = path.stat()
            if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns or total != before.st_size:
                raise SourceError("Image changed during read; hash and dimensions discarded")
            record["sha256"] = digest.hexdigest()
            record["provenance"] = {"source": "synthetic-fixture" if synthetic else "local-file",
                                    "path": str(path), "sourceId": relative,
                                    "sha256": record["sha256"], "extractedAt": timestamp,
                                    "status": "extracted"}
            digests.setdefault(record["sha256"], []).append(relative)
            try:
                record["dimensions"] = header_dimensions(header, path.suffix, total)
                record["headerStatus"] = "dimensions-read"
            except SourceError as exc:
                record["headerStatus"] = "unsupported" if path.suffix.lower() == ".tga" else "invalid-or-unsupported"
                diagnostics.append({"severity": "warning", "path": str(path), "code": "image-header-unresolved", "message": str(exc)})
        except (OSError, SourceError) as exc:
            record["headerStatus"] = "unreadable-or-limit"
            diagnostics.append({"severity": "error", "path": str(path), "code": "image-read-failed", "message": str(exc)})
        records.append(record)
    return {"schemaVersion": "1.0.0", "type": "rpgup-image-catalogue", "source": {"root": str(root),
            "extractedAt": timestamp, "extractorVersion": __version__, "synthetic": synthetic},
            "limits": {"filesWalked": max_files, "fileBytes": max_file_bytes,
                       "totalHashBytes": max_total_bytes, "headerBytes": HEADER_LIMIT,
                       "maxDimension": DIMENSION_LIMIT},
            "images": records, "duplicateBytes": [{"sha256": digest, "paths": paths}
            for digest, paths in sorted(digests.items()) if len(paths) > 1], "diagnostics": diagnostics,
            "counts": {"candidates": len(records), "hashed": sum(r["sha256"] is not None for r in records),
                       "dimensionsRead": sum(r["dimensions"] is not None for r in records),
                       "decoded": 0, "foundryValidated": 0,
                       "bytesHashed": sum(r.get("sizeBytes", 0) for r in records if r["sha256"]),
                       "bytesRead": consumed},
            "note": "Header inspection and byte hashes do not prove image decodability, quality, map identity or combat readiness."}
