import argparse
import json
import logging
import os
import sys
import time
import yaml
import numpy as np
import pandas as pd

def write_metrics(output_path, metrics_data):
    """Writes the metrics dict to the specified JSON file and prints to stdout."""
    try:
        if metrics_data.get("status") == "success":
            # Format value float to exactly 4 decimal places without quotes
            json_str = (
                "{\n"
                f'  "version": "{metrics_data["version"]}",\n'
                f'  "rows_processed": {metrics_data["rows_processed"]},\n'
                f'  "metric": "{metrics_data["metric"]}",\n'
                f'  "value": {metrics_data["value"]:.4f},\n'
                f'  "latency_ms": {metrics_data["latency_ms"]},\n'
                f'  "seed": {metrics_data["seed"]},\n'
                f'  "status": "{metrics_data["status"]}"\n'
                "}"
            )
        else:
            json_str = json.dumps(metrics_data, indent=2)
            
        with open(output_path, 'w') as f:
            f.write(json_str)
            f.write('\n')
            
        # Print the JSON to stdout
        print(json_str)
    except Exception as e:
        print(f"Error writing metrics JSON: {e}", file=sys.stderr)

def main():
    start_time = time.time()
    
    # 1. Parse CLI arguments
    parser = argparse.ArgumentParser(description="MLOps Batch Job Assessment Pipeline")
    parser.add_argument("--input", required=True, help="Path to input CSV file")
    parser.add_argument("--config", required=True, help="Path to configuration YAML file")
    parser.add_argument("--output", required=True, help="Path to output metrics JSON file")
    parser.add_argument("--log-file", required=True, help="Path to run log file")
    
    # We parse args manually or using argparse.
    # If args are malformed, argparse will exit. We can catch this if needed, 
    # but standard execution will supply correct flags.
    args = parser.parse_args()
    
    # Initialize logging configuration to write to log-file
    try:
        logging.basicConfig(
            filename=args.log_file,
            filemode='w',
            format='%(asctime)s - %(levelname)s - %(message)s',
            level=logging.INFO
        )
    except Exception as e:
        print(f"Failed to initialize logging: {e}", file=sys.stderr)
        sys.exit(1)
        
    logging.info("Job started")
    
    # Placeholders for metrics version and seed (used in error output if config fails)
    config_version = "v1"
    config_seed = 42
    
    try:
        # 2. Load and validate config file
        if not os.path.exists(args.config):
            raise FileNotFoundError(f"Config file not found: {args.config}")
        
        logging.info(f"Loading config from {args.config}")
        with open(args.config, 'r') as f:
            try:
                config = yaml.safe_load(f)
            except yaml.YAMLError as e:
                raise ValueError(f"Invalid YAML format in config file: {e}")
                
        if not isinstance(config, dict):
            raise ValueError("Config structure is invalid (must be a dictionary)")
            
        # Validate required config fields
        for field in ['seed', 'window', 'version']:
            if field not in config:
                raise ValueError(f"Config is missing required field: {field}")
                
        config_version = config['version']
        config_seed = config['seed']
        window = config['window']
        
        if not isinstance(window, int) or window <= 0:
            raise ValueError(f"Config field 'window' must be a positive integer, got: {window}")
            
        logging.info(f"Config loaded + validated (seed={config_seed}/window={window}/version={config_version})")
        
        # Set random seeds for reproducibility
        np.random.seed(config_seed)
        logging.info(f"Random seed set to {config_seed}")
        
        # 3. Load and validate dataset
        if not os.path.exists(args.input):
            raise FileNotFoundError(f"Input file not found: {args.input}")
            
        if os.path.getsize(args.input) == 0:
            raise ValueError(f"Input file is empty: {args.input}")
            
        logging.info(f"Loading dataset from {args.input}")
        try:
            df = pd.read_csv(args.input)
        except Exception as e:
            raise ValueError(f"Invalid CSV format: {e}")
            
        rows_processed = len(df)
        logging.info(f"Rows loaded: {rows_processed}")
        
        if rows_processed == 0:
            raise ValueError("Dataset contains no rows")
            
        # Find case-insensitive 'close' column
        close_col = None
        for col in df.columns:
            if col.lower() == 'close':
                close_col = col
                break
                
        if close_col is None:
            raise ValueError("Missing required column: close")
            
        logging.info(f"Using column '{close_col}' for Close price calculations")
        
        # 4. Processing: Rolling mean and signal generation
        logging.info("Processing steps (rolling mean, signal generation)")
        
        # Compute rolling mean
        rolling_mean = df[close_col].rolling(window=window).mean()
        
        # Determine how to handle first window-1 rows: 
        # We allow NaNs and exclude them from signal rate computation.
        # Compute signal: 1 if close > rolling_mean else 0
        signals = (df[close_col] > rolling_mean).astype(int)
        
        # Filter out the first window-1 rows (where rolling mean is NaN)
        # to exclude them from signal rate calculation.
        valid_signals = signals.iloc[window-1:]
        
        if len(valid_signals) == 0:
            raise ValueError("Dataset is smaller than the window size; cannot compute metrics")
            
        signal_rate = float(valid_signals.mean())
        
        # 5. Metrics + timing
        latency_ms = int((time.time() - start_time) * 1000)
        
        success_metrics = {
            "version": config_version,
            "rows_processed": rows_processed,
            "metric": "signal_rate",
            "value": round(signal_rate, 4),
            "latency_ms": latency_ms,
            "seed": config_seed,
            "status": "success"
        }
        
        logging.info(f"Metrics summary: rows_processed={rows_processed}, signal_rate={signal_rate:.4f}, latency_ms={latency_ms}")
        logging.info("Job end + status: success")
        
        write_metrics(args.output, success_metrics)
        sys.exit(0)
        
    except Exception as e:
        error_message = str(e)
        logging.error(f"Job failed: {error_message}", exc_info=True)
        logging.info("Job end + status: error")
        
        error_metrics = {
            "version": config_version,
            "status": "error",
            "error_message": error_message
        }
        
        write_metrics(args.output, error_metrics)
        sys.exit(1)

if __name__ == "__main__":
    main()
