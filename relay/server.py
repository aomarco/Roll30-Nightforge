#!/usr/bin/env python3
"""Nightforge Zen relay.

A tiny middleman that lets the browser game talk to OpenCode Go. Browsers
refuse to call Zen directly (Zen sends no CORS blessing), but servers may call
anyone -- so the bubble calls this relay (your computer, your rules, CORS wide
open) and the relay walks the request over to Zen itself.

Runs on the standard library only: no pip install step, anywhere Python 3.11+
lives. See README.md beside this file for the five-minute hosting guide.

Security posture, stated plainly:
- The relay holds NO api keys. Yours travels browser -> relay -> Zen and the
  relay never writes it anywhere. A stranger who finds your relay address can
  only spend their OWN key through it, never yours.
- Only /chat/completions (POST) and /models (GET) are forwarded. Everything
  else gets a 404. Bodies are capped at 4 MiB with a 120 s upstream timeout.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = "https://opencode.ai/zen/go/v1"
FORWARD_ROUTES = {"/chat/completions", "/models"}
MAX_BODY_BYTES = 4 * 1024 * 1024
UPSTREAM_TIMEOUT_SECONDS = 120


def json_bytes(payload):
    return json.dumps(payload).encode("utf-8")


class RelayHandler(BaseHTTPRequestHandler):
    server_version = "NightforgeRelay/1.0"

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # Must name every non-standard header the bubble sends (it posts an
        # HTTP-Referer attribution line for OpenRouter); one missing name
        # fails the whole preflight and the browser reports a bare TypeError.
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Title, HTTP-Referer")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json(self, status, payload):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 - http.server names the hooks
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/":
            self._send_json(200, {"ok": True, "relay": "nightforge-zen", "upstream": UPSTREAM})
            return
        if path == "/models":
            self._forward("GET", path, None)
            return
        self._send_json(404, {"ok": False, "code": "relay-unknown-route"})

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path not in FORWARD_ROUTES:
            self._send_json(404, {"ok": False, "code": "relay-unknown-route"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json(413, {"ok": False, "code": "relay-body-too-large"})
            return
        self._forward("POST", path, self.rfile.read(length))

    def _forward(self, method, path, body):
        upstream = urllib.request.Request(
            UPSTREAM + path,
            data=body,
            method=method,
            headers={
                "Content-Type": "application/json",
                "Authorization": self.headers.get("Authorization") or "",
                "X-Title": self.headers.get("X-Title") or "Roll30 Nightforge tabletop sage",
            },
        )
        try:
            with urllib.request.urlopen(upstream, timeout=UPSTREAM_TIMEOUT_SECONDS) as answer:
                payload = answer.read()
                self.send_response(answer.status)
                self.send_header("Content-Type", answer.headers.get("Content-Type") or "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self._cors_headers()
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as failure:
            payload = failure.read() or json_bytes({"ok": False, "code": "relay-upstream-error"})
            self.send_response(failure.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(payload)
        except Exception as failure:  # network down, DNS, timeout: say so as JSON
            self._send_json(502, {"ok": False, "code": "relay-unreachable", "message": str(failure)[:200]})
        finally:
            print(f"{method} {path} forwarded", flush=True)

    def log_message(self, *args):  # keep hosted logs to one line per call
        print(f"relay {args[0] % args[1:]}", flush=True)


def main():
    port = int(os.environ.get("PORT") or 8099)
    server = ThreadingHTTPServer(("0.0.0.0", port), RelayHandler)
    print(f"Nightforge Zen relay listening on {port}, forwarding to {UPSTREAM}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
