#!/usr/bin/env python3
"""
Mock Chat API Server for Testing
Serves chat endpoints without requiring full kita-ax setup
"""

import json
import uuid
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import sys

# In-memory storage for chat messages (per user/tenant)
messages_db = {}


def generate_id():
    return str(uuid.uuid4())


def get_timestamp():
    return datetime.utcnow().isoformat() + "Z"


def generate_assistant_response(user_message):
    """Generate a simple assistant response"""
    responses = [
        "I understand. Thank you for your message.",
        "I appreciate your input. How can I help further?",
        "Got it. Is there anything else you would like to know?",
        "Thank you for reaching out. What else can I assist you with?",
        "I see. Please feel free to ask more questions."
    ]
    import random
    return random.choice(responses)


class ChatAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET /api/v1/chat/messages"""
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/api/v1/chat/messages":
            # Parse query parameters
            query_params = parse_qs(parsed_url.query)
            page = int(query_params.get('page', ['0'])[0])
            size = int(query_params.get('size', ['50'])[0])

            # Get mock user/tenant from Authorization header
            auth_header = self.headers.get('Authorization', 'Bearer mock-user-id')
            user_id = auth_header.split()[-1] if 'Bearer' in auth_header else 'mock-user-id'
            tenant_id = self.headers.get('X-Tenant-ID', 'mock-tenant-id')

            # Get messages for this user
            key = f"{user_id}:{tenant_id}"
            user_messages = messages_db.get(key, [])

            # Paginate
            start = page * size
            end = start + size
            paginated = user_messages[start:end]

            response_data = {
                "success": True,
                "content": paginated,
                "totalElements": len(user_messages),
                "totalPages": (len(user_messages) + size - 1) // size,
                "number": page,
                "size": size
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        """Handle POST /api/v1/chat/messages"""
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/api/v1/chat/messages":
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            try:
                request_data = json.loads(body.decode())
                content = request_data.get('content', '')
            except:
                content = ''

            if not content:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error = {
                    "success": False,
                    "error": "Validation failed",
                    "details": {"content": "Message content is required"}
                }
                self.wfile.write(json.dumps(error).encode())
                return

            # Get user/tenant info
            auth_header = self.headers.get('Authorization', 'Bearer mock-user-id')
            user_id = auth_header.split()[-1] if 'Bearer' in auth_header else 'mock-user-id'
            tenant_id = self.headers.get('X-Tenant-ID', 'mock-tenant-id')

            # Create user message
            user_message = {
                "id": generate_id(),
                "role": "user",
                "content": content,
                "createdAt": get_timestamp()
            }

            # Create assistant response
            assistant_message = {
                "id": generate_id(),
                "role": "assistant",
                "content": generate_assistant_response(content),
                "createdAt": get_timestamp()
            }

            # Store messages
            key = f"{user_id}:{tenant_id}"
            if key not in messages_db:
                messages_db[key] = []
            messages_db[key].append(user_message)
            messages_db[key].append(assistant_message)

            response_data = {
                "success": True,
                "userMessage": user_message,
                "assistantMessage": assistant_message
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID')
        self.end_headers()

    def log_message(self, format, *args):
        """Suppress default logging"""
        print(f"[{self.client_address[0]}] {format % args}", file=sys.stderr)


def run_server(host='0.0.0.0', port=3005):
    """Start the mock chat API server"""
    server_address = (host, port)
    httpd = HTTPServer(server_address, ChatAPIHandler)
    print(f"🚀 Mock Chat API Server running on {host}:{port}")
    print(f"📝 POST /api/v1/chat/messages - Send a message")
    print(f"📖 GET /api/v1/chat/messages?page=0&size=50 - Get message history")
    print(f"✋ Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server stopped")
        sys.exit(0)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3005
    run_server(port=port)
