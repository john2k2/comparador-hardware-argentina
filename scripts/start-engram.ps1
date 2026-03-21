#!/bin/bash
# Start Engram server in background for OpenCode memory persistence

# Check if already running
if curl -s http://127.0.0.1:7437/health > /dev/null 2>&1; then
    echo "Engram server already running on port 7437"
else
    echo "Starting Engram server..."
    # Start in background (for Windows we need to handle this differently)
    start /b engram serve 2>/dev/null || engram serve &
    sleep 2
    
    if curl -s http://127.0.0.1:7437/health > /dev/null 2>&1; then
        echo "Engram server started successfully on port 7437"
    else
        echo "Failed to start Engram server"
    fi
fi
