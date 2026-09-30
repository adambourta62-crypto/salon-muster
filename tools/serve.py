"""Lokaler Vorschau-Server mit denselben Sicherheits-Headern wie im Einsatz.

Aufruf (im Projektordner):   python tools/serve.py          → http://localhost:8080
                             python tools/serve.py 9000     → anderer Port
Die Header werden aus der Datei _headers gelesen (Abschnitt „/*“).
Nur Python-Standardbibliothek, keine Installation nötig.
"""
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


def read_headers():
    headers, section = [], None
    for raw in (ROOT / "_headers").read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            section = line.strip()
            continue
        if section == "/*" and ":" in line:
            key, value = line.strip().split(":", 1)
            headers.append((key.strip(), value.strip()))
    return headers


HEADERS = read_headers()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        for key, value in HEADERS:
            self.send_header(key, value)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # ruhiger Log
        if "--quiet" not in sys.argv:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Vorschau: http://localhost:{PORT}  (Beenden mit Strg+C)")
        httpd.serve_forever()
