"""Own synthetic headers/tile metadata; no game assets and no optional dependencies."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
from types import SimpleNamespace

SPEC = importlib.util.spec_from_file_location("unity_maps", Path(__file__).resolve().parents[2] / "tools/unity_maps.py")
unity = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(unity)


def texture(row, column, width=4, height=4, area="OwnSyntheticArea", layer="BKG"):
    return {"name": f"{layer}_{area}-R{row:03d}_C{column:03d}", "width": width, "height": height, "key": f"{row}-{column}"}


def synthetic_fs(uncompressed=100, flags=0x40):
    info = b"\0" * 16 + struct.pack(">I2IH", 1, uncompressed, 1, 0) + struct.pack(">I", 0)
    base = b"UnityFS\0" + struct.pack(">I", 7) + b"5.x.x\0" + b"2019.4.39f1\0"
    prefix_length = len(base) + 20
    padding = b"\0" * (-prefix_length % 16)
    total = prefix_length + len(padding) + len(info) + 1
    return base + struct.pack(">Q3I", total, len(info), len(info), flags) + padding + info + b"x"


class MosaicTests(unittest.TestCase):
    def test_composition_requires_an_exact_area_and_explicit_base_grid(self):
        with self.assertRaisesRegex(ValueError, "exact --area"):
            unity.validate_composition_spec(None, (1, 1))
        with self.assertRaisesRegex(ValueError, "explicit --grid-extent"):
            unity.validate_composition_spec("OwnSyntheticArea", None)
        with self.assertRaisesRegex(ValueError, "positive row and column"):
            unity.validate_composition_spec("OwnSyntheticArea", (0, 1))
        unity.validate_composition_spec("OwnSyntheticArea", (1, 1))

    def test_complete_rectangle_preserves_edge_dimensions(self):
        records = [texture(0, 0), texture(0, 1, 3), texture(1, 0, height=1), texture(1, 1, 3, 1)]
        result = unity.tile_layout(records)
        self.assertEqual((result["width"], result["height"]), (7, 5))
        self.assertEqual([(t["x"], t["y"]) for t in result["tiles"]], [(0, 0), (4, 0), (0, 4), (4, 4)])

    def test_missing_tiles_are_never_fabricated(self):
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            unity.tile_layout([texture(0, 0), texture(0, 1), texture(1, 0)])

    def test_explicit_sparse_grid_keeps_missing_cells_transparent_and_counted(self):
        result = unity.tile_layout([texture(0, 0), texture(0, 1), texture(1, 0)], grid_extent=(2, 2), allow_sparse=True)
        self.assertFalse(result["tileGridComplete"])
        self.assertEqual(result["emptyCells"], [[1, 1]])
        self.assertTrue(result["sourceCoverageComplete"])
        self.assertEqual((result["width"], result["height"]), (8, 8))

    def test_sparse_grid_requires_explicit_extent(self):
        with self.assertRaisesRegex(ValueError, "explicit --grid-extent"):
            unity.tile_layout([texture(0, 0)], allow_sparse=True)

    def test_sparse_grid_stacks_short_edge_tiles_without_inventing_pixels(self):
        records = [texture(0, 0), texture(0, 1), texture(1, 0, height=1)]
        result = unity.tile_layout(records, grid_extent=(2, 2), allow_sparse=True)
        self.assertEqual((result["width"], result["height"]), (8, 5))
        by_cell = {(tile["row"], tile["column"]): tile for tile in result["tiles"]}
        self.assertEqual(by_cell[(1, 0)]["y"], 4)
        self.assertEqual(result["emptyCells"], [[1, 1]])

    def test_duplicate_indices_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            unity.tile_layout([texture(0, 0), texture(0, 0)])

    def test_inconsistent_edges_and_nonzero_indices_are_rejected(self):
        for records in ([texture(0, 0), texture(1, 0, 3)], [texture(1, 0)], [texture(0, 1)]):
            with self.assertRaises(ValueError):
                unity.tile_layout(records)

    def test_tiles_in_one_row_must_share_height_before_they_can_be_stitched(self):
        with self.assertRaisesRegex(ValueError, "Inconsistent tile heights in one row"):
            unity.tile_layout([texture(0, 0, 4, 4), texture(0, 1, 4, 3)])

    def test_layers_and_areas_are_not_mixed(self):
        result = unity.tile_layout([texture(0, 0), texture(0, 0, layer="NM")])
        self.assertEqual(len(result["tiles"]), 1)
        with self.assertRaises(ValueError):
            unity.tile_layout([texture(0, 0), texture(0, 1, area="DifferentOwnArea")])

    def test_variant_selection_is_explicit_and_preserves_pending_areas(self):
        records = [texture(0, 0), texture(4, 0, area="OwnSyntheticArea_f001")]
        result = unity.tile_layout(records, area="OwnSyntheticArea")
        self.assertEqual(len(result["tiles"]), 1)
        self.assertEqual(result["additionalAreas"], ["OwnSyntheticArea_f001"])
        self.assertTrue(result["sourceCoverageComplete"])

    def test_explicit_base_subset_keeps_extra_tiles_pending(self):
        result = unity.tile_layout([texture(0, 0), texture(0, 1), texture(1, 0)], grid_extent=(1, 2))
        self.assertEqual(len(result["tiles"]), 2)
        self.assertEqual(len(result["unselectedTiles"]), 1)
        self.assertFalse(result["sourceCoverageComplete"])
        with self.assertRaises(ValueError):
            unity.tile_layout([texture(0, 0)], grid_extent=(1, 2))

    def test_pixel_limit_precedes_decoding(self):
        with self.assertRaisesRegex(ValueError, "pixel limit"):
            unity.tile_layout([texture(0, 0, 100, 100)], maximum_pixels=9999)

    def test_binary_navigation_data_is_not_falsely_decoded(self):
        result = unity.json_metadata({"tiles": [b"own synthetic opaque navigation bytes"]})
        self.assertFalse(result["tiles"][0]["decoded"])
        self.assertEqual(result["tiles"][0]["opaqueBytes"], 37)
        self.assertEqual(len(result["tiles"][0]["sha256"]), 64)

    def test_scene_feature_inventory_keeps_lights_and_triggers_pending(self):
        class Reader:
            def __init__(self, type_name, path_id, data):
                self.type = SimpleNamespace(name=type_name)
                self.path_id = path_id
                self.assets_file = SimpleNamespace(name="own-scene", externals=[])
                self._data = data
            def parse_as_dict(self):
                return self._data

        env = SimpleNamespace(objects=[
            Reader("GameObject", 10, {"m_Name": "OwnTrigger"}),
            Reader("Light", 11, {"m_GameObject": {"m_PathID": 10}, "m_Enabled": 1,
                                  "m_Type": 1, "m_Color": {"r": 1, "g": 1, "b": 1, "a": 1},
                                  "m_Intensity": 1.0, "m_Range": 10.0}),
            Reader("BoxCollider", 12, {"m_GameObject": {"m_PathID": 10}, "m_Enabled": True,
                                        "m_IsTrigger": True, "m_Size": {"x": 2, "y": 1, "z": 3}}),
        ])
        result = unity.scene_structure(env)["featureInventory"]
        self.assertEqual(result["lights"]["count"], 1)
        self.assertEqual(result["lights"]["items"][0]["type"], "directional")
        self.assertEqual(result["lights"]["converted"], 0)
        self.assertEqual(result["collisions"]["total"], 1)
        self.assertEqual(result["triggers"]["total"], 1)
        self.assertEqual(result["triggers"]["items"][0]["gameObjectName"], "OwnTrigger")
        self.assertEqual(result["triggers"]["behavioursInterpreted"], 0)


class SourceBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp_parent = (Path(__file__).resolve().parents[2] / ".tmp" / "unity-tests").resolve()
        self.temp_parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=self.temp_parent)
        self.root = Path(self.temp.name).resolve()
        self.assertTrue(self.root.is_relative_to(self.temp_parent))

    def tearDown(self):
        self.assertTrue(self.root.is_relative_to(self.temp_parent))
        self.temp.cleanup()

    def test_newer_bundle_header_has_per_file_version_and_bounded_size(self):
        source = self.root / "own-bundle"
        source.write_bytes(synthetic_fs())
        header = unity.unity_header(source)
        self.assertEqual(header["signature"], "UnityFS")
        self.assertEqual(header["unityVersion"], "2019.4.39f1")
        self.assertEqual(header["uncompressedBytes"], 100)
        with self.assertRaisesRegex(ValueError, "Expanded"):
            unity.unity_header(source, maximum_uncompressed=99)

    def test_unknown_or_encrypted_flags_are_refused(self):
        source = self.root / "own-bundle"
        source.write_bytes(synthetic_fs(flags=0x240))
        with self.assertRaisesRegex(ValueError, "Unknown/encrypted"):
            unity.unity_header(source)

    def test_output_cannot_modify_installation_or_public_repository(self):
        game = self.root / "original" / "PillarsOfEternity_Data"
        game.mkdir(parents=True)
        source = game / "own-file"
        source.write_bytes(b"synthetic")
        repo = self.root / "repository"
        with self.assertRaisesRegex(ValueError, "outside"):
            unity.private_output(source, game.parent / "new", repository=repo)
        with self.assertRaisesRegex(ValueError, "ignored local"):
            unity.private_output(source, repo / "docs" / "private", repository=repo)
        output = unity.private_output(source, repo / "local" / "new", repository=repo)
        (output / "prior.json").write_text("own-data")
        with self.assertRaisesRegex(ValueError, "never overwritten"):
            unity.private_output(source, output, repository=repo)

    def test_explicit_input_size_limit_and_bad_headers(self):
        source = self.root / "own-file"
        source.write_bytes(b"not Unity")
        with self.assertRaises(ValueError):
            unity.source_file(source, 2)
        with self.assertRaises(ValueError):
            unity.unity_header(source)


if __name__ == "__main__":
    unittest.main()
