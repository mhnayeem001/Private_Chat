// Login page functionality

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const successView = document.getElementById('successView');
    const generatedLink = document.getElementById('generatedLink');
    const copyBtn = document.getElementById('copyBtn');
    const joinChatBtn = document.getElementById('joinChatBtn');

    let currentToken = null;
    let currentChatLink = null;

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username) {
            mainUtils.showToast('Please enter a username', 'error');
            return;
        }

        if (username.length > 50) {
            mainUtils.showToast('Username must be 50 characters or less', 'error');
            return;
        }

        // Show loading state
        setLoading(true);

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store the data
                currentToken = data.token;
                currentChatLink = data.chatLink;
                
                // Show success view
                showSuccessView(data);
            } else {
                mainUtils.showToast(data.error || 'Failed to create chat link', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            mainUtils.showToast('Network error. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    });

    // Handle copy button
    copyBtn.addEventListener('click', async function() {
        if (!currentChatLink) return;

        try {
            const success = await mainUtils.copyToClipboard(currentChatLink);
            if (success) {
                mainUtils.showToast('Link copied to clipboard!', 'success');
                
                // Visual feedback
                copyBtn.innerHTML = `
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                `;
                
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                        </svg>
                    `;
                }, 2000);
            } else {
                mainUtils.showToast('Failed to copy link', 'error');
            }
        } catch (error) {
            mainUtils.showToast('Failed to copy link', 'error');
        }
    });

    // Handle join chat button
    joinChatBtn.addEventListener('click', function() {
        if (!currentChatLink) return;
        
        // Open chat link
        window.location.href = currentChatLink;
    });

    // Handle username input validation
    const usernameInput = document.getElementById('username');
    usernameInput.addEventListener('input', function() {
        const value = this.value;
        
        if (value.length > 50) {
            this.setCustomValidity('Username must be 50 characters or less');
        } else if (value.trim().length === 0 && value.length > 0) {
            this.setCustomValidity('Username cannot be only whitespace');
        } else {
            this.setCustomValidity('');
        }
    });

    // Auto-focus username field
    usernameInput.focus();

    function setLoading(loading) {
        if (loading) {
            submitBtn.disabled = true;
            btnText.textContent = 'Creating...';
            loadingSpinner.classList.remove('hidden');
        } else {
            submitBtn.disabled = false;
            btnText.textContent = 'Generate Chat Link';
            loadingSpinner.classList.add('hidden');
        }
    }

    function showSuccessView(data) {
        // Hide the form
        loginForm.parentElement.classList.add('hidden');
        
        // Show success view
        successView.classList.remove('hidden');
        
        // Set the generated link
        generatedLink.value = data.chatLink;
        
        // Auto-select the link for easy copying
        generatedLink.select();
        
        mainUtils.showToast('Chat link created successfully!', 'success');
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to submit form
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (!successView.classList.contains('hidden')) {
                // In success view, copy the link
                copyBtn.click();
            } else {
                // In form view, submit the form
                loginForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // Escape to go back to home
        if (e.key === 'Escape') {
            window.location.href = '/';
        }
    });

    // Auto-resize password field if it becomes multiline (shouldn't happen, but just in case)
    const passwordInput = document.getElementById('password');
    passwordInput.addEventListener('input', function() {
        mainUtils.autoResizeTextarea(this);
    });

    // Clear any browser autocomplete for security
    setTimeout(() => {
        if (passwordInput.value && !passwordInput.dataset.userInput) {
            passwordInput.value = '';
        }
    }, 100);

    passwordInput.addEventListener('input', function() {
        this.dataset.userInput = 'true';
    });
});
