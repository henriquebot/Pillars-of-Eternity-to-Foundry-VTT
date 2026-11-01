"""Parsers for verified PoE1 XML structures. Scripts remain inert source data."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

MAX_XML_BYTES = 16 * 1024 * 1024
MAX_XML_NODES = 100_000
MAX_XML_DEPTH = 64
XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"


class SourceError(ValueError):
    pass


def safe_xml(raw: bytes) -> ET.Element:
    if len(raw) > MAX_XML_BYTES:
        raise SourceError(f"XML exceeds {MAX_XML_BYTES} bytes")
    try:
        if raw.startswith((b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff")):
            text = raw.decode("utf-32")
        elif raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            text = raw.decode("utf-16")
        else:
            text = raw.decode("utf-8-sig")
    except UnicodeError as exc:
        raise SourceError(f"Expected UTF-8 or BOM-marked UTF-16/32 XML: {exc}") from exc
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", text, re.IGNORECASE):
        raise SourceError("DTD and entity declarations are prohibited")
    parser = ET.XMLPullParser(events=("start", "end"))
    count = depth = 0
    root = None
    try:
        for offset in range(0, len(text), 8192):
            parser.feed(text[offset:offset + 8192])
            for event, element in parser.read_events():
                if event == "start":
                    if root is None:
                        root = element
                    count += 1
                    depth += 1
                    if count > MAX_XML_NODES or depth > MAX_XML_DEPTH:
                        raise SourceError("XML node/depth limit exceeded")
                else:
                    depth -= 1
        parser.close()
    except ET.ParseError as exc:
        raise SourceError(f"Malformed XML: {exc}") from exc
    if root is None:
        raise SourceError("Empty XML")
    return root


def local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def children(element: ET.Element | None, name: str) -> list[ET.Element]:
    return [] if element is None else [e for e in element if local_tag(e.tag) == name]


def child(element: ET.Element | None, name: str) -> ET.Element | None:
    return next(iter(children(element, name)), None)


def content(element: ET.Element | None) -> str:
    return "" if element is None else "".join(element.itertext())


def value(element: ET.Element | None, name: str, default: str = "") -> str:
    found = child(element, name)
    return default if found is None else content(found)


def integer(text: str, label: str) -> int:
    try:
        return int(text)
    except (TypeError, ValueError) as exc:
        raise SourceError(f"Invalid integer {label}: {text!r}") from exc


def tree_data(element: ET.Element) -> dict:
    """JSON-safe source tree, never treated as instructions or HTML."""
    return {"tag": local_tag(element.tag), "attributes": dict(element.attrib),
            "text": element.text or "", "tail": element.tail or "",
            "children": [tree_data(e) for e in element]}


def parse_stringtable(raw: bytes) -> dict:
    root = safe_xml(raw)
    if local_tag(root.tag) != "StringTableFile":
        raise SourceError(f"Unsupported stringtable root: {local_tag(root.tag)}")
    entries: dict[int, dict] = {}
    warnings = []
    for entry in children(child(root, "Entries"), "Entry"):
        source_id = integer(value(entry, "ID"), "Entry.ID")
        if source_id in entries:
            # Ambiguous source tables must not silently overwrite text.
            raise SourceError(f"Duplicate stringtable entry ID {source_id}")
        entries[source_id] = {"defaultText": value(entry, "DefaultText"),
                              "femaleText": value(entry, "FemaleText")}
    declared = value(root, "EntryCount")
    if declared and integer(declared, "EntryCount") != len(entries):
        warnings.append("Declared EntryCount differs from actual entries")
    return {"name": value(root, "Name"), "entries": entries, "warnings": warnings}


def _scripts(node: ET.Element) -> list[dict]:
    calls = []
    for tag, phase in (("OnEnterScripts", "enter"), ("OnExitScripts", "exit"), ("OnUpdateScripts", "update")):
        parent = child(node, tag)
        for call in list(parent) if parent is not None else []:
            data = child(call, "Data")
            if data is not None:
                calls.append({"phase": phase, "function": value(data, "FullName"),
                              "parameters": [content(e) for e in children(child(data, "Parameters"), "string")],
                              "executable": False, "source": tree_data(call)})
    return calls


def parse_flow(raw: bytes, *, quest: bool = False) -> dict:
    root = safe_xml(raw)
    expected = "QuestData" if quest else "ConversationData"
    if local_tag(root.tag) != expected:
        raise SourceError(f"Unsupported {'quest' if quest else 'conversation'} root: {local_tag(root.tag)}")
    nodes = []
    seen = set()
    warnings = []
    known = ({"QuestNode", "ObjectiveNode", "GlobalQuestNode", "EndStateNode"} if quest else
             {"TalkNode", "PlayerResponseNode", "ScriptNode", "BankNode", "TriggerConversationNode"})
    for node in children(child(root, "Nodes"), "FlowChartNode"):
        source_id = integer(value(node, "NodeID"), "NodeID")
        if source_id in seen:
            raise SourceError(f"Duplicate flow node ID {source_id}")
        seen.add(source_id)
        node_type = node.attrib.get(XSI_TYPE, "")
        if node_type not in known:
            warnings.append(f"Unknown node type {node_type!r}: preserved for review")
        links = []
        for link in children(child(node, "Links"), "FlowChartLink"):
            links.append({"from": integer(value(link, "FromNodeID"), "FromNodeID"),
                          "to": integer(value(link, "ToNodeID"), "ToNodeID"),
                          "type": link.attrib.get(XSI_TYPE, ""),
                          "metadata": [tree_data(e) for e in link
                                       if local_tag(e.tag) not in {"FromNodeID", "ToNodeID"}],
                          "source": tree_data(link)})
        nodes.append({"id": source_id, "type": node_type, "isPlayerChoice": node_type == "PlayerResponseNode",
                      "speaker": value(node, "SpeakerGuid"), "listener": value(node, "ListenerGuid"),
                      "links": links, "conditions": tree_data(child(node, "Conditionals"))
                      if child(node, "Conditionals") is not None else None,
                      "scripts": _scripts(node), "source": tree_data(node)})
    for node in nodes:
        for link in node["links"]:
            if link["to"] not in seen:
                warnings.append(f"Node {node['id']} references absent node {link['to']}")
            if link["from"] != node["id"]:
                warnings.append(f"Node {node['id']} has mismatching link source {link['from']}")
    # The full tree preserves unsupported fields and quest event metadata. No original scripts execute.
    return {"nodes": nodes, "warnings": warnings, "sourceTree": tree_data(root),
            "semantics": "partial-structural-only", "automation": "manual-only"}


def quest_text(entries: dict[int, dict], nodes: list[dict]) -> dict:
    """Verified PoE1 stringtable offsets, not an execution model for quest logic."""
    result = {"title": entries.get(0), "description": entries.get(10000), "nodes": [],
              "addenda": [], "endStates": []}
    for node in nodes:
        n = node["id"]
        result["nodes"].append({"id": n, "title": entries.get(n), "description": entries.get(n + 10000)})
    for key, entry in sorted(entries.items()):
        if 20000 <= key < 30000:
            result["addenda"].append({"id": key - 20000, "text": entry})
        elif 30000 <= key < 40000:
            result["endStates"].append({"id": key - 30000, "text": entry})
    return result
