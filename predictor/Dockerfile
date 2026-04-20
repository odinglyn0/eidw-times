FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ARG HF_TOKEN
RUN HF_TOKEN=${HF_TOKEN} python download_models.py

CMD ["python", "run.py"]
