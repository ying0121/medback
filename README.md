# Chatbot Backend (Express + MySQL + WebSocket)

This backend includes:
- Express.js REST API
- MySQL database with schema management (Sequelize)
- OpenAI integration for chatbot responses
- Twilio integration for SMS alerts
- Nodemailer integration for email alerts
- WebSocket server for realtime chat updates

## 1) Setup

1. Copy `.env.example` to `.env` and fill all required values.
2. Install dependencies:
   - `npm install`
3. Sync schema (create/update DB tables):
   - `npm run db:sync`
4. Start server:
   - `npm run dev`

## 2) API Endpoints

- `GET /health`
- `POST /api/chat/message`
  - body: `{ "text": "Hi", "conversationId": 1 }`
- `GET /api/chat/conversation/:conversationId/messages`
- `POST /api/notifications/alert`
  - body: `{ "subject": "Alert", "message": "Something happened" }`

## 3) WebSocket

- URL: `ws://localhost:4000/ws`
- Send:
  - `{ "type": "chat", "text": "Hello", "conversationId": 1 }`
- Receive:
  - `{ "type": "chat_response", "conversationId": 1, "reply": "..." }`

## Notes

- Twilio and SMTP modules are optional at runtime, but if credentials are missing, alert calls will return `sent: false`.
- OpenAI API key is required for chat completion.
- Default OpenAI text model is `gpt-5.4-mini` (configurable via `OPENAI_MODEL`).
- Server startup also runs Sequelize DB initialization/sync.
