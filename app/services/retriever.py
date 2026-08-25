from app.services.vector_store import get_collection


def retrieve_documents(
    query: str,
    account_id: str | None = None,
    n_results: int = 5,
):
    collection = get_collection()

    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        include=["documents", "metadatas", "distances"],
    )

    retrieved_documents = []

    for index in range(len(results["documents"][0])):
        document = results["documents"][0][index]
        metadata = results["metadatas"][0][index]
        distance = results["distances"][0][index]

        if metadata["status"] != "current":
            continue

        document_account_id = metadata["account_id"]

        if account_id:
            if document_account_id not in [account_id, "GLOBAL"]:
                continue

        retrieved_documents.append(
            {
                "document": document,
                "metadata": metadata,
                "distance": distance,
            }
        )

    retrieved_documents.sort(
        key=lambda item: (
            item["metadata"]["precedence"],
            item["distance"],
        )
    )

    return retrieved_documents