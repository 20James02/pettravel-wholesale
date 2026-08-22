import json

import pytest
from starlette.requests import Request

from app.main import global_exception_handler


@pytest.mark.asyncio
async def test_global_exception_response_does_not_expose_exception_details():
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/private",
            "headers": [],
            "scheme": "https",
            "server": ("example.test", 443),
            "client": ("203.0.113.10", 1234),
            "query_string": b"",
        }
    )
    response = await global_exception_handler(request, RuntimeError("database password leaked here"))
    payload = json.loads(response.body)

    assert response.status_code == 500
    assert payload["requestId"]
    assert response.headers["x-request-id"] == payload["requestId"]
    assert "database password" not in response.body.decode("utf-8")
    assert "error" not in payload
