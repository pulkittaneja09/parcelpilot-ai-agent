from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = BASE_DIR / "data" / "ParcelPilot_Assessment_Data.xlsx"


def inspect_workbook():
    excel_file = pd.ExcelFile(EXCEL_PATH)

    print("\nSHEETS FOUND:")
    print(excel_file.sheet_names)

    for sheet_name in excel_file.sheet_names:
        print("\n" + "=" * 60)
        print(f"SHEET: {sheet_name}")
        print("=" * 60)

        df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name)

        print(f"\nRows: {len(df)}")
        print(f"Columns: {list(df.columns)}")

        print("\nPreview:")
        print(df.head())

        print("\nData Types:")
        print(df.dtypes)


if __name__ == "__main__":
    inspect_workbook()