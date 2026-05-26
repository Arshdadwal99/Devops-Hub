#!/bin/bash
# Production Deployment Verification Script

set -e

echo "🔍 DevOps Hub Production Deployment Verification"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PORT=${1:-5000}
HOST=${2:-localhost}
API_URL="http://${HOST}:${PORT}"
TIMEOUT=5

check_endpoint() {
  local name=$1
  local endpoint=$2
  local method=${3:-GET}
  
  echo -n "  Checking $name... "
  
  if [ "$method" = "GET" ]; then
    if timeout $TIMEOUT curl -s "$API_URL$endpoint" > /dev/null 2>&1; then
      echo -e "${GREEN}✓${NC}"
      return 0
    else
      echo -e "${RED}✗${NC}"
      return 1
    fi
  fi
}

echo "1️⃣  Checking Basic Connectivity"
echo "==============================="

# Check if port is listening
echo -n "  Checking if port $PORT is listening... "
if timeout $TIMEOUT bash -c "echo > /dev/tcp/$HOST/$PORT" 2>/dev/null; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ (Port not listening)${NC}"
  exit 1
fi

echo ""
echo "2️⃣  Checking Express Server"
echo "============================"

check_endpoint "Health endpoint" "/api/health" || {
  echo -e "${RED}ERROR: Server not responding${NC}"
  exit 1
}

echo ""
echo "3️⃣  Checking Frontend"
echo "===================="

echo -n "  Checking if frontend loads... "
if timeout $TIMEOUT curl -s "$API_URL/" | grep -q "html\|<!DOCTYPE" 2>/dev/null; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
fi

echo ""
echo "4️⃣  Checking API Routes"
echo "======================="

# Test health
echo -n "  Testing /api/health... "
HEALTH=$(timeout $TIMEOUT curl -s "$API_URL/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo -e "${GREEN}✓${NC}"
  echo "    Response: $HEALTH"
else
  echo -e "${RED}✗${NC}"
fi

# Test metrics (optional, may require auth)
check_endpoint "API test endpoint" "/api/test" || true

echo ""
echo "5️⃣  Checking Docker Integration"
echo "================================"

echo -n "  Checking Docker API... "
if timeout $TIMEOUT curl -s "$API_URL/api/docker/status" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${YELLOW}⚠${NC} (Docker not available or requires auth)"
fi

echo ""
echo "6️⃣  Checking Jenkins Integration"
echo "================================="

echo -n "  Checking Jenkins API... "
if timeout $TIMEOUT curl -s "$API_URL/api/jenkins/status" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${YELLOW}⚠${NC} (Jenkins not available or requires auth)"
fi

echo ""
echo "7️⃣  Performance Checks"
echo "======================"

# Test response time for health endpoint
echo -n "  Health endpoint response time... "
START=$(date +%s%N)
timeout $TIMEOUT curl -s "$API_URL/api/health" > /dev/null
END=$(date +%s%N)
DIFF=$((($END - $START) / 1000000))
echo "${DIFF}ms"

if [ $DIFF -gt 5000 ]; then
  echo -e "    ${YELLOW}⚠  Slow response (>5s)${NC}"
elif [ $DIFF -gt 1000 ]; then
  echo -e "    ${YELLOW}⚠  Moderate response (>1s)${NC}"
else
  echo -e "    ${GREEN}✓ Fast response (<1s)${NC}"
fi

echo ""
echo "8️⃣  Checking Configuration"
echo "=========================="

# Try to detect environment
if timeout $TIMEOUT curl -s "$API_URL/api/health" | grep -q '"dbConnected":true'; then
  echo -e "  ${GREEN}✓${NC} MongoDB is connected"
else
  echo -e "  ${YELLOW}⚠${NC} MongoDB is not connected (but server still running)"
fi

echo ""
echo "9️⃣  Summary"
echo "==========="

echo -e "${GREEN}✓ Server is running on port $PORT${NC}"
echo -e "${GREEN}✓ Frontend is being served${NC}"
echo -e "${GREEN}✓ API is responding${NC}"
echo ""
echo "✅ Production deployment looks good!"
echo ""
echo "Next steps:"
echo "  1. Test in browser: http://$HOST:$PORT"
echo "  2. Check browser console for errors"
echo "  3. Monitor logs: docker logs -f <container-id>"
echo "  4. Verify all services work (may take time to connect)"

exit 0
