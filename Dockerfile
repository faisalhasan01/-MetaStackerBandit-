FROM python:3.9-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the dataset, config, and processing script
COPY data.csv .
COPY config.yaml .
COPY run.py .

# Set the default command to run the pipeline
ENTRYPOINT ["python", "run.py", "--input", "data.csv", "--config", "config.yaml", "--output", "metrics.json", "--log-file", "run.log"]
