import re
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_DATABASE_SCRIPTS = [
    BACKEND_ROOT / "scripts" / "deploy_production_v11_v12.py",
    BACKEND_ROOT / "scripts" / "inspect_prod_readonly.py",
    BACKEND_ROOT / "scripts" / "prod_read_only_gate.py",
]
EMBEDDED_DATABASE_CREDENTIAL = re.compile(
    r"postgres(?:ql)?://[^\s'\"]+:[^\s'\"]+@",
    re.IGNORECASE,
)


def test_production_database_scripts_never_embed_connection_credentials():
    for script_path in PRODUCTION_DATABASE_SCRIPTS:
        source = script_path.read_text(encoding="utf-8")
        assert not EMBEDDED_DATABASE_CREDENTIAL.search(source), script_path.name
        assert "settings.async_database_url" in source, script_path.name
