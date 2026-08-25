from app.database.connection import get_connection


def test_connection():
    connection = get_connection()

    print("Database connected successfully!")

    connection.close()


if __name__ == "__main__":
    test_connection()