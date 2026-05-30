# Chat API Deployment Guide

## Status: ✅ LIVE ON DEV SERVER

The chat API mock server is now running and responding to requests.

### Server Details
- **Location**: `/data/development/external-projects/kita-ax/`
- **Process**: `python3 chat-mock-server.py 3005`
- **Port**: 3005
- **Status**: Running and accepting requests

### API Endpoints

#### 1. Get Chat History
```
GET http://172.16.200.200:3005/api/v1/chat/messages?page=0&size=50
```

**Headers:**
```
Authorization: Bearer {user-id}
X-Tenant-ID: {tenant-id}
```

**Response:**
```json
{
  "success": true,
  "content": [
    {
      "id": "uuid",
      "role": "user",
      "content": "User message",
      "createdAt": "2026-05-30T06:17:28.930799Z"
    }
  ],
  "totalElements": 50,
  "totalPages": 1,
  "number": 0,
  "size": 50
}
```

#### 2. Send Message
```
POST http://172.16.200.200:3005/api/v1/chat/messages
```

**Headers:**
```
Authorization: Bearer {user-id}
X-Tenant-ID: {tenant-id}
Content-Type: application/json
```

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

### Testing

#### Test 1: Send a Message
```bash
curl -X POST "http://172.16.200.200:3005/api/v1/chat/messages" \
  -H "Authorization: Bearer test-user" \
  -H "X-Tenant-ID: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello!"}'
```

#### Test 2: Retrieve History
```bash
curl "http://172.16.200.200:3005/api/v1/chat/messages?page=0&size=50" \
  -H "Authorization: Bearer test-user" \
  -H "X-Tenant-ID: test-tenant"
```

#### Test 3: Multi-user Isolation
```bash
# Send as user1
curl -X POST "http://172.16.200.200:3005/api/v1/chat/messages" \
  -H "Authorization: Bearer user1" \
  -H "X-Tenant-ID: tenant1" \
  -H "Content-Type: application/json" \
  -d '{"content":"User 1 message"}'

# Send as user2
curl -X POST "http://172.16.200.200:3005/api/v1/chat/messages" \
  -H "Authorization: Bearer user2" \
  -H "X-Tenant-ID: tenant1" \
  -H "Content-Type: application/json" \
  -d '{"content":"User 2 message"}'

# Verify user1 only sees their messages
curl "http://172.16.200.200:3005/api/v1/chat/messages?page=0&size=50" \
  -H "Authorization: Bearer user1" \
  -H "X-Tenant-ID: tenant1"
```

### Portal Configuration

To make the portal use these endpoints, update the portal's environment to point to the mock server:

#### Option A: Environment Variable (Recommended)
```bash
REACT_APP_API_BASE_URL=http://172.16.200.200:3005
```

#### Option B: Portal Configuration
Edit `portal/src/lib/api/chat.ts` to use:
```javascript
const baseURL = 'http://172.16.200.200:3005';
```

### Features

✅ **Multi-tenant isolation** - Messages are separated by user and tenant
✅ **Pagination support** - page and size parameters work correctly
✅ **CORS enabled** - Browser requests are allowed
✅ **Conversation memory** - Messages persist in memory during server runtime
✅ **Auto-generated responses** - Assistant responses vary with each message
✅ **Proper timestamps** - ISO 8601 formatted with milliseconds

### Limitations (Mock Only)

⚠️ **No persistence** - Messages are lost when server restarts
⚠️ **No database** - Runs in Python memory only
⚠️ **Test mode only** - Not suitable for production

### Scaling to Production

For production deployment, switch to the full kita-ax implementation:

1. Use full NodeJS + PostgreSQL setup
2. Deploy with Docker Compose
3. Run proper migrations: `npm run db:migrate`
4. Use permanent storage instead of in-memory

### Keep Server Running

To keep the mock server running after SSH disconnect:

```bash
# On dev server
nohup python3 /data/development/external-projects/kita-ax/chat-mock-server.py 3005 \
  > /data/development/external-projects/kita-ax/chat-server.log 2>&1 &

# Or using screen/tmux
screen -S chat-api -d -m python3 /data/development/external-projects/kita-ax/chat-mock-server.py 3005
```

### Restart Server

```bash
# Kill existing process
pkill -f "chat-mock-server.py"

# Start new instance
python3 /data/development/external-projects/kita-ax/chat-mock-server.py 3005 &
```

## Next Steps

1. ✅ Chat endpoints deployed and tested
2. ⏳ Configure portal to use the mock server
3. ⏳ Test chat functionality in portal UI
4. ⏳ Plan migration to full kita-ax implementation

## Support

For issues or changes to the mock server, edit `chat-mock-server.py` and restart:
- The mock server requires only Python 3 (no pip dependencies)
- Response format matches portal expectations exactly
- All endpoints support user and tenant isolation
