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
