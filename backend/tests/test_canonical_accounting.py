import pytest

from app.services.canonical_accounting import post_order_accounting


class _ScalarResult:
    def scalar_one(self):
        return {
            "status": "posted",
            "mode": "post_all",
            "createdEntries": 2,
            "skippedEntries": 0,
            "createdReceivables": 1,
            "createdAllocations": 1,
        }


class _RecordingSession:
    def __init__(self):
        self.parameters = None

    async def execute(self, _statement, parameters):
        self.parameters = parameters
        return _ScalarResult()


@pytest.mark.asyncio
async def test_post_order_accounting_delegates_to_hardened_idempotent_sql_function():
    session = _RecordingSession()

    result = await post_order_accounting(
        session,
        order_id="order_1",
        actor_id="accountant_1",
        mode="post_all",
        vat_rate_bps=800,
        require_consumed_stock=True,
    )

    assert session.parameters == {
        "order_id": "order_1",
        "actor_id": "accountant_1",
        "mode": "post_all",
        "vat_rate_bps": 800,
        "require_consumed_stock": True,
    }
    assert result["createdEntries"] == 2
