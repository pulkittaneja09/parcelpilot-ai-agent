from pathlib import Path

import chromadb


BASE_DIR = Path(__file__).resolve().parent.parent.parent
CHROMA_PATH = BASE_DIR / "storage" / "chroma"


def get_collection():
    client = chromadb.PersistentClient(
        path=str(CHROMA_PATH)
    )

    collection = client.get_or_create_collection(
        name="parcelpilot_documents"
    )

    return collection


def clear_collection():
    client = chromadb.PersistentClient(
        path=str(CHROMA_PATH)
    )

    try:
        client.delete_collection("parcelpilot_documents")
    except Exception:
        pass

    return client.get_or_create_collection(
        name="parcelpilot_documents"
    )