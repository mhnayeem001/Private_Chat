# Private Chat App

A privacy-first, stateless 1-to-1 chat application with optional end-to-end encryption.

## Features

- **Stateless Design**: No database required, all data stored in-memory
- **One-time Links**: Generate unique chat links that expire after 5 minutes or 2 users
- **Real-time Messaging**: Instant text and image sharing via Socket.IO
- **Optional E2E Encryption**: Client-side AES-GCM encryption with PBKDF2 key derivation
- **Modern UI**: Responsive design with dark/light theme toggle
- **Privacy First**: No server-side message logging, messages cleared on restart
- **Security**: Rate limiting, XSS protection, secure headers

## Quick Start on Replit

1. Fork this repl
2. Click "Run" - the app will start automatically on port 5000
3. Open the provided URL to access the chat application

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
