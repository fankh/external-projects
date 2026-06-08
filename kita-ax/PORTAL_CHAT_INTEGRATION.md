# Portal Chat Integration Guide

This document describes how the portal is configured to use the mock chat server.

## Overview

The chat feature in the kyra-mdr portal is now integrated with the mock chat API server running at `http://172.16.200.200:3005`.

## Portal Changes

### 1. Chat API Client (`portal/src/lib/api/chat.ts`)

Created a new chat API client module that provides:

- `sendMessage(content: string)` - Send a message and get assistant response
- `getChatHistory(page?: number, size?: number)` - Retrieve paginated chat history
- `clearChatHistory()` - Clear chat history (optional for future use)

Types:
- `ChatMessage` - Message object with id, role, content, createdAt
- `SendMessageResponse` - Response from send message endpoint
- `ChatHistoryResponse` - Response from get history endpoint

### 2. Chat Page (`portal/src/app/chat/page.tsx`)

Created a new chat interface page with:

- Message history display with auto-scroll
- Message input form with send button
- Real-time message loading
- Error handling with toast notifications
- User/assistant message styling
- Responsive design

### 3. API Exports (`portal/src/lib/api/index.ts`)

Added chat API functions to the module's public exports for easy importing throughout the portal.

### 4. Environment Configuration (`.env.local`)

```bash
NEXT_PUBLIC_API_BASE_URL=http://172.16.200.200:3005
```

This tells the portal where to find the chat API endpoints. The base URL is used by all API client requests.

## How It Works

1. **Portal User** navigates to `/chat` route
2. **Chat Page** loads and calls `getChatHistory()` to fetch previous messages
3. **User Types** a message and clicks Send
4. **Chat Page** calls `sendMessage(content)` with the message text
5. **Mock Server** receives request, creates user and assistant messages
6. **Portal** displays both messages in the conversation
7. **User** continues the multi-turn conversation

## Mock Server API Endpoints

The portal communicates with these endpoints on the mock server:

### GET /api/v1/chat/messages
Retrieves paginated chat history

**Query Parameters:**
- `page` (default: 0) - Page number for pagination
- `size` (default: 50) - Number of messages per page

**Headers:**
- `Authorization: Bearer {user-id}`
- `X-Tenant-ID: {tenant-id}`

**Response:**
```json
{
  "success": true,
  "content": [
    {
      "id": "uuid",
      "role": "user",
      "content": "message text",
      "createdAt": "2026-05-30T06:17:28.930799Z"
    }
  ],
  "totalElements": 50,
  "totalPages": 1,
  "number": 0,
  "size": 50
}
```

### POST /api/v1/chat/messages
Send a message and get assistant response

**Headers:**
- `Authorization: Bearer {user-id}`
- `X-Tenant-ID: {tenant-id}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "content": "Hello, how are you?"
}
```

**Response:**
```json
{
  "success": true,
  "userMessage": {
    "id": "uuid",
    "role": "user",
    "content": "Hello, how are you?",
    "createdAt": "2026-05-30T06:17:28.930799Z"
  },
  "assistantMessage": {
    "id": "uuid",
    "role": "assistant",
    "content": "I appreciate your input. How can I help further?",
    "createdAt": "2026-05-30T06:17:28.933014Z"
  }
}
```

## Testing the Chat Feature

### Test 1: Navigate to Chat Page
1. Open portal at `https://kyra-guardrail-dev.seekerslab.com`
2. Navigate to `/chat` route
3. Verify chat history loads (or shows empty state)

### Test 2: Send a Message
1. Type "Hello" in the message input
2. Click Send button
3. Verify user message appears with blue background
4. Verify assistant response appears with gray background
5. Check that both messages have timestamps

### Test 3: Multi-turn Conversation
1. Send another message: "What are your features?"
2. Verify new messages are added to the conversation
3. Verify message count increases in the history
4. Check timestamps are properly ordered

### Test 4: Reload and Verify Persistence
1. Refresh the page
2. Verify previous messages load from history
3. Confirm message persistence works

### Test 5: Error Handling
1. Check browser console for any errors
2. Verify toast notifications appear for success/error
3. Confirm error messages are user-friendly

## Server Availability

The mock server must be running on the dev server at:
```
http://172.16.200.200:3005
```

### To Check Server Status
```bash
curl http://172.16.200.200:3005/api/v1/chat/messages?page=0&size=1 \
  -H "Authorization: Bearer test-user" \
  -H "X-Tenant-ID: test-tenant"
```

### To Keep Server Running (after SSH disconnect)
```bash
nohup python3 /data/development/external-projects/kita-ax/chat-mock-server.py 3005 \
  > /data/development/external-projects/kita-ax/chat-server.log 2>&1 &
```

## Switching to Production

When ready to move from the mock server to the full kita-ax implementation:

1. Update `.env.local` to point to the real kita-ax API:
   ```
   NEXT_PUBLIC_API_BASE_URL=http://172.16.200.200:8080
   ```

2. No code changes needed in the portal - the API client will work with the same endpoint signatures

3. Ensure kita-ax server is running with:
   ```bash
   npm run db:migrate
   npm start
   ```

## Troubleshooting

### Messages not appearing
- Check browser Network tab for API errors
- Verify mock server is running
- Check Authorization and X-Tenant-ID headers are being sent
- Review browser console for client-side errors

### "Failed to load chat history" error
- Verify `NEXT_PUBLIC_API_BASE_URL` is set correctly
- Check mock server is responding: `curl http://172.16.200.200:3005/api/v1/chat/messages?page=0&size=1`
- Verify CORS is enabled on the mock server

### Messages lost after refresh
- This is expected with the mock server (in-memory storage)
- Messages are only persisted during the current server runtime
- Switch to production kita-ax setup for persistent storage

## Architecture

```
Portal Browser
    ↓
Chat Page Component (React)
    ↓
Chat API Client (sendMessage, getChatHistory)
    ↓
API Base URL (NEXT_PUBLIC_API_BASE_URL)
    ↓
Mock Server (http://172.16.200.200:3005)
    ↓
In-Memory Message Storage
    ↓
Response with User + Assistant Messages
```

## Files Modified/Created

- ✅ `portal/src/lib/api/chat.ts` - Chat API client (NEW)
- ✅ `portal/src/app/chat/page.tsx` - Chat page component (NEW)
- ✅ `portal/src/lib/api/index.ts` - Added chat exports (MODIFIED)
- ✅ `portal/.env.local` - Environment config (NEW)
- ✅ `kita-ax/chat-mock-server.py` - Mock API server (from Phase 11)
- ✅ `kita-ax/test-chat-api.sh` - API testing script (from Phase 11)
- ✅ `kita-ax/CHAT_API_DEPLOYMENT.md` - Server deployment guide (from Phase 11)
