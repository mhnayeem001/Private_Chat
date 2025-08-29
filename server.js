const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Simple middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage
const rooms = new Map(); // roomId -> { users: [], messages: [], created: timestamp }
const tokens = new Map(); // token -> { roomId, created: timestamp, used: boolean }

// Clean up expired tokens every minute
setInterval(() => {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    for (const [token, data] of tokens.entries()) {
        if (data.created < fiveMinutesAgo) {
            tokens.delete(token);
            if (rooms.has(data.roomId)) {
                const room = rooms.get(data.roomId);
                if (room.users.length === 0) {
                    rooms.delete(data.roomId);
                }
            }
        }
    }
}, 60000);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/create-room', (req, res) => {
    const { username } = req.body;
    
    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const token = uuidv4();
    const roomId = uuidv4();
    
    // Create room
    rooms.set(roomId, {
        users: [],
        messages: [],
        created: Date.now(),
        owner: username.trim()
    });
    
    // Create token
    tokens.set(token, {
        roomId,
        created: Date.now(),
        used: false
    });

    const chatLink = `${req.protocol}://${req.get('host')}/chat/${token}`;
    
    res.json({
        success: true,
        token,
        roomId,
        chatLink,
        username: username.trim()
    });
});

app.get('/chat/:token', (req, res) => {
    const token = req.params.token;
    const tokenData = tokens.get(token);
    
    if (!tokenData) {
        return res.redirect('/?error=invalid_token');
    }
    
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    if (tokenData.created < fiveMinutesAgo) {
        tokens.delete(token);
        return res.redirect('/?error=expired_token');
    }
    
    const room = rooms.get(tokenData.roomId);
    if (!room) {
        return res.redirect('/?error=room_not_found');
    }
    
    if (room.users.length >= 2) {
        return res.redirect('/?error=room_full');
    }
    
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-room', (data) => {
        const { token, username } = data;
        
        if (!token || !username) {
            socket.emit('error', 'Missing token or username');
            return;
        }
        
        const tokenData = tokens.get(token);
        if (!tokenData) {
            socket.emit('error', 'Invalid token');
            return;
        }
        
        const room = rooms.get(tokenData.roomId);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.users.length >= 2) {
            socket.emit('error', 'Room is full');
            return;
        }
        
        // Join the room
        socket.join(tokenData.roomId);
        
        const user = {
            id: socket.id,
            username: username.trim(),
            joinedAt: Date.now()
        };
        
        room.users.push(user);
        socket.userData = { roomId: tokenData.roomId, username: user.username };
        
        // Mark token as used when 2 users join
        if (room.users.length === 2) {
            tokenData.used = true;
        }
        
        // Send room info to user
        socket.emit('room-joined', {
            roomId: tokenData.roomId,
            users: room.users.map(u => u.username),
            messages: room.messages
        });
        
        // Notify others
        socket.to(tokenData.roomId).emit('user-joined', {
            username: user.username,
            users: room.users.map(u => u.username)
        });
        
        // Add system message
        const systemMessage = {
            id: uuidv4(),
            type: 'system',
            message: `${user.username} joined the chat`,
            timestamp: new Date().toISOString()
        };
        
        room.messages.push(systemMessage);
        io.to(tokenData.roomId).emit('new-message', systemMessage);
    });
    
    socket.on('send-message', (data) => {
        if (!socket.userData) {
            socket.emit('error', 'Not in a room');
            return;
        }
        
        const { roomId, username } = socket.userData;
        const room = rooms.get(roomId);
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        const message = {
            id: uuidv4(),
            type: 'user',
            username,
            text: data.text || '',
            image: data.image || null,
            timestamp: new Date().toISOString()
        };
        
        room.messages.push(message);
        io.to(roomId).emit('new-message', message);
    });
    
    socket.on('typing', (data) => {
        if (!socket.userData) return;
        
        const { roomId, username } = socket.userData;
        socket.to(roomId).emit('user-typing', {
            username,
            typing: data.typing
        });
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (socket.userData) {
            const { roomId, username } = socket.userData;
            const room = rooms.get(roomId);
            
            if (room) {
                // Remove user from room
                room.users = room.users.filter(u => u.id !== socket.id);
                
                // Notify others
                socket.to(roomId).emit('user-left', {
                    username,
                    users: room.users.map(u => u.username)
                });
                
                // Add system message
                const systemMessage = {
                    id: uuidv4(),
                    type: 'system',
                    message: `${username} left the chat`,
                    timestamp: new Date().toISOString()
                };
                
                room.messages.push(systemMessage);
                socket.to(roomId).emit('new-message', systemMessage);
                
                // Clean up empty room
                if (room.users.length === 0) {
                    rooms.delete(roomId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});