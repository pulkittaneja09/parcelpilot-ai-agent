"""Agent tools.

Three distinct tools back the copilot:

1. document search — :func:`app.services.retriever.retrieve_documents`
2. structured-data lookup — :mod:`app.database.repository` via
   :mod:`app.services.context_service`
3. state-changing action — :mod:`app.tools.escalation`

Only the third mutates anything, and it is gated behind explicit confirmation.
"""
