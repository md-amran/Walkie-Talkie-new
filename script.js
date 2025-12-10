// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAIOBY18re2JDYY8br9OgGEnjBAyQAFsiU",
    authDomain: "my-walkie-talkie-app.firebaseapp.com",
    databaseURL: "https://my-walkie-talkie-app-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "my-walkie-talkie-app",
    storageBucket: "my-walkie-talkie-app.firebasestorage.app",
    messagingSenderId: "852251263438",
    appId: "1:852251263438:web:0393c53479f4cba535ab9f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const mainContainer = document.getElementById('mainContainer');
const loginModal = document.getElementById('loginModal');

// Authentication state
let currentUser = null;
let myId = null;
let authCheckCompleted = false;

// Connection state variables - GLOBAL
let peerConnection = null;
let localStream = null;
let dataChannel = null;
let currentFriendId = null;
let isConnected = false;
let isInitiator = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let isTalking = false;
let isListening = false;
let audioLevelInterval = null;
let keepAliveInterval = null;
let connectionMonitorInterval = null;
let lastActivityTime = Date.now();
let isPageHidden = false;

// ==================== GLOBAL STATUS FUNCTIONS ====================

// Update main status display (GLOBAL)
function updateStatus(type = "info", icon = "fas fa-signal", title = "Ready", details = "Waiting...") {
    try {
        const statusElement = document.getElementById('status');
        if (!statusElement) {
            console.warn("⚠️ Status element not found");
            return;
        }
        
        // Update status class
        statusElement.className = `status-message ${type}`;
        
        // Update icon
        const statusIcon = statusElement.querySelector('.status-icon i');
        if (statusIcon) {
            statusIcon.className = icon;
        }
        
        // Update title and details
        const statusTitle = document.getElementById('statusTitle');
        const statusDetails = document.getElementById('statusDetails');
        if (statusTitle) statusTitle.textContent = title;
        if (statusDetails) statusDetails.textContent = details;
        
        console.log(`✅ Status updated: ${title}`);
        
        // Update last activity time
        lastActivityTime = Date.now();
    } catch (error) {
        console.error("❌ Error updating status:", error);
    }
}

// Update audio status text (GLOBAL)
function updateAudioStatus(text = "Mic: Ready") {
    try {
        const audioStatus = document.getElementById('audioStatus');
        if (audioStatus) {
            audioStatus.textContent = text;
        }
    } catch (error) {
        console.error("❌ Error updating audio status:", error);
    }
}

// ==================== PAGE VISIBILITY MANAGEMENT ====================

// Handle page visibility changes
function handleVisibilityChange() {
    isPageHidden = document.hidden;
    
    if (document.hidden) {
        console.log("🔍 Page hidden (minimized/switched tab)");
        
        // Don't disconnect, just adjust resources
        if (localStream && isConnected) {
            console.log("📱 Page hidden - Reducing audio quality to save resources");
            
            // Adjust audio constraints for background
            if (localStream.getAudioTracks().length > 0) {
                const track = localStream.getAudioTracks()[0];
                
                // Apply constraints to reduce CPU usage in background
                track.applyConstraints({
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 1,
                    sampleRate: 16000,
                    sampleSize: 16
                }).then(() => {
                    console.log("✅ Audio constraints applied for background");
                }).catch(e => {
                    console.log("⚠️ Couldn't apply background constraints:", e);
                });
            }
        }
        
        // Update status to show app is still running
        if (isConnected) {
            updateStatus("info", "fas fa-moon", "Background Mode",
                       "App is running in background. Connection active.");
        }
        
    } else {
        console.log("🔍 Page visible again");
        
        // Restore full functionality
        if (localStream && isConnected) {
            console.log("📱 Page visible - Restoring audio quality");
            
            // Restore original audio constraints
            if (localStream.getAudioTracks().length > 0) {
                const track = localStream.getAudioTracks()[0];
                
                track.applyConstraints({
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 2,
                    sampleRate: 44100,
                    sampleSize: 16
                }).then(() => {
                    console.log("✅ Audio constraints restored");
                }).catch(e => {
                    console.log("⚠️ Couldn't restore audio constraints:", e);
                });
            }
            
            updateStatus("success", "fas fa-check-circle", "Connected!", "Hold to talk");
        }
        
        // Check connection health
        if (peerConnection && isConnected) {
            checkConnectionHealth();
        }
    }
}

// Start keep-alive mechanism
function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(() => {
        if (isConnected && peerConnection && dataChannel && dataChannel.readyState === 'open') {
            try {
                // Send keep-alive message
                dataChannel.send(JSON.stringify({
                    type: 'keep-alive',
                    timestamp: Date.now(),
                    sender: myId
                }));
                console.log("💓 Keep-alive sent");
            } catch (e) {
                console.log("⚠️ Couldn't send keep-alive:", e);
            }
        }
        
        // Check if connection is stale
        if (isConnected && Date.now() - lastActivityTime > 30000) {
            console.log("🕒 Connection appears stale, refreshing...");
            sendActivityPing();
        }
    }, 10000); // Send every 10 seconds
}

// Send activity ping
function sendActivityPing() {
    if (peerConnection && peerConnection.connectionState === 'connected') {
        lastActivityTime = Date.now();
        
        // Use data channel if available
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify({
                type: 'activity-ping',
                timestamp: Date.now()
            }));
        }
    }
}

// Check connection health
function checkConnectionHealth() {
    if (!peerConnection) return;
    
    const state = peerConnection.connectionState;
    const iceState = peerConnection.iceConnectionState;
    
    console.log(`🔍 Connection check: ${state}, ICE: ${iceState}`);
    
    if (state === 'connected' && iceState === 'connected') {
        // Connection is healthy
        return true;
    } else if (state === 'disconnected' || iceState === 'disconnected') {
        console.log("⚠️ Connection appears disconnected, attempting recovery...");
        attemptReconnection();
        return false;
    }
    
    return true;
}

// Attempt reconnection
function attemptReconnection() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log("❌ Max reconnection attempts reached");
        updateStatus("error", "fas fa-times-circle", "Connection Lost",
                   "Failed to reconnect after multiple attempts");
        return;
    }
    
    reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
    
    updateStatus("warning", "fas fa-sync-alt", "Reconnecting",
               `Attempt ${reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS}`);
    
    // Try to restore connection
    if (currentFriendId && localStream) {
        setTimeout(() => {
            if (!isConnected && currentFriendId) {
                console.log("Trying to restore connection...");
                restoreConnection();
            }
        }, 2000);
    }
}

// Restore connection
function restoreConnection() {
    if (!currentFriendId) return;
    
    console.log("🔄 Restoring connection to:", currentFriendId);
    
    // If we have an active peer connection, try to restart ICE
    if (peerConnection) {
        try {
            peerConnection.restartIce();
            console.log("✅ ICE restart initiated");
        } catch (e) {
            console.log("❌ Couldn't restart ICE:", e);
            // Fall back to re-creating connection
            reestablishConnection();
        }
    } else {
        reestablishConnection();
    }
}

// Re-establish connection
function reestablishConnection() {
    if (!currentFriendId) return;
    
    console.log("🔁 Re-establishing connection");
    
    // Clean up old connection
    safeCleanup();
    
    // Re-create connection
    if (isInitiator) {
        makeCall(currentFriendId);
    } else {
        // If we were the receiver, wait for new offer
        updateStatus("info", "fas fa-clock", "Waiting for Reconnect",
                   "Waiting for friend to call back...");
    }
}

// Safe cleanup that doesn't destroy everything
function safeCleanup() {
    console.log("🧹 Safe cleanup (preserving resources)");
    
    // Close peer connection gently
    if (peerConnection) {
        try {
            // Don't close, just remove event listeners
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.onicecandidate = null;
            peerConnection.ontrack = null;
            peerConnection.ondatachannel = null;
        } catch (e) {
            console.log("⚠️ Error cleaning peer connection:", e);
        }
        peerConnection = null;
    }
    
    // Close data channel
    if (dataChannel) {
        try {
            dataChannel.onopen = null;
            dataChannel.onclose = null;
            dataChannel.onmessage = null;
            dataChannel.onerror = null;
            if (dataChannel.readyState !== 'closed') {
                dataChannel.close();
            }
        } catch (e) {
            console.log("⚠️ Error cleaning data channel:", e);
        }
        dataChannel = null;
    }
    
    // Don't stop local stream - keep it for reconnection
    // Just mute it
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });
    }
    
    // Clear intervals
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    
    if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
        connectionMonitorInterval = null;
    }
    
    // Reset states but keep friend ID
    isConnected = false;
    isTalking = false;
    isListening = false;
    
    // UI updates
    const disconnectButton = document.getElementById('disconnectButton');
    if (disconnectButton) disconnectButton.style.display = 'none';
    
    const waveContainer = document.getElementById('waveContainer');
    if (waveContainer) waveContainer.style.display = 'none';
    
    // Reset talk button
    resetTalkButton();
}

// ==================== AUTHENTICATION SYSTEM ====================

// Check authentication state - FIXED
function checkAuth() {
    console.log("🔐 Checking authentication...");
    
    // Show auth overlay initially
    if (authOverlay) {
        authOverlay.style.display = 'flex';
    }
    
    // Hide other containers
    if (mainContainer) {
        mainContainer.style.display = 'none';
    }
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    
    // Set timeout to prevent infinite loading
    const authTimeout = setTimeout(() => {
        if (!authCheckCompleted) {
            console.warn("⚠️ Auth check timeout - showing login modal");
            showLoginModal();
            authCheckCompleted = true;
        }
    }, 3000); // 3 seconds timeout
    
    // Firebase auth state listener
    auth.onAuthStateChanged(async (user) => {
        clearTimeout(authTimeout);
        authCheckCompleted = true;
        
        // Hide auth overlay
        if (authOverlay) {
            authOverlay.style.display = 'none';
        }
        
        if (user) {
            // User is signed in
            console.log("✅ User authenticated:", user.email);
            currentUser = user;
            await initializeUser(user);
            showMainApp();
        } else {
            // No user is signed in
            console.log("❌ No user signed in");
            showLoginModal();
        }
    });
}

// Initialize user data
async function initializeUser(user) {
    console.log("✅ User authenticated:", user.uid);
    
    // Generate fixed user ID from UID
    myId = generateFixedUserId(user.uid);
    console.log("🎯 Your Fixed Walkie ID:", myId);
    
    // Update UI with user info
    updateUserUI(user);
    
    // Save user data to database
    await saveUserToDatabase(user);
}

// Generate fixed user ID from Firebase UID
function generateFixedUserId(uid) {
    // Use first 8 chars of UID + simple hash
    const shortUid = uid.substring(0, 8);
    const hash = simpleHash(uid);
    return `user_${shortUid}_${hash}`;
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 4);
}

// Update user UI elements
function updateUserUI(user) {
    // Update user name in menu
    const userNameElement = document.getElementById('userName');
    const userEmailElement = document.getElementById('userEmail');
    const userIdSmallElement = document.getElementById('userIdSmall');
    const idTextElement = document.getElementById('idText');
    
    if (userNameElement) {
        userNameElement.textContent = user.displayName || user.email.split('@')[0];
    }
    
    if (userEmailElement) {
        userEmailElement.textContent = user.email;
    }
    
    if (userIdSmallElement) {
        userIdSmallElement.textContent = `ID: ${myId}`;
    }
    
    if (idTextElement) {
        idTextElement.textContent = myId;
    }
    
    // Update user ID in the main display
    const myIdElement = document.getElementById('myId');
    if (myIdElement) {
        const idText = myIdElement.querySelector('.id-text');
        if (idText) {
            idText.textContent = myId;
        }
    }
}

// Save user to database
async function saveUserToDatabase(user) {
    try {
        await database.ref('users/' + user.uid).set({
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            walkieId: myId,
            lastSeen: Date.now(),
            online: true,
            status: 'available'
        });
        console.log("✅ User saved to database");
    } catch (error) {
        console.error("❌ Error saving user:", error);
    }
}

// Show main application
function showMainApp() {
    console.log("📱 Showing main application");
    
    if (mainContainer) {
        mainContainer.style.display = 'block';
    }
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    if (authOverlay) {
        authOverlay.style.display = 'none';
    }
    
    // Initialize the walkie talkie functionality
    initializeWalkieTalkie();
    
    // Start page visibility monitoring
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Start connection monitoring
    startConnectionMonitoring();
}

// Start connection monitoring
function startConnectionMonitoring() {
    if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
    }
    
    connectionMonitorInterval = setInterval(() => {
        if (isConnected) {
            checkConnectionHealth();
        }
    }, 15000); // Check every 15 seconds
}

// Show login modal
function showLoginModal() {
    console.log("🔓 Showing login modal");
    
    if (mainContainer) {
        mainContainer.style.display = 'none';
    }
    if (loginModal) {
        loginModal.style.display = 'flex';
    }
    if (authOverlay) {
        authOverlay.style.display = 'none';
    }
    
    // Reset forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (forgotPasswordForm) forgotPasswordForm.style.display = 'none';
}

// ==================== AUTHENTICATION EVENT LISTENERS ====================

// Login form elements
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');
const toggleLoginPassword = document.getElementById('toggleLoginPassword');

// Register form elements
const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const confirmPassword = document.getElementById('confirmPassword');
const registerButton = document.getElementById('registerButton');
const toggleRegisterPassword = document.getElementById('toggleRegisterPassword');

// Form navigation
const showRegisterLink = document.getElementById('showRegisterLink');
const showLoginLink = document.getElementById('showLoginLink');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const backToLoginLink = document.getElementById('backToLoginLink');

// Form containers
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');

// Status elements
const authLoading = document.getElementById('authLoading');
const authStatus = document.getElementById('authStatus');

// Password toggle functionality
if (toggleLoginPassword) {
    toggleLoginPassword.addEventListener('click', function() {
        const passwordInput = loginPassword;
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });
}
if (toggleRegisterPassword) {
    toggleRegisterPassword.addEventListener('click', function() {
        const passwordInput = registerPassword;
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });
}

// Show/hide forms
if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        forgotPasswordForm.style.display = 'none';
        clearAuthStatus();
    });
}
if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        forgotPasswordForm.style.display = 'none';
        clearAuthStatus();
    });
}
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'none';
        forgotPasswordForm.style.display = 'block';
        clearAuthStatus();
    });
}
if (backToLoginLink) {
    backToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordForm.style.display = 'none';
        loginForm.style.display = 'block';
        clearAuthStatus();
    });
}

// Show/hide loading
function showAuthLoading(show) {
    if (authLoading) {
        authLoading.style.display = show ? 'block' : 'none';
    }
}

// Show auth status message
function showAuthStatus(message, type = 'error') {
    if (authStatus) {
        authStatus.textContent = message;
        authStatus.className = `auth-status ${type}`;
        authStatus.style.display = 'block';
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            authStatus.style.display = 'none';
        }, 5000);
    }
}
function clearAuthStatus() {
    if (authStatus) {
        authStatus.style.display = 'none';
    }
}

// Login functionality
if (loginButton) {
    loginButton.addEventListener('click', async () => {
        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();
        const rememberMe = document.getElementById('rememberMe')?.checked || false;
        
        if (!email || !password) {
            showAuthStatus('Please enter both email and password', 'error');
            return;
        }
        
        showAuthLoading(true);
        
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            console.log("✅ Login successful");
            
            // Save remember me preference
            if (rememberMe) {
                localStorage.setItem('rememberMe', 'true');
                localStorage.setItem('userEmail', email);
            } else {
                localStorage.removeItem('rememberMe');
                localStorage.removeItem('userEmail');
            }
            
            // Clear forms
            loginEmail.value = '';
            loginPassword.value = '';
            
        } catch (error) {
            console.error("❌ Login error:", error);
            
            let errorMessage = "Login failed. Please try again.";
            switch(error.code) {
                case 'auth/user-not-found':
                    errorMessage = "No account found with this email.";
                    break;
                case 'auth/wrong-password':
                    errorMessage = "Incorrect password.";
                    break;
                case 'auth/invalid-email':
                    errorMessage = "Invalid email address.";
                    break;
                case 'auth/user-disabled':
                    errorMessage = "This account has been disabled.";
                    break;
                case 'auth/too-many-requests':
                    errorMessage = "Too many failed attempts. Please try again later.";
                    break;
            }
            
            showAuthStatus(errorMessage, 'error');
        } finally {
            showAuthLoading(false);
        }
    });
}

// Register functionality
if (registerButton) {
    registerButton.addEventListener('click', async () => {
        const name = registerName.value.trim();
        const email = registerEmail.value.trim();
        const password = registerPassword.value.trim();
        const confirm = confirmPassword.value.trim();
        
        // Validation
        if (!name || !email || !password || !confirm) {
            showAuthStatus('Please fill all fields', 'error');
            return;
        }
        
        if (password.length < 6) {
            showAuthStatus('Password must be at least 6 characters', 'error');
            return;
        }
        
        if (password !== confirm) {
            showAuthStatus('Passwords do not match', 'error');
            return;
        }
        
        showAuthLoading(true);
        
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Update display name
            await user.updateProfile({
                displayName: name
            });
            
            console.log("✅ Registration successful");
            showAuthStatus('Account created successfully!', 'success');
            
            // Auto clear forms
            registerName.value = '';
            registerEmail.value = '';
            registerPassword.value = '';
            confirmPassword.value = '';
            
        } catch (error) {
            console.error("❌ Registration error:", error);
            
            let errorMessage = "Registration failed. Please try again.";
            switch(error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = "Email already registered. Please login.";
                    break;
                case 'auth/invalid-email':
                    errorMessage = "Invalid email address.";
                    break;
                case 'auth/weak-password':
                    errorMessage = "Password is too weak. Use at least 6 characters.";
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = "Registration is temporarily disabled.";
                    break;
            }
            
            showAuthStatus(errorMessage, 'error');
        } finally {
            showAuthLoading(false);
        }
    });
}

// Forgot password functionality
const resetPasswordButton = document.getElementById('resetPasswordButton');
if (resetPasswordButton) {
    resetPasswordButton.addEventListener('click', async () => {
        const email = document.getElementById('resetEmail').value.trim();
        
        if (!email) {
            showAuthStatus('Please enter your email address', 'error');
            return;
        }
        
        showAuthLoading(true);
        
        try {
            await auth.sendPasswordResetEmail(email);
            showAuthStatus('Password reset email sent. Check your inbox.', 'success');
            document.getElementById('resetEmail').value = '';
        } catch (error) {
            console.error("❌ Password reset error:", error);
            showAuthStatus('Error sending reset email. Please try again.', 'error');
        } finally {
            showAuthLoading(false);
        }
    });
}

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            // Clean up walkie talkie connections first
            if (typeof fullCleanup === 'function') {
                fullCleanup();
            }
            
            // Sign out from Firebase
            await auth.signOut();
            
            // Clear local data
            currentUser = null;
            myId = null;
            
            // Show login modal
            showLoginModal();
            
            console.log("✅ Logout successful");
        } catch (error) {
            console.error("❌ Logout error:", error);
        }
    });
}

// User menu toggle
const userMenuBtn = document.getElementById('userMenuBtn');
if (userMenuBtn) {
    userMenuBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('userDropdown');
        const menuBtn = document.getElementById('userMenuBtn');
        
        if (dropdown && menuBtn &&
            !dropdown.contains(event.target) &&
            !menuBtn.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });
}

// ==================== WALKIE TALKIE FUNCTIONALITY ====================

function initializeWalkieTalkie() {
    // Only initialize if user is authenticated
    if (!currentUser || !myId) {
        console.error("❌ Cannot initialize walkie talkie: User not authenticated");
        return;
    }
    
    console.log("🚀 Initializing Walkie Talkie for user:", myId);
    
    // Initialize status using GLOBAL function
    updateStatus("info", "fas fa-signal", "Ready to Connect",
                `You are logged in as ${currentUser.email}`);
    
    // Initialize WebRTC elements
    initWalkieElements();
    
    // Start database connection monitoring
    startDatabaseMonitoring();
}

function initWalkieElements() {
    // Get elements
    const myIdElement = document.getElementById('myId');
    const friendIdInput = document.getElementById('friendId');
    const syncButton = document.getElementById('syncButton');
    const talkButton = document.getElementById('talkButton');
    const remoteAudio = document.getElementById('remoteAudio');
    const disconnectButton = document.getElementById('disconnectButton');
    const waveContainer = document.getElementById('waveContainer');
    
    // Audio control buttons
    const muteButton = document.getElementById('muteButton');
    const volumeUpButton = document.getElementById('volumeUp');
    const volumeDownButton = document.getElementById('volumeDown');
    
    // Reset talk button function
    window.resetTalkButton = function() {
        if (talkButton) {
            talkButton.classList.remove('talking');
            talkButton.classList.remove('listening');
            
            const talkText = talkButton.querySelector('.talk-text');
            if (talkText) {
                talkText.textContent = 'Hold to Talk';
            }
            
            updateAudioStatus("Mic: Ready");
            isTalking = false;
            isListening = false;
        }
    };
    
    // ==================== AUDIO CONTROLS ====================
    
    // Mute/Unmute remote audio
    if (muteButton) {
        muteButton.addEventListener('click', () => {
            if (!remoteAudio) return;
            
            remoteAudio.muted = !remoteAudio.muted;
            const icon = muteButton.querySelector('.control-icon i');
            const textSpan = muteButton.querySelector('.button-text');
            
            if (remoteAudio.muted) {
                icon.className = 'fas fa-volume-mute';
                if (textSpan) textSpan.textContent = 'Unmute';
                console.log("🔇 Remote audio muted");
                updateStatus("info", "fas fa-volume-mute", "Audio Muted",
                           "You won't hear your friend. Click again to unmute.");
            } else {
                icon.className = 'fas fa-volume-up';
                if (textSpan) textSpan.textContent = 'Mute';
                console.log("🔊 Remote audio unmuted");
                updateStatus("success", "fas fa-volume-up", "Audio Unmuted",
                           "You can hear your friend now.");
            }
        });
    }
    
    // Volume controls
    if (volumeUpButton) {
        volumeUpButton.addEventListener('click', () => {
            if (remoteAudio) {
                remoteAudio.volume = Math.min(1.0, remoteAudio.volume + 0.1);
                updateAudioStatus(`Volume: ${Math.round(remoteAudio.volume * 100)}%`);
            }
        });
    }
    
    if (volumeDownButton) {
        volumeDownButton.addEventListener('click', () => {
            if (remoteAudio) {
                remoteAudio.volume = Math.max(0.0, remoteAudio.volume - 0.1);
                updateAudioStatus(`Volume: ${Math.round(remoteAudio.volume * 100)}%`);
            }
        });
    }
    
    // ==================== WEBRTC CONNECTION ====================
    
    // Listen for incoming calls
    database.ref('offers').on('child_added', async (snapshot) => {
        const offerData = snapshot.val();
        
        if (offerData.to === myId && offerData.from !== myId && !peerConnection) {
            console.log("📞 Incoming call from:", offerData.from);
            
            // Check if we're already connected
            if (isConnected) {
                console.log("Already connected, ignoring new call");
                snapshot.ref.remove();
                return;
            }
            
            if (confirm(`${offerData.from} is calling. Answer?`)) {
                snapshot.ref.remove();
                currentFriendId = offerData.from;
                isInitiator = false;
                
                updateStatus("info", "fas fa-phone-alt", "Incoming Call", "Answering call...");
                await answerCall(offerData);
            } else {
                snapshot.ref.remove();
            }
        }
    });
    
    // Answer incoming call
    async function answerCall(offerData) {
        try {
            updateStatus("info", "fas fa-phone-alt", "Answering Call", "Setting up connection...");
            
            // Cleanup existing connection
            safeCleanup();
            
            // Get microphone with background-friendly constraints
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 2,
                    sampleRate: 44100,
                    sampleSize: 16,
                    // Add these for better background handling
                    latency: 0.01,
                    sampleSize: 16
                }
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log("🎤 Microphone acquired");
            updateAudioStatus("Mic: Active");
            
            // Setup audio level monitoring
            setupAudioLevelMonitoring();
            
            // Create peer connection with robust configuration
            const config = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceCandidatePoolSize: 10
            };
            
            peerConnection = new RTCPeerConnection(config);
            
            // Add connection state handlers
            peerConnection.onconnectionstatechange = () => {
                console.log("🔄 Connection state:", peerConnection.connectionState);
                
                switch(peerConnection.connectionState) {
                    case 'connected':
                        updateStatus("success", "fas fa-check-circle", "Connected!", "Hold to talk");
                        isConnected = true;
                        reconnectAttempts = 0;
                        
                        // Start keep-alive
                        startKeepAlive();
                        
                        // Reset button state
                        resetTalkButton();
                        break;
                        
                    case 'disconnected':
                        console.log("⚠️ Connection disconnected");
                        
                        if (!document.hidden) {
                            updateStatus("warning", "fas fa-exclamation-triangle", "Connection Weak",
                                       "Trying to stabilize connection...");
                        }
                        
                        // Don't cleanup immediately, wait for recovery
                        setTimeout(() => {
                            if (peerConnection && peerConnection.connectionState === 'disconnected') {
                                attemptReconnection();
                            }
                        }, 3000);
                        break;
                        
                    case 'failed':
                        console.log("❌ Connection failed");
                        if (!document.hidden) {
                            updateStatus("error", "fas fa-times-circle", "Connection Failed",
                                       "Please try reconnecting");
                        }
                        attemptReconnection();
                        break;
                        
                    case 'closed':
                        isConnected = false;
                        console.log("🔒 Connection closed");
                        break;
                }
            };
            
            // ICE connection state
            peerConnection.oniceconnectionstatechange = () => {
                console.log("❄️ ICE state:", peerConnection.iceConnectionState);
                
                if (peerConnection.iceConnectionState === 'disconnected' && !document.hidden) {
                    console.log("ICE disconnected, attempting recovery");
                    // Try to restart ICE
                    setTimeout(() => {
                        if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
                            try {
                                peerConnection.restartIce();
                                console.log("✅ ICE restart initiated");
                            } catch (e) {
                                console.log("❌ Couldn't restart ICE:", e);
                            }
                        }
                    }, 2000);
                }
            };
            
            // Add local tracks
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                track.enabled = false; // Start muted
            });
            
            // Create data channel for keep-alive
            dataChannel = peerConnection.createDataChannel('walkie-talkie', {
                ordered: true,
                maxPacketLifeTime: 3000 // 3 seconds
            });
            
            setupDataChannel();
            
            // Handle remote stream
            peerConnection.ontrack = (event) => {
                console.log("🎧 Remote audio track received");
                
                if (event.streams && event.streams[0]) {
                    remoteAudio.srcObject = event.streams[0];
                    
                    const playAudio = () => {
                        remoteAudio.play()
                            .then(() => {
                                console.log("✅ Audio playing successfully");
                                updateStatus("success", "fas fa-check-circle", "Connected!", "Hold to talk");
                                isConnected = true;
                                
                                if (disconnectButton) {
                                    disconnectButton.style.display = 'block';
                                    disconnectButton.innerHTML = `
                                        <span class="button-icon"><i class="fas fa-phone-slash"></i></span>
                                        <span class="button-text">End Call</span>
                                    `;
                                    disconnectButton.onclick = () => {
                                        fullCleanup();
                                        updateStatus("info", "fas fa-signal", "Disconnected", "Call ended");
                                    };
                                }
                                
                                // Set initial volume
                                remoteAudio.volume = 0.7;
                                updateAudioStatus(`Volume: ${Math.round(remoteAudio.volume * 100)}%`);
                                
                                // Start connection monitoring
                                startConnectionMonitoring();
                            })
                            .catch(e => {
                                console.log("Audio play requires interaction");
                                updateStatus("warning", "fas fa-exclamation-triangle", "Audio Blocked", "Click to enable audio");
                                document.addEventListener('click', playAudio, { once: true });
                            });
                    };
                    
                    playAudio();
                }
            };
            
            // ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    database.ref(`candidates/${myId}_${offerData.from}`).push({
                        candidate: event.candidate.toJSON(),
                        from: myId,
                        to: offerData.from,
                        timestamp: Date.now()
                    });
                }
            };
            
            // Listen for ICE candidates from caller
            database.ref(`candidates/${offerData.from}_${myId}`).on('child_added', async (snapshot) => {
                const candidateData = snapshot.val();
                if (candidateData && candidateData.from === offerData.from && peerConnection) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData.candidate));
                        console.log("✅ ICE candidate added");
                        snapshot.ref.remove();
                    } catch (error) {
                        console.error("ICE candidate error:", error);
                    }
                }
            });
            
            // Set remote offer
            await peerConnection.setRemoteDescription(new RTCSessionDescription({
                sdp: offerData.sdp,
                type: offerData.type
            }));
            
            console.log("✅ Remote description set");
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            await database.ref('answers').push({
                sdp: answer.sdp,
                type: answer.type,
                from: myId,
                to: offerData.from,
                timestamp: Date.now()
            });
            
            console.log("📤 Answer sent");
            updateStatus("info", "fas fa-sync-alt", "Connecting", "Establishing secure connection...");
            
        } catch (error) {
            console.error("❌ Error answering call:", error);
            updateStatus("error", "fas fa-times-circle", "Error", error.message);
            safeCleanup();
        }
    }
    
    // Setup data channel
    function setupDataChannel() {
        if (!dataChannel) return;
        
        dataChannel.onopen = () => {
            console.log("📡 Data channel opened");
        };
        
        dataChannel.onclose = () => {
            console.log("📡 Data channel closed");
        };
        
        dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'keep-alive') {
                    // Update last activity time
                    lastActivityTime = Date.now();
                    console.log("💓 Keep-alive received from:", message.sender);
                    
                    // Send response
                    if (dataChannel.readyState === 'open') {
                        dataChannel.send(JSON.stringify({
                            type: 'keep-alive-ack',
                            timestamp: Date.now(),
                            sender: myId
                        }));
                    }
                } else if (message.type === 'keep-alive-ack') {
                    lastActivityTime = Date.now();
                    console.log("💓 Keep-alive acknowledged");
                } else if (message.type === 'activity-ping') {
                    lastActivityTime = Date.now();
                }
            } catch (e) {
                console.log("⚠️ Error parsing data channel message:", e);
            }
        };
        
        dataChannel.onerror = (error) => {
            console.log("📡 Data channel error:", error);
        };
    }
    
    // Make call
    if (syncButton) {
        syncButton.addEventListener('click', async () => {
            const friendId = friendIdInput.value.trim();
            if (!friendId) {
                alert("Please enter your friend's ID");
                return;
            }
            
            if (friendId === myId) {
                alert("You cannot call yourself!");
                return;
            }
            
            if (friendId.length < 6) {
                alert("Please enter a valid friend ID");
                return;
            }
            
            currentFriendId = friendId;
            isInitiator = true;
            
            updateStatus("info", "fas fa-phone-alt", "Calling", "Initiating call...");
            await makeCall(friendId);
        });
    }
    
    // Make call function
    async function makeCall(friendId) {
        try {
            safeCleanup();
            
            console.log("📞 Calling:", friendId);
            
            // Get microphone with background-friendly constraints
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 2,
                    sampleRate: 44100,
                    sampleSize: 16,
                    latency: 0.01
                }
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log("🎤 Microphone ready");
            updateAudioStatus("Mic: Active");
            
            // Setup audio level monitoring
            setupAudioLevelMonitoring();
            
            // Create peer connection with robust configuration
            const config = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceCandidatePoolSize: 10
            };
            
            peerConnection = new RTCPeerConnection(config);
            
            // Add connection state handlers
            peerConnection.onconnectionstatechange = () => {
                console.log("🔄 Connection state:", peerConnection.connectionState);
                
                switch(peerConnection.connectionState) {
                    case 'connected':
                        updateStatus("success", "fas fa-check-circle", "Connected!", "Hold to talk");
                        isConnected = true;
                        reconnectAttempts = 0;
                        
                        // Start keep-alive
                        startKeepAlive();
                        break;
                        
                    case 'disconnected':
                        console.log("⚠️ Connection disconnected");
                        
                        if (!document.hidden) {
                            updateStatus("warning", "fas fa-exclamation-triangle", "Connection Weak",
                                       "Trying to stabilize connection...");
                        }
                        
                        // Don't cleanup immediately
                        setTimeout(() => {
                            if (peerConnection && peerConnection.connectionState === 'disconnected') {
                                attemptReconnection();
                            }
                        }, 3000);
                        break;
                        
                    case 'failed':
                        console.log("❌ Connection failed");
                        if (!document.hidden) {
                            updateStatus("error", "fas fa-times-circle", "Connection Failed",
                                       "Please try reconnecting");
                        }
                        attemptReconnection();
                        break;
                        
                    case 'closed':
                        isConnected = false;
                        console.log("🔒 Connection closed");
                        break;
                }
            };
            
            // ICE connection state
            peerConnection.oniceconnectionstatechange = () => {
                console.log("❄️ ICE state:", peerConnection.iceConnectionState);
                
                if (peerConnection.iceConnectionState === 'disconnected' && !document.hidden) {
                    console.log("ICE disconnected, attempting recovery");
                    setTimeout(() => {
                        if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
                            try {
                                peerConnection.restartIce();
                                console.log("✅ ICE restart initiated");
                            } catch (e) {
                                console.log("❌ Couldn't restart ICE:", e);
                            }
                        }
                    }, 2000);
                }
            };
            
            // Listen for data channel from remote
            peerConnection.ondatachannel = (event) => {
                dataChannel = event.channel;
                setupDataChannel();
            };
            
            // Add local tracks
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                track.enabled = false; // Start muted
            });
            
            // Create data channel
            dataChannel = peerConnection.createDataChannel('walkie-talkie', {
                ordered: true,
                maxPacketLifeTime: 3000
            });
            
            setupDataChannel();
            
            // Handle remote stream
            peerConnection.ontrack = (event) => {
                console.log("🎧 Remote audio received!");
                
                if (event.streams && event.streams[0]) {
                    remoteAudio.srcObject = event.streams[0];
                    
                    const playAudio = () => {
                        remoteAudio.play()
                            .then(() => {
                                console.log("✅ Audio playing");
                                updateStatus("success", "fas fa-check-circle", "Connected!", "Hold to talk");
                                isConnected = true;
                                
                                if (disconnectButton) {
                                    disconnectButton.style.display = 'block';
                                    disconnectButton.innerHTML = `
                                        <span class="button-icon"><i class="fas fa-phone-slash"></i></span>
                                        <span class="button-text">End Call</span>
                                    `;
                                    disconnectButton.onclick = () => {
                                        fullCleanup();
                                        updateStatus("info", "fas fa-signal", "Disconnected", "Call ended");
                                    };
                                }
                                
                                // Set initial volume
                                remoteAudio.volume = 0.7;
                                updateAudioStatus(`Volume: ${Math.round(remoteAudio.volume * 100)}%`);
                                
                                // Start connection monitoring
                                startConnectionMonitoring();
                            })
                            .catch(e => {
                                console.log("Audio blocked");
                                updateStatus("warning", "fas fa-exclamation-triangle", "Audio Blocked", "Click to enable audio");
                                document.addEventListener('click', playAudio, { once: true });
                            });
                    };
                    
                    playAudio();
                }
            };
            
            // ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    database.ref(`candidates/${myId}_${friendId}`).push({
                        candidate: event.candidate.toJSON(),
                        from: myId,
                        to: friendId,
                        timestamp: Date.now()
                    });
                }
            };
            
            // Listen for ICE candidates
            database.ref(`candidates/${friendId}_${myId}`).on('child_added', async (snapshot) => {
                const candidateData = snapshot.val();
                if (candidateData && candidateData.from === friendId && peerConnection) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData.candidate));
                        console.log("✅ ICE candidate added");
                        snapshot.ref.remove();
                    } catch (error) {
                        console.error("ICE candidate error:", error);
                    }
                }
            });
            
            // Listen for answer
            database.ref('answers').on('child_added', async (snapshot) => {
                const answerData = snapshot.val();
                if (answerData.to === myId && answerData.from === friendId && peerConnection) {
                    try {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(answerData));
                        console.log("✅ Answer received and set");
                        snapshot.ref.remove();
                    } catch (error) {
                        console.error("Answer error:", error);
                    }
                }
            });
            
            // Create offer
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                iceRestart: true
            });
            
            await peerConnection.setLocalDescription(offer);
            
            // Send offer
            await database.ref('offers').push({
                sdp: offer.sdp,
                type: offer.type,
                from: myId,
                to: friendId,
                timestamp: Date.now()
            });
            
            console.log("📤 Offer sent");
            updateStatus("info", "fas fa-clock", "Calling", "Waiting for answer...");
            
            // Timeout after 45 seconds (increased for background)
            setTimeout(() => {
                if (!isConnected) {
                    console.log("Call timeout");
                    updateStatus("error", "fas fa-times-circle", "No Answer", "Friend didn't answer the call");
                    safeCleanup();
                }
            }, 45000);
            
        } catch (error) {
            console.error("❌ Error making call:", error);
            updateStatus("error", "fas fa-times-circle", "Error", error.message);
            safeCleanup();
        }
    }
    
    // Setup audio level monitoring
    function setupAudioLevelMonitoring() {
        if (!localStream) return;
        
        // Clear existing interval
        if (audioLevelInterval) {
            clearInterval(audioLevelInterval);
        }
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(localStream);
        const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
        
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        
        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        let isProcessing = false;
        
        javascriptNode.onaudioprocess = () => {
            if (isProcessing) return;
            isProcessing = true;
            
            try {
                const array = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(array);
                
                let values = 0;
                const length = array.length;
                for (let i = 0; i < length; i++) {
                    values += array[i];
                }
                
                const average = values / length;
                const level = Math.min(100, Math.max(0, average * 0.5));
                
                // Update audio level bar
                const audioLevelFill = document.getElementById('audioLevel');
                if (audioLevelFill) {
                    audioLevelFill.style.width = `${level}%`;
                    
                    // Change color based on level
                    if (level > 70) {
                        audioLevelFill.style.background = 'linear-gradient(90deg, #ff0033, #ff9900)';
                    } else if (level > 30) {
                        audioLevelFill.style.background = 'linear-gradient(90deg, #ff9900, #00cc66)';
                    } else {
                        audioLevelFill.style.background = 'linear-gradient(90deg, #00cc66, #0066ff)';
                    }
                }
            } catch (e) {
                console.error("Audio level monitoring error:", e);
            } finally {
                isProcessing = false;
            }
        };
    }
    
    // ==================== DOUBLE TAP MIC TOGGLE FEATURE ====================
    // Add these variables at the top with your other global variables
    let isMicLockedByDoubleTap = false;
    let tapCount = 0;
    let tapTimer = null;
    // ==================== MODIFIED PUSH-TO-TALK WITH DOUBLE TAP ====================
    
    if (talkButton) {
        // When button is pressed (talking) - Only if not locked by double tap
        talkButton.addEventListener('mousedown', () => {
            if (isMicLockedByDoubleTap) return; // Ignore if mic is locked by double tap
            
            if (localStream && isConnected) {
                console.log("🎤 START talking");
                isTalking = true;
                isListening = false;
                
                // Enable microphone
                localStream.getAudioTracks().forEach(track => {
                    track.enabled = true;
                });
                
                // Change button to green (Talking mode)
                talkButton.classList.add('talking');
                talkButton.classList.remove('listening');
                
                // Update text to "Talking..."
                const talkText = talkButton.querySelector('.talk-text');
                if (talkText) {
                    talkText.textContent = 'Talking...';
                }
                
                // Show wave effect
                if (waveContainer) {
                    waveContainer.style.display = 'flex';
                }
                
                updateAudioStatus("Mic: Talking");
                
                // Update activity time
                lastActivityTime = Date.now();
            }
        });
        
        // When button is released (listening) - Only if not locked by double tap
        talkButton.addEventListener('mouseup', () => {
            if (isMicLockedByDoubleTap) return; // Ignore if mic is locked by double tap
            
            if (localStream && isConnected) {
                console.log("🔇 STOP talking, now Listening");
                isTalking = false;
                isListening = true;
                
                // Disable microphone
                localStream.getAudioTracks().forEach(track => {
                    track.enabled = false;
                });
                
                // Change button to blue (Listening mode)
                talkButton.classList.remove('talking');
                talkButton.classList.add('listening');
                
                // Update text to "Listening..."
                const talkText = talkButton.querySelector('.talk-text');
                if (talkText) {
                    talkText.textContent = 'Listening...';
                }
                
                // Hide wave effect
                if (waveContainer) {
                    waveContainer.style.display = 'none';
                }
                
                updateAudioStatus("Mic: Listening");
                
                // Update activity time
                lastActivityTime = Date.now();
                
                // Auto switch back to "Hold to Talk" after 3 seconds if not talking
                setTimeout(() => {
                    if (!isTalking && isListening) {
                        resetTalkButton();
                    }
                }, 3000);
            }
        });
        
        // Single click handler with double tap detection
        talkButton.addEventListener('click', (e) => {
            // Don't prevent default for single click
            if (!isTalking && isConnected && !isMicLockedByDoubleTap) {
                e.preventDefault();
                
                if (isListening) {
                    // If currently listening, switch back to ready
                    resetTalkButton();
                } else {
                    // If ready, switch to listening
                    isListening = true;
                    talkButton.classList.add('listening');
                    
                    const talkText = talkButton.querySelector('.talk-text');
                    if (talkText) {
                        talkText.textContent = 'Listening...';
                    }
                    
                    updateAudioStatus("Mic: Listening");
                    
                    // Update activity time
                    lastActivityTime = Date.now();
                    
                    // Auto switch back after 3 seconds
                    setTimeout(() => {
                        if (isListening && !isTalking) {
                            resetTalkButton();
                        }
                    }, 3000);
                }
            }
        });
        
        // ==================== DOUBLE TAP DETECTION ====================
        
        // Mouse double click detection
        let clickCount = 0;
        let clickTimeout;
        
        talkButton.addEventListener('click', handleDoubleTap);
        
        // Touch double tap detection for mobile
        let touchCount = 0;
        let touchTimeout;
        
        talkButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchCount++;
            
            if (touchCount === 1) {
                touchTimeout = setTimeout(() => {
                    // Single tap - reset
                    touchCount = 0;
                    
                    // If mic is not locked, trigger regular touch events
                    if (!isMicLockedByDoubleTap) {
                        talkButton.dispatchEvent(new MouseEvent('mousedown'));
                    }
                }, 600);
            } else if (touchCount === 2) {
                clearTimeout(touchTimeout);
                touchCount = 0;
                
                // Double tap detected
                handleDoubleTap(e);
                
                // Don't trigger regular touch events for double tap
                e.stopPropagation();
            }
        });
        
        talkButton.addEventListener('touchend', (e) => {
            if (!isMicLockedByDoubleTap) {
                e.preventDefault();
                talkButton.dispatchEvent(new MouseEvent('mouseup'));
            }
        });
        
        talkButton.addEventListener('touchcancel', (e) => {
            if (!isMicLockedByDoubleTap) {
                e.preventDefault();
                talkButton.dispatchEvent(new MouseEvent('mouseup'));
            }
        });
        
        // ==================== DOUBLE TAP HANDLER FUNCTION ====================
        
        function handleDoubleTap(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Increment click count
            clickCount++;
            
            if (clickCount === 1) {
                // First click - start timer
                clickTimeout = setTimeout(() => {
                    // Single click - reset
                    clickCount = 0;
                    
                    // Don't do anything for single click if mic is locked
                    if (!isMicLockedByDoubleTap) {
                        // Let single click handler handle it
                        return;
                    }
                }, 600); // 300ms for double click detection
            } else if (clickCount === 2) {
                // Double click detected
                clearTimeout(clickTimeout);
                clickCount = 0;
                
                toggleMicrophoneLock();
            }
        }
        
        // ==================== TOGGLE MICROPHONE LOCK FUNCTION ====================
        
        function toggleMicrophoneLock() {
            if (isMicLockedByDoubleTap) {
                // Turn OFF microphone lock
                isMicLockedByDoubleTap = false;
                
                // Disable microphone
                if (localStream) {
                    localStream.getAudioTracks().forEach(track => {
                        track.enabled = false;
                    });
                }
                
                // Reset button appearance
                resetTalkButton();
                
                // Update status
                updateAudioStatus("Mic: Ready");
                updateStatus("info", "fas fa-microphone-slash", "Mic Unlocked",
                           "Double tap to lock mic ON. Hold to talk.");
                
                console.log("🔓 Microphone unlocked");
                
            } else {
                // Turn ON microphone lock
                isMicLockedByDoubleTap = true;
                
                // Enable microphone
                if (localStream) {
                    localStream.getAudioTracks().forEach(track => {
                        track.enabled = true;
                    });
                }
                
                // Update button appearance
                talkButton.classList.add('talking');
                talkButton.classList.remove('listening');
                
                const talkText = talkButton.querySelector('.talk-text');
                if (talkText) {
                    talkText.textContent = 'Mic ON (Locked)';
                }
                
                // Show wave effect
                if (waveContainer) {
                    waveContainer.style.display = 'flex';
                }
                
                // Update status
                updateAudioStatus("Mic: ON (Locked)");
                updateStatus("success", "fas fa-microphone", "Mic Locked ON",
                           "Microphone is always on. Double tap to turn off.");
                
                console.log("🔒 Microphone locked ON");
            }
        }
        
        // ==================== MODIFIED RESET TALK BUTTON FUNCTION ====================
        
        // Update your existing resetTalkButton function or add this
        window.resetTalkButton = function() {
            // Only reset if mic is not locked by double tap
            if (isMicLockedByDoubleTap) {
                return;
            }
            
            if (talkButton) {
                talkButton.classList.remove('talking');
                talkButton.classList.remove('listening');
                
                const talkText = talkButton.querySelector('.talk-text');
                if (talkText) {
                    talkText.textContent = 'Hold to Talk';
                }
                
                updateAudioStatus("Mic: Ready");
                isTalking = false;
                isListening = false;
                
                // Hide wave effect
                if (waveContainer) {
                    waveContainer.style.display = 'none';
                }
            }
        };
    }
    
    // ==================== FULL CLEANUP ====================
    
    window.fullCleanup = function() {
        console.log("🧹 Full cleanup (disconnecting)");
        
        // Close peer connection
        if (peerConnection) {
            try {
                peerConnection.close();
            } catch (e) {
                console.log("Peer connection close error:", e);
            }
            peerConnection = null;
        }
        
        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        // Close data channel
        if (dataChannel) {
            try {
                if (dataChannel.readyState !== 'closed') {
                    dataChannel.close();
                }
            } catch (e) {
                console.log("Data channel close error:", e);
            }
            dataChannel = null;
        }
        
        // Clear intervals
        if (audioLevelInterval) {
            clearInterval(audioLevelInterval);
            audioLevelInterval = null;
        }
        
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        
        if (connectionMonitorInterval) {
            clearInterval(connectionMonitorInterval);
            connectionMonitorInterval = null;
        }
        
        // Clean Firebase data
        if (currentFriendId) {
            database.ref(`candidates/${myId}_${currentFriendId}`).remove();
            database.ref(`candidates/${currentFriendId}_${myId}`).remove();
            database.ref('offers').orderByChild('from').equalTo(myId).once('value', snap => {
                snap.forEach(child => child.ref.remove());
            });
            database.ref('answers').orderByChild('from').equalTo(myId).once('value', snap => {
                snap.forEach(child => child.ref.remove());
            });
        }
        
        // Reset state
        isConnected = false;
        isTalking = false;
        isListening = false;
        currentFriendId = null;
        reconnectAttempts = 0;
        
        // Hide disconnect button
        if (disconnectButton) {
            disconnectButton.style.display = 'none';
        }
        
        // Hide wave effect
        if (waveContainer) {
            waveContainer.style.display = 'none';
        }
        
        // Reset talk button
        resetTalkButton();
        
        // Reset audio level bar
        const audioLevelFill = document.getElementById('audioLevel');
        if (audioLevelFill) {
            audioLevelFill.style.width = '0%';
        }
        
        updateAudioStatus("Mic: Ready");
        updateStatus("info", "fas fa-signal", "Disconnected", "Ready for new call");
    };
    
    // ==================== UTILITIES ====================
    
    // Copy ID to clipboard
    if (myIdElement) {
        myIdElement.addEventListener('click', () => {
            navigator.clipboard.writeText(myId).then(() => {
                const copyIcon = myIdElement.querySelector('.copy-icon i');
                if (copyIcon) {
                    const originalClass = copyIcon.className;
                    copyIcon.className = 'fas fa-check';
                    
                    setTimeout(() => {
                        copyIcon.className = originalClass;
                    }, 2000);
                }
            });
        });
    }
    
    // Page cleanup
    window.addEventListener('beforeunload', () => {
        fullCleanup();
        
        // Update user offline status
        if (currentUser) {
            database.ref('users/' + currentUser.uid).update({
                online: false,
                lastSeen: Date.now()
            });
        }
    });
}

// Start database monitoring
function startDatabaseMonitoring() {
    database.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {
            console.log("✅ Firebase connected");
            
            // Update user status in database
            if (currentUser && myId) {
                database.ref('users/' + currentUser.uid).update({
                    online: true,
                    lastSeen: Date.now(),
                    walkieId: myId
                }).catch(e => console.log("User update error:", e));
            }
        }
    });
}

// ==================== INITIALIZATION ====================

// Start the application with error handling
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Walkie Talkie v2.0 - Starting...");
    
    // Initial hide everything
    if (authOverlay) authOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'none';
    if (loginModal) loginModal.style.display = 'none';
    
    // Start auth check after a short delay
    setTimeout(() => {
        try {
            checkAuth();
        } catch (error) {
            console.error("🔥 Critical auth error:", error);
            // Emergency fallback - show login directly
            if (authOverlay) authOverlay.style.display = 'none';
            if (loginModal) loginModal.style.display = 'flex';
        }
    }, 100);
});

// Emergency timeout - if everything else fails
setTimeout(() => {
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay && authOverlay.style.display === 'flex') {
        console.log("🚨 EMERGENCY: Auth overlay stuck, forcing login");
        authOverlay.style.display = 'none';
        
        // Force show login
        const loginModal = document.getElementById('loginModal');
        const mainContainer = document.getElementById('mainContainer');
        
        if (loginModal) loginModal.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';
    }
}, 7000);