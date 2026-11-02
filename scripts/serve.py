"""Serve repository bytes with enough queue capacity for browser module bursts."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        # Match GitHub Pages: dynamic account routes boot through the actual
        # 404 document, retaining the 404 status until its client redirect.
        if code == 404:
            try:
                content = (Path(self.directory) / "404.html").read_bytes()
            except OSError:
                pass
            else:
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(content)
                return
        super().send_error(code, message, explain)


class PreviewServer(ThreadingHTTPServer):
    # Python 3.9's five queued connections can reset a browser's module burst.
    request_queue_size = 256


def main(default_port=9000):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", type=int, default=default_port)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--directory", default=".")
    args = parser.parse_args()
    handler = partial(PreviewHandler, directory=args.directory)
    with PreviewServer((args.bind, args.port), handler) as server:
        print(f"http://{args.bind}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
