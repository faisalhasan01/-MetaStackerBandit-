# MLOps Batch Job Assessment (Task 0)

This repository implements a minimal, reproducible, and observable MLOps-style batch job in Python. It loads data, runs a simple rolling-average signal indicator, logs its steps, and outputs machine-readable JSON metrics.

## Project Structure

- `run.py`: Main processing script that contains configuration parsing, validation, computation, and output logging.
- `config.yaml`: Configuration parameters (`seed`, `window`, and `version`).
- `data.csv`: Provided 10,000-row OHLCV dataset.
- `requirements.txt`: Python package dependencies.
- `Dockerfile`: Configuration for building the Docker image.
- `README.md`: This document.
- `metrics.json`: Output metrics from a successful execution.
- `run.log`: Application log file containing execution details.

---

## Prerequisites & Setup (For Another Laptop)

To run this project on any other laptop, make sure the system has **Python 3.9+** and/or **Docker** installed.

### 1. Clone the Repository
Open a terminal (Command Prompt, PowerShell, or Git Bash) and run:
```bash
git clone https://github.com/faisalhasan01/-MetaStackerBandit-.git
cd -MetaStackerBandit-
```

## Local Run Instructions

### 1. Set Up Environment
It is recommended to use a virtual environment:
```bash
python -m venv venv
# On Windows (cmd/PowerShell):
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Execute the Pipeline
Run the script using the specified command format:
```bash
python run.py --input data.csv --config config.yaml --output metrics.json --log-file run.log
```

---

## Interactive Dashboard UI

This project includes a premium, dark-mode visual web dashboard that lets you configure parameters, load datasets (supporting drag-and-drop), visualize prices and buy signals, and view execution logs in real-time.

### How to Run the Dashboard:
1. In your terminal, make sure you are in the project folder and run:
   ```bash
   python -m http.server 8000
   ```
2. Open your web browser and go to:
   **[http://localhost:8000/index.html](http://localhost:8000/index.html)**
3. Adjust the window/seed config values, click **⚡ Run Batch Job**, and explore the interactive Chart.js price trend visualization.

---

## Docker Build & Run Commands

You can build and run the application inside a container.

### 1. Build the Docker Image
```bash
docker build -t mlops-task .
```

### 2. Run the Container
```bash
docker run --rm mlops-task
```

Running this command executes the batch job, generates the `metrics.json` and `run.log` inside the container, prints the final JSON output to standard output (`stdout`), and exits.

---

## Example `metrics.json`

### Success Case Output
```json
{
  "version": "v1",
  "rows_processed": 10000,
  "metric": "signal_rate",
  "value": 0.4990,
  "latency_ms": 127,
  "seed": 42,
  "status": "success"
}
```

### Error Case Output
```json
{
  "version": "v1",
  "status": "error",
  "error_message": "Missing required column: close"
}
```
