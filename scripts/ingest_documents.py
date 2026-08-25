from pathlib import Path

from pypdf import PdfReader

from app.config.document_metadata import DOCUMENT_METADATA
from app.services.vector_store import clear_collection


BASE_DIR = Path(__file__).resolve().parent.parent
DOCUMENTS_DIR = BASE_DIR / "data" / "documents"


def extract_text(pdf_path: Path) -> str:
    reader = PdfReader(pdf_path)

    pages = []

    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)

    return "\n".join(pages)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100):
    chunks = []

    start = 0

    while start < len(text):
        end = start + chunk_size

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


def ingest_documents():
    collection = clear_collection()

    documents = []
    metadatas = []
    ids = []

    for filename, metadata in DOCUMENT_METADATA.items():
        pdf_path = DOCUMENTS_DIR / filename

        if not pdf_path.exists():
            print(f"Document not found: {filename}")
            continue

        text = extract_text(pdf_path)
        chunks = chunk_text(text)

        print(f"\nProcessing: {filename}")
        print(f"Chunks: {len(chunks)}")

        for index, chunk in enumerate(chunks):
            chunk_id = f"{filename}_chunk_{index}"

            chunk_metadata = {
                "filename": filename,
                "chunk_index": index,
                "status": metadata["status"],
                "document_type": metadata["document_type"],
                "precedence": metadata["precedence"],
                "account_id": metadata["account_id"] or "GLOBAL",
            }

            documents.append(chunk)
            metadatas.append(chunk_metadata)
            ids.append(chunk_id)

    collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids,
    )

    print("\n" + "=" * 60)
    print("Document ingestion completed!")
    print(f"Total chunks stored: {collection.count()}")


if __name__ == "__main__":
    ingest_documents()