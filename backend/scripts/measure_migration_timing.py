import asyncio
import time
import os
import asyncpg
import statistics

POSTGRES_TEST_HOST = os.environ.get("POSTGRES_TEST_HOST", "127.0.0.1")
POSTGRES_TEST_PORT = int(os.environ.get("POSTGRES_TEST_PORT", "5432"))
POSTGRES_TEST_USER = os.environ.get("POSTGRES_TEST_USER", "postgres")
POSTGRES_TEST_PASS = os.environ.get("POSTGRES_TEST_PASS", "postgres")
POSTGRES_TEST_DB = "pettravel_lock_measure_test"

async def measure_lock_durations():
    # Connect to default postgres to setup db
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database="postgres"
    )
    await conn.execute(f"DROP DATABASE IF EXISTS {POSTGRES_TEST_DB}")
    await conn.execute(f"CREATE DATABASE {POSTGRES_TEST_DB}")
    await conn.close()

    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=POSTGRES_TEST_DB
    )

    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    schema_file = os.path.join(supabase_dir, "schema.sql")
    with open(schema_file, "r", encoding="utf-8") as f:
        await conn.execute(f.read())

    v11_file = os.path.join(supabase_dir, "update_v11_security_accounting_hardening.sql")
    with open(v11_file, "r", encoding="utf-8") as f:
        v11_sql = f.read()

    durations_ms = []

    # Run 50 repeated replacements
    for i in range(50):
        t0 = time.perf_counter()
        async with conn.transaction():
            await conn.execute(v11_sql)
        t1 = time.perf_counter()
        durations_ms.append((t1 - t0) * 1000.0)

    await conn.close()

    durations_sorted = sorted(durations_ms)
    min_v = durations_sorted[0]
    med_v = statistics.median(durations_sorted)
    p95_v = durations_sorted[int(len(durations_sorted) * 0.95)]
    max_v = durations_sorted[-1]
    mean_v = statistics.mean(durations_sorted)
    stdev_v = statistics.stdev(durations_sorted)

    print("--- 50 REPEATED MIGRATION REPLACEMENTS LOCK / EXECUTION TIMING ---")
    print(f"Min:    {min_v:.2f} ms")
    print(f"Median: {med_v:.2f} ms")
    print(f"P95:    {p95_v:.2f} ms")
    print(f"Max:    {max_v:.2f} ms")
    print(f"Mean:   {mean_v:.2f} ms")
    print(f"StdDev: {stdev_v:.2f} ms")

if __name__ == "__main__":
    asyncio.run(measure_lock_durations())

