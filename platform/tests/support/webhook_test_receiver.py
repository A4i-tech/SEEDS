from __future__ import annotations

import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


@dataclass
class CapturedRequest:
    method: str
    path: str
    headers: dict[str, str]
    body: bytes


class WebhookTestReceiver:
    def __init__(self) -> None:
        self.requests: list[CapturedRequest] = []
        self._response_codes: list[int] = []
        self._lock = threading.Lock()
        receiver = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                with receiver._lock:
                    receiver.requests.append(
                        CapturedRequest(
                            method="POST",
                            path=self.path,
                            headers=dict(self.headers.items()),
                            body=body,
                        )
                    )
                    code = receiver._response_codes.pop(0) if receiver._response_codes else 200
                self.send_response(code)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, format: str, *args: object) -> None:
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self._server.server_address
        return f"http://{host}:{port}/hook"

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()

    def queue_response_code(self, code: int) -> None:
        with self._lock:
            self._response_codes.append(code)

    @property
    def request_count(self) -> int:
        with self._lock:
            return len(self.requests)
