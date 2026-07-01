FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

RUN DJANGO_SECRET_KEY=dummy python manage.py collectstatic --noinput || true

EXPOSE 8000

# Run migrations and start the server
CMD python manage.py migrate && uvicorn config.asgi:application --host 0.0.0.0 --port ${PORT:-8000}
