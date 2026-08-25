from app.services.context_service import (
    get_order_context,
    get_ticket_context,
)


def test_context_service():
    print("\nTICKET CONTEXT")
    print("=" * 60)

    ticket_context = get_ticket_context("TKT-501")

    print(ticket_context)

    print("\nORDER CONTEXT")
    print("=" * 60)

    order_context = get_order_context("ORD-1001")

    print(order_context)


if __name__ == "__main__":
    test_context_service()