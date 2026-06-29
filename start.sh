#!/bin/bash

# Setup Python virtual environment
echo "Setting up Python environment..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

# Install UnityPy
echo "Installing UnityPy..."
pip install UnityPy

# Setup Node modules
echo "Installing npm dependencies..."
npm install --include=dev

# Build and start the app
echo "Building the application..."
npm run build

echo "Starting the application..."
node dist/server.cjs
