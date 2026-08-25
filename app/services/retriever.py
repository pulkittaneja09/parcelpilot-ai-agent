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

    seen_ids = set()

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

        key = (
            metadata["filename"],
            metadata["chunk_index"],
        )

        seen_ids.add(key)

        retrieved_documents.append(
            {
                "document": document,
                "metadata": metadata,
                "distance": distance,
            }
        )

    if account_id:
        agreement_results = collection.get(
            where={
                "$and": [
                    {"account_id": {"$eq": account_id}},
                    {"document_type": {"$eq": "customer_agreement"}},
                    {"status": {"$eq": "current"}},
                ]
            },
            include=["documents", "metadatas"],
        )

        for index in range(len(agreement_results["documents"])):
            document = agreement_results["documents"][index]
            metadata = agreement_results["metadatas"][index]

            key = (
                metadata["filename"],
                metadata["chunk_index"],
            )

            if key in seen_ids:
                continue

            retrieved_documents.append(
                {
                    "document": document,
                    "metadata": metadata,
                    "distance": 0,
                }
            )

    retrieved_documents.sort(
        key=lambda item: (
            item["metadata"]["precedence"],
            item["distance"],
        )
    )

    return retrieved_documents