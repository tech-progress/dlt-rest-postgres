import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


class Fixture(BaseHTTPRequestHandler):
    phase = 1
    requests_seen = []

    def log_message(self, format, *args):
        return

    def respond(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.respond(200, {"ok": True})
            return
        if self.headers.get("Authorization") != "Bearer " + os.environ["SOURCE_API_TOKEN"]:
            self.respond(401, {"error": "unauthorized"})
            return
        if parsed.path == "/stats":
            self.respond(200, {"requests": self.requests_seen})
            return
        if parsed.path != "/orders":
            self.respond(404, {})
            return
        params = parse_qs(parsed.query)
        since = int(params.get("updated_since", ["0"])[0])
        page = int(params.get("page", ["1"])[0])
        size = int(params.get("page_size", ["50"])[0])
        self.requests_seen.append({"phase": self.phase, "since": since, "page": page})
        orders = [{"id": number, "customer": f"customer-{number % 7}", "amount_cents": number * 100,
                   "status": "paid", "updated_at": 1727740800} for number in range(1, 101)]
        if self.phase == 2:
            orders[0].update(amount_cents=99900, updated_at=1727820000)
            orders.append({"id": 101, "customer": "customer-3", "amount_cents": 10100,
                           "status": "paid", "updated_at": 1727827200})
        orders = [order for order in orders if order["updated_at"] >= since]
        self.respond(200, {"data": orders[(page - 1) * size:page * size],
                           "total_pages": max(1, math.ceil(len(orders) / size))})

    def do_POST(self):
        if self.headers.get("Authorization") != "Bearer " + os.environ["SOURCE_API_TOKEN"]:
            self.respond(401, {})
            return
        if self.path == "/phase/2":
            Fixture.phase = 2
            self.respond(200, {"phase": 2})
        else:
            self.respond(404, {})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Fixture).serve_forever()
