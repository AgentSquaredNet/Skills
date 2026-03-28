#!/usr/bin/env python3
"""
Sign an AgentSquared relay presence target or relay MCP target with an existing
local runtime key bundle.

The script signs the exact bytes provided by the caller. Use it for:
- relay presence targets such as agentsquared:relay-online:<agentId>:<signedAt>
- relay MCP targets such as agentsquared:relay-mcp:<METHOD>:<PATH>:<agentId>:<signedAt>
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, ed25519


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sign a message with a local Agent runtime key.")
    parser.add_argument(
        "--key-file",
        required=True,
        help="Path to the local runtime key bundle JSON file.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--message", help="Literal string to sign as UTF-8 bytes.")
    group.add_argument("--message-file", help="Path to a file whose raw bytes should be signed.")
    return parser.parse_args()


def load_bundle(path: Path) -> dict:
    return json.loads(path.read_text())


def load_message(args: argparse.Namespace) -> bytes:
    if args.message is not None:
        return args.message.encode("utf-8")
    return Path(args.message_file).expanduser().resolve().read_bytes()


def sign_ed25519(private_key_pem: str, message: bytes) -> bytes:
    private_key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    if not isinstance(private_key, ed25519.Ed25519PrivateKey):
        raise TypeError("Expected an Ed25519 private key.")
    return private_key.sign(message)


def sign_secp256k1(private_key_pem: str, message: bytes) -> bytes:
    private_key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    if not isinstance(private_key, ec.EllipticCurvePrivateKey):
        raise TypeError("Expected an EC private key.")
    return private_key.sign(message, ec.ECDSA(hashes.SHA256()))


def main() -> int:
    args = parse_args()
    bundle = load_bundle(Path(args.key_file).expanduser().resolve())
    message = load_message(args)

    key_type = bundle.get("keyType")
    private_key_pem = bundle.get("privateKeyPem")
    if not private_key_pem:
        raise ValueError("Key bundle is missing privateKeyPem.")

    if key_type == 2:
        signature = sign_ed25519(private_key_pem, message)
    elif key_type == 3:
        signature = sign_secp256k1(private_key_pem, message)
    else:
        raise ValueError(f"Unsupported keyType: {key_type!r}")

    result = {
        "keyType": key_type,
        "signatureBase64Url": b64url(signature),
        "signatureHex": signature.hex(),
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
