"""python -m rpgup_pillars --help"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from . import __version__
from .parsers import SourceError
from .pipeline import extract, validate, write_json
from .packaging import make_package
from .images import catalog_images, FILE_LIMIT, TOTAL_LIMIT
from .scanner import DATA_FOLDER, discover, inventory


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rpgup-pillars", description="Extrator PoE1 somente leitura")
    parser.add_argument("--version", action="version", version=__version__)
    commands = parser.add_subparsers(dest="command", required=True)
    scan = commands.add_parser("scan", help="Encontrar instalações e inventariar arquivos sem alterações")
    scan.add_argument("--root", action="append", default=[], type=Path)
    scan.add_argument("--no-auto", action="store_true", help="Consultar somente as raízes explícitas")
    scan.add_argument("--output", type=Path)
    scan.add_argument("--max-files", type=int, default=100_000)
    convert = commands.add_parser("extract", help="Extrair quests, diálogos e tabelas XML para IR")
    convert.add_argument("--root", type=Path, required=True)
    convert.add_argument("--output", type=Path, required=True)
    convert.add_argument("--language", default="pt-BR")
    convert.add_argument("--max-files", type=int, default=100_000)
    check = commands.add_parser("validate", help="Validar estrutura mínima e IDs de um arquivo IR")
    check.add_argument("path", type=Path)
    package = commands.add_parser("package", help="Criar pacote compacto filtrado para importação no Foundry")
    package.add_argument("path", type=Path, help="IR completo produzido por extract")
    package.add_argument("--output", type=Path, required=True)
    package.add_argument("--select-source", action="append", default=[], help="Glob de sourceId, repetível")
    package.add_argument("--kind", action="append", default=[], help="Tipo de entidade, repetível")
    package.add_argument("--no-related", action="store_true", help="Não incluir quests referenciadas")
    images = commands.add_parser("catalog-images", help="Catalogar imagens externas por cabeçalho e SHA-256, sem decodificar")
    images.add_argument("--root", type=Path, required=True)
    images.add_argument("--output", type=Path, required=True)
    images.add_argument("--max-files", type=int, default=100_000)
    images.add_argument("--max-file-bytes", type=int, default=FILE_LIMIT)
    images.add_argument("--max-total-bytes", type=int, default=TOTAL_LIMIT)
    args = parser.parse_args(argv)
    try:
        if args.command == "catalog-images":
            payload = catalog_images(args.root, max_files=args.max_files, max_file_bytes=args.max_file_bytes,
                                     max_total_bytes=args.max_total_bytes)
            source = args.root.resolve()
            forbidden = [source]
            for ancestor in (source, *source.parents):
                if ancestor.name == DATA_FOLDER:
                    forbidden.append(ancestor.parent)
            write_json(args.output, payload, forbidden_roots=tuple(forbidden))
            print(json.dumps({"output": str(args.output.resolve()), "counts": payload["counts"],
                              "diagnostics": len(payload["diagnostics"]), "imageDecodeValidated": False}, ensure_ascii=False))
            return 1 if any(d["severity"] == "error" for d in payload["diagnostics"]) else 0
        if args.command == "scan":
            payload = discover(args.root, auto=not args.no_auto)
            for install in payload["installations"]:
                install["inventory"] = inventory(Path(install["dataRoot"]), max_files=args.max_files)
            if args.output:
                forbidden = tuple(Path(p["root"]) for p in payload["installations"]) + tuple(args.root)
                write_json(args.output, payload, forbidden_roots=forbidden)
                print(json.dumps({"output": str(args.output.resolve()), "installations": len(payload["installations"]),
                                  "warnings": payload["warnings"]}, ensure_ascii=False))
            else:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        if args.command == "extract":
            payload = extract(args.root, language=args.language, max_files=args.max_files)
            errors = validate(payload)
            if errors:
                raise SourceError("Generated IR failed validation: " + "; ".join(errors))
            source = args.root.parent if args.root.name == DATA_FOLDER else args.root
            backup = write_json(args.output, payload, forbidden_roots=(source,))
            print(json.dumps({"output": str(args.output.resolve()), "backup": str(backup) if backup else None,
                              "entities": len(payload["entities"]), "synthetic": payload["source"]["synthetic"],
                              "errors": sum(d["severity"] == "error" for d in payload["diagnostics"]),
                              "warnings": sum(d["severity"] == "warning" for d in payload["diagnostics"])}, ensure_ascii=False))
            return 1 if any(d["severity"] == "error" for d in payload["diagnostics"]) else 0
        if args.path.stat().st_size > 512 * 1024 * 1024:
            raise SourceError("IR exceeds 512 MiB validation/package input limit")
        with args.path.open(encoding="utf-8-sig") as stream:
            payload = json.load(stream, parse_constant=lambda value: (_ for _ in ()).throw(SourceError("Non-finite JSON number")))
        if args.command == "package":
            digest = hashlib.sha256()
            with args.path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            packed = make_package(payload, patterns=tuple(args.select_source), kinds=tuple(args.kind),
                                  include_related=not args.no_related, original_path=args.path,
                                  original_sha256=digest.hexdigest())
            forbidden = (Path(payload["source"]["root"]),) if payload["source"].get("root") else ()
            if args.output.resolve() == args.path.resolve():
                raise SourceError("Package output must differ from the original full extract")
            backup = write_json(args.output, packed, forbidden_roots=forbidden)
            print(json.dumps({"output": str(args.output.resolve()), "entities": len(packed["entities"]),
                              "backup": str(backup) if backup else None, "originalPreserved": str(args.path.resolve())}, ensure_ascii=False))
            return 0
        errors = validate(payload)
        print(json.dumps({"valid": not errors, "errors": errors}, ensure_ascii=False))
        return 1 if errors else 0
    except (OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
