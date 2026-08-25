"""FastAPI application entrypoint for the ParcelPilot AI Support Copilot backend."""

from fastapi import FastAPI

app = FastAPI(title="ParcelPilot AI Support Copilot")


@app.get("/health")
def health() -> dict[str, str]:
    """Report that the backend service is running."""
    return {"status": "ok", "service": "ParcelPilot AI Support Copilot"}
