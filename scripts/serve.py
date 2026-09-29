"""Serve repository bytes with enough queue capacity for browser module bursts."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class PreviewServer(ThreadingHTTPServer):
    # Python 3.9's five queued connections can reset a browser's module burst.
    request_queue_size = 256


def main(default_port=9000):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", type=int, default=default_port)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--directory", default=".")
    args = parser.parse_args()
    handler = partial(SimpleHTTPRequestHandler, directory=args.directory)
    with PreviewServer((args.bind, args.port), handler) as server:
        print(f"http://{args.bind}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
