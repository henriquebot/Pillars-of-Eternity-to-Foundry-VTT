"""All generated images/headers are original tiny test fixtures, not game assets."""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "extractor"))

from rpgup_pillars.__main__ import main
from rpgup_pillars.images import catalog_images, header_dimensions
from rpgup_pillars.parsers import SourceError


def chunk(tag: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)


def own_png(width: int = 1, height: int = 1) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    pixels = (b"\x00" + b"\x40\x80\xC0" * width) * height
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")


def own_jpeg_header(width: int = 24, height: int = 16, marker: int = 0xC0) -> bytes:
    # Only a frame-header fixture. Deliberately not presented as a decodable JPEG.
    payload = struct.pack(">BHHB", 8, height, width, 1) + bytes((1, 0x11, 0))
    comment = b"Own header-only fixture"
    return b"\xff\xd8\xff\xfe" + struct.pack(">H", len(comment) + 2) + comment + bytes((0xFF, marker)) + struct.pack(">H", len(payload) + 2) + payload + b"\xff\xd9"


def own_webp_header(tag: bytes = b"VP8X", width: int = 32, height: int = 12) -> bytes:
    if tag == b"VP8X":
        payload = b"\x00" * 4 + (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little")
    elif tag == b"VP8L":
        bits = (width - 1) | ((height - 1) << 14)
        payload = b"\x2F" + bits.to_bytes(4, "little")
    else:
        payload = b"\x10\x00\x00\x9d\x01\x2a" + struct.pack("<HH", width, height)
    content = tag + struct.pack("<I", len(payload)) + payload + (b"\x00" if len(payload) % 2 else b"")
    return b"RIFF" + struct.pack("<I", len(content) + 4) + b"WEBP" + content


def own_dds_header(width: int = 128, height: int = 64) -> bytes:
    result = bytearray(128)
    result[:4] = b"DDS "
    struct.pack_into("<IIII", result, 4, 124, 0x1007, height, width)
    struct.pack_into("<I", result, 76, 32)
    return bytes(result)


class HeaderTests(unittest.TestCase):
    def test_png_header_dimensions_and_checksum(self):
        raw = own_png(2, 3)
        result = header_dimensions(raw, ".png", len(raw))
        self.assertEqual((result["width"], result["height"]), (2, 3))
        broken = bytearray(raw)
        broken[20] ^= 1
        with self.assertRaisesRegex(SourceError, "checksum"):
            header_dimensions(bytes(broken), ".png", len(broken))

    def test_png_truncation_and_zero_dimensions_refused(self):
        with self.assertRaises(SourceError):
            header_dimensions(b"\x89PNG", ".png", 4)
        raw = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 0, 1, 8, 2, 0, 0, 0))
        with self.assertRaisesRegex(SourceError, "dimensions"):
            header_dimensions(raw, ".png", len(raw))

    def test_jpeg_baseline_and_progressive_skip_comment(self):
        for marker in (0xC0, 0xC2):
            raw = own_jpeg_header(marker=marker)
            result = header_dimensions(raw, ".jpg", len(raw))
            self.assertEqual((result["width"], result["height"]), (24, 16))

    def test_jpeg_malformed_segment_refused(self):
        with self.assertRaisesRegex(SourceError, "segment length"):
            header_dimensions(b"\xff\xd8\xff\xe0\x00\x01", ".jpeg", 6)

    def test_jpeg_deferred_height_explicitly_unsupported(self):
        raw = own_jpeg_header(height=0)
        with self.assertRaisesRegex(SourceError, "DNL"):
            header_dimensions(raw, ".jpeg", len(raw))

    def test_webp_all_three_header_variants(self):
        for tag in (b"VP8X", b"VP8L", b"VP8 "):
            raw = own_webp_header(tag)
            result = header_dimensions(raw, ".webp", len(raw))
            self.assertEqual((result["width"], result["height"]), (32, 12))

    def test_webp_truncated_riff_refused(self):
        raw = own_webp_header()
        with self.assertRaisesRegex(SourceError, "truncated"):
            header_dimensions(raw[:-1], ".webp", len(raw) - 1)

    def test_dds_header_dimensions(self):
        raw = own_dds_header()
        result = header_dimensions(raw, ".dds", len(raw))
        self.assertEqual((result["width"], result["height"]), (128, 64))
        with self.assertRaises(SourceError):
            header_dimensions(raw[:127], ".dds", 127)

    def test_unknown_header_is_not_guessed(self):
        with self.assertRaisesRegex(SourceError, "not supported"):
            header_dimensions(b"not-an-image", ".tga", 12)


class CatalogueTests(unittest.TestCase):
    def setUp(self):
        temp_base = Path(__file__).resolve().parents[2] / ".tmp"
        temp_base.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=temp_base)
        assert Path(self.tmp.name).resolve().is_relative_to(temp_base.resolve())
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.source = self.base / "own-source"
        self.source.mkdir()
        (self.source / ".rpgup-synthetic").write_text("Own fixtures only", encoding="utf-8")

    def test_readonly_hashes_exact_duplicates_without_map_classification(self):
        raw = own_png()
        for name in ("a.png", "copy.PNG"):
            (self.source / name).write_bytes(raw)
        (self.source / "notes.txt").write_text("Own non-image", encoding="utf-8")
        before = {p.name: p.read_bytes() for p in self.source.iterdir() if p.is_file()}
        result = catalog_images(self.source)
        self.assertEqual(result["counts"]["candidates"], 2)
        self.assertEqual(result["counts"]["hashed"], 2)
        self.assertEqual(result["counts"]["dimensionsRead"], 2)
        self.assertEqual(len(result["duplicateBytes"]), 1)
        self.assertEqual(result["duplicateBytes"][0]["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertTrue(result["source"]["synthetic"])
        self.assertTrue(all(image["classification"] == "unclassified-image" and
                            image["quality"] == "unassessed" and not image["imageDecodeValidated"] and
                            not image["foundryLoadValidated"] for image in result["images"]))
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.source.iterdir() if p.is_file()})

    def test_invalid_and_unsupported_images_keep_hash_but_no_dimensions(self):
        for name in ("corrupt.png", "own.tga"):
            (self.source / name).write_bytes(b"Own invalid-header test fixture")
        result = catalog_images(self.source)
        self.assertEqual(result["counts"]["hashed"], 2)
        self.assertEqual(result["counts"]["dimensionsRead"], 0)
        self.assertEqual(len(result["diagnostics"]), 2)

    def test_byte_limit_skips_without_hashing(self):
        (self.source / "a.png").write_bytes(own_png())
        result = catalog_images(self.source, max_file_bytes=10)
        self.assertEqual(result["counts"]["hashed"], 0)
        self.assertEqual(result["counts"]["bytesHashed"], 0)
        self.assertEqual(result["diagnostics"][0]["severity"], "error")

    def test_total_byte_limit_is_enforced(self):
        raw = own_png()
        (self.source / "a.png").write_bytes(raw)
        (self.source / "b.png").write_bytes(raw)
        result = catalog_images(self.source, max_total_bytes=len(raw))
        self.assertEqual(result["counts"]["hashed"], 1)
        self.assertEqual(result["counts"]["bytesHashed"], len(raw))

    def test_cli_output_outside_source_and_validate_flags(self):
        (self.source / "a.png").write_bytes(own_png())
        output = self.base / "catalogue.json"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["catalog-images", "--root", str(self.source), "--output", str(output)]), 0)
        result = json.loads(output.read_text(encoding="utf-8"))
        self.assertFalse(result["images"][0]["imageDecodeValidated"])
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(["catalog-images", "--root", str(self.source), "--output", str(self.source / "bad.json")]), 2)
        self.assertFalse((self.source / "bad.json").exists())

    def test_missing_root_and_invalid_limits_fail(self):
        with self.assertRaises(SourceError):
            catalog_images(self.base / "missing")
        with self.assertRaises(SourceError):
            catalog_images(self.source, max_file_bytes=0)


if __name__ == "__main__":
    unittest.main()
