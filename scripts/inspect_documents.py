from pathlib import Path

from pypdf import PdfReader


BASE_DIR = Path(__file__).resolve().parent.parent
DOCUMENTS_DIR = BASE_DIR / "data" / "documents"


def inspect_documents():
    pdf_files = sorted(DOCUMENTS_DIR.glob("*.pdf"))

    print(f"\nFound {len(pdf_files)} PDF documents\n")

    for pdf_path in pdf_files:
        print("=" * 70)
        print(f"DOCUMENT: {pdf_path.name}")
        print("=" * 70)

        reader = PdfReader(pdf_path)

        full_text = ""

        for page in reader.pages:
            text = page.extract_text() or ""
            full_text += text

        print(f"Pages: {len(reader.pages)}")
        print(f"Characters extracted: {len(full_text)}")

        preview = " ".join(full_text.split())

        print("\nTEXT PREVIEW:")
        print(preview[:500])
        print("\n")


if __name__ == "__main__":
    inspect_documents()