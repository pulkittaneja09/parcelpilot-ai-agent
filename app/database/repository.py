from app.database.connection import get_connection


def get_account_by_id(account_id: str):
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT *
            FROM accounts
            WHERE account_id = ?
            """,
            (account_id,)
        )

        account = cursor.fetchone()

        return dict(account) if account else None

    finally:
        connection.close()


def get_order_by_id(order_id: str):
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT *
            FROM orders
            WHERE order_id = ?
            """,
            (order_id,)
        )

        order = cursor.fetchone()

        return dict(order) if order else None

    finally:
        connection.close()


def get_ticket_by_id(ticket_id: str):
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT *
            FROM tickets
            WHERE ticket_id = ?
            """,
            (ticket_id,)
        )

        ticket = cursor.fetchone()

        return dict(ticket) if ticket else None

    finally:
        connection.close()
def get_orders_by_account(account_id: str):
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT *
            FROM orders
            WHERE account_id = ?
            ORDER BY booked_at DESC
            """,
            (account_id,)
        )

        orders = cursor.fetchall()

        return [dict(order) for order in orders]

    finally:
        connection.close()


def get_tickets_by_account(account_id: str):
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT *
            FROM tickets
            WHERE account_id = ?
            ORDER BY created_at DESC
            """,
            (account_id,)
        )

        tickets = cursor.fetchall()

        return [dict(ticket) for ticket in tickets]

    finally:
        connection.close()