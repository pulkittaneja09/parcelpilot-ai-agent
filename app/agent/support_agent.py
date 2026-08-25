from google import genai
from dotenv import load_dotenv
from app.services.context_service import get_ticket_context, get_order_context
from app.services.retriever import retrieve_documents
import os

load_dotenv()
def format_documents(documents):
    formatted = []

    for index, item in enumerate(documents, start=1):
        formatted.append(
            f"""
DOCUMENT {index}
Filename: {item["metadata"]["filename"]}
Document Type: {item["metadata"]["document_type"]}
Precedence: {item["metadata"]["precedence"]}

Content:
{item["document"]}
"""
        )

    return "\n".join(formatted)


def answer_ticket(ticket_id: str, query: str):
    context = get_ticket_context(ticket_id)

    account_id = context["account"]["account_id"]

    documents = retrieve_documents(
        query=query,
        account_id=account_id,
        n_results=10,
    )

    document_context = format_documents(documents)

    prompt = f"""
You are ParcelPilot's AI support operations agent.

Answer the user's question using the provided ticket data,
account data, and retrieved company documents.

SOURCE PRECEDENCE:
1. Customer-specific signed agreement
2. Current company policy or SOP
3. Current product documentation
4. Historical information or notes

Never use deprecated documents.

If sources conflict, follow the higher-precedence source.

TICKET:
{context["ticket"]}

ACCOUNT:
{context["account"]}

RETRIEVED DOCUMENTS:
{document_context}

USER QUESTION:
{query}

Give a clear and concise operational answer.
Explain which policy or agreement supports the answer.
"""

    client = genai.Client(
        api_key=os.getenv("GOOGLE_API_KEY")
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return response.text


def answer_order(order_id: str, query: str):
    context = get_order_context(order_id)

    account_id = context["account"]["account_id"]

    documents = retrieve_documents(
        query=query,
        account_id=account_id,
        n_results=10,
    )

    document_context = format_documents(documents)

    prompt = f"""
You are ParcelPilot's AI support operations agent.

Answer the user's question using the provided order data,
account data, and retrieved company documents.

SOURCE PRECEDENCE:
1. Customer-specific signed agreement
2. Current company policy or SOP
3. Current product documentation
4. Historical information or notes

Never use deprecated documents.

If sources conflict, follow the higher-precedence source.

ORDER:
{context["order"]}

ACCOUNT:
{context["account"]}

RETRIEVED DOCUMENTS:
{document_context}

USER QUESTION:
{query}

Give a clear and concise operational answer.
Explain which policy or agreement supports the answer.
"""

    client = genai.Client(
        api_key=os.getenv("GOOGLE_API_KEY")
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return response.text