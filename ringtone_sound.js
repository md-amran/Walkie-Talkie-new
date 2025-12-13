// ringtone_sound.js - Complete Audio & Vibration System

console.log("🔊 Ringtone Sound System Loading...");

// ==================== AUDIO SYSTEM ====================

// Global variables
let ringtoneAudio, notificationAudio, connectedAudio;
let isAudioInitialized = false;
let isVibrationSupported = false;

// Initialize audio system
function initAudioSystem() {
    try {
        // Get audio elements
        ringtoneAudio = document.getElementById('ringtoneAudio');
        notificationAudio = document.getElementById('notificationAudio');
        connectedAudio = document.getElementById('connectedAudio');
        
        // Check if audio elements exist
        if (!ringtoneAudio || !notificationAudio) {
            console.warn("⚠️ Audio elements not found in DOM");
            return false;
        }
        
        // Configure audio
        if (ringtoneAudio) {
            ringtoneAudio.volume = 0.6; // 60% volume
            ringtoneAudio.loop = true; // লুপ হবে
            console.log("✅ Ringtone audio configured");
        }
        
        if (notificationAudio) {
            notificationAudio.volume = 0.4; // 40% volume
            console.log("✅ Notification audio configured");
        }
        
        if (connectedAudio) {
            connectedAudio.volume = 0.5; // 50% volume
            console.log("✅ Connected audio configured");
        }
        
        // Check vibration support
        isVibrationSupported = 'vibrate' in navigator;
        console.log(`📳 Vibration support: ${isVibrationSupported}`);
        
        isAudioInitialized = true;
        console.log("✅ Audio system initialized successfully");
        return true;
        
    } catch (error) {
        console.error("❌ Audio system initialization failed:", error);
        return false;
    }
}

// ==================== RINGTONE FUNCTIONS ====================

// Play ringtone for incoming call
function playRingtone() {
    if (!isAudioInitialized || !ringtoneAudio) {
        console.warn("⚠️ Audio not initialized, cannot play ringtone");
        return false;
    }
    
    try {
        // Stop if already playing
        if (!ringtoneAudio.paused) {
            ringtoneAudio.pause();
            ringtoneAudio.currentTime = 0;
        }
        
        // Start vibration (mobile)
        startCallVibration();
        
        // Play audio
        const playPromise = ringtoneAudio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log("🔔 Ringtone started");
                })
                .catch(error => {
                    console.log("🔕 Ringtone play blocked, user interaction required:", error);
                    // ভিজুয়াল নোটিফিকেশন দেখাও
                    showVisualAlert("🔔 Call Waiting! (Click to enable sound)");
                });
        }
        
        return true;
        
    } catch (error) {
        console.error("❌ Ringtone play error:", error);
        return false;
    }
}

// Stop ringtone
function stopRingtone() {
    if (!isAudioInitialized || !ringtoneAudio) return;
    
    try {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime = 0;
        console.log("🔕 Ringtone stopped");
        
        // Stop vibration
        stopVibration();
        
    } catch (error) {
        console.error("❌ Stop ringtone error:", error);
    }
}

// ==================== NOTIFICATION SOUNDS ====================

// Play notification sound
function playNotification(type = "message") {
    if (!isAudioInitialized || !notificationAudio) return false;
    
    try {
        // Use appropriate sound based on type
        let audioToPlay = notificationAudio;
        
        if (type === "connected" && connectedAudio) {
            audioToPlay = connectedAudio;
        }
        
        // Reset and play
        audioToPlay.currentTime = 0;
        const playPromise = audioToPlay.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log(`🔔 ${type} notification sound played`);
                })
                .catch(error => {
                    console.log(`Notification sound (${type}) blocked:`, error);
                });
        }
        
        // Short vibration for notification
        vibrate([100]);
        
        return true;
        
    } catch (error) {
        console.error("❌ Notification error:", error);
        return false;
    }
}

// Play call connected sound
function playConnectedSound() {
    return playNotification("connected");
}

// Play call ended sound (short beep)
function playCallEndedSound() {
    try {
        // Create a simple beep using Web Audio API (no file needed)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
        
        console.log("📴 Call ended beep played");
        
    } catch (error) {
        console.error("Beep error:", error);
    }
}

// ==================== VIBRATION SYSTEM ====================

// Vibrate with pattern
function vibrate(pattern = [200]) {
    if (!isVibrationSupported) return false;
    
    try {
        navigator.vibrate(pattern);
        return true;
    } catch (error) {
        console.error("Vibration error:", error);
        return false;
    }
}

// Special vibration for incoming call
function startCallVibration() {
    if (!isVibrationSupported) return;
    
    // Pattern: vibrate for 1s, pause for 0.5s, vibrate for 1s
    const callPattern = [1000, 500, 1000];
    vibrate(callPattern);
    
    // Continue pattern until stopped
    window.vibrationInterval = setInterval(() => {
        if (isVibrationSupported) {
            navigator.vibrate(callPattern);
        }
    }, 2500); // Pattern duration + gap
}

// Stop vibration
function stopVibration() {
    if (!isVibrationSupported) return;
    
    try {
        navigator.vibrate(0); // Stop vibration
        
        // Clear interval if exists
        if (window.vibrationInterval) {
            clearInterval(window.vibrationInterval);
            window.vibrationInterval = null;
        }
        
        console.log("📳 Vibration stopped");
    } catch (error) {
        console.error("Stop vibration error:", error);
    }
}

// ==================== VISUAL FEEDBACK ====================

// Show visual alert when audio is blocked
function showVisualAlert(message) {
    try {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = 'audio-blocked-alert';
        alertDiv.innerHTML = `
            <div class="alert-content">
                <i class="fas fa-volume-mute"></i>
                <span>${message}</span>
                <button class="alert-close"><i class="fas fa-times"></i></button>
            </div>
        `;
        
        // Add styles
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #99001f, #660014);
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
            z-index: 9998;
            max-width: 300px;
            animation: slideInRight 0.3s ease;
            font-size: 14px;
        `;
        
        alertDiv.querySelector('.alert-content').style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        
        alertDiv.querySelector('.alert-close').style.cssText = `
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            margin-left: auto;
            opacity: 0.8;
            transition: opacity 0.3s;
        `;
        
        // Add to page
        document.body.appendChild(alertDiv);
        
        // Close button event
        alertDiv.querySelector('.alert-close').addEventListener('click', () => {
            alertDiv.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => alertDiv.remove(), 300);
        });
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => alertDiv.remove(), 300);
            }
        }, 5000);
        
        // Add animation styles if not exists
        if (!document.querySelector('#alert-animations')) {
            const style = document.createElement('style');
            style.id = 'alert-animations';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
    } catch (error) {
        console.error("Visual alert error:", error);
    }
}

// ringtone_sound.js - Incoming Call Modal Update

// ... আগের সব কোড থাকবে ...

// ==================== INCOMING CALL UI ====================

// Create incoming call notification UI with caller name
function showIncomingCallUI(callerId, callerName = null, onAccept, onReject) {
    // Remove existing notification if any
    const existing = document.getElementById('incomingCallModal');
    if (existing) existing.remove();
    
    // Use caller name if available, otherwise use ID
    const displayName = callerName || callerId;
    
    // Create modal HTML - MORE COMPACT VERSION
    const modalHTML = `
        <div id="incomingCallModal" class="incoming-call-modal">
            <div class="call-modal-content">
                <div class="call-modal-header">
                    <div class="ringing-icon">
                        <i class="fas fa-phone-volume"></i>
                    </div>
                    <h3>Incoming Call</h3>
                </div>
                
                <div class="call-modal-body">
                    <div class="caller-display">
                        <div class="caller-avatar">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="caller-info">
                            <div class="caller-name" title="${callerId}">${displayName}</div>
                            <div class="caller-status">is calling you...</div>
                        </div>
                    </div>
                    
                    <div class="call-actions-compact">
                        <button class="action-btn-compact reject-call-compact" id="rejectCallBtn" title="Decline call">
                            <span class="action-icon-compact">
                                <i class="fas fa-times"></i>
                            </span>
                            <span class="action-text-compact">Decline</span>
                        </button>
                        
                        <button class="action-btn-compact accept-call-compact" id="acceptCallBtn" title="Answer call">
                            <span class="action-icon-compact">
                                <i class="fas fa-phone"></i>
                            </span>
                            <span class="action-text-compact">Answer</span>
                        </button>
                    </div>
                </div>
                
                <div class="call-modal-footer-compact">
                    <p class="call-hint-compact">Tap to answer or decline</p>
                </div>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listeners
    document.getElementById('acceptCallBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        hideIncomingCallUI();
        if (typeof onAccept === 'function') onAccept();
    });
    
    document.getElementById('rejectCallBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        hideIncomingCallUI();
        if (typeof onReject === 'function') onReject();
    });
    
    // Close modal when clicking outside
    document.getElementById('incomingCallModal').addEventListener('click', (e) => {
        if (e.target.id === 'incomingCallModal') {
            hideIncomingCallUI();
            if (typeof onReject === 'function') onReject();
        }
    });
    
    // Add styles if not already present
    addCompactModalStyles();
}

// Hide incoming call UI
function hideIncomingCallUI() {
    const modal = document.getElementById('incomingCallModal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transform = 'scale(0.95)';
        setTimeout(() => modal.remove(), 200);
    }
}

// Add COMPACT styles for incoming call UI
function addCompactModalStyles() {
    if (document.querySelector('#compactModalStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'compactModalStyles';
    style.textContent = `
        /* COMPACT INCOMING CALL MODAL */
        .incoming-call-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.92);
            backdrop-filter: blur(15px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            animation: fadeIn 0.25s ease;
            padding: 15px;
        }
        
        .call-modal-content {
            background: linear-gradient(145deg, #1a0a0a, #0a0505);
            border-radius: 20px;
            padding: 25px 20px;
            width: 100%;
            max-width: 300px;
            border: 1.5px solid rgba(255, 0, 51, 0.4);
            box-shadow: 
                0 15px 40px rgba(255, 0, 51, 0.25),
                0 0 80px rgba(255, 0, 51, 0.15),
                inset 0 1px 0 rgba(255, 255, 255, 0.05);
            text-align: center;
            animation: modalSlideUp 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        
        .call-modal-header {
            margin-bottom: 20px;
        }
        
        .ringing-icon {
            font-size: 3em;
            color: var(--amoled-red);
            margin-bottom: 10px;
            animation: ringPulse 1.5s infinite;
        }
        
        .call-modal-header h3 {
            color: var(--text-primary);
            font-size: 1.4em;
            margin: 0;
            font-weight: 600;
        }
        
        .caller-display {
            background: rgba(255, 0, 51, 0.08);
            padding: 15px;
            border-radius: 15px;
            margin-bottom: 20px;
            border: 1px solid rgba(255, 0, 51, 0.15);
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .caller-avatar {
            width: 50px;
            height: 50px;
            background: rgba(255, 0, 51, 0.15);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .caller-avatar i {
            font-size: 1.8em;
            color: var(--amoled-red);
        }
        
        .caller-info {
            text-align: left;
            flex: 1;
            overflow: hidden;
        }
        
        .caller-name {
            color: var(--text-primary);
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .caller-status {
            color: var(--text-secondary);
            font-size: 0.85em;
            opacity: 0.9;
        }
        
        /* COMPACT BUTTONS */
        .call-actions-compact {
            display: flex;
            gap: 12px;
            margin-bottom: 15px;
            justify-content: center;
        }
        
        .action-btn-compact {
            padding: 14px 20px;
            border: none;
            border-radius: 12px;
            font-size: 0.95em;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s ease;
            min-width: 100px;
            flex: 1;
            max-width: 120px;
        }
        
        .accept-call-compact {
            background: linear-gradient(135deg, #00cc66, #009944);
            color: white;
        }
        
        .accept-call-compact:hover {
            background: linear-gradient(135deg, #00dd77, #00aa55);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 204, 102, 0.3);
        }
        
        .accept-call-compact:active {
            transform: translateY(0);
        }
        
        .reject-call-compact {
            background: linear-gradient(135deg, #ff0033, #cc0029);
            color: white;
        }
        
        .reject-call-compact:hover {
            background: linear-gradient(135deg, #ff3355, #ff0033);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(255, 0, 51, 0.3);
        }
        
        .reject-call-compact:active {
            transform: translateY(0);
        }
        
        .action-icon-compact {
            font-size: 1.3em;
        }
        
        .action-text-compact {
            font-size: 0.9em;
            font-weight: 500;
        }
        
        /* COMPACT FOOTER */
        .call-modal-footer-compact {
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding-top: 12px;
        }
        
        .call-hint-compact {
            color: var(--text-muted);
            font-size: 0.8em;
            margin: 0;
            opacity: 0.8;
        }
        
        /* ANIMATIONS */
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes modalSlideUp {
            from { 
                transform: translateY(20px) scale(0.97); 
                opacity: 0; 
            }
            to { 
                transform: translateY(0) scale(1); 
                opacity: 1; 
            }
        }
        
        @keyframes ringPulse {
            0%, 100% { 
                transform: scale(1); 
                text-shadow: 0 0 15px rgba(255, 0, 51, 0.5);
            }
            50% { 
                transform: scale(1.1); 
                text-shadow: 0 0 25px rgba(255, 0, 51, 0.8);
            }
        }
        
        /* MOBILE RESPONSIVE */
        @media (max-width: 480px) {
            .incoming-call-modal {
                padding: 10px;
            }
            
            .call-modal-content {
                max-width: 280px;
                padding: 20px 15px;
                border-radius: 18px;
            }
            
            .ringing-icon {
                font-size: 2.5em;
            }
            
            .call-modal-header h3 {
                font-size: 1.3em;
            }
            
            .caller-display {
                padding: 12px;
                gap: 12px;
                margin-bottom: 18px;
            }
            
            .caller-avatar {
                width: 45px;
                height: 45px;
            }
            
            .caller-avatar i {
                font-size: 1.6em;
            }
            
            .caller-name {
                font-size: 1em;
            }
            
            .caller-status {
                font-size: 0.8em;
            }
            
            .call-actions-compact {
                gap: 10px;
                margin-bottom: 12px;
            }
            
            .action-btn-compact {
                padding: 12px 15px;
                min-width: 90px;
                max-width: 110px;
                border-radius: 10px;
            }
            
            .action-icon-compact {
                font-size: 1.2em;
            }
            
            .action-text-compact {
                font-size: 0.85em;
            }
            
            .call-modal-footer-compact {
                padding-top: 10px;
            }
            
            .call-hint-compact {
                font-size: 0.75em;
            }
        }
        
        /* VERY SMALL PHONES */
        @media (max-width: 360px) {
            .call-modal-content {
                max-width: 260px;
                padding: 18px 12px;
            }
            
            .action-btn-compact {
                min-width: 80px;
                max-width: 100px;
                padding: 10px 12px;
            }
            
            .call-actions-compact {
                gap: 8px;
            }
        }
    `;
    
    document.head.appendChild(style);
}

// Function to get caller name from Firebase
async function getCallerName(callerId) {
    try {
        // Try to get user info from Firebase
        const usersRef = database.ref('users');
        const snapshot = await usersRef.orderByChild('walkieId').equalTo(callerId).once('value');
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            const userId = Object.keys(userData)[0];
            return userData[userId].displayName || userData[userId].email.split('@')[0];
        }
        
        // If not found in database, extract name from email if callerId is email-like
        if (callerId.includes('@')) {
            return callerId.split('@')[0];
        }
        
        // Return the ID itself as fallback
        return callerId;
        
    } catch (error) {
        console.error("Error getting caller name:", error);
        return callerId;
    }
}

// Update the AudioSystem API
window.AudioSystem = {
    init: initAudioSystem,
    playRingtone: playRingtone,
    stopRingtone: stopRingtone,
    playNotification: playNotification,
    playConnectedSound: playConnectedSound,
    playCallEndedSound: playCallEndedSound,
    vibrate: vibrate,
    showIncomingCallUI: showIncomingCallUI,
    hideIncomingCallUI: hideIncomingCallUI,
    getCallerName: getCallerName, // NEW FUNCTION
    isInitialized: () => isAudioInitialized,
    isVibrationSupported: () => isVibrationSupported
};

// ... বাকি কোড ...

console.log("✅ Ringtone Sound System Loaded Successfully!");

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const initialized = initAudioSystem();
        if (initialized) {
            console.log("🎵 Audio system ready for incoming calls!");
        }
    }, 1000);
});