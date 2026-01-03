// background_call_modal.js - ব্যাকগ্রাউন্ডে কল নেওয়ার ফুল স্ক্রিন সিস্টেম

console.log("📞 Background Call Modal System Loading...");

// ==================== GLOBAL VARIABLES ====================
let isBackgroundCallModalActive = false;
let backgroundCallOfferKey = null;
let backgroundCallerId = null;
let backgroundCallerName = null;
let backgroundCallStartTime = null;
let backgroundCallTimeout = null;
let backgroundRingtoneInterval = null;

// ==================== FULLSCREEN CALL MODAL ====================

/**
 * ব্যাকগ্রাউন্ডে কল আসলে ফুলস্ক্রিন মডাল দেখানো
 */
function showBackgroundCallModal(callerId, callerName) {
    if (isBackgroundCallModalActive) {
        console.log("⚠️ Background call modal already active");
        return;
    }
    
    console.log("📱 Showing fullscreen background call modal");
    
    // ডেটা স্টোর করুন
    backgroundCallerId = callerId;
    backgroundCallerName = callerName;
    backgroundCallStartTime = Date.now();
    isBackgroundCallModalActive = true;
    
    // ব্রাউজার ট্যাবকে ফোরগ্রাউন্ডে আনতে চেষ্টা করুন
    bringBrowserToForeground();
    
    // রিংটোন শুরু করুন
    startBackgroundRingtone();
    
    // ফুলস্ক্রিন মডাল তৈরি করুন
    createFullscreenCallModal();
    
    // 60 সেকেন্ড পর অটো রিজেক্ট
    backgroundCallTimeout = setTimeout(() => {
        if (isBackgroundCallModalActive) {
            console.log("⏰ Background call auto-rejected (timeout)");
            rejectBackgroundCall();
        }
    }, 60000);
    
    // ব্রাউজার ট্যাব ব্লিংকিং শুরু করুন
    startTabBlinking();
}

/**
 * ব্রাউজার ট্যাবকে ফোরগ্রাউন্ডে আনার চেষ্টা
 */
function bringBrowserToForeground() {
    console.log("🔄 Trying to bring browser to foreground...");
    
    // ব্রাউজার ফোকাস করার চেষ্টা
    window.focus();
    
    // ভিজিবিলিটি API ব্যবহার
    if (document.hidden) {
        // ট্যাবটি হিডেন হলে ভিজিবল করতে চেষ্টা করুন
        const visibilityEvent = new Event('visibilitychange', {
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(visibilityEvent);
    }
    
    // ফুলস্ক্রিন মোডে যাবার চেষ্টা (যদি সাপোর্ট করে)
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        try {
            document.documentElement.requestFullscreen().catch(e => {
                console.log("Fullscreen not supported:", e);
            });
        } catch (e) {
            console.log("Fullscreen error:", e);
        }
    }
    
    // ভাইব্রেশন শুরু করুন (মোবাইলে)
    startBackgroundVibration();
}

/**
 * ফুলস্ক্রিন কল মডাল তৈরি
 */
function createFullscreenCallModal() {
    // যদি আগে থেকে মডাল থাকে তাহলে রিমুভ করুন
    const existingModal = document.getElementById('fullscreenCallModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // নিউ মডাল HTML তৈরি করুন
    const modalHTML = `
        <div id="fullscreenCallModal" class="fullscreen-call-modal">
            <div class="fullscreen-call-overlay"></div>
            
            <div class="fullscreen-call-content">
                <!-- রিংটোন এনিমেশন -->
                <div class="ring-animation">
                    <div class="ring-circle ring-1"></div>
                    <div class="ring-circle ring-2"></div>
                    <div class="ring-circle ring-3"></div>
                    <div class="ring-icon">
                        <i class="fas fa-phone-volume"></i>
                    </div>
                </div>
                
                <!-- কলার ইনফো -->
                <div class="caller-info-fullscreen">
                    <div class="caller-avatar-fullscreen">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="caller-details-fullscreen">
                        <h2 class="caller-name-fullscreen">${backgroundCallerName}</h2>
                        <p class="caller-id-fullscreen">ID: ${backgroundCallerId}</p>
                        <p class="call-status-fullscreen">📞 Calling...</p>
                    </div>
                </div>
                
                <!-- অ্যাকশন বাটন -->
                <div class="call-actions-fullscreen">
                    <button class="action-btn-fullscreen reject-btn-fullscreen" id="backgroundRejectBtn">
                        <div class="action-icon-fullscreen">
                            <i class="fas fa-times"></i>
                        </div>
                        <div class="action-text-fullscreen">Reject</div>
                    </button>
                    
                    <button class="action-btn-fullscreen answer-btn-fullscreen" id="backgroundAnswerBtn">
                        <div class="action-icon-fullscreen">
                            <i class="fas fa-phone"></i>
                        </div>
                        <div class="action-text-fullscreen">Answer</div>
                    </button>
                </div>
                
                <!-- টাইমার -->
                <div class="call-timer-fullscreen" id="backgroundCallTimer">
                    Auto-reject in: <span class="timer-count">60</span>s
                </div>
                
                <!-- ওয়েভ এফেক্ট -->
                <div class="wave-effect-fullscreen">
                    <div class="wave"></div>
                    <div class="wave"></div>
                    <div class="wave"></div>
                    <div class="wave"></div>
                    <div class="wave"></div>
                </div>
            </div>
            
            <!-- ব্যাকগ্রাউন্ড রিংটোন (যদি রিংটোন সিস্টেম কাজ না করে) -->
            <audio id="backgroundRingtone" loop style="display: none;">
                <source src="https://assets.mixkit.co/sfx/preview/mixkit-classic-phone-ring-449.mp3" type="audio/mpeg">
            </audio>
        </div>
    `;
    
    // বডিতে অ্যাড করুন
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // ইভেন্ট লিসেনার যোগ করুন
    document.getElementById('backgroundAnswerBtn').addEventListener('click', answerBackgroundCall);
    document.getElementById('backgroundRejectBtn').addEventListener('click', rejectBackgroundCall);
    
    // স্টাইল অ্যাড করুন যদি না থাকে
    addFullscreenModalStyles();
    
    // টাইমার আপডেট শুরু করুন
    startBackgroundTimer();
    
    console.log("✅ Fullscreen call modal created");
}

/**
 * ব্যাকগ্রাউন্ড কল রিসিভ
 */
function answerBackgroundCall() {
    console.log("✅ Answering background call...");
    
    // মডাল হাইড করুন
    hideBackgroundCallModal();
    
    // যদি কলের ডেটা থাকে তাহলে কল রিসিভ করুন
    if (backgroundCallOfferKey) {
        acceptIncomingCall(backgroundCallOfferKey);
    } else {
        console.error("❌ No offer key found for background call");
    }
    
    // স্ট্যাটাস আপডেট করুন
    updateStatus("info", "fas fa-phone-alt", "Answering Call", "Connecting...");
}

/**
 * ব্যাকগ্রাউন্ড কল রিজেক্ট
 */
function rejectBackgroundCall() {
    console.log("❌ Rejecting background call...");
    
    // মডাল হাইড করুন
    hideBackgroundCallModal();
    
    // যদি কলের ডেটা থাকে তাহলে রিজেক্ট করুন
    if (backgroundCallOfferKey) {
        rejectIncomingCall(backgroundCallOfferKey);
    }
    
    // স্ট্যাটাস আপডেট করুন
    updateStatus("info", "fas fa-phone-slash", "Call Declined", "You rejected the call");
}

/**
 * ব্যাকগ্রাউন্ড কল মডাল হাইড
 */
function hideBackgroundCallModal() {
    console.log("👋 Hiding background call modal");
    
    // টাইমআউট ক্লিয়ার করুন
    if (backgroundCallTimeout) {
        clearTimeout(backgroundCallTimeout);
        backgroundCallTimeout = null;
    }
    
    // রিংটোন বন্ধ করুন
    stopBackgroundRingtone();
    
    // ট্যাব ব্লিংকিং বন্ধ করুন
    stopTabBlinking();
    
    // ভাইব্রেশন বন্ধ করুন
    stopBackgroundVibration();
    
    // মডাল রিমুভ করুন
    const modal = document.getElementById('fullscreenCallModal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 300);
    }
    
    // স্টেট রিসেট করুন
    isBackgroundCallModalActive = false;
    backgroundCallOfferKey = null;
    backgroundCallerId = null;
    backgroundCallerName = null;
    backgroundCallStartTime = null;
}

/**
 * ব্যাকগ্রাউন্ড রিংটোন শুরু
 */
function startBackgroundRingtone() {
    console.log("🔊 Starting background ringtone");
    
    // AudioSystem থেকে রিংটোন চালু করুন
    if (window.AudioSystem && window.AudioSystem.playRingtone) {
        window.AudioSystem.playRingtone();
    } else {
        // বিকল্প রিংটোন
        const ringtone = document.getElementById('backgroundRingtone');
        if (ringtone) {
            ringtone.volume = 0.7;
            ringtone.play().catch(e => {
                console.log("Background ringtone play blocked:", e);
            });
        }
    }
    
    // ভাইব্রেশন শুরু করুন
    startBackgroundVibration();
}

/**
 * ব্যাকগ্রাউন্ড রিংটোন বন্ধ
 */
function stopBackgroundRingtone() {
    console.log("🔇 Stopping background ringtone");
    
    // AudioSystem থেকে রিংটোন বন্ধ করুন
    if (window.AudioSystem && window.AudioSystem.stopRingtone) {
        window.AudioSystem.stopRingtone();
    }
    
    // বিকল্প রিংটোন বন্ধ করুন
    const ringtone = document.getElementById('backgroundRingtone');
    if (ringtone) {
        ringtone.pause();
        ringtone.currentTime = 0;
    }
    
    // ভাইব্রেশন বন্ধ করুন
    stopBackgroundVibration();
}

/**
 * ব্যাকগ্রাউন্ড ভাইব্রেশন শুরু
 */
function startBackgroundVibration() {
    if (!('vibrate' in navigator)) return;
    
    try {
        // কল ভাইব্রেশন প্যাটার্ন
        navigator.vibrate([1000, 500, 1000]);
        
        // ইন্টারভাল সেট করুন
        backgroundRingtoneInterval = setInterval(() => {
            navigator.vibrate([1000, 500, 1000]);
        }, 2500);
        
    } catch (e) {
        console.log("Vibration error:", e);
    }
}

/**
 * ব্যাকগ্রাউন্ড ভাইব্রেশন বন্ধ
 */
function stopBackgroundVibration() {
    if (!('vibrate' in navigator)) return;
    
    try {
        navigator.vibrate(0);
        
        if (backgroundRingtoneInterval) {
            clearInterval(backgroundRingtoneInterval);
            backgroundRingtoneInterval = null;
        }
    } catch (e) {
        console.log("Stop vibration error:", e);
    }
}

/**
 * ট্যাব টাইটেল ব্লিংকিং শুরু
 */
function startTabBlinking() {
    const originalTitle = document.title;
    let blinkCount = 0;
    let isShowingAlert = false;
    
    // 500ms পরপর টাইটেল চেঞ্জ করুন
    const blinkInterval = setInterval(() => {
        if (!isBackgroundCallModalActive) {
            clearInterval(blinkInterval);
            document.title = originalTitle;
            return;
        }
        
        if (isShowingAlert) {
            document.title = originalTitle;
        } else {
            document.title = "📞 INCOMING CALL! - " + backgroundCallerName;
        }
        
        isShowingAlert = !isShowingAlert;
        blinkCount++;
        
    }, 500);
    
    // স্টোর রেফারেন্স
    window.tabBlinkInterval = blinkInterval;
}

/**
 * ট্যাব টাইটেল ব্লিংকিং বন্ধ
 */
function stopTabBlinking() {
    if (window.tabBlinkInterval) {
        clearInterval(window.tabBlinkInterval);
        window.tabBlinkInterval = null;
    }
    
    // মূল টাইটেল ফিরিয়ে দিন
    document.title = document.title.replace(/📞 INCOMING CALL! - /, '');
}

/**
 * ব্যাকগ্রাউন্ড কল টাইমার শুরু
 */
function startBackgroundTimer() {
    const timerElement = document.querySelector('.timer-count');
    if (!timerElement) return;
    
    let secondsLeft = 60;
    
    const timerInterval = setInterval(() => {
        if (!isBackgroundCallModalActive) {
            clearInterval(timerInterval);
            return;
        }
        
        secondsLeft--;
        timerElement.textContent = secondsLeft;
        
        // লাল কালার যখন 10 সেকেন্ড বাকি
        if (secondsLeft <= 10) {
            timerElement.style.color = 'var(--amoled-red)';
            timerElement.style.animation = 'pulse 1s infinite';
        }
        
        if (secondsLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

/**
 * ফুলস্ক্রিন মডালের জন্য স্টাইল অ্যাড
 */
function addFullscreenModalStyles() {
    if (document.querySelector('#fullscreenModalStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'fullscreenModalStyles';
    style.textContent = `
        /* ==================== FULLSCREEN CALL MODAL STYLES ==================== */
        .fullscreen-call-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: modalFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
        }
        
        .fullscreen-call-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, 
                rgba(0, 0, 0, 0.98), 
                rgba(20, 0, 5, 0.97));
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        }
        
        .fullscreen-call-content {
            position: relative;
            z-index: 2;
            width: 90%;
            max-width: 400px;
            background: linear-gradient(145deg, 
                rgba(20, 20, 20, 0.95),
                rgba(30, 0, 10, 0.93));
            border-radius: 25px;
            padding: 40px 30px;
            text-align: center;
            border: 2px solid rgba(255, 0, 51, 0.4);
            box-shadow: 
                0 25px 80px rgba(0, 0, 0, 0.9),
                0 0 60px rgba(255, 0, 51, 0.3),
                0 0 100px rgba(255, 0, 51, 0.15),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            animation: contentSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        /* রিং এনিমেশন */
        .ring-animation {
            position: relative;
            width: 150px;
            height: 150px;
            margin: 0 auto 40px;
        }
        
        .ring-circle {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 3px solid rgba(255, 0, 51, 0.3);
            border-radius: 50%;
            animation: ringPulse 2s ease-out infinite;
        }
        
        .ring-1 { animation-delay: 0s; }
        .ring-2 { animation-delay: 0.5s; }
        .ring-3 { animation-delay: 1s; }
        
        .ring-icon {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 4em;
            color: var(--amoled-red);
            animation: ringIconPulse 1.5s ease-in-out infinite;
            text-shadow: 0 0 30px rgba(255, 0, 51, 0.7);
        }
        
        /* কলার ইনফো */
        .caller-info-fullscreen {
            margin-bottom: 40px;
        }
        
        .caller-avatar-fullscreen {
            font-size: 4em;
            color: var(--amoled-red);
            margin-bottom: 15px;
            text-shadow: 0 0 20px rgba(255, 0, 51, 0.5);
        }
        
        .caller-name-fullscreen {
            font-size: 1.8em;
            color: var(--text-primary);
            margin-bottom: 8px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }
        
        .caller-id-fullscreen {
            color: var(--text-secondary);
            font-size: 0.95em;
            margin-bottom: 10px;
            font-family: 'Courier New', monospace;
            opacity: 0.9;
        }
        
        .call-status-fullscreen {
            color: var(--amoled-red);
            font-size: 1.1em;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            animation: statusPulse 2s infinite;
        }
        
        /* অ্যাকশন বাটন */
        .call-actions-fullscreen {
            display: flex;
            gap: 25px;
            justify-content: center;
            margin-bottom: 25px;
        }
        
        .action-btn-fullscreen {
            width: 130px;
            height: 130px;
            border-radius: 50%;
            border: none;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        
        .action-btn-fullscreen::before {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            border-radius: 50%;
            z-index: -1;
            opacity: 0.5;
        }
        
        .answer-btn-fullscreen {
            background: linear-gradient(135deg, var(--amoled-green), #00aa55);
            box-shadow: 0 10px 30px rgba(0, 204, 102, 0.3);
        }
        
        .answer-btn-fullscreen::before {
            background: linear-gradient(135deg, var(--amoled-green), #00aa55);
        }
        
        .answer-btn-fullscreen:hover {
            transform: scale(1.08);
            box-shadow: 0 15px 40px rgba(0, 204, 102, 0.4);
        }
        
        .reject-btn-fullscreen {
            background: linear-gradient(135deg, var(--amoled-red), #cc0029);
            box-shadow: 0 10px 30px rgba(255, 0, 51, 0.3);
        }
        
        .reject-btn-fullscreen::before {
            background: linear-gradient(135deg, var(--amoled-red), #cc0029);
        }
        
        .reject-btn-fullscreen:hover {
            transform: scale(1.08);
            box-shadow: 0 15px 40px rgba(255, 0, 51, 0.4);
        }
        
        .action-icon-fullscreen {
            font-size: 2.5em;
            color: white;
            margin-bottom: 8px;
        }
        
        .action-text-fullscreen {
            color: white;
            font-size: 1.1em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        /* টাইমার */
        .call-timer-fullscreen {
            color: var(--text-secondary);
            font-size: 0.95em;
            margin-bottom: 20px;
            padding: 10px 20px;
            background: rgba(255, 0, 51, 0.1);
            border-radius: 20px;
            display: inline-block;
            border: 1px solid rgba(255, 0, 51, 0.2);
        }
        
        .timer-count {
            color: var(--amoled-green);
            font-weight: 700;
            font-size: 1.2em;
            margin-left: 5px;
        }
        
        /* ওয়েভ এফেক্ট */
        .wave-effect-fullscreen {
            display: flex;
            justify-content: center;
            gap: 6px;
            height: 40px;
            margin-top: 20px;
        }
        
        .wave-effect-fullscreen .wave {
            width: 6px;
            height: 20px;
            background: var(--amoled-red);
            border-radius: 3px;
            animation: wave 1.2s ease-in-out infinite;
        }
        
        .wave-effect-fullscreen .wave:nth-child(1) { animation-delay: 0s; }
        .wave-effect-fullscreen .wave:nth-child(2) { animation-delay: 0.1s; }
        .wave-effect-fullscreen .wave:nth-child(3) { animation-delay: 0.2s; }
        .wave-effect-fullscreen .wave:nth-child(4) { animation-delay: 0.3s; }
        .wave-effect-fullscreen .wave:nth-child(5) { animation-delay: 0.4s; }
        
        /* ANIMATIONS */
        @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes contentSlideUp {
            from {
                opacity: 0;
                transform: translateY(30px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }
        
        @keyframes ringPulse {
            0% {
                transform: scale(0.8);
                opacity: 1;
            }
            100% {
                transform: scale(1.5);
                opacity: 0;
            }
        }
        
        @keyframes ringIconPulse {
            0%, 100% {
                transform: translate(-50%, -50%) scale(1);
                text-shadow: 0 0 20px rgba(255, 0, 51, 0.7);
            }
            50% {
                transform: translate(-50%, -50%) scale(1.1);
                text-shadow: 0 0 40px rgba(255, 0, 51, 0.9);
            }
        }
        
        @keyframes statusPulse {
            0%, 100% {
                opacity: 1;
            }
            50% {
                opacity: 0.7;
            }
        }
        
        @keyframes wave {
            0%, 100% { height: 20px; }
            50% { height: 40px; }
        }
        
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.05);
            }
        }
        
        /* RESPONSIVE DESIGN */
        @media (max-width: 768px) {
            .fullscreen-call-content {
                width: 95%;
                padding: 30px 20px;
                border-radius: 20px;
                max-width: 350px;
            }
            
            .ring-animation {
                width: 120px;
                height: 120px;
                margin-bottom: 30px;
            }
            
            .ring-icon {
                font-size: 3em;
            }
            
            .caller-name-fullscreen {
                font-size: 1.6em;
            }
            
            .action-btn-fullscreen {
                width: 110px;
                height: 110px;
            }
            
            .action-icon-fullscreen {
                font-size: 2em;
            }
            
            .action-text-fullscreen {
                font-size: 1em;
            }
            
            .call-actions-fullscreen {
                gap: 15px;
            }
        }
        
        @media (max-width: 480px) {
            .fullscreen-call-content {
                padding: 25px 15px;
                border-radius: 18px;
                max-width: 320px;
            }
            
            .ring-animation {
                width: 100px;
                height: 100px;
                margin-bottom: 25px;
            }
            
            .ring-icon {
                font-size: 2.5em;
            }
            
            .caller-name-fullscreen {
                font-size: 1.4em;
            }
            
            .caller-avatar-fullscreen {
                font-size: 3.5em;
            }
            
            .action-btn-fullscreen {
                width: 100px;
                height: 100px;
            }
            
            .action-icon-fullscreen {
                font-size: 1.8em;
            }
            
            .action-text-fullscreen {
                font-size: 0.9em;
            }
            
            .call-timer-fullscreen {
                font-size: 0.9em;
            }
        }
        
        @media (max-height: 600px) {
            .fullscreen-call-content {
                padding: 20px 15px;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .ring-animation {
                width: 80px;
                height: 80px;
                margin-bottom: 20px;
            }
            
            .ring-icon {
                font-size: 2em;
            }
            
            .caller-info-fullscreen {
                margin-bottom: 20px;
            }
            
            .call-actions-fullscreen {
                margin-bottom: 15px;
            }
        }
        
        /* LANDSCAPE MODE */
        @media (max-height: 500px) and (orientation: landscape) {
            .fullscreen-call-content {
                max-width: 90%;
                padding: 15px 20px;
                display: flex;
                align-items: center;
                gap: 20px;
            }
            
            .ring-animation {
                width: 80px;
                height: 80px;
                margin: 0;
                flex-shrink: 0;
            }
            
            .caller-info-fullscreen {
                margin: 0;
                text-align: left;
                flex: 1;
            }
            
            .call-actions-fullscreen {
                margin: 0;
                flex-direction: column;
                gap: 10px;
            }
            
            .action-btn-fullscreen {
                width: 80px;
                height: 80px;
            }
            
            .action-icon-fullscreen {
                font-size: 1.5em;
                margin-bottom: 5px;
            }
            
            .action-text-fullscreen {
                font-size: 0.8em;
            }
            
            .call-timer-fullscreen {
                position: absolute;
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 0.8em;
                padding: 5px 10px;
            }
            
            .wave-effect-fullscreen {
                display: none;
            }
        }
        
        /* DARK THEME OPTIMIZATION */
        @media (prefers-color-scheme: dark) {
            .fullscreen-call-content {
                background: linear-gradient(145deg, 
                    rgba(10, 10, 10, 0.97),
                    rgba(20, 0, 5, 0.95));
            }
        }
        
        /* HIGH CONTRAST MODE */
        @media (prefers-contrast: high) {
            .fullscreen-call-content {
                background: #000000;
                border: 3px solid var(--amoled-red);
            }
            
            .caller-name-fullscreen {
                color: #ffffff;
            }
            
            .answer-btn-fullscreen,
            .reject-btn-fullscreen {
                border: 2px solid white;
            }
        }
    `;
    
    document.head.appendChild(style);
    console.log("✅ Fullscreen modal styles added");
}

// ==================== MAIN INCOMING CALL HANDLER UPDATES ====================

/**
 * ইনকামিং কল হ্যান্ডলার আপডেট করুন
 */
function updateIncomingCallHandler() {
    console.log("🔄 Updating incoming call handler for background mode");
    
    // Firebase offer listener
    database.ref('offers').on('child_added', async (snapshot) => {
        const offerData = snapshot.val();
        
        // নিজেকে কল করলে ইগনোর করুন
        if (offerData.to !== myId || offerData.from === myId || peerConnection) {
            return;
        }
        
        console.log("📞 Incoming call detected:", offerData.from);
        
        // কল ডেটা স্টোর করুন
        backgroundCallOfferKey = snapshot.key;
        
        // কলার নাম আনুন
        let callerName = offerData.from;
        if (window.AudioSystem && window.AudioSystem.getCallerName) {
            try {
                callerName = await window.AudioSystem.getCallerName(offerData.from);
                console.log("📇 Caller name resolved:", callerName);
            } catch (error) {
                console.error("Error getting caller name:", error);
            }
        }
        
        // পেজ ভিজিবিলিটি চেক করুন
        if (document.hidden) {
            // ব্রাউজার ব্যাকগ্রাউন্ড/মিনিমাইজড
            console.log("📱 Browser is hidden - showing FULLSCREEN call modal");
            showBackgroundCallModal(offerData.from, callerName);
            
        } else {
            // ব্রাউজার ভিজিবল - নরমাল কল UI দেখান
            console.log("📱 Browser is visible - showing normal call UI");
            
            if (window.AudioSystem && window.AudioSystem.showIncomingCallUI) {
                window.AudioSystem.showIncomingCallUI(
                    offerData.from,
                    callerName,
                    () => acceptIncomingCall(snapshot.key),
                    () => rejectIncomingCall(snapshot.key)
                );
            } else {
                // ফলব্যাক
                if (confirm(`${callerName} is calling. Answer?`)) {
                    await acceptIncomingCall(snapshot.key);
                } else {
                    rejectIncomingCall(snapshot.key);
                }
            }
        }
    });
}

// ==================== PAGE VISIBILITY HANDLER ====================

/**
 * পেজ ভিজিবিলিটি হ্যান্ডলার
 */
function setupPageVisibilityHandler() {
    console.log("👁️ Setting up page visibility handler");
    
    document.addEventListener('visibilitychange', () => {
        console.log(`🔍 Page visibility: ${document.hidden ? 'HIDDEN' : 'VISIBLE'}`);
        
        if (document.hidden) {
            // পেজ হিডেন - ব্যাকগ্রাউন্ড মোড
            console.log("📱 App running in background");
            
            // যদি কল চলতে থাকে, স্ট্যাটাস আপডেট করুন
            if (isConnected) {
                updateStatus("info", "fas fa-moon", "Background Mode", 
                           "App is running in background. Connection active.");
            }
            
        } else {
            // পেজ ভিজিবল - ফোরগ্রাউন্ড
            console.log("📱 App returned to foreground");
            
            // যদি ব্যাকগ্রাউন্ড কল মডাল চালু থাকে, হাইড করুন
            if (isBackgroundCallModalActive) {
                hideBackgroundCallModal();
            }
            
            // কানেকশন চেক করুন
            if (isConnected) {
                checkConnectionHealth();
            }
        }
    });
}

// ==================== INITIALIZATION ====================

/**
 * ব্যাকগ্রাউন্ড কল সিস্টেম ইন্সট্যান্ট করে
 */
function initBackgroundCallSystem() {
    console.log("🚀 Initializing Background Call System...");
    
    try {
        // পেজ ভিজিবিলিটি হ্যান্ডলার সেটআপ
        setupPageVisibilityHandler();
        
        // ইনকামিং কল হ্যান্ডলার আপডেট
        setTimeout(() => {
            updateIncomingCallHandler();
        }, 2000);
        
        console.log("✅ Background Call System initialized successfully");
        return true;
        
    } catch (error) {
        console.error("❌ Background Call System initialization failed:", error);
        return false;
    }
}

// ==================== GLOBAL API EXPORT ====================

window.BackgroundCallSystem = {
    init: initBackgroundCallSystem,
    showModal: showBackgroundCallModal,
    hideModal: hideBackgroundCallModal,
    answerCall: answerBackgroundCall,
    rejectCall: rejectBackgroundCall,
    isModalActive: () => isBackgroundCallModalActive,
    getCallerInfo: () => ({
        id: backgroundCallerId,
        name: backgroundCallerName,
        time: backgroundCallStartTime
    })
};

console.log("✅ Background Call Modal System Loaded!");