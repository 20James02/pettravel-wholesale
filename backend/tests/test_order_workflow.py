from app.services.order_workflow import stock_command_for_transition


def test_accepting_order_reserves_stock():
    assert stock_command_for_transition(
        before_commercial="quoted",
        after_commercial="customer_accepted",
        before_fulfillment="not_started",
        after_fulfillment="not_started",
    ) == "reserve_order"


def test_cancelling_order_releases_stock():
    assert stock_command_for_transition(
        before_commercial="customer_accepted",
        after_commercial="cancelled",
        before_fulfillment="supplier_confirmed",
        after_fulfillment="supplier_confirmed",
    ) == "cancel_order"


def test_shipping_order_consumes_stock_once():
    assert stock_command_for_transition(
        before_commercial="locked",
        after_commercial="locked",
        before_fulfillment="ready_to_ship",
        after_fulfillment="shipped",
    ) == "consume_order"
    assert stock_command_for_transition(
        before_commercial="locked",
        after_commercial="locked",
        before_fulfillment="shipped",
        after_fulfillment="delivered",
    ) is None
