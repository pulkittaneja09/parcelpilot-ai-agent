from app.services.vector_store import get_collection


def search_documents(query: str):
    collection = get_collection()

    results = collection.query(
        query_texts=[query],
        n_results=3,
        include=["documents", "metadatas", "distances"],
    )

    for index in range(len(results["documents"][0])):
        print("\n" + "=" * 70)
        print(f"RESULT {index + 1}")

        print("\nDOCUMENT:")
        print(results["documents"][0][index])

        print("\nMETADATA:")
        print(results["metadatas"][0][index])

        print("\nDISTANCE:")
        print(results["distances"][0][index])


if __name__ == "__main__":
    search_documents(
        "Can Northstar cancel a booked shipment without paying a fee?"
    )