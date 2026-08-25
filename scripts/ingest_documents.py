from pathlib import Path

from pypdf import PdfReader

from app.config.document_metadata import DOCUMENT_METADATA


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

        chunk = text[start:end]
        chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


def ingest_documents():
    for filename, metadata in DOCUMENT_METADATA.items():
        pdf_path = DOCUMENTS_DIR / filename

        if not pdf_path.exists():
            print(f"Document not found: {filename}")
            continue

        text = extract_text(pdf_path)

        chunks = chunk_text(text)

        print("\n" + "=" * 60)
        print(f"DOCUMENT: {filename}")
        print(f"Characters: {len(text)}")
        print(f"Chunks created: {len(chunks)}")
        print(f"Metadata: {metadata}")
if __name__ == "__main__":
    ingest_documents()