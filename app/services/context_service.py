from app.database.repository import (
    get_account_by_id,
    get_order_by_id,
    get_ticket_by_id,
)


def get_ticket_context(ticket_id: str):
    ticket = get_ticket_by_id(ticket_id)

    if not ticket:
        return None

    account = get_account_by_id(ticket["account_id"])

    return {
        "ticket": ticket,
        "account": account,
    }


def get_order_context(order_id: str):
    order = get_order_by_id(order_id)

    if not order:
        return None

    account = get_account_by_id(order["account_id"])

    return {
        "order": order,
        "account": account,
    }