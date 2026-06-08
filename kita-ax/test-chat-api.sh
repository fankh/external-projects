#!/bin/bash

# Test Chat API Endpoints
# Usage: ./test-chat-api.sh [api_url] [user_id] [tenant_id]

API_URL="${1:-http://172.16.200.200:3005}"
USER_ID="${2:-test-user}"
TENANT_ID="${3:-test-tenant}"

echo "🧪 Testing Chat API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "API URL: $API_URL"
echo "User ID: $USER_ID"
echo "Tenant ID: $TENANT_ID"
echo ""

# Test 1: Send a message
echo "1️⃣  Testing POST /api/v1/chat/messages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MESSAGE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/chat/messages" \
  -H "Authorization: Bearer $USER_ID" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello! Can you help me with something?"}')

echo "$MESSAGE_RESPONSE" | jq .

USER_MESSAGE_ID=$(echo "$MESSAGE_RESPONSE" | jq -r '.userMessage.id')
echo ""
echo "✅ User Message ID: $USER_MESSAGE_ID"
echo ""

# Test 2: Get chat history
echo "2️⃣  Testing GET /api/v1/chat/messages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HISTORY_RESPONSE=$(curl -s "$API_URL/api/v1/chat/messages?page=0&size=50" \
  -H "Authorization: Bearer $USER_ID" \
  -H "X-Tenant-ID: $TENANT_ID")

echo "$HISTORY_RESPONSE" | jq .

MESSAGE_COUNT=$(echo "$HISTORY_RESPONSE" | jq '.totalElements')
echo ""
echo "✅ Total Messages: $MESSAGE_COUNT"
echo ""

# Test 3: Send another message
echo "3️⃣  Testing Multi-turn Conversation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MESSAGE_RESPONSE_2=$(curl -s -X POST "$API_URL/api/v1/chat/messages" \
  -H "Authorization: Bearer $USER_ID" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":"What are the main features?"}')

echo "$MESSAGE_RESPONSE_2" | jq .
echo ""

# Test 4: Verify message count increased
echo "4️⃣  Verify Message Count Increased"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FINAL_RESPONSE=$(curl -s "$API_URL/api/v1/chat/messages?page=0&size=50" \
  -H "Authorization: Bearer $USER_ID" \
  -H "X-Tenant-ID: $TENANT_ID")

FINAL_COUNT=$(echo "$FINAL_RESPONSE" | jq '.totalElements')
echo "Final Message Count: $FINAL_COUNT"
echo ""

if [ "$FINAL_COUNT" -gt "$MESSAGE_COUNT" ]; then
  echo "✅ SUCCESS: Messages were added to conversation"
else
  echo "❌ ERROR: Message count did not increase"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Chat API tests complete!"
