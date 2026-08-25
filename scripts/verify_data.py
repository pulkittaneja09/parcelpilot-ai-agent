from app.database.connection import get_connection


def verify_data():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT name
            FROM sqlite_master
            WHERE type='table'
            ORDER BY name
        """)

        tables = cursor.fetchall()

        print("\nDATABASE TABLES:")
        print("-" * 40)

        for table in tables:
            table_name = table["name"]

            cursor.execute(f"SELECT COUNT(*) AS count FROM {table_name}")
            row_count = cursor.fetchone()["count"]

            print(f"{table_name}: {row_count} rows")

        print("\nSAMPLE ORDER:")
        print("-" * 40)

        cursor.execute("""
            SELECT *
            FROM orders
            WHERE order_id = ?
        """, ("ORD-1001",))

        order = cursor.fetchone()

        if order:
            for key in order.keys():
                print(f"{key}: {order[key]}")
        else:
            print("Order not found")

    finally:
        connection.close()


if __name__ == "__main__":
    verify_data()