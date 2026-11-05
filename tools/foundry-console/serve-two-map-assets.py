"""Serve exactly the two private repaired maps to Foundry Desktop on loopback."""
from argparse import ArgumentParser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

REPOSITORY = Path(__file__).resolve().parents[2]
ALLOWED = {
    "valewood-base-6x6-2026-11-04.webp",
    "gilded-vale-base-6x10-2026-11-04.webp",
}
ORIGIN = "http://localhost:30001"


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Private local folder containing the two generated WebP files")
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    root = (REPOSITORY / args.root).resolve()
    private_root = (REPOSITORY / "local").resolve()
    if not root.is_relative_to(private_root) or not root.is_dir():
        raise SystemExit("The asset directory must exist below this repository's ignored local/ directory.")
    assets = {name: (root / name).resolve() for name in ALLOWED}
    for name, path in assets.items():
        if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size <= 0:
            raise SystemExit(f"Missing or unsafe asset: {name}")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.headers.get("Origin") != ORIGIN:
                self.send_error(403, "Foundry Desktop origin required")
                return
            name = urlsplit(self.path).path.removeprefix("/")
            path = assets.get(name)
            if path is None:
                self.send_error(404, "Not found")
                return
            body = path.read_bytes()
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", ORIGIN)
            self.send_header("Vary", "Origin")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "image/webp")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    server.timeout = 1
    print(f"Serving two allowlisted assets on 127.0.0.1:{args.port}; Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("Loopback asset server stopped.", flush=True)


if __name__ == "__main__":
    main()
