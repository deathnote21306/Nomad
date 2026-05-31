import argparse
import logging
import os
import uvicorn


class _SuppressRoutes(logging.Filter):
    _paths = {"/navigation/status"}

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p in msg for p in self._paths)


logging.getLogger("uvicorn.access").addFilter(_SuppressRoutes())

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stream", default="", help="Camera stream URL (e.g. http://192.168.1.x:4747/video)")
    args = parser.parse_args()

    if args.stream:
        os.environ["NOMAD_STREAM_URL"] = args.stream

    uvicorn.run("nomad.server:app", host="0.0.0.0", port=8000, reload=True)
