#!/bin/bash

# Make sure the script is executable
chmod +x "$0"

# Safe Context Intelligence Test Script
# Tests enhancements without affecting the live system

echo "🧪 Testing Context Intelligence Enhancement..."
echo "📍 Current directory: $(pwd)"
echo "🗓️  Test time: $(date)"

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: Not in trading-dashboard directory"
    echo "   Please run from /Users/michaelmote/Desktop/trading-dashboard"
    exit 1
fi

echo ""
echo "✅ In correct directory"

# Check if enhancement files exist
echo ""
echo "📁 Checking enhancement files..."
if [ -f "enhancements/context-intelligence.js" ]; then
    echo "✅ context-intelligence.js found"
else
    echo "❌ context-intelligence.js missing"
    exit 1
fi

if [ -f "enhancements/context-tester.js" ]; then
    echo "✅ context-tester.js found"
else
    echo "❌ context-tester.js missing"
    exit 1
fi

# Check Node.js availability
echo ""
echo "🔍 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js found: $NODE_VERSION"
else
    echo "❌ Node.js not found"
    exit 1
fi

# Run the context intelligence tests
echo ""
echo "🚀 Running Context Intelligence Tests..."
echo "----------------------------------------"

cd enhancements
node context-tester.js

TEST_RESULT=$?

echo ""
echo "----------------------------------------"

if [ $TEST_RESULT -eq 0 ]; then
    echo "🎉 All tests passed!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Tests verify the enhancement works correctly"
    echo "   2. Integration is completely optional and safe"
    echo "   3. To enable: add ENABLE_CONTEXT_INTELLIGENCE=true to .env"
    echo "   4. Test locally first, then deploy when ready"
    echo ""
    echo "⚠️  IMPORTANT: This is an additive enhancement only"
    echo "   Your existing system remains completely unchanged"
else
    echo "❌ Tests failed - do not integrate until issues are resolved"
fi

echo ""
echo "🏁 Test script complete"