// Chat page functionality with Socket.IO integration

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const imageBtn = document.getElementById('imageBtn');
    const imageInput = document.getElementById('imageInput');
    const typingIndicator = document.getElementById('typingIndicator');
    const typingText = document.getElementById('typingText');
    const roomUsers = document.getElementById('roomUsers');
    const connectionStatus = document.getElementById('connectionStatus');
    const e2eToggle = document.getElementById('e2eToggle');
    const e2eStatus = document.getElementById('e2eStatus');
    const e2eModal = document.getElementById('e2eModal');
    const closeE2eModal = document.getElementById('closeE2eModal');
    const e2eSetup = document.getElementById('e2eSetup');
    const e2eDisable = document.getElementById('e2eDisable');
    const passphraseInput = document.getElementById('passphrase');
    const enableE2eBtn = document.getElementById('enableE2e');
    const disableE2eBtn = document.getElementById('disableE2e');
    const cancelE2eBtn = document.getElementById('cancelE2e');
    const cancelDisableE2eBtn = document.getElementById('cancelDisableE2e');

    // Get parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token') || window.location.pathname.split('/').pop();
    const username = urlParams.get('username');

    // Chat state
    let socket = null;
    let currentUsername = username;
    let roomId = null;
    let isConnected = false;
    let roomUsersList = [];
    let typingTimeout = null;
    let lastTypingTime = 0;
    let isE2EEnabled = false;
    let cryptoKey = null;
    let currentSalt = null;

    // E2E Encryption functionality
    class E2EEncryption {
        static async deriveKey(passphrase, salt) {
            const encoder = new TextEncoder();
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(passphrase),
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );

            return window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        }

        static async encrypt(text, key, salt) {
            const encoder = new TextEncoder();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(text)
            );

            return {
                ciphertext: Array.from(new Uint8Array(encrypted)),
                iv: Array.from(iv),
                salt: Array.from(salt)
            };
        }

        static async decrypt(encryptedData, key) {
            try {
                const ciphertext = new Uint8Array(encryptedData.ciphertext);
                const iv = new Uint8Array(encryptedData.iv);

                const decrypted = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    ciphertext
                );

                const decoder = new TextDecoder();
                return decoder.decode(decrypted);
            } catch (error) {
                console.error('Decryption failed:', error);
                return null;
            }
        }
    }

    // Initialize chat
    async function initChat() {
        if (!token) {
            window.location.href = '/error?type=invalid_token';
            return;
        }

        if (!username) {
            // If no username provided, redirect to join page
            window.location.href = `/chat/${token}`;
            return;
        }

        // Initialize Socket.IO connection
        socket = io({
            timeout: 5000,
            retries: 3
        });

        setupSocketEvents();
        connectToRoom();
    }

    // Setup Socket.IO event listeners
    function setupSocketEvents() {
        socket.on('connect', () => {
            console.log('Connected to server');
            isConnected = true;
            updateConnectionStatus('Connected', 'success');
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            isConnected = false;
            updateConnectionStatus('Disconnected', 'error');
            
            if (reason === 'io server disconnect') {
                // Server disconnected, try to reconnect
                socket.connect();
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            updateConnectionStatus('Connection failed', 'error');
        });

        socket.on('roomJoined', (data) => {
            console.log('Room joined:', data);
            roomId = data.roomId;
            currentUsername = data.username;
            roomUsersList = data.users || [];
            updateRoomUsers();
            
            // Load existing messages
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(message => displayMessage(message));
            }
            
            updateConnectionStatus('Connected to chat', 'success');
            messageInput.focus();
        });

        socket.on('userJoined', (data) => {
            console.log('User joined:', data);
            roomUsersList = data.users || [];
            updateRoomUsers();
            
            mainUtils.showToast(`${data.username} joined the chat`, 'info');
        });

        socket.on('userLeft', (data) => {
            console.log('User left:', data);
            roomUsersList = data.users || [];
            updateRoomUsers();
            
            mainUtils.showToast(`${data.username} left the chat`, 'info');
        });

        socket.on('message', (message) => {
            displayMessage(message);
        });

        socket.on('userTyping', (data) => {
            if (data.username !== currentUsername) {
                showTypingIndicator(data.username, data.typing);
            }
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            mainUtils.showToast(error.message || 'An error occurred', 'error');
            
            // Handle specific errors
            if (error.message.includes('Invalid or expired token')) {
                setTimeout(() => {
                    window.location.href = '/error?type=invalid_token';
                }, 2000);
            } else if (error.message.includes('Room is full')) {
                setTimeout(() => {
                    window.location.href = '/error?type=room_full';
                }, 2000);
            }
        });
    }

    // Connect to chat room
    function connectToRoom() {
        if (!socket || !token || !currentUsername) return;

        updateConnectionStatus('Joining room...', 'info');
        
        socket.emit('joinRoom', {
            token: token,
            username: currentUsername,
            isOwner: !username // If no username in URL, this is the owner
        });
    }

    // Update connection status
    function updateConnectionStatus(status, type) {
        if (!connectionStatus) return;

        connectionStatus.textContent = status;
        connectionStatus.className = 'text-xs ';
        
        switch (type) {
            case 'success':
                connectionStatus.className += 'text-green-500 dark:text-green-400';
                break;
            case 'error':
                connectionStatus.className += 'text-red-500 dark:text-red-400';
                break;
            case 'info':
                connectionStatus.className += 'text-blue-500 dark:text-blue-400';
                break;
            default:
                connectionStatus.className += 'text-gray-500 dark:text-gray-400';
        }
    }

    // Update room users display
    function updateRoomUsers() {
        if (!roomUsers) return;

        if (roomUsersList.length === 0) {
            roomUsers.textContent = 'Loading...';
        } else if (roomUsersList.length === 1) {
            roomUsers.textContent = `${roomUsersList[0]} (waiting for someone to join)`;
        } else {
            roomUsers.textContent = roomUsersList.join(' ↔ ');
        }
    }

    // Display message in chat
    function displayMessage(message) {
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-bubble';

        if (message.type === 'system') {
            messageDiv.innerHTML = `
                <div class="text-center py-2">
                    <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                        ${mainUtils.sanitizeHTML(message.message)} • ${mainUtils.formatTime(message.timestamp)}
                    </span>
                </div>
            `;
        } else {
            const isOwnMessage = message.username === currentUsername;
            const alignClass = isOwnMessage ? 'ml-auto' : 'mr-auto';
            const bgClass = isOwnMessage 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600';

            let messageContent = '';
            let isEncrypted = message.encrypted || false;

            // Handle encrypted messages
            if (isEncrypted && cryptoKey && message.iv && message.salt) {
                try {
                    if (message.text) {
                        const decryptedText = await E2EEncryption.decrypt({
                            ciphertext: message.text,
                            iv: message.iv
                        }, cryptoKey);
                        
                        if (decryptedText) {
                            messageContent = `<p class="break-words">${mainUtils.sanitizeHTML(decryptedText)}</p>`;
                        } else {
                            messageContent = `<p class="italic opacity-75">[Failed to decrypt message]</p>`;
                        }
                    }

                    if (message.imageBase64) {
                        const decryptedImage = await E2EEncryption.decrypt({
                            ciphertext: message.imageBase64,
                            iv: message.iv
                        }, cryptoKey);
                        
                        if (decryptedImage) {
                            messageContent += `<img src="${decryptedImage}" alt="Shared image" class="image-preview mt-2 cursor-pointer" onclick="openImageModal(this.src)">`;
                        } else {
                            messageContent += `<p class="italic opacity-75">[Failed to decrypt image]</p>`;
                        }
                    }
                } catch (error) {
                    messageContent = `<p class="italic opacity-75">[Encrypted message - enter passphrase to decrypt]</p>`;
                }
            } else if (isEncrypted) {
                messageContent = `<p class="italic opacity-75">[Encrypted message - enter passphrase to decrypt]</p>`;
            } else {
                // Plain text message
                if (message.text) {
                    messageContent = `<p class="break-words">${mainUtils.sanitizeHTML(message.text)}</p>`;
                }
                
                if (message.imageBase64) {
                    messageContent += `<img src="${message.imageBase64}" alt="Shared image" class="image-preview mt-2 cursor-pointer" onclick="openImageModal(this.src)">`;
                }
            }

            messageDiv.innerHTML = `
                <div class="flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4">
                    <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${bgClass} ${alignClass} relative ${isEncrypted && message.encrypted ? 'message-encrypted' : ''}">
                        ${!isOwnMessage ? `<div class="text-xs font-semibold mb-1 opacity-75">${mainUtils.sanitizeHTML(message.username)}</div>` : ''}
                        ${messageContent}
                        <div class="text-xs mt-1 opacity-70 message-time">
                            ${mainUtils.formatTime(message.timestamp)}
                        </div>
                    </div>
                </div>
            `;
        }

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    // Send message
    async function sendMessage() {
        const text = messageInput.value.trim();
        if (!text || !socket || !isConnected) return;

        if (text.length > 2000) {
            mainUtils.showToast('Message too long (max 2000 characters)', 'error');
            return;
        }

        try {
            const messageData = {
                token: token,
                username: currentUsername
            };

            if (isE2EEnabled && cryptoKey) {
                // Encrypt the message
                const encryptedData = await E2EEncryption.encrypt(text, cryptoKey, currentSalt);
                messageData.text = encryptedData.ciphertext;
                messageData.iv = encryptedData.iv;
                messageData.salt = encryptedData.salt;
                messageData.encrypted = true;
            } else {
                messageData.text = text;
            }

            socket.emit('sendMessage', messageData);
            messageInput.value = '';
            mainUtils.autoResizeTextarea(messageInput);
            sendBtn.disabled = false;
        } catch (error) {
            console.error('Failed to send message:', error);
            mainUtils.showToast('Failed to send message', 'error');
        }
    }

    // Send image
    async function sendImage(file) {
        if (!socket || !isConnected) return;

        if (!mainUtils.isValidImageFile(file)) {
            mainUtils.showToast('Invalid image file type', 'error');
            return;
        }

        if (!mainUtils.validateFileSize(file, 1)) {
            mainUtils.showToast('Image too large (max 1MB)', 'error');
            return;
        }

        try {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<div class="spinner"></div>';

            const base64 = await mainUtils.fileToBase64(file);
            
            const messageData = {
                token: token,
                username: currentUsername
            };

            if (isE2EEnabled && cryptoKey) {
                // Encrypt the image
                const encryptedData = await E2EEncryption.encrypt(base64, cryptoKey, currentSalt);
                messageData.imageBase64 = encryptedData.ciphertext;
                messageData.iv = encryptedData.iv;
                messageData.salt = encryptedData.salt;
                messageData.encrypted = true;
            } else {
                messageData.imageBase64 = base64;
            }

            socket.emit('sendMessage', messageData);
            mainUtils.showToast('Image sent successfully', 'success');
        } catch (error) {
            console.error('Failed to send image:', error);
            mainUtils.showToast('Failed to send image', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                </svg>
            `;
        }
    }

    // Handle typing indicator
    function handleTyping() {
        if (!socket || !isConnected) return;

        const now = Date.now();
        const timeSinceLastTyping = now - lastTypingTime;

        if (timeSinceLastTyping > 1000) {
            socket.emit('typing', { typing: true });
            lastTypingTime = now;
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { typing: false });
        }, 1000);
    }

    // Show/hide typing indicator
    function showTypingIndicator(username, isTyping) {
        if (!typingIndicator || !typingText) return;

        if (isTyping) {
            typingText.textContent = `${username} is typing...`;
            typingIndicator.classList.remove('hidden');
            scrollToBottom();
        } else {
            typingIndicator.classList.add('hidden');
        }
    }

    // Scroll to bottom of messages
    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // E2E Encryption management
    async function enableE2E(passphrase) {
        if (!passphrase.trim()) {
            mainUtils.showToast('Please enter a passphrase', 'error');
            return;
        }

        try {
            currentSalt = window.crypto.getRandomValues(new Uint8Array(16));
            cryptoKey = await E2EEncryption.deriveKey(passphrase, currentSalt);
            isE2EEnabled = true;
            updateE2EStatus();
            mainUtils.showToast('End-to-end encryption enabled', 'success');
            return true;
        } catch (error) {
            console.error('Failed to enable E2E encryption:', error);
            mainUtils.showToast('Failed to enable encryption', 'error');
            return false;
        }
    }

    function disableE2E() {
        isE2EEnabled = false;
        cryptoKey = null;
        currentSalt = null;
        updateE2EStatus();
        mainUtils.showToast('End-to-end encryption disabled', 'info');
    }

    function updateE2EStatus() {
        if (!e2eStatus || !e2eToggle) return;

        if (isE2EEnabled) {
            e2eStatus.textContent = 'E2E: ON';
            e2eToggle.className = e2eToggle.className.replace('encryption-off', 'encryption-on');
            if (!e2eToggle.classList.contains('encryption-on')) {
                e2eToggle.classList.add('encryption-on');
            }
        } else {
            e2eStatus.textContent = 'E2E: OFF';
            e2eToggle.className = e2eToggle.className.replace('encryption-on', 'encryption-off');
            if (!e2eToggle.classList.contains('encryption-off')) {
                e2eToggle.classList.add('encryption-off');
            }
        }
    }

    // Modal management
    function openE2EModal(isDisabling = false) {
        if (!e2eModal) return;

        if (isDisabling) {
            e2eSetup.classList.add('hidden');
            e2eDisable.classList.remove('hidden');
        } else {
            e2eSetup.classList.remove('hidden');
            e2eDisable.classList.add('hidden');
            passphraseInput.value = '';
            setTimeout(() => passphraseInput.focus(), 100);
        }

        e2eModal.classList.remove('hidden');
    }

    function closeE2EModalFn() {
        if (!e2eModal) return;
        e2eModal.classList.add('hidden');
        passphraseInput.value = '';
    }

    // Image modal for full view
    window.openImageModal = function(src) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="relative max-w-full max-h-full">
                <img src="${src}" alt="Full size image" class="max-w-full max-h-full object-contain">
                <button class="absolute top-4 right-4 text-white hover:text-gray-300 text-2xl font-bold" onclick="this.parentElement.parentElement.remove()">
                    ×
                </button>
            </div>
        `;
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    };

    // Event listeners
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            mainUtils.autoResizeTextarea(this);
            handleTyping();
        });

        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    if (imageBtn && imageInput) {
        imageBtn.addEventListener('click', () => imageInput.click());
        
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                sendImage(file);
            }
            // Reset input
            this.value = '';
        });
    }

    if (e2eToggle) {
        e2eToggle.addEventListener('click', function() {
            if (isE2EEnabled) {
                openE2EModal(true);
            } else {
                openE2EModal(false);
            }
        });
    }

    if (closeE2eModal) {
        closeE2eModal.addEventListener('click', closeE2EModalFn);
    }

    if (cancelE2eBtn) {
        cancelE2eBtn.addEventListener('click', closeE2EModalFn);
    }

    if (cancelDisableE2eBtn) {
        cancelDisableE2eBtn.addEventListener('click', closeE2EModalFn);
    }

    if (enableE2eBtn) {
        enableE2eBtn.addEventListener('click', async function() {
            const passphrase = passphraseInput.value;
            const success = await enableE2E(passphrase);
            if (success) {
                closeE2EModalFn();
            }
        });
    }

    if (disableE2eBtn) {
        disableE2eBtn.addEventListener('click', function() {
            disableE2E();
            closeE2EModalFn();
        });
    }

    if (passphraseInput) {
        passphraseInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                enableE2eBtn.click();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !e2eModal.classList.contains('hidden')) {
            closeE2EModalFn();
        }
    });

    // Click outside modal to close
    if (e2eModal) {
        e2eModal.addEventListener('click', function(e) {
            if (e.target === e2eModal) {
                closeE2EModalFn();
            }
        });
    }

    // Initialize E2E status
    updateE2EStatus();

    // Start the chat application
    initChat();

    // Handle page visibility changes
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible' && socket && !socket.connected) {
            socket.connect();
        }
    });

    // Handle beforeunload
    window.addEventListener('beforeunload', function() {
        if (socket) {
            socket.disconnect();
        }
    });
});
