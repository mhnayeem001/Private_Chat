// Main utility functions and theme management

// Theme Management
function initTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeToggle();
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggle();
    
    showToast(`Switched to ${newTheme} theme`, 'success');
}

function updateThemeToggle() {
    const theme = document.documentElement.getAttribute('data-theme');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    
    if (sunIcon && moonIcon) {
        if (theme === 'dark') {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    }
}

// Toast Notifications
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-xs`;
    
    // Set color based on type
    switch (type) {
        case 'success':
            toast.classList.add('bg-green-600');
            break;
        case 'error':
            toast.classList.add('bg-red-600');
            break;
        case 'warning':
            toast.classList.add('bg-yellow-600');
            break;
        default:
            toast.classList.add('bg-blue-600');
    }
    
    toast.textContent = message;
    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    container.removeChild(toast);
                }
            }, 300);
        }
    }, duration);
}

// Utility Functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
        return 'Today';
    } else if (diffDays === 2) {
        return 'Yesterday';
    } else if (diffDays <= 7) {
        return date.toLocaleDateString([], { weekday: 'long' });
    } else {
        return date.toLocaleDateString([], { 
            month: 'short', 
            day: 'numeric' 
        });
    }
}

function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Copy to clipboard functionality
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const result = document.execCommand('copy');
            document.body.removeChild(textArea);
            return result;
        }
    } catch (error) {
        console.error('Failed to copy text: ', error);
        return false;
    }
}

// Auto-resize textarea
function autoResizeTextarea(element) {
    element.style.height = 'auto';
    element.style.height = Math.min(element.scrollHeight, 128) + 'px'; // Max 8rem
}

// Validate file size
function validateFileSize(file, maxSizeMB = 1) {
    const maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    return file.size <= maxSize;
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Validate image file
function isValidImageFile(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    return validTypes.includes(file.type);
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// URL validation
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Extract token from URL
function extractTokenFromURL(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        if (pathParts[1] === 'chat' && pathParts[2]) {
            return pathParts[2];
        }
    } catch (e) {
        // Invalid URL
    }
    return null;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    
    // Set up theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Handle textarea auto-resize
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function() {
            autoResizeTextarea(this);
        });
    });
    
    // Prevent form submission on Enter (except with Shift+Enter)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA') {
            const form = e.target.closest('form');
            if (form) {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        }
    });
});

// Export functions for use in other scripts
window.mainUtils = {
    initTheme,
    toggleTheme,
    showToast,
    formatTime,
    formatDate,
    sanitizeHTML,
    debounce,
    throttle,
    copyToClipboard,
    autoResizeTextarea,
    validateFileSize,
    fileToBase64,
    isValidImageFile,
    formatFileSize,
    isValidURL,
    extractTokenFromURL
};
