from pathlib import Path

from scripts.check_production_env import is_placeholder


def test_redacted_and_example_environment_values_are_rejected():
    for value in (
        "pub-example.r2.dev",
        "Unavailable",
        "<encrypted>",
        "[REDACTED]",
        "hidden",
        "changeme",
    ):
        assert is_placeholder(value), value


def test_realistic_environment_values_are_not_treated_as_placeholders():
    assert not is_placeholder("pettravel-wholesale")
    assert not is_placeholder("https://assets.pettravel.vn")
    assert not is_placeholder("a1B2c3D4e5F6g7H8")


def test_backend_preflight_requires_authoritative_payment_configuration():
    source = (Path(__file__).resolve().parents[1] / "scripts" / "check_production_env.py").read_text(
        encoding="utf-8"
    )
    for key in (
        "PAYMENT_QR_BANK_CODE",
        "PAYMENT_QR_ACCOUNT_NO",
        "PAYMENT_QR_ACCOUNT_NAME",
        "VIETQR_WEBHOOK_SECRET",
        "PAYMENT_SYSTEM_ACTOR_ID",
    ):
        assert f'"{key}"' in source
    assert '"R2_PRIVATE_BUCKET"' in source
    assert "R2_PRIVATE_BUCKET must be different from R2_BUCKET" in source
