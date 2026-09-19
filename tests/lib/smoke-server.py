"""Serve unchanged repository bytes with enough queue capacity for ES-module bursts."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys


class SmokeServer(ThreadingHTTPServer):
    # Python 3.9 defaults to five queued connections. Chromium's module bursts
    # can reset connections on local macOS, preventing the app from loading.
    request_queue_size = 256


server = SmokeServer(('127.0.0.1', int(sys.argv[1])), SimpleHTTPRequestHandler)
print(f'http://127.0.0.1:{server.server_port}', flush=True)
try:
    server.serve_forever()
finally:
    server.server_close()
