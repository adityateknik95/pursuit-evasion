FROM python:3.12-slim

WORKDIR /app

# CPU-only torch keeps the image several GB smaller than the default CUDA build
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pursuit_evasion ./pursuit_evasion
COPY server.py .
COPY checkpoints/*.zip ./checkpoints/

# Hugging Face Spaces expects 7860; other hosts can override PORT
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
