from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "extractor"))

from rpgup_pillars.__main__ import main
from rpgup_pillars.parsers import SourceError, parse_flow, parse_stringtable, quest_text, safe_xml
from rpgup_pillars.pipeline import extract, stable_id, validate, write_json
from rpgup_pillars.packaging import _check_limits, make_package
from rpgup_pillars.scanner import DATA_FOLDER, discover, inventory, steam_libraries, walk_files

FIXTURES = Path(__file__).parent / "fixtures"


def fake_install(parent: Path) -> Path:
    root = parent / "Synthetic Pillars"
    root.mkdir()
    (root / ".rpgup-synthetic").write_text("Own test data only", encoding="utf-8")
    base = root / DATA_FOLDER / "data"
    for relative, fixture in (
        ("conversations/test/branch.conversation", "branch.conversation"),
        ("localized/en/text/conversations/test/branch.stringtable", "branch.stringtable"),
        ("quests/test/sample.quest", "sample.quest"),
        ("localized/en/text/quests/test/sample.stringtable", "sample.stringtable"),
    ):
        target = base / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(FIXTURES / fixture, target)
    return root


class ParserTests(unittest.TestCase):
    def test_stringtable_preserves_accents_and_variants(self):
        result = parse_stringtable((FIXTURES / "branch.stringtable").read_bytes())
        self.assertIn("ação, bênção e coração", result["entries"][0]["defaultText"])
        self.assertEqual(result["entries"][0]["femaleText"], "Uma variante própria.")

    def test_duplicate_text_id_refused(self):
        with self.assertRaisesRegex(SourceError, "Duplicate"):
            parse_stringtable(b"<StringTableFile><Entries><Entry><ID>1</ID></Entry><Entry><ID>1</ID></Entry></Entries></StringTableFile>")

    def test_declared_count_warning(self):
        result = parse_stringtable(b"<StringTableFile><EntryCount>3</EntryCount><Entries /></StringTableFile>")
        self.assertEqual(len(result["warnings"]), 1)

    def test_wrong_root_refused(self):
        with self.assertRaisesRegex(SourceError, "Unsupported"):
            parse_stringtable(b"<NotStringTable />")

    def test_malformed_xml_refused(self):
        with self.assertRaisesRegex(SourceError, "Malformed"):
            safe_xml(b"<a><b></a>")

    def test_dtd_refused(self):
        with self.assertRaisesRegex(SourceError, "prohibited"):
            safe_xml(b'<!DOCTYPE a [<!ENTITY hidden "secret">]><a>&hidden;</a>')

    def test_utf16_dtd_refused(self):
        with self.assertRaisesRegex(SourceError, "prohibited"):
            safe_xml('<!DOCTYPE a [<!ENTITY hidden "secret">]><a>&hidden;</a>'.encode("utf-16"))

    def test_xml_depth_limited(self):
        with self.assertRaisesRegex(SourceError, "limit"):
            safe_xml(("<a>" * 65 + "</a>" * 65).encode())

    def test_utf16_xml_supported(self):
        self.assertEqual(safe_xml('<a>ação</a>'.encode("utf-16")).text, "ação")

    def test_conversation_branch_structure_and_inert_script(self):
        result = parse_flow((FIXTURES / "branch.conversation").read_bytes())
        self.assertEqual([link["to"] for link in result["nodes"][0]["links"]], [1, 2])
        self.assertTrue(result["nodes"][1]["isPlayerChoice"])
        self.assertFalse(result["nodes"][0]["scripts"][0]["executable"])
        self.assertEqual(result["automation"], "manual-only")
        self.assertIn("CharacterMappings", str(result["sourceTree"]))

    def test_dangling_link_warns(self):
        raw = (FIXTURES / "branch.conversation").read_bytes().replace(b"<ToNodeID>2", b"<ToNodeID>999")
        self.assertIn("absent node 999", " ".join(parse_flow(raw)["warnings"]))

    def test_duplicate_node_id_refused(self):
        raw = (FIXTURES / "branch.conversation").read_bytes().replace(b"<NodeID>2", b"<NodeID>1")
        with self.assertRaisesRegex(SourceError, "Duplicate"):
            parse_flow(raw)

    def test_quest_text_offsets(self):
        flow = parse_flow((FIXTURES / "sample.quest").read_bytes(), quest=True)
        table = parse_stringtable((FIXTURES / "sample.stringtable").read_bytes())
        result = quest_text(table["entries"], flow["nodes"])
        self.assertEqual(result["title"]["defaultText"], "Missão sintética de validação")
        self.assertEqual(result["nodes"][1]["description"]["defaultText"], "Detalhe do primeiro objetivo sintético.")
        self.assertEqual(result["addenda"][0]["id"], 0)
        self.assertEqual(result["endStates"][0]["id"], 0)


class InstallationTests(unittest.TestCase):
    def setUp(self):
        temp_base = Path(__file__).resolve().parents[2] / ".tmp"
        temp_base.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=temp_base)
        assert Path(self.tmp.name).resolve().is_relative_to(temp_base.resolve())
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name)
        self.root = fake_install(self.parent)

    def test_direct_root_and_data_root_discovery(self):
        result = discover([self.root, self.root / DATA_FOLDER], auto=False)
        self.assertEqual(len(result["installations"]), 1)
        self.assertTrue(result["installations"][0]["synthetic"])

    def test_parent_root_bounded_discovery(self):
        result = discover([self.parent], auto=False)
        self.assertEqual(len(result["installations"]), 1)

    def test_missing_installation_handled(self):
        self.assertEqual(discover([self.parent / "missing"], auto=False)["installations"], [])
        with self.assertRaisesRegex(SourceError, "No readable"):
            extract(self.parent / "missing")

    def test_inventory_counts_actual_sources(self):
        result = inventory(self.root / DATA_FOLDER)
        self.assertEqual(result["counts"]["text"], 4)
        self.assertEqual(len(result["files"]), 4)

    def test_walk_file_limit(self):
        with self.assertRaisesRegex(ValueError, "limit"):
            list(walk_files(self.root, max_files=1))

    def test_steam_current_library_metadata(self):
        steam = self.parent / "steam"
        apps = steam / "steamapps"
        apps.mkdir(parents=True)
        library = self.parent / "outside-library"
        (apps / "libraryfolders.vdf").write_text('"libraryfolders" { "0" { "path" "' + str(library).replace("\\", "\\\\") + '" } }', encoding="utf-8")
        self.assertIn(library, steam_libraries(steam))

    def test_steam_manifest_detects_arbitrary_install_name(self):
        library = self.parent / "library"
        apps = library / "steamapps"
        destination = apps / "common/arbitrary-name"
        destination.parent.mkdir(parents=True)
        shutil.move(str(self.root), destination)
        (apps / "appmanifest_291650.acf").write_text('"AppState" { "installdir" "arbitrary-name" }', encoding="utf-8")
        result = discover([library], auto=False)
        self.assertEqual(result["installations"][0]["root"], str(destination.resolve()))

    def test_steam_manifest_traversal_refused(self):
        library = self.parent / "library"
        apps = library / "steamapps"
        apps.mkdir(parents=True)
        (apps / "appmanifest_291650.acf").write_text('"installdir" "../Synthetic Pillars"', encoding="utf-8")
        result = discover([library], auto=False)
        self.assertEqual(result["installations"], [])
        self.assertIn("Unsafe", " ".join(result["warnings"]))

    def test_steam_partial_install_warns_without_owner_fields(self):
        library = self.parent / "library"
        apps = library / "steamapps"
        apps.mkdir(parents=True)
        (apps / "appmanifest_291650.acf").write_text('"installdir" "still-downloading" "StateFlags" "1026" "LastOwner" "DO-NOT-RETURN"', encoding="utf-8")
        result = discover([library], auto=False)
        self.assertIn("StateFlags=1026", " ".join(result["warnings"]))
        self.assertNotIn("DO-NOT-RETURN", json.dumps(result))

    def test_extract_is_readonly_and_ids_repeat(self):
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        first = extract(self.root)
        second = extract(self.root)
        after = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual([e["id"] for e in first["entities"]], [e["id"] for e in second["entities"]])
        self.assertEqual(validate(first), [])
        self.assertTrue(first["source"]["synthetic"])
        self.assertEqual({e["kind"] for e in first["entities"]}, {"quest", "dialogue"})

    def test_sidecar_source_snapshots_are_exact_and_external(self):
        audit = self.parent / "audit"
        result = extract(self.root, source_detail="sidecar", audit_dir=audit)
        self.assertTrue(all("sourceTree" not in entity["data"] for entity in result["entities"]))
        for entity in result["entities"]:
            original = Path(entity["provenance"]["path"])
            snapshot = Path(entity["provenance"]["snapshotPath"])
            self.assertEqual(snapshot.read_bytes(), original.read_bytes())
            self.assertTrue(snapshot.resolve().is_relative_to(audit.resolve()))
        self.assertFalse(any(p.suffix == ".tmp" for p in audit.rglob("*")))

    def test_sidecar_cannot_write_into_source_and_requires_audit_dir(self):
        with self.assertRaisesRegex(SourceError, "outside"):
            extract(self.root, source_detail="sidecar", audit_dir=self.root / "audit")
        with self.assertRaisesRegex(SourceError, "requires"):
            extract(self.root, source_detail="sidecar")
        self.assertFalse((self.root / "audit").exists())

    def test_language_selection_can_include_all_explicitly(self):
        foreign = self.root / DATA_FOLDER / "data/localized/de/text/conversations/test/branch.stringtable"
        foreign.parent.mkdir(parents=True)
        foreign.write_bytes((FIXTURES / "branch.stringtable").read_bytes())
        selected = extract(self.root)
        self.assertIn("de", selected["source"]["availableLanguages"])
        self.assertFalse(any(table.get("language") == "de" for table in selected["source"]["tables"]))
        complete = extract(self.root, all_languages=True)
        self.assertTrue(any(table.get("language") == "de" for table in complete["source"]["tables"]))
        dialogue = next(entity for entity in complete["entities"] if entity["kind"] == "dialogue")
        self.assertIn("de", dialogue["data"]["nodes"][0]["texts"])

    def test_dialogue_text_and_quest_reference_resolve(self):
        result = extract(self.root)
        dialogue = next(e for e in result["entities"] if e["kind"] == "dialogue")
        quest = next(e for e in result["entities"] if e["kind"] == "quest")
        self.assertIn("ação", dialogue["data"]["nodes"][0]["texts"]["en"]["defaultText"])
        self.assertEqual(dialogue["data"]["references"][0]["id"], quest["id"])

    def test_missing_translation_explicitly_flagged(self):
        result = extract(self.root, language="pt-BR")
        dialogue = next(e for e in result["entities"] if e["kind"] == "dialogue")
        text = dialogue["data"]["nodes"][0]["texts"]["pt-BR"]
        self.assertTrue(text["translationMissing"])
        self.assertEqual(text["language"], "en")
        self.assertNotIn("pt-BR", dialogue["name"])

    def test_conversation_root_without_text_is_not_reported_missing(self):
        table_path = self.root / DATA_FOLDER / "data/localized/en/text/conversations/test/branch.stringtable"
        table_path.write_bytes(b'<StringTableFile><Entries><Entry><ID>1</ID><DefaultText>Own test choice</DefaultText></Entry><Entry><ID>2</ID><DefaultText>Own other choice</DefaultText></Entry></Entries></StringTableFile>')
        result = extract(self.root)
        dialogue = next(entity for entity in result["entities"] if entity["kind"] == "dialogue")
        self.assertTrue(dialogue["data"]["nodes"][0]["isRoot"])
        self.assertFalse(any(warning == "Missing stringtable text for node 0" for warning in dialogue["data"]["warnings"]))

    def test_white_march_later_entry_override_and_fallback(self):
        expansion = self.root / DATA_FOLDER / "data_expansion1/localized/en/text/conversations/test/branch.stringtable"
        expansion.parent.mkdir(parents=True)
        expansion.write_text('<StringTableFile><Entries><Entry><ID>0</ID><DefaultText>Expansão sintética</DefaultText></Entry></Entries></StringTableFile>', encoding="utf-8")
        result = extract(self.root, language="pt-BR")
        dialogue = next(e for e in result["entities"] if e["kind"] == "dialogue")
        self.assertEqual(dialogue["data"]["nodes"][0]["texts"]["en"]["defaultText"], "Expansão sintética")
        self.assertEqual(dialogue["data"]["nodes"][1]["texts"]["en"]["defaultText"], "Investigar o objeto de teste.")

    def test_source_parse_error_preserves_other_entities(self):
        path = self.root / DATA_FOLDER / "data/quests/test/sample.quest"
        path.write_bytes(b"<Broken>")
        result = extract(self.root)
        self.assertEqual(len(result["entities"]), 1)
        self.assertTrue(any(d["code"] == "narrative-unreadable" for d in result["diagnostics"]))

    def test_output_inside_game_refused(self):
        with self.assertRaisesRegex(SourceError, "outside"):
            write_json(self.root / "output.json", {}, forbidden_roots=(self.root,))

    def test_output_backup_and_atomic_write(self):
        target = self.parent / "campaign.json"
        write_json(target, {"first": 1}, forbidden_roots=(self.root,))
        backup = write_json(target, {"second": 2}, forbidden_roots=(self.root,))
        self.assertEqual(json.loads(target.read_text()), {"second": 2})
        self.assertEqual(json.loads(backup.read_text()), {"first": 1})

    def test_cli_extract_validate_and_scan(self):
        target = self.parent / "campaign.json"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["scan", "--root", str(self.root), "--no-auto"]), 0)
            self.assertEqual(main(["extract", "--root", str(self.root), "--output", str(target)]), 0)
            self.assertEqual(main(["validate", str(target)]), 0)

    def test_scan_cannot_write_to_incomplete_explicit_source(self):
        partial = self.parent / "Partial-install"
        partial.mkdir()
        target = partial / "scan.json"
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(["scan", "--root", str(partial), "--no-auto", "--output", str(target)]), 2)
        self.assertFalse(target.exists())

    def test_compact_package_filters_and_preserves_dialogue_logic(self):
        campaign = extract(self.root)
        packed = make_package(campaign, patterns=("conversations/*",))
        self.assertEqual({e["kind"] for e in packed["entities"]}, {"quest", "dialogue"})
        self.assertNotIn("tables", packed["source"])
        for entity in packed["entities"]:
            self.assertNotIn("sourceTree", entity["data"])
            for node in entity["data"]["nodes"]:
                self.assertNotIn("source", node)
        dialogue = next(e for e in packed["entities"] if e["kind"] == "dialogue")
        node = dialogue["data"]["nodes"][0]
        self.assertIsNotNone(node["conditions"])
        self.assertEqual(node["scripts"][0]["function"], "Void StartQuest(String)")
        self.assertFalse(node["scripts"][0]["executable"])
        self.assertTrue(campaign["source"]["tables"])
        self.assertIn("sourceTree", campaign["entities"][0]["data"])

    def test_package_can_exclude_related_and_filter_kind(self):
        campaign = extract(self.root)
        packed = make_package(campaign, kinds=("dialogue",), include_related=False)
        self.assertEqual(len(packed["entities"]), 1)
        self.assertEqual(packed["entities"][0]["kind"], "dialogue")

    def test_package_no_matches_is_error(self):
        with self.assertRaisesRegex(SourceError, "No entities matched"):
            make_package(extract(self.root), patterns=("never-matches-*",))

    def test_cli_package_preserves_original(self):
        original = self.parent / "full.json"
        output = self.parent / "package.json"
        write_json(original, extract(self.root), forbidden_roots=(self.root,))
        before = original.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            code = main(["package", str(original), "--output", str(output), "--select-source", "conversations/*"])
        self.assertEqual(code, 0)
        self.assertEqual(original.read_bytes(), before)
        self.assertLess(output.stat().st_size, original.stat().st_size)
        result = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(validate(result), [])
        self.assertEqual(output.stat().st_size, _check_limits(result)["bytes"])

    def test_cli_package_cannot_replace_full_extract(self):
        original = self.parent / "full.json"
        write_json(original, extract(self.root), forbidden_roots=(self.root,))
        before = original.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = main(["package", str(original), "--output", str(original)])
        self.assertEqual(code, 2)
        self.assertEqual(original.read_bytes(), before)


class ValidationTests(unittest.TestCase):
    def test_wrong_schema_and_missing_fields(self):
        errors = validate({"schemaVersion": "2.0", "id": "x", "source": {}, "entities": [{}]})
        self.assertTrue(any("Unsupported schemaVersion" in error for error in errors))
        self.assertTrue(any("provenance" in error for error in errors))

    def test_stable_identifier_normalizes_slashes_and_case(self):
        self.assertEqual(stable_id("quest", "QUESTS\\TEST\\X"), stable_id("quest", "quests/test/x"))

    def test_nonobject_campaign_rejected(self):
        self.assertEqual(validate([]), ["Campaign must be an object"])

    def test_package_limits_match_runtime_depth_and_unsafe_keys(self):
        payload = {}
        current = payload
        for _ in range(41):
            current["next"] = {}
            current = current["next"]
        with self.assertRaisesRegex(SourceError, "40 levels"):
            _check_limits(payload)
        with self.assertRaisesRegex(SourceError, "prohibited"):
            _check_limits({"constructor": "untrusted"})


if __name__ == "__main__":
    unittest.main()
