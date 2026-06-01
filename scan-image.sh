#!/bin/bash
# Local Trivy vulnerability scan for the BunTrade Docker image.
# Requires: Docker and Trivy installed locally
#
# Install Trivy: https://github.com/aquasecurity/trivy?tab=readme-ov-file#installation
# Or: brew install trivy  (macOS)
#     apt-get install trivy  (Linux, if available)
#     or use the official GitHub releases
#
# Usage:
#   ./scan-image.sh              # Scan and show summary
#   ./scan-image.sh --strict     # Fail on HIGH/CRITICAL
#   ./scan-image.sh --json       # Output JSON

set -e

# Check if Trivy is installed
if ! command -v trivy &>/dev/null; then
  echo "❌ Trivy is not installed."
  echo ""
  echo "Install it from: https://github.com/aquasecurity/trivy/releases"
  echo "Or use: brew install trivy (macOS) / apt-get install trivy (some Linux distros)"
  echo ""
  echo "GitHub Actions will run Trivy automatically on push/PR."
  exit 1
fi

IMAGE="buntrade:latest"
STRICT="${1:-}"
FORMAT="table"

if [ "$STRICT" = "--json" ]; then
  FORMAT="json"
fi

echo "📦 Building Docker image: $IMAGE"
docker build -t "$IMAGE" . --quiet

echo ""
echo "🔍 Running Trivy vulnerability scan..."
echo ""

if [ "$FORMAT" = "json" ]; then
  echo "Outputting JSON format to trivy-results.json"
  trivy image "$IMAGE" --format json --output trivy-results.json
  echo "✅ Scan complete. Results saved to trivy-results.json"
elif [ "$STRICT" = "--strict" ]; then
  echo "Strict mode: failing on CRITICAL vulnerabilities..."
  trivy image "$IMAGE" --format table --severity CRITICAL --exit-code 1 || {
    echo ""
    echo "⚠️  CRITICAL vulnerabilities detected. Fix them before pushing."
    exit 1
  }
else
  trivy image "$IMAGE" --format table --severity CRITICAL,HIGH,MEDIUM,LOW
  echo ""
  echo "✅ Scan complete. Use --strict to fail on CRITICAL vulnerabilities."
fi
