from app.services.context_service import build_agent_context


def test_ticket_context():
    context = build_agent_context(
        query="All shipment creation is failing with HTTP 500. What is the severity and response time?",
        ticket_id="TKT-501",
    )

    print("\nTICKET AGENT CONTEXT")
    print("=" * 60)

    print("\nQUERY:")
    print(context["query"])

    print("\nTICKET:")
    print(context["ticket"])

    print("\nACCOUNT:")
    print(context["account"])

    print("\nRETRIEVED DOCUMENTS:")

    for index, document in enumerate(context["documents"], start=1):
        print(f"\nDOCUMENT {index}")
        print("-" * 40)
        print(document["metadata"])
        print(document["document"][:300])


def test_order_context():
    context = build_agent_context(
        query="Can this booked shipment be cancelled without a fee?",
        order_id="ORD-1001",
    )

    print("\n\nORDER AGENT CONTEXT")
    print("=" * 60)

    print("\nQUERY:")
    print(context["query"])

    print("\nORDER:")
    print(context["order"])

    print("\nACCOUNT:")
    print(context["account"])

    print("\nRETRIEVED DOCUMENTS:")

    for index, document in enumerate(context["documents"], start=1):
        print(f"\nDOCUMENT {index}")
        print("-" * 40)
        print(document["metadata"])
        print(document["document"][:300])


if __name__ == "__main__":
    test_ticket_context()
    test_order_context()