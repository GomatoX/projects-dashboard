#!/bin/bash
set -e

echo "🗑️  Dev Dashboard Agent Uninstaller"
echo "──────────────────────────────────"

INSTALL_DIR="$HOME/.dev-dashboard-agent"

# Detect OS and stop service
case "$(uname)" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/com.devdashboard.agent.plist"
    if [ -f "$PLIST" ]; then
      echo "Stopping launchd service..."
      launchctl unload "$PLIST" 2>/dev/null || true
      rm -f "$PLIST"
      echo "✓ launchd service removed"
    fi
    ;;
  Linux)
    if systemctl is-active --quiet dev-dashboard-agent 2>/dev/null; then
      echo "Stopping systemd service..."
      sudo systemctl stop dev-dashboard-agent
      sudo systemctl disable dev-dashboard-agent
      sudo rm -f /etc/systemd/system/dev-dashboard-agent.service
      sudo systemctl daemon-reload
      echo "✓ systemd service removed"
    fi
    ;;
esac

# Remove install directory
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo "✓ Removed $INSTALL_DIR"
fi

echo ""
echo "✅ Agent uninstalled successfully"
