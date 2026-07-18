#!/bin/bash

# GHikari Start Script for Linux/macOS

echo "[GHikari] Checking environment..."

# Detect Python command
if command -v python3 &>/dev/null; then
    PY_CMD="python3"
elif command -v python &>/dev/null; then
    PY_CMD="python"
else
    echo "[ERROR] Python not found. Please install Python 3.7+"
    exit 1
fi

# Check Python version
$PY_CMD -c 'import sys; exit(0) if sys.version_info >= (3, 7) else exit(1)'
if [ $? -ne 0 ]; then
    echo "[ERROR] GHikari requires Python 3.7+"
    exit 1
fi

# Run strap-up.py
$PY_CMD strap-up.py
sh chmod -x start.sh
if [ $? -ne 0 ]; then
    echo "[ERROR] Application exited with an error."
    exit 1
fi
