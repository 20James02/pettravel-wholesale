import argparse
import asyncio
import os
from pathlib import Path

import asyncpg


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent


def load_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


async def apply() -> None:
    dsn = (os.getenv("DATABASE_URL") or "").strip()
    if not dsn.startswith(("postgresql://", "postgres://")):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL URL.")

    ssl_mode = (os.getenv("DB_SSL_MODE") or "require").strip().lower()
    ssl_value: str | bool = False if ssl_mode == "disable" else "require"
    sql = (REPO_ROOT / "supabase" / "update_v9_order_workflow_guards.sql").read_text(
        encoding="utf-8"
    )
    connection = await asyncpg.connect(dsn=dsn, ssl=ssl_value, timeout=20)
    try:
        async with connection.transaction():
            await connection.execute(
                "select pg_advisory_xact_lock(hashtext('pettravel:update_v9_order_workflow_guards'))"
            )
            await connection.execute(sql)
        print("MIGRATION_V9_APPLIED=true")
    finally:
        await connection.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    args = parser.parse_args()
    load_env_file(Path(args.env_file))
    asyncio.run(apply())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
