from app.agent.support_agent import answer_ticket, answer_order


print("=" * 60)
print("TICKET TEST")
print("=" * 60)

ticket_answer = answer_ticket(
    ticket_id="TKT-501",
    query="All shipment creation is failing with HTTP 500. What is the severity and response time?"
)

print(ticket_answer)


print("\n" + "=" * 60)
print("ORDER TEST")
print("=" * 60)

order_answer = answer_order(
    order_id="ORD-1001",
    query="Can this booked shipment be cancelled without a fee?"
)

print(order_answer)