from app.config.document_metadata import DOCUMENT_METADATA


def test_document_metadata():
    for filename, metadata in DOCUMENT_METADATA.items():
        print(f"\n{filename}")
        print("-" * 60)

        for key, value in metadata.items():
            print(f"{key}: {value}")


if __name__ == "__main__":
    test_document_metadata()