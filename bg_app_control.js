// ============================================
// FILE: bg_app_control.js
// ============================================
// Background App Control System for Walkie Talkie
// Manages app behavior when minimized, tab switched, or screen locked

// Global variables for background control
let bgControl = {
    isMicLocked: false,
    isInBackground: false,
    wasTalkingBeforeBg: false,
    resumeCallbacks: [],
    bgAudioContext: null,
    bgStream: null,
    bgInterval: null,
    
    // Performance settings
    settings: {
        bgAudioQuality: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 16000,
            latency: 0.1
        },
        normalAudioQuality: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 44100,
            latency: 0.01
        },
        checkInterval: 1000, // Check every second
        maxBgTime: 10 * 60 * 1000 // Max 10 minutes in background
    }
};

// ============================================
// 1. BACKGROUND STATE DETECTION
// ============================================

/**
 * Detect if app is in background (minimized, tab switched, screen locked)
 */
function detectBackgroundState() {
    const isHidden = document.hidden || 
                    document.msHidden || 
                    document.webkitHidden || 
                    document.mozHidden;
    
    const isPageActive = document.hasFocus && document.hasFocus();
    const isScreenLocked = !isPageActive && !isHidden;
    
    return isHidden || !isPageActive || isScreenLocked;
}

/**
 * Handle visibility change events
 */
function handleBgVisibilityChange() {
    const nowInBg = detectBackgroundState();
    
    if (nowInBg && !bgControl.isInBackground) {
        // Entering background
        console.log("📱 App entering background/tab switch");
        bgControl.isInBackground = true;
        bgControl.wasTalkingBeforeBg = isTalking || isMicLocked;
        
        // Only optimize if mic was locked/talking
        if (bgControl.isMicLocked || isTalking) {
            optimizeForBackground();
            startBackgroundMonitoring();
            updateStatus("info", "fas fa-moon", "Background Mode", 
                       "App is running in background. Mic locked active.");
        }
        
    } else if (!nowInBg && bgControl.isInBackground) {
        // Returning to foreground
        console.log("📱 App returning to foreground");
        bgControl.isInBackground = false;
        
        // Restore normal operation
        restoreFromBackground();
        stopBackgroundMonitoring();
        
        // Update status if connected
        if (isConnected) {
            updateStatus("success", "fas fa-check-circle", "Connected!", 
                       bgControl.isMicLocked ? "Mic LOCKED ON" : "Hold to talk");
        }
        
        // Execute any pending resume callbacks
        executeResumeCallbacks();
    }
}

// ============================================
// 2. BACKGROUND OPTIMIZATION
// ============================================

/**
 * Optimize app for background operation when mic is locked
 */
function optimizeForBackground() {
    if (!bgControl.isMicLocked && !isTalking) return;
    
    console.log("🔧 Optimizing for background with mic locked");
    
    // Save current audio track state
    if (localStream && localStream.getAudioTracks().length > 0) {
        const track = localStream.getAudioTracks()[0];
        
        // If mic was active, keep it active but with lower quality
        if (track.enabled) {
            track.applyConstraints(bgControl.settings.bgAudioQuality)
                .then(() => {
                    console.log("✅ Audio optimized for background");
                })
                .catch(e => {
                    console.log("⚠️ Couldn't optimize audio:", e);
                });
        }
    }
    
    // Adjust peer connection for background
    if (peerConnection) {
        // Try to maintain connection with lower bandwidth
        try {
            const senders = peerConnection.getSenders();
            if (senders.length > 0) {
                // Adjust encoding parameters for background
                const parameters = senders[0].getParameters();
                if (parameters && parameters.encodings) {
                    parameters.encodings[0].maxBitrate = 64000; // Lower bitrate
                    senders[0].setParameters(parameters);
                    console.log("✅ Peer connection optimized for background");
                }
            }
        } catch (e) {
            console.log("⚠️ Couldn't optimize peer connection:", e);
        }
    }
    
    // Start background audio keep-alive if needed
    if (isConnected && peerConnection) {
        startBackgroundAudioKeepAlive();
    }
}

/**
 * Restore normal operation when returning to foreground
 */
function restoreFromBackground() {
    console.log("🔧 Restoring from background");
    
    // Restore audio quality
    if (localStream && localStream.getAudioTracks().length > 0) {
        const track = localStream.getAudioTracks()[0];
        
        track.applyConstraints(bgControl.settings.normalAudioQuality)
            .then(() => {
                console.log("✅ Audio quality restored");
            })
            .catch(e => {
                console.log("⚠️ Couldn't restore audio quality:", e);
            });
    }
    
    // Restore peer connection settings
    if (peerConnection) {
        try {
            const senders = peerConnection.getSenders();
            if (senders.length > 0) {
                const parameters = senders[0].getParameters();
                if (parameters && parameters.encodings) {
                    parameters.encodings[0].maxBitrate = 128000; // Normal bitrate
                    senders[0].setParameters(parameters);
                    console.log("✅ Peer connection restored");
                }
            }
        } catch (e) {
            console.log("⚠️ Couldn't restore peer connection:", e);
        }
    }
    
    // Stop background keep-alive
    stopBackgroundAudioKeepAlive();
}

// ============================================
// 3. BACKGROUND AUDIO KEEP-ALIVE SYSTEM
// ============================================

/**
 * Start background audio keep-alive to prevent audio dropout
 */
function startBackgroundAudioKeepAlive() {
    if (bgControl.bgInterval) {
        clearInterval(bgControl.bgInterval);
    }
    
    bgControl.bgInterval = setInterval(() => {
        if (bgControl.isInBackground && isConnected && localStream) {
            // Send minimal audio data to keep connection alive
            sendBackgroundKeepAlive();
            
            // Check connection health
            if (peerConnection) {
                const state = peerConnection.connectionState;
                if (state === 'disconnected' || state === 'failed') {
                    console.log("⚠️ Connection issue in background, attempting recovery");
                    attemptBackgroundReconnection();
                }
            }
        }
    }, 5000); // Check every 5 seconds in background
}

/**
 * Send background keep-alive signal
 */
function sendBackgroundKeepAlive() {
    if (!isConnected || !peerConnection) return;
    
    // Use data channel if available
    if (dataChannel && dataChannel.readyState === 'open') {
        try {
            dataChannel.send(JSON.stringify({
                type: 'bg-keep-alive',
                timestamp: Date.now(),
                micLocked: bgControl.isMicLocked
            }));
            console.log("💓 Background keep-alive sent");
        } catch (e) {
            console.log("⚠️ Couldn't send background keep-alive:", e);
        }
    }
    
    // Update last activity time
    lastActivityTime = Date.now();
}

/**
 * Stop background keep-alive
 */
function stopBackgroundAudioKeepAlive() {
    if (bgControl.bgInterval) {
        clearInterval(bgControl.bgInterval);
        bgControl.bgInterval = null;
    }
}

// ============================================
// 4. BACKGROUND RECONNECTION SYSTEM
// ============================================

/**
 * Attempt reconnection while in background
 */
function attemptBackgroundReconnection() {
    if (!bgControl.isInBackground) return;
    
    console.log("🔄 Attempting background reconnection");
    
    // Try gentle reconnection first
    if (peerConnection) {
        try {
            // Try ICE restart
            peerConnection.restartIce();
            console.log("✅ ICE restart initiated in background");
            
            // Send reconnection signal via data channel
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(JSON.stringify({
                    type: 'bg-reconnect',
                    timestamp: Date.now()
                }));
            }
        } catch (e) {
            console.log("❌ ICE restart failed in background:", e);
            
            // Schedule full reconnection when returning to foreground
            scheduleForegroundReconnection();
        }
    }
}

/**
 * Schedule reconnection for when app returns to foreground
 */
function scheduleForegroundReconnection() {
    bgControl.resumeCallbacks.push(() => {
        if (!isConnected && currentFriendId) {
            console.log("🔄 Executing scheduled reconnection");
            updateStatus("warning", "fas fa-sync-alt", "Reconnecting", 
                       "Restoring connection after background...");
            
            // Wait a bit for network stabilization
            setTimeout(() => {
                if (!isConnected && currentFriendId) {
                    reestablishConnection();
                }
            }, 1000);
        }
    });
}

/**
 * Execute all resume callbacks
 */
function executeResumeCallbacks() {
    if (bgControl.resumeCallbacks.length > 0) {
        console.log(`📋 Executing ${bgControl.resumeCallbacks.length} resume callbacks`);
        
        bgControl.resumeCallbacks.forEach(callback => {
            try {
                callback();
            } catch (e) {
                console.error("❌ Resume callback error:", e);
            }
        });
        
        bgControl.resumeCallbacks = [];
    }
}

// ============================================
// 5. MIC LOCK BACKGROUND INTEGRATION
// ============================================

/**
 * Set mic lock state and configure background behavior
 */
function setMicLockForBackground(locked) {
    bgControl.isMicLocked = locked;
    console.log(`🔒 Mic lock for background: ${locked ? 'ON' : 'OFF'}`);
    
    if (locked) {
        // Prepare for possible background operation
        setupBackgroundCapabilities();
        
        // Update status
        if (isConnected) {
            updateStatus("success", "fas fa-microphone-alt", "Mic Locked ON", 
                       "App will work in background. Double tap to unlock.");
        }
    } else {
        // Clean up background resources if not needed
        if (!isTalking && bgControl.isInBackground) {
            // If we're in background but not talking, pause connection
            pauseConnectionForBackground();
        }
    }
}

/**
 * Setup background capabilities when mic is locked
 */
function setupBackgroundCapabilities() {
    // Request persistent storage permission if available
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(granted => {
            if (granted) {
                console.log("✅ Storage persistence granted for background");
            }
        });
    }
    
    // Request wake lock if available
    if ('wakeLock' in navigator) {
        requestWakeLock();
    }
}

/**
 * Request wake lock to prevent device sleep
 */
async function requestWakeLock() {
    try {
        const wakeLock = await navigator.wakeLock.request('screen');
        console.log("✅ Wake lock acquired for background");
        
        wakeLock.addEventListener('release', () => {
            console.log("⚠️ Wake lock released");
        });
        
        return wakeLock;
    } catch (e) {
        console.log("⚠️ Wake lock not available:", e.message);
        return null;
    }
}

/**
 * Pause connection when in background without active mic
 */
function pauseConnectionForBackground() {
    if (!bgControl.isInBackground || isTalking || bgControl.isMicLocked) return;
    
    console.log("⏸️ Pausing connection for background (no active mic)");
    
    // Reduce connection activity
    if (peerConnection) {
        try {
            // Set connection to passive mode
            const config = peerConnection.getConfiguration();
            if (config.iceTransportPolicy !== 'relay') {
                config.iceTransportPolicy = 'relay'; // Use relays only to save battery
                console.log("✅ Connection set to relay-only for background");
            }
        } catch (e) {
            console.log("⚠️ Couldn't adjust connection for background:", e);
        }
    }
    
    // Pause audio processing
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
        audioLevelInterval = null;
    }
}

// ============================================
// 6. BACKGROUND MONITORING SYSTEM
// ============================================

/**
 * Start monitoring app in background
 */
function startBackgroundMonitoring() {
    if (bgControl.bgInterval) {
        clearInterval(bgControl.bgInterval);
    }
    
    bgControl.bgInterval = setInterval(() => {
        monitorBackgroundState();
    }, bgControl.settings.checkInterval);
}

/**
 * Monitor background state and take action
 */
function monitorBackgroundState() {
    if (!bgControl.isInBackground) return;
    
    // Check connection health
    if (isConnected && peerConnection) {
        const state = peerConnection.connectionState;
        const iceState = peerConnection.iceConnectionState;
        
        // If connection is failing and mic is locked, try to recover
        if ((state === 'disconnected' || iceState === 'disconnected') && 
            bgControl.isMicLocked) {
            console.log("⚠️ Connection weak in background, mic locked - attempting recovery");
            attemptBackgroundReconnection();
        }
    }
    
    // Check if we've been in background too long
    const bgDuration = Date.now() - lastActivityTime;
    if (bgDuration > bgControl.settings.maxBgTime && bgControl.isMicLocked) {
        console.log("🕒 Been in background too long, refreshing connection");
        sendActivityPing();
    }
}

/**
 * Stop background monitoring
 */
function stopBackgroundMonitoring() {
    if (bgControl.bgInterval) {
        clearInterval(bgControl.bgInterval);
        bgControl.bgInterval = null;
    }
}

// ============================================
// 7. INTEGRATION WITH MAIN APP
// ============================================

/**
 * Initialize background control system
 */
function initBackgroundControl() {
    console.log("🚀 Initializing Background App Control");
    
    // Set up visibility change listeners
    document.addEventListener('visibilitychange', handleBgVisibilityChange);
    
    // Set up page focus listeners
    window.addEventListener('blur', () => {
        setTimeout(handleBgVisibilityChange, 100);
    });
    
    window.addEventListener('focus', () => {
        setTimeout(handleBgVisibilityChange, 100);
    });
    
    // Set up beforeunload for cleanup
    window.addEventListener('beforeunload', cleanupBackgroundControl);
    
    // Expose functions to global scope for main app
    window.BgControl = {
        setMicLockForBackground,
        optimizeForBackground,
        restoreFromBackground,
        isInBackground: () => bgControl.isInBackground
    };
    
    console.log("✅ Background Control System Ready");
}

/**
 * Clean up background control system
 */
function cleanupBackgroundControl() {
    console.log("🧹 Cleaning up Background Control");
    
    // Remove event listeners
    document.removeEventListener('visibilitychange', handleBgVisibilityChange);
    window.removeEventListener('blur', handleBgVisibilityChange);
    window.removeEventListener('focus', handleBgVisibilityChange);
    
    // Stop all intervals
    stopBackgroundMonitoring();
    stopBackgroundAudioKeepAlive();
    
    // Clean up resources
    if (bgControl.bgAudioContext) {
        bgControl.bgAudioContext.close();
        bgControl.bgAudioContext = null;
    }
    
    if (bgControl.bgStream) {
        bgControl.bgStream.getTracks().forEach(track => track.stop());
        bgControl.bgStream = null;
    }
    
    // Clear callbacks
    bgControl.resumeCallbacks = [];
    
    console.log("✅ Background Control Cleaned Up");
}

// ============================================
// 8. DATA CHANNEL MESSAGE HANDLING FOR BACKGROUND
// ============================================

/**
 * Handle background-specific data channel messages
 */
function handleBackgroundDataMessage(message) {
    try {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'bg-keep-alive':
                // Acknowledge background keep-alive
                lastActivityTime = Date.now();
                console.log("💓 Background keep-alive received");
                
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({
                        type: 'bg-keep-alive-ack',
                        timestamp: Date.now()
                    }));
                }
                break;
                
            case 'bg-keep-alive-ack':
                lastActivityTime = Date.now();
                console.log("💓 Background keep-alive acknowledged");
                break;
                
            case 'bg-reconnect':
                console.log("🔄 Background reconnection request received");
                if (peerConnection) {
                    try {
                        peerConnection.restartIce();
                        console.log("✅ ICE restart initiated for peer");
                    } catch (e) {
                        console.log("❌ Couldn't restart ICE for peer:", e);
                    }
                }
                break;
        }
    } catch (e) {
        console.log("⚠️ Error parsing background message:", e);
    }
}

// ============================================
// 9. MAIN APP INTEGRATION HOOKS
// ============================================

/**
 * Call this when mic lock is toggled in main app
 */
function onMicLockToggle(isLocked) {
    setMicLockForBackground(isLocked);
    
    // If unlocking mic while in background, pause connection
    if (!isLocked && bgControl.isInBackground) {
        pauseConnectionForBackground();
    }
}

/**
 * Call this when starting a call
 */
function onCallStart() {
    // Reset background state
    bgControl.isInBackground = false;
    bgControl.wasTalkingBeforeBg = false;
    bgControl.resumeCallbacks = [];
}

/**
 * Call this when ending a call
 */
function onCallEnd() {
    // Clean up background resources
    bgControl.isMicLocked = false;
    bgControl.wasTalkingBeforeBg = false;
    stopBackgroundMonitoring();
    stopBackgroundAudioKeepAlive();
}

// ============================================
// 10. INITIALIZATION
// ============================================

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initBackgroundControl, 1000);
});

// Export functions for use in main script
window.bgAppControl = {
    initBackgroundControl,
    cleanupBackgroundControl,
    onMicLockToggle,
    onCallStart,
    onCallEnd,
    handleBackgroundDataMessage,
    setMicLockForBackground,
    isInBackground: () => bgControl.isInBackground
};

// ============================================
// END OF bg_app_control.js
// ============================================