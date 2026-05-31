import argparse

import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cert", default="", help="Path to SSL certificate (.pem)")
    parser.add_argument("--key",  default="", help="Path to SSL key (.pem)")
    args = parser.parse_args()

    ssl_kwargs = {}
    if args.cert and args.key:
        ssl_kwargs["ssl_certfile"] = args.cert
        ssl_kwargs["ssl_keyfile"]  = args.key
        print(f"[SSL] serving HTTPS with {args.cert}")

    uvicorn.run("nomad.server:app", host="0.0.0.0", port=8000, reload=True, **ssl_kwargs)
