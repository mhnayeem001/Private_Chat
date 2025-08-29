# Overview

This is a privacy-first, stateless 1-to-1 chat application built with Node.js, Express, and Socket.IO. The application emphasizes security and privacy by storing no data in databases - everything is kept in-memory and cleared on server restart. Key features include one-time chat links, real-time messaging with image sharing, optional end-to-end encryption, and a modern responsive UI with dark/light theme support.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture

**Stateless Design**: The application uses an in-memory architecture with no database persistence. All chat rooms, user sessions, and messages exist only in server memory using JavaScript Maps and objects. When the server restarts, all data is intentionally lost, supporting the privacy-first approach.

**Express.js Server**: Built on Express 5.x with comprehensive security middleware including Helmet for security headers, CORS for cross-origin requests, compression for performance, and express-rate-limit for DDoS protection. The server implements specific rate limits: 10 token creation attempts per 5 minutes and 20 join attempts per minute per IP.

**Socket.IO Real-time Communication**: Uses Socket.IO 4.x for bidirectional real-time messaging. The socket implementation handles room management, typing indicators, user presence, and message broadcasting. All socket events include XSS protection through the 'xss' library.

**One-time Token System**: Implements a unique chat link system where each room gets a UUID-based token that expires after 5 minutes or when 2 users join (whichever comes first). This ensures true 1-to-1 privacy without allowing room persistence or unauthorized access.

## Frontend Architecture

**Multi-page Application**: Uses separate HTML pages for different flows:
- `index.html`: Landing page with options to create or join chat
- `login.html`: Chat room creation with username/password input
- `join.html`: Join existing chat via shared link  
- `chat.html`: Main chat interface with real-time messaging
- `error.html`: Error handling for expired/invalid links

**Client-side Encryption**: Implements optional end-to-end encryption using Web Crypto API with AES-GCM encryption and PBKDF2 key derivation. Users can enable E2E encryption with a shared passphrase, and all message encryption/decryption happens client-side before Socket.IO transmission.

**Responsive UI Framework**: Built with Tailwind CSS 3.x and Alpine.js for reactivity. Supports dark/light theme toggling with persistence in localStorage. Custom CSS handles scrollbar styling, message animations, and theme variables.

**Image Sharing**: Supports Base64 image sharing over WebSocket with client-side 1MB size limits and inline preview in chat bubbles. No server-side image storage or processing.

## Security Implementation

**Content Security Policy**: Strict CSP headers allowing only necessary external resources (Tailwind CDN, Alpine.js CDN) and preventing XSS attacks. All inline scripts and styles are explicitly allowed where needed.

**Rate Limiting**: Implements multiple rate limiting strategies:
- Token creation: 10 attempts per 5 minutes per IP
- Chat join attempts: 20 attempts per minute per IP
- Built-in Socket.IO connection limits

**XSS Protection**: All user-generated content (messages, usernames) is sanitized using the 'xss' library before being broadcasted to prevent script injection attacks.

**Privacy Measures**: No server-side message logging, no persistent user data, automatic data cleanup on server restart, and optional client-side encryption for messages.

# External Dependencies

**Core Runtime**: Node.js with Express 5.x framework for HTTP server and routing.

**Real-time Communication**: Socket.IO 4.x for WebSocket-based real-time messaging and room management.

**Security Libraries**: 
- Helmet 8.x for HTTP security headers
- XSS 1.x for content sanitization  
- express-rate-limit 8.x for rate limiting
- CORS 2.x for cross-origin request handling

**Frontend Frameworks**:
- Tailwind CSS 3.x (CDN) for responsive styling
- Alpine.js 3.x (CDN) for client-side reactivity

**Utility Libraries**:
- UUID 11.x for generating unique room tokens
- compression 1.x for response compression
- cookie-parser 1.x for cookie handling

**Development Tools**: Nodemon 3.x for development server auto-restart.

**Browser APIs**: Web Crypto API for client-side end-to-end encryption, LocalStorage API for theme persistence.

**Deployment Platform**: Designed for Replit hosting with automatic port detection and zero-configuration deployment.