from app.database.repository import (
    get_account_by_id,
    get_order_by_id,
    get_ticket_by_id,
    get_orders_by_account,
    get_tickets_by_account,
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

    orders = get_orders_by_account("ACCT-001")
    print("\nNORTHSTAR ORDERS:")
    for order in orders:
        print(order["order_id"], "-", order["status"])

    tickets = get_tickets_by_account("ACCT-001")
    print("\nNORTHSTAR TICKETS:")
    for ticket in tickets:
        print(ticket["ticket_id"], "-", ticket["subject"])


if __name__ == "__main__":
    test_repository()