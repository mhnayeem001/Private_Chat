const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const xss = require('xss');

const app = express();

// Trust proxy setting for Replit environment
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
            connectSrc: ["'self'", "ws:", "wss:"],
            imgSrc: ["'self'", "data:", "blob:"]
        }
    }
}));

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate limiting
const createTokenLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // limit each IP to 10 token creation requests per windowMs
    message: 'Too many token creation attempts, try again later.'
});

const joinLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // limit each IP to 20 join attempts per minute
    message: 'Too many join attempts, try again later.'
});

// In-memory storage
const tokens = new Map(); // token -> { ownerUsername, createdAt, used, roomId }
const rooms = new Map(); // roomId -> { users: Set, messages: [] }
const userSockets = new Map(); // socketId -> { username, roomId, token }

// Utility functions
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return xss(input, {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script']
    });
}

function isTokenValid(token) {
    const tokenData = tokens.get(token);
    if (!tokenData) return false;
    
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    return tokenData.createdAt > fiveMinutesAgo && !tokenData.used;
}

function expireToken(token) {
    setTimeout(() => {
        const tokenData = tokens.get(token);
        if (tokenData && !tokenData.used) {
            tokens.delete(token);
            console.log(`Token ${token} expired after 5 minutes`);
        }
    }, 5 * 60 * 1000); // 5 minutes
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', createTokenLimiter, (req, res) => {
    const { username, password } = req.body;
    
    if (!username || username.trim().length === 0) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const sanitizedUsername = sanitizeInput(username.trim());
    if (sanitizedUsername.length === 0) {
        return res.status(400).json({ error: 'Invalid username' });
    }

    const token = uuidv4();
    const tokenData = {
        ownerUsername: sanitizedUsername,
        createdAt: Date.now(),
        used: false,
        roomId: null
    };

    tokens.set(token, tokenData);
    expireToken(token);

    const chatLink = `${req.protocol}://${req.get('host')}/chat/${token}`;
    
    res.json({
        success: true,
        token,
        chatLink,
        username: sanitizedUsername
    });
});

app.get('/chat/:token', joinLimiter, (req, res) => {
    const { token } = req.params;
    
    if (!isTokenValid(token)) {
        return res.redirect('/error?type=invalid_token');
    }

    const tokenData = tokens.get(token);
    if (tokenData.used) {
        return res.redirect('/error?type=room_full');
    }

    res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/error', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'error.html'));
});

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Rate limiting for socket events
    const messageRateLimit = new Map();
    
    function checkMessageRate(socketId) {
        const now = Date.now();
        const userRateData = messageRateLimit.get(socketId) || { count: 0, resetTime: now + 1000 };
        
        if (now > userRateData.resetTime) {
            userRateData.count = 0;
            userRateData.resetTime = now + 1000;
        }
        
        userRateData.count++;
        messageRateLimit.set(socketId, userRateData);
        
        return userRateData.count <= 5; // 5 messages per second
    }

    socket.on('joinRoom', (data) => {
        const { token, username, isOwner } = data;
        
        if (!token || !username) {
            socket.emit('error', { message: 'Missing token or username' });
            return;
        }

        const sanitizedUsername = sanitizeInput(username.trim());
        if (sanitizedUsername.length === 0) {
            socket.emit('error', { message: 'Invalid username' });
            return;
        }

        if (!isTokenValid(token)) {
            socket.emit('error', { message: 'Invalid or expired token' });
            return;
        }

        const tokenData = tokens.get(token);
        let roomId = tokenData.roomId;

        // Create room if it doesn't exist
        if (!roomId) {
            roomId = uuidv4();
            tokenData.roomId = roomId;
            rooms.set(roomId, {
                users: new Set(),
                messages: []
            });
        }

        const room = rooms.get(roomId);
        
        // Check room capacity
        if (room.users.size >= 2) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        // Check if username is already taken in this room
        const existingUsers = Array.from(room.users);
        if (existingUsers.some(user => user.username === sanitizedUsername)) {
            socket.emit('error', { message: 'Username already taken in this room' });
            return;
        }

        // Join the room
        socket.join(roomId);
        const userData = { username: sanitizedUsername, socketId: socket.id };
        room.users.add(userData);
        userSockets.set(socket.id, { username: sanitizedUsername, roomId, token });

        // Mark token as used when second user joins
        if (room.users.size === 2) {
            tokenData.used = true;
        }

        // Send room data to the user
        socket.emit('roomJoined', {
            roomId,
            username: sanitizedUsername,
            users: Array.from(room.users).map(u => u.username),
            messages: room.messages
        });

        // Notify others in the room
        socket.to(roomId).emit('userJoined', {
            username: sanitizedUsername,
            users: Array.from(room.users).map(u => u.username)
        });

        // Send system message
        const systemMessage = {
            type: 'system',
            message: `${sanitizedUsername} joined the chat`,
            timestamp: new Date().toISOString()
        };
        
        room.messages.push(systemMessage);
        io.to(roomId).emit('message', systemMessage);
    });

    socket.on('sendMessage', (data) => {
        if (!checkMessageRate(socket.id)) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
        }

        const userInfo = userSockets.get(socket.id);
        if (!userInfo) {
            socket.emit('error', { message: 'Not in a room' });
            return;
        }

        const { roomId, username } = userInfo;
        const room = rooms.get(roomId);
        
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        let message = {
            username,
            timestamp: new Date().toISOString(),
            type: 'user'
        };

        // Handle text message
        if (data.text) {
            if (data.encrypted) {
                // For encrypted messages, pass through as-is
                message.text = data.text;
                message.encrypted = true;
                message.iv = data.iv;
                message.salt = data.salt;
            } else {
                // Sanitize plain text
                message.text = sanitizeInput(data.text);
            }
        }

        // Handle image message
        if (data.imageBase64) {
            if (data.encrypted) {
                message.imageBase64 = data.imageBase64;
                message.encrypted = true;
                message.iv = data.iv;
                message.salt = data.salt;
            } else {
                // Basic validation for base64 image
                if (data.imageBase64.startsWith('data:image/')) {
                    message.imageBase64 = data.imageBase64;
                } else {
                    socket.emit('error', { message: 'Invalid image format' });
                    return;
                }
            }
        }

        room.messages.push(message);
        io.to(roomId).emit('message', message);
    });

    socket.on('typing', (data) => {
        const userInfo = userSockets.get(socket.id);
        if (!userInfo) return;

        const { roomId, username } = userInfo;
        socket.to(roomId).emit('userTyping', { username, typing: data.typing });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const userInfo = userSockets.get(socket.id);
        if (userInfo) {
            const { roomId, username } = userInfo;
            const room = rooms.get(roomId);
            
            if (room) {
                // Remove user from room
                room.users = new Set(Array.from(room.users).filter(u => u.socketId !== socket.id));
                
                // Send system message
                const systemMessage = {
                    type: 'system',
                    message: `${username} left the chat`,
                    timestamp: new Date().toISOString()
                };
                
                room.messages.push(systemMessage);
                socket.to(roomId).emit('message', systemMessage);
                socket.to(roomId).emit('userLeft', {
                    username,
                    users: Array.from(room.users).map(u => u.username)
                });

                // Clean up empty room
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                }
            }
            
            userSockets.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
