// Join page functionality

document.addEventListener('DOMContentLoaded', function() {
    const joinForm = document.getElementById('joinForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const usernameInput = document.getElementById('username');

    // Extract token from current URL
    const currentPath = window.location.pathname;
    const token = currentPath.split('/').pop();

    if (!token || token === 'join.html') {
        // Invalid URL, redirect to error page
        window.location.href = '/error?type=invalid_token';
        return;
    }

    // Handle form submission
    joinForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim();

        if (!username) {
            mainUtils.showToast('Please enter a username', 'error');
            usernameInput.focus();
            return;
        }

        if (username.length > 50) {
            mainUtils.showToast('Username must be 50 characters or less', 'error');
            return;
        }

        // Show loading state
        setLoading(true);

        try {
            // Redirect to chat with the username
            const chatUrl = `/chat.html?token=${encodeURIComponent(token)}&username=${encodeURIComponent(username)}`;
            window.location.href = chatUrl;
        } catch (error) {
            console.error('Join error:', error);
            mainUtils.showToast('Failed to join chat. Please try again.', 'error');
            setLoading(false);
        }
    });

    // Handle username input validation
    usernameInput.addEventListener('input', function() {
        const value = this.value;
        
        if (value.length > 50) {
            this.setCustomValidity('Username must be 50 characters or less');
        } else if (value.trim().length === 0 && value.length > 0) {
            this.setCustomValidity('Username cannot be only whitespace');
        } else {
            this.setCustomValidity('');
        }
        
        // Remove loading state if user is typing
        if (submitBtn.disabled && value.trim().length > 0) {
            setLoading(false);
        }
    });

    // Auto-focus username field
    usernameInput.focus();

    function setLoading(loading) {
        if (loading) {
            submitBtn.disabled = true;
            btnText.textContent = 'Joining...';
            loadingSpinner.classList.remove('hidden');
        } else {
            submitBtn.disabled = false;
            btnText.textContent = 'Join Chat Room';
            loadingSpinner.classList.add('hidden');
        }
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to submit form
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            joinForm.dispatchEvent(new Event('submit'));
        }
        
        // Escape to go back to home
        if (e.key === 'Escape') {
            window.location.href = '/';
        }
    });

    // Check if token is valid by making a quick request
    // This helps provide early feedback if the link is invalid
    async function validateToken() {
        try {
            const response = await fetch(window.location.href, {
                method: 'HEAD'
            });
            
            if (response.status === 404 || response.redirected) {
                // Token is likely invalid, but let user try to join anyway
                // The server will provide the proper error handling
                console.warn('Token may be invalid or expired');
            }
        } catch (error) {
            // Network error, but don't block the user
            console.warn('Could not validate token:', error);
        }
    }

    // Validate token on load (non-blocking)
    validateToken();

    // Add some visual feedback for the user
    const tokenDisplay = document.createElement('div');
    tokenDisplay.className = 'text-xs text-gray-500 dark:text-gray-400 mt-2';
    tokenDisplay.innerHTML = `
        <div class="flex items-center space-x-1">
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
            </svg>
            <span>Chat ID: ${token.substring(0, 8)}...</span>
        </div>
    `;
    
    // Insert after the username input
    usernameInput.parentNode.appendChild(tokenDisplay);
});
