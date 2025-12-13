// pass_authentication.js - Custom Password Reset System
console.log("🔐 Password Authentication System Loading...");

// DOM Elements
const verifyStep = document.getElementById('verifyStep');
const passwordStep = document.getElementById('passwordStep');
const successStep = document.getElementById('successStep');
const errorStep = document.getElementById('errorStep');

const resetEmailInput = document.getElementById('resetEmail');
const oobCodeInput = document.getElementById('oobCode');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

const verifyButton = document.getElementById('verifyButton');
const updateButton = document.getElementById('updateButton');
const toggleNewPassword = document.getElementById('toggleNewPassword');

const strengthBar = document.getElementById('strengthBar');
const strengthText = document.getElementById('strengthText');

const verifyStatus = document.getElementById('verifyStatus');
const passwordStatus = document.getElementById('passwordStatus');
const errorMessage = document.getElementById('errorMessage');

// State variables
let currentUser = null;
let isEmailVerified = false;
let oobCode = '';

// ==================== PASSWORD STRENGTH CHECKER ====================

function checkPasswordStrength(password) {
    let strength = 0;
    let feedback = "";
    
    // Length check
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength += 10;
    
    // Complexity checks
    if (/[A-Z]/.test(password)) strength += 15; // Uppercase
    if (/[a-z]/.test(password)) strength += 15; // Lowercase
    if (/[0-9]/.test(password)) strength += 15; // Numbers
    if (/[^A-Za-z0-9]/.test(password)) strength += 20; // Special chars
    
    // Set strength bar color and text
    if (strength < 50) {
        strengthBar.style.background = 'linear-gradient(90deg, #ff0033, #ff6600)';
        feedback = "Weak";
    } else if (strength < 75) {
        strengthBar.style.background = 'linear-gradient(90deg, #ff6600, #ffcc00)';
        feedback = "Medium";
    } else {
        strengthBar.style.background = 'linear-gradient(90deg, #00cc66, #00ff99)';
        feedback = "Strong";
    }
    
    strengthBar.style.width = `${Math.min(strength, 100)}%`;
    strengthText.textContent = feedback;
    strengthText.style.color = strengthBar.style.background.split(',')[0];
    
    return strength >= 50; // Minimum acceptable strength
}

// ==================== SHOW/HIDE PASSWORD ====================

if (toggleNewPassword) {
    toggleNewPassword.addEventListener('click', function() {
        const type = newPasswordInput.type === 'password' ? 'text' : 'password';
        newPasswordInput.type = type;
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });
}

// ==================== FORM STEP MANAGEMENT ====================

function showStep(stepId) {
    // Hide all steps
    verifyStep.style.display = 'none';
    passwordStep.style.display = 'none';
    successStep.style.display = 'none';
    errorStep.style.display = 'none';
    
    // Show requested step
    document.getElementById(stepId).style.display = 'block';
}

function showStatus(element, message, type = 'error') {
    if (!element) return;
    
    element.textContent = message;
    element.className = `auth-status ${type}`;
    element.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// ==================== URL PARSING FOR OOB CODE ====================

function parseOobCodeFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');
    const apiKey = urlParams.get('apiKey');
    const lang = urlParams.get('lang');
    
    console.log("URL Parameters:", { mode, oobCode: oobCode ? '***' : null, apiKey, lang });
    
    if (mode === 'resetPassword' && oobCode) {
        // Auto-fill OOB code from URL
        oobCodeInput.value = oobCode;
        
        // Try to get email from the code
        try {
            // Firebase handles OOB code verification
            console.log("OOB code found in URL");
        } catch (error) {
            console.error("Error parsing OOB code:", error);
        }
    }
    
    return { mode, oobCode, apiKey, lang };
}

// ==================== VERIFY OOB CODE ====================

async function verifyOobCode(email, code) {
    try {
        showStatus(verifyStatus, "Verifying...", 'info');
        
        // Step 1: Verify the password reset code
        const verifiedEmail = await auth.verifyPasswordResetCode(code);
        console.log("✅ OOB Code verified for email:", verifiedEmail);
        
        // Step 2: Apply the action code to mark it as used
        try {
            await auth.applyActionCode(code);
            console.log("✅ Action code applied");
        } catch (applyError) {
            console.warn("⚠️ Could not apply action code:", applyError);
            // পাসওয়ার্ড রিসেটের ক্ষেত্রে applyActionCode ব্যর্থ হতে পারে, সেটা OK
        }
        
        // Store verified state
        isEmailVerified = true;
        oobCode = code;
        
        // Pre-fill email
        if (verifiedEmail && !resetEmailInput.value) {
            resetEmailInput.value = verifiedEmail;
        }
        
        showStatus(verifyStatus, "Email verified successfully!", 'success');
        return verifiedEmail;
        
    } catch (error) {
        console.error("❌ OOB Code verification failed:", error);
        
        let errorMsg = "Verification failed. ";
        switch(error.code) {
            case 'auth/expired-action-code':
                errorMsg += "The reset link has expired.";
                break;
            case 'auth/invalid-action-code':
                errorMsg += "Invalid reset link.";
                break;
            case 'auth/user-disabled':
                errorMsg += "This account has been disabled.";
                break;
            case 'auth/user-not-found':
                errorMsg += "No account found with this email.";
                break;
            default:
                errorMsg += error.message;
        }
        
        showStatus(verifyStatus, errorMsg, 'error');
        throw error;
    }
}

// ==================== RESET PASSWORD ====================

async function resetPasswordWithCode(code, newPassword) {
    try {
        showStatus(passwordStatus, "Updating password...", 'info');
        
        // Confirm password reset with the code
        await auth.confirmPasswordReset(code, newPassword);
        
        console.log("✅ Password reset successful!");
        showStatus(passwordStatus, "Password updated successfully!", 'success');
        
        // Try to sign in the user automatically
        const email = resetEmailInput.value;
        if (email) {
            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, newPassword);
                currentUser = userCredential.user;
                console.log("✅ Auto-login successful");
            } catch (loginError) {
                console.log("⚠️ Auto-login failed, user must login manually");
            }
        }
        
        return true;
        
    } catch (error) {
        console.error("❌ Password reset failed:", error);
        
        let errorMsg = "Failed to update password. ";
        switch(error.code) {
            case 'auth/expired-action-code':
                errorMsg += "The reset link has expired.";
                break;
            case 'auth/invalid-action-code':
                errorMsg += "Invalid reset link.";
                break;
            case 'auth/weak-password':
                errorMsg += "Password is too weak. Use at least 6 characters.";
                break;
            default:
                errorMsg += error.message;
        }
        
        showStatus(passwordStatus, errorMsg, 'error');
        throw error;
    }
}

// ==================== EVENT LISTENERS ====================

// Verify Button
if (verifyButton) {
    verifyButton.addEventListener('click', async () => {
        const email = resetEmailInput.value.trim();
        const code = oobCodeInput.value.trim();
        
        if (!email) {
            showStatus(verifyStatus, "Please enter your email address", 'error');
            return;
        }
        
        if (!code) {
            showStatus(verifyStatus, "Please enter the verification code", 'error');
            return;
        }
        
        verifyButton.disabled = true;
        verifyButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        
        try {
            await verifyOobCode(email, code);
            
            // Move to password step after successful verification
            setTimeout(() => {
                showStep('passwordStep');
                verifyButton.disabled = false;
                verifyButton.innerHTML = '<i class="fas fa-check-circle"></i> Verify & Continue';
            }, 1000);
            
        } catch (error) {
            verifyButton.disabled = false;
            verifyButton.innerHTML = '<i class="fas fa-check-circle"></i> Verify & Continue';
        }
    });
}

// Update Password Button
if (updateButton) {
    updateButton.addEventListener('click', async () => {
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        // Validation
        if (!newPassword || !confirmPassword) {
            showStatus(passwordStatus, "Please fill both password fields", 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            showStatus(passwordStatus, "Password must be at least 6 characters", 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showStatus(passwordStatus, "Passwords do not match", 'error');
            return;
        }
        
        // Check password strength
        if (!checkPasswordStrength(newPassword)) {
            showStatus(passwordStatus, "Password is too weak. Try adding uppercase, numbers, or symbols.", 'error');
            return;
        }
        
        if (!oobCode) {
            showStatus(passwordStatus, "No verification code found. Please start over.", 'error');
            showStep('verifyStep');
            return;
        }
        
        updateButton.disabled = true;
        updateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        
        try {
            await resetPasswordWithCode(oobCode, newPassword);
            
            // Move to success step
            setTimeout(() => {
                showStep('successStep');
                updateButton.disabled = false;
                updateButton.innerHTML = '<i class="fas fa-save"></i> Update Password';
            }, 1500);
            
        } catch (error) {
            updateButton.disabled = false;
            updateButton.innerHTML = '<i class="fas fa-save"></i> Update Password';
        }
    });
}

// Real-time password strength checking
if (newPasswordInput) {
    newPasswordInput.addEventListener('input', () => {
        checkPasswordStrength(newPasswordInput.value);
    });
}

// Auto-enter on Enter key
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (verifyStep.style.display !== 'none') {
            verifyButton.click();
        } else if (passwordStep.style.display !== 'none') {
            updateButton.click();
        }
    }
});

// ==================== INITIALIZATION ====================

function initializeResetPage() {
    console.log("🔐 Initializing Password Reset Page");
    
    // Parse OOB code from URL
    const urlParams = parseOobCodeFromUrl();
    
    if (urlParams.mode === 'resetPassword' && urlParams.oobCode) {
        console.log("🔗 Firebase reset link detected");
        
        // Try to verify the code automatically
        setTimeout(async () => {
            try {
                const email = await verifyOobCode('', urlParams.oobCode);
                if (email && isEmailVerified) {
                    // Auto-fill email if we got it
                    if (email && email.includes('@')) {
                        resetEmailInput.value = email;
                    }
                    
                    // Move to password step
                    showStep('passwordStep');
                }
            } catch (error) {
                showStep('errorStep');
                errorMessage.textContent = error.message || "Invalid or expired reset link.";
            }
        }, 500);
    } else if (urlParams.mode === 'error') {
        // Show error state
        showStep('errorStep');
        errorMessage.textContent = "An error occurred. Please request a new reset link.";
    }
    
    // Check if there's a stored email in localStorage
    const storedEmail = localStorage.getItem('resetEmail');
    if (storedEmail && !resetEmailInput.value) {
        resetEmailInput.value = storedEmail;
    }
}

// ==================== MAIN APP INTEGRATION FUNCTIONS ====================

// Function to call from main app (script.js)
function sendPasswordResetEmail(email) {
    return new Promise(async (resolve, reject) => {
        try {
            // Save email to localStorage for the reset page
            localStorage.setItem('resetEmail', email);
            
            // Use Firebase's built-in reset email
            await auth.sendPasswordResetEmail(email, {
                url: `${window.location.origin}/reset_password.html`,
                handleCodeInApp: false
            });
            
            console.log("✅ Password reset email sent to:", email);
            resolve(true);
            
        } catch (error) {
            console.error("❌ Error sending reset email:", error);
            reject(error);
        }
    });
}

// Function to check reset status
function getResetStatus() {
    return {
        isEmailVerified,
        currentUser: currentUser ? currentUser.email : null,
        oobCode: oobCode ? '***' : null
    };
}

// ==================== EXPORT FUNCTIONS ====================

window.PasswordAuth = {
    sendResetEmail: sendPasswordResetEmail,
    getStatus: getResetStatus,
    initializeResetPage: initializeResetPage
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ Password Authentication System Ready");
    
    // Check if we're on the reset page
    if (window.location.pathname.includes('reset_password')) {
        initializeResetPage();
    }
});

// Auto-clean localStorage on success
window.addEventListener('beforeunload', () => {
    if (successStep && successStep.style.display !== 'none') {
        localStorage.removeItem('resetEmail');
    }
});

console.log("🚀 Password Authentication System Loaded");