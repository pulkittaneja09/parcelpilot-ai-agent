from pathlib import Path

import pandas as pd

from app.database.connection import get_connection


BASE_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = BASE_DIR / "data" / "ParcelPilot_Assessment_Data.xlsx"


def ingest_data():
    connection = get_connection()

    try:
        excel_file = pd.ExcelFile(EXCEL_PATH)

        for sheet_name in ["accounts", "orders", "tickets"]:
            dataframe = pd.read_excel(
                excel_file,
                sheet_name=sheet_name
            )

            dataframe.to_sql(
                name=sheet_name,
                con=connection,
                if_exists="replace",
                index=False
            )

            print(f"Imported {sheet_name}: {len(dataframe)} rows")

        print("\nData ingestion completed successfully!")

    finally:
        connection.close()


if __name__ == "__main__":
    ingest_data()