from app.services.retriever import retrieve_documents


def test_retriever():
    results = retrieve_documents(
        query="Can Northstar cancel a booked shipment without paying a fee?",
        account_id="ACCT-001",
    )

    for index, result in enumerate(results, start=1):
        print("\n" + "=" * 70)
        print(f"RESULT {index}")

        print("\nDOCUMENT:")
        print(result["document"])

        print("\nMETADATA:")
        print(result["metadata"])

        print("\nDISTANCE:")
        print(result["distance"])


if __name__ == "__main__":
    test_retriever()