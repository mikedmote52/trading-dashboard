#!/bin/bash
# Start Monitoring Stack - Feature 3: Prometheus + Grafana
set -e

echo "🚀 Starting Trading Intelligence Monitoring Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Navigate to monitoring directory
cd "$(dirname "$0")"

echo "📊 Starting Prometheus + Grafana stack..."

# Start the monitoring stack
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Monitoring stack started successfully!"
    echo ""
    echo "🔗 Access URLs:"
    echo "   Prometheus: http://localhost:9090"
    echo "   Grafana:    http://localhost:3000 (admin/admin123)"
    echo "   Node Exporter: http://localhost:9100"
    echo ""
    echo "📊 Your trading dashboard metrics are being collected!"
    echo "   Dashboard metrics: http://localhost:3003/metrics"
    echo "   Health endpoint: http://localhost:3003/metrics/health"
    echo ""
    echo "🎯 To view trading intelligence dashboard in Grafana:"
    echo "   1. Open http://localhost:3000"
    echo "   2. Login with admin/admin123"
    echo "   3. Navigate to 'Trading Intelligence' folder"
    echo "   4. Open 'Trading Intelligence Dashboard'"
else
    echo "❌ Failed to start monitoring stack. Check Docker logs:"
    docker-compose logs
    exit 1
fi