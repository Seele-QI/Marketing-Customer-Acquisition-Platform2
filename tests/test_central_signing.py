"""Tests for lib/central_signing Ed25519 activate response signing."""

from __future__ import annotations

import base64
import os

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption

import lib.central_signing as signing


@pytest.fixture()
def ed25519_env(monkeypatch):
    private = Ed25519PrivateKey.generate()
    seed_b64 = base64.b64encode(private.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())).decode(
        "ascii"
    )
    monkeypatch.setenv("CENTRAL_SIGNING_PRIVATE_KEY", seed_b64)
    monkeypatch.setenv("CENTRAL_SIGNING_KEY_ID", "test-v1")
    pem = private.public_key().public_bytes(
        Encoding.PEM,
        __import__(
            "cryptography.hazmat.primitives.serialization",
            fromlist=["PublicFormat"],
        ).PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    return private, pem


def test_canonical_payload_stable():
    a = signing.canonical_activate_payload(
        plan="standard",
        expires_at=123.0,
        keys={"B": "2", "A": "1"},
        server_time=100.0,
    )
    b = signing.canonical_activate_payload(
        plan="standard",
        expires_at=123.0,
        keys={"A": "1", "B": "2"},
        server_time=100.0,
    )
    assert a == b
    assert '"A"' in a and '"B"' in a


def test_sign_and_verify_round_trip(ed25519_env):
    _, pem = ed25519_env
    keys = {"DEEPSEEK_API_KEY": "sk-test", "RUNNINGHUB_API_KEY": "rh-test"}
    sig, key_id = signing.sign_activate_response(
        plan="standard",
        expires_at=9999.0,
        keys=keys,
        server_time=1000.0,
    )
    assert sig
    assert key_id == "test-v1"
    assert signing.verify_activate_response(
        plan="standard",
        expires_at=9999.0,
        keys=keys,
        server_time=1000.0,
        signature_b64=sig,
        public_key_pem=pem,
    )


def test_tampered_keys_fail_verify(ed25519_env):
    _, pem = ed25519_env
    keys = {"DEEPSEEK_API_KEY": "sk-test"}
    sig, _ = signing.sign_activate_response(
        plan="standard",
        expires_at=9999.0,
        keys=keys,
        server_time=1000.0,
    )
    bad_keys = {"DEEPSEEK_API_KEY": "sk-tampered"}
    assert not signing.verify_activate_response(
        plan="standard",
        expires_at=9999.0,
        keys=bad_keys,
        server_time=1000.0,
        signature_b64=sig,
        public_key_pem=pem,
    )


def test_unsigned_when_no_private_key(monkeypatch):
    monkeypatch.delenv("CENTRAL_SIGNING_PRIVATE_KEY", raising=False)
    sig, key_id = signing.sign_activate_response(
        plan="standard",
        expires_at=1.0,
        keys={"A": "1"},
        server_time=1.0,
    )
    assert sig == ""
    assert key_id
