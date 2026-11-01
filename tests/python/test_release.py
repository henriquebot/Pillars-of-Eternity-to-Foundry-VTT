from pathlib import Path
import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load("release", ROOT / "tools/build_release.py")
reporting = load("reporting", ROOT / "tools/coverage_report.py")


class ReportingTests(unittest.TestCase):
    def test_counts_real_ir_only_without_inventing_runtime_results(self):
        report = reporting.coverage({"id": "sample", "entities": [{"id": "a", "kind": "map"}, {"id": "b", "kind": "map"}, {"id": "c", "kind": "quest"}]})
        row = report["rows"][0]
        self.assertEqual((row["found"], row["imported"], row["validated"], row["pending"]), (2, 0, 0, 2))
        self.assertFalse(report["foundryRuntimeExecuted"])

    def test_duplicate_ids_fail(self):
        with self.assertRaises(ValueError):
            reporting.coverage({"entities": [{"id": "a", "kind": "map"}, {"id": "a", "kind": "map"}]})

    def test_no_game_data_is_explicit(self):
        report = reporting.coverage()
        self.assertEqual(report["basis"], "no-game-data-processed")
        self.assertTrue(all(row["found"] == 0 for row in report["rows"]))


class ReleaseTests(unittest.TestCase):
    def test_deterministic_allowlisted_archive(self):
        (ROOT / ".tmp").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT / ".tmp") as folder:
            output = Path(folder)
            one = release.build(output)
            two = release.build(output)
            self.assertEqual(one["sha256"], two["sha256"])
            with zipfile.ZipFile(output / one["archive"]) as archive:
                self.assertIn("module.json", archive.namelist())
                self.assertTrue(all(Path(name).suffix in release.ALLOWED for name in archive.namelist()))
                self.assertFalse(any(name.startswith(("local/", "extractor/", "tests/")) for name in archive.namelist()))


if __name__ == "__main__":
    unittest.main()
