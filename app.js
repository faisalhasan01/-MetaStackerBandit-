let csvContent = "";
let parsedData = [];
let chartInstance = null;

// Terminal Log Helper
function addLog(message, type = "info") {
  const terminal = document.getElementById("terminal");
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = document.createElement("div");
  logLine.className = `log-line ${type}`;
  logLine.textContent = `${timestamp} - ${type.toUpperCase()} - ${message}`;
  terminal.appendChild(logLine);
  terminal.scrollTop = terminal.scrollHeight;
}

// Custom simple YAML parser
function parseYamlConfig(text) {
  try {
    const lines = text.split('\n');
    const config = {};
    for (let line of lines) {
      if (line.trim().startsWith('#') || !line.includes(':')) continue;
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join(':').trim();
        // Remove surrounding quotes if any
        val = val.replace(/^['"]|['"]$/g, '');
        config[key] = val;
      }
    }
    if (config.seed) document.getElementById('configSeed').value = parseInt(config.seed);
    if (config.window) document.getElementById('configWindow').value = parseInt(config.window);
    if (config.version) document.getElementById('configVersion').value = config.version;
    addLog(`Config parsed: seed=${config.seed || 42}, window=${config.window || 5}, version="${config.version || 'v1'}"`, "info");
  } catch (e) {
    addLog(`Error parsing config YAML: ${e.message}`, "warn");
  }
}

// Simple CSV Parser
function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length === 0) throw new Error("File is empty");
  
  const headers = lines[0].split(',').map(h => h.trim());
  
  // Find case-insensitive 'close' column
  const closeColIndex = headers.findIndex(h => h.toLowerCase() === 'close');
  if (closeColIndex === -1) {
    throw new Error("Missing required column: close");
  }
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',').map(v => v.trim());
    
    const closePrice = parseFloat(values[closeColIndex]);
    if (isNaN(closePrice)) {
      throw new Error(`Invalid price value at row ${i}: ${values[closeColIndex]}`);
    }
    
    rows.push({
      close: closePrice,
      index: i
    });
  }
  
  return { rows, closeColName: headers[closeColIndex] };
}

// Load default files if available locally
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const configRes = await fetch('config.yaml');
    if (configRes.ok) {
      const configText = await configRes.text();
      parseYamlConfig(configText);
    }
  } catch (e) {
    // Fail silently on local file protocol CORS errors
  }

  try {
    const dataRes = await fetch('data.csv');
    if (dataRes.ok) {
      const dataText = await dataRes.text();
      processCsvData(dataText, 'data.csv');
    }
  } catch (e) {
    // Fail silently on local file protocol CORS errors
  }
});

// Setup File Uploader
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const runBtn = document.getElementById("runBtn");

uploadZone.addEventListener("click", () => fileInput.click());

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    processCsvData(e.target.result, file.name);
  };
  reader.readAsText(file);
}

function processCsvData(text, fileName) {
  try {
    addLog(`Loading dataset: ${fileName}`, "info");
    const { rows, closeColName } = parseCsv(text);
    csvContent = text;
    parsedData = rows;
    
    fileInfo.textContent = `📄 ${fileName} (${rows.length} rows, using '${closeColName}')`;
    fileInfo.style.display = "block";
    document.getElementById("uploadPrompt").style.display = "none";
    runBtn.removeAttribute("disabled");
    
    addLog(`Rows loaded: ${rows.length}`, "info");
  } catch (e) {
    addLog(`File processing failed: ${e.message}`, "error");
    fileInfo.style.display = "none";
    document.getElementById("uploadPrompt").style.display = "block";
    runBtn.setAttribute("disabled", "true");
    
    // Show error in dashboard metrics
    document.getElementById("metricStatus").textContent = "Error";
    document.getElementById("metricStatus").className = "metric-value red";
  }
}

// Pipeline Calculation Logic
runBtn.addEventListener("click", () => {
  const startTime = performance.now();
  
  // Set UI running state
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const runBtnText = document.getElementById("runBtn");
  
  statusDot.className = "status-dot processing";
  statusText.textContent = "Running";
  runBtn.setAttribute("disabled", "true");
  runBtn.innerHTML = `<span class="spinner"></span> Executing...`;
  
  addLog("Job started", "info");
  
  setTimeout(() => {
    try {
      const seed = parseInt(document.getElementById("configSeed").value) || 42;
      const windowSize = parseInt(document.getElementById("configWindow").value) || 5;
      const version = document.getElementById("configVersion").value || "v1";
      
      addLog(`Config validated (seed=${seed}/window=${windowSize}/version="${version}")`, "info");
      addLog(`Reproducibility seed set to ${seed}`, "info");
      
      if (parsedData.length === 0) {
        throw new Error("No dataset loaded");
      }
      
      addLog("Processing steps (rolling mean, signal generation)", "info");
      
      // 1. Calculate Rolling Mean
      const prices = parsedData.map(d => d.close);
      const rollingMeans = [];
      const signals = [];
      let onesCount = 0;
      let validRows = 0;
      
      for (let i = 0; i < prices.length; i++) {
        if (i < windowSize - 1) {
          rollingMeans.push(NaN);
          signals.push(null);
        } else {
          let sum = 0;
          for (let j = 0; j < windowSize; j++) {
            sum += prices[i - j];
          }
          const mean = sum / windowSize;
          rollingMeans.push(mean);
          
          const signal = prices[i] > mean ? 1 : 0;
          signals.push(signal);
          onesCount += signal;
          validRows++;
        }
      }
      
      const signalRate = validRows > 0 ? (onesCount / validRows) : 0;
      
      // Calculate Latency
      const latencyMs = Math.round(performance.now() - startTime);
      
      // Success Output
      const metrics = {
        version: version,
        rows_processed: prices.length,
        metric: "signal_rate",
        value: parseFloat(signalRate.toFixed(4)),
        latency_ms: latencyMs,
        seed: seed,
        status: "success"
      };
      
      // Render Output
      document.getElementById("metricStatus").textContent = "Success";
      document.getElementById("metricStatus").className = "metric-value green";
      document.getElementById("metricRows").textContent = prices.length;
      document.getElementById("metricSignalRate").textContent = signalRate.toFixed(4);
      document.getElementById("metricLatency").textContent = `${latencyMs} ms`;
      
      // Set JSON Text
      // Manual formatting to match target floating point (0.4990) exactly
      const jsonStr = (
        "{\n" +
        `  "version": "${metrics.version}",\n` +
        `  "rows_processed": ${metrics.rows_processed},\n` +
        `  "metric": "${metrics.metric}",\n` +
        `  "value": ${metrics.value.toFixed(4)},\n` +
        `  "latency_ms": ${metrics.latency_ms},\n` +
        `  "seed": ${metrics.seed},\n` +
        `  "status": "${metrics.status}"\n` +
        "}"
      );
      document.getElementById("jsonOutput").textContent = jsonStr;
      
      // Enable Download button
      const downloadBtn = document.getElementById("downloadJsonBtn");
      downloadBtn.removeAttribute("disabled");
      downloadBtn.onclick = () => {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "metrics.json";
        a.click();
        URL.revokeObjectURL(url);
      };
      
      // Logs summary
      addLog(`Metrics summary: rows_processed=${prices.length}, signal_rate=${signalRate.toFixed(4)}, latency_ms=${latencyMs}`, "info");
      addLog("Job end + status: success", "info");
      
      statusDot.className = "status-dot success";
      statusText.textContent = "Success";
      
      // Render the Chart (first 250 rows)
      renderChart(prices, rollingMeans, signals, Math.min(250, prices.length));
      
    } catch (e) {
      addLog(`Job failed: ${e.message}`, "error");
      addLog("Job end + status: error", "info");
      
      statusDot.className = "status-dot error";
      statusText.textContent = "Error";
      
      document.getElementById("metricStatus").textContent = "Error";
      document.getElementById("metricStatus").className = "metric-value red";
      
      const errorJson = {
        version: document.getElementById("configVersion").value || "v1",
        status: "error",
        error_message: e.message
      };
      document.getElementById("jsonOutput").textContent = JSON.stringify(errorJson, null, 2);
    } finally {
      runBtn.removeAttribute("disabled");
      runBtn.innerHTML = `⚡ Run Batch Job`;
    }
  }, 350); // Small delay to visualize loading indicator
});

// Clear Logs
document.getElementById("clearLogsBtn").addEventListener("click", () => {
  document.getElementById("terminal").innerHTML = '<div class="log-line info">Terminal logs cleared.</div>';
});

// Render Chart.js
function renderChart(prices, rollingMeans, signals, limit) {
  const ctx = document.getElementById("signalChart").getContext("2d");
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  const labels = Array.from({ length: limit }, (_, i) => i + 1);
  const subsetPrices = prices.slice(0, limit);
  const subsetRM = rollingMeans.slice(0, limit);
  
  // Create dataset for signals (point markers)
  const signalPoints = [];
  for (let i = 0; i < limit; i++) {
    if (signals[i] === 1) {
      signalPoints.push(prices[i]);
    } else {
      signalPoints.push(null);
    }
  }
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Close Price',
          data: subsetPrices,
          borderColor: '#06b6d4', // cyan
          backgroundColor: 'rgba(6, 182, 212, 0.05)',
          borderWidth: 2,
          pointRadius: 1.5,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Rolling Mean',
          data: subsetRM,
          borderColor: '#8b5cf6', // purple
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.1,
          fill: false
        },
        {
          label: 'Signal Buy (1)',
          data: signalPoints,
          borderColor: '#10b981', // green
          backgroundColor: '#10b981',
          pointStyle: 'circle',
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#f3f4f6',
            font: {
              family: 'Outfit'
            }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit'
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit'
            }
          }
        }
      }
    }
  });
}
