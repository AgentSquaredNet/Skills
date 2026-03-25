#!/usr/bin/env python3
"""
Generate a local AgentSquared runtime keypair.

This script is intended to run inside the Agent's own local runtime or skill
workspace. It writes a local-only key bundle that includes the registration
public key and a PEM-encoded private key for subsequent relay signing.
"""

from __future__ import annotations

import argparse
import base64
import json
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, ed25519


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def build_ed25519_bundle() -> dict[str, str | int]:
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    return {
        "keyType": 2,
        "keyTypeName": "agent_runtime_ed25519",
        "publicKey": b64url(public_bytes),
        "publicKeyEncoding": "base64url-raw-32",
        "publicKeyHex": public_bytes.hex(),
        "privateKeyPem": private_pem,
        "privateKeyEncoding": "pkcs8-pem",
        "signingAlgorithm": "ed25519",
    }


def build_secp256k1_bundle() -> dict[str, str | int]:
    private_key = ec.generate_private_key(ec.SECP256K1())
    public_key = private_key.public_key()

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.CompressedPoint,
    )
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    return {
        "keyType": 3,
        "keyTypeName": "agent_runtime_secp256k1",
        "publicKey": public_bytes.hex(),
        "publicKeyEncoding": "hex-compressed-33",
        "publicKeyHex": public_bytes.hex(),
        "privateKeyPem": private_pem,
        "privateKeyEncoding": "pkcs8-pem",
        "signingAlgorithm": "ecdsa-secp256k1-sha256",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a local Agent runtime keypair.")
    parser.add_argument(
        "--key-type",
        choices=("ed25519", "secp256k1"),
        default="ed25519",
        help="Runtime key type to generate. Defaults to ed25519.",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Path to the local key bundle JSON file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_path = Path(args.out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    bundle = build_ed25519_bundle() if args.key_type == "ed25519" else build_secp256k1_bundle()
    bundle["generatedAt"] = datetime.now(timezone.utc).isoformat()

    out_path.write_text(json.dumps(bundle, indent=2) + "\n")
    out_path.chmod(0o600)
    print(f"Wrote local runtime key bundle to {out_path}")
    print(f"keyType={bundle['keyType']} publicKey={bundle['publicKey']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
