import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/api/health" else 404)
        self.end_headers()

    def do_POST(self):
        expected = f"Bearer {os.environ['NOTIFICATION_JOB_SECRET']}"
        valid = (
            self.path == "/api/internal/notifications/gb-ending-soon"
            and self.headers.get("Authorization") == expected
        )
        if valid:
            open("/results/post-ok", "w", encoding="utf-8").close()
        self.send_response(200 if valid else 401)
        self.end_headers()

    def log_message(self, *_args):
        pass


HTTPServer(("0.0.0.0", 3000), Handler).serve_forever()
