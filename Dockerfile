# ==========================================
# Dockerfile for Vault Distributed Object Storage
# ==========================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VAULT_BASE_STORAGE_PATH=/app/storage \
    VAULT_HOST=0.0.0.0 \
    VAULT_PORT=8000

# Install curl for health check probing
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency definition and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY app/ /app/app/

# Create persistent storage directory
RUN mkdir -p /app/storage

# Expose server port
EXPOSE 8000

# Health check configuration
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/admin/nodes || exit 1

# Launch Uvicorn ASGI server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
