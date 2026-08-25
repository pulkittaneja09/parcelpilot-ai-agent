from app.services.vector_store import get_collection


def test_vector_store():
    collection = get_collection()

    print("ChromaDB collection ready!")
    print(f"Collection name: {collection.name}")
    print(f"Documents stored: {collection.count()}")


if __name__ == "__main__":
    test_vector_store()