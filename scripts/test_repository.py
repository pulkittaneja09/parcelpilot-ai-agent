from app.database.repository import (
    get_account_by_id,
    get_order_by_id,
    get_ticket_by_id,
)


def test_repository():
    account = get_account_by_id("ACCT-001")
    print("\nACCOUNT:")
    print(account)

    order = get_order_by_id("ORD-1001")
    print("\nORDER:")
    print(order)

    ticket = get_ticket_by_id("TKT-501")
    print("\nTICKET:")
    print(ticket)


if __name__ == "__main__":
    test_repository()