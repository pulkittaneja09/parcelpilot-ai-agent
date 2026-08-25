from app.database.repository import (
    get_account_by_id,
    get_order_by_id,
    get_ticket_by_id,
)
from app.services.retriever import retrieve_documents


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


def build_agent_context(
    query: str,
    ticket_id: str = None,
    order_id: str = None,
):
    context = {
        "query": query,
        "ticket": None,
        "order": None,
        "account": None,
        "documents": [],
    }

    account_id = None

    if ticket_id:
        ticket_context = get_ticket_context(ticket_id)

        if ticket_context:
            context["ticket"] = ticket_context["ticket"]
            context["account"] = ticket_context["account"]

            account_id = ticket_context["account"]["account_id"]

    if order_id:
        order_context = get_order_context(order_id)

        if order_context:
            context["order"] = order_context["order"]

            if not context["account"]:
                context["account"] = order_context["account"]

            account_id = order_context["account"]["account_id"]

    documents = retrieve_documents(
        query=query,
        account_id=account_id,
        n_results=5,
    )

    context["documents"] = documents

    return context