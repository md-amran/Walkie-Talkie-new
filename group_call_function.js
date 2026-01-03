// group_call_function.js - Updated

// DOM Elements
const groupCallButton = document.getElementById('groupCallButton');
const groupCallModal = document.getElementById('groupCallModal');
const closeGroupModal = document.getElementById('closeGroupModal');

// Initialize Group Call Functionality
function initGroupCallFunctionality() {
    console.log("✅ Group Call functionality initialized");
    
    // Remove any existing event listeners
    groupCallButton.replaceWith(groupCallButton.cloneNode(true));
    const newGroupCallButton = document.getElementById('groupCallButton');
    
    // Add fresh event listener
    newGroupCallButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Group Call button clicked");
        openGroupCallModal();
    });
    
    // Close Group Call Modal
    if (closeGroupModal) {
        closeGroupModal.addEventListener('click', function(e) {
            e.stopPropagation();
            closeGroupCallModal();
        });
    }
    
    // Close modal when clicking outside
    if (groupCallModal) {
        groupCallModal.addEventListener('click', function(e) {
            if (e.target === groupCallModal) {
                closeGroupCallModal();
            }
        });
        
        // Close with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && groupCallModal.classList.contains('show')) {
                closeGroupCallModal();
            }
        });
    }
}

// Open Group Call Modal
function openGroupCallModal() {
    console.log("📞 Opening Group Call modal");
    
    if (groupCallModal) {
        groupCallModal.style.display = 'flex';
        
        // Force reflow
        void groupCallModal.offsetWidth;
        
        // Animation
        setTimeout(() => {
            groupCallModal.classList.add('show');
        }, 10);
        
        // স্ক্রল টপে নিয়ে যাও (ছোট ফোনের জন্য)
        groupCallModal.scrollTop = 0;
    }
    
    // Detect if small screen
    const isSmallScreen = window.innerHeight < 700;
    
    if (isSmallScreen) {
        // শুধু ছোট ফোনে body scroll disable
        document.body.style.overflow = 'hidden';
    }
}

// Close Group Call Modal
function closeGroupCallModal() {
    console.log("📞 Closing Group Call modal");
    
    if (groupCallModal) {
        groupCallModal.classList.remove('show');
        
        setTimeout(() => {
            groupCallModal.style.display = 'none';
            // সব ডিভাইসে scroll restore
            document.body.style.overflow = 'auto';
        }, 350);
    }
}

// Check screen size on load and resize
function checkScreenSize() {
    const modalContent = document.querySelector('#groupCallModal .modal-content');
    if (!modalContent) return;
    
    const isVerySmallScreen = window.innerHeight < 700 || window.innerWidth < 361;
    
    if (isVerySmallScreen) {
        // ছোট স্ক্রিনের জন্য স্ক্রল এনাবল
        modalContent.style.overflowY = 'auto';
        modalContent.style.maxHeight = 'calc(100vh - 20px)';
    } else {
        // বড় স্ক্রিনের জন্য স্ক্রল ডিজেবল
        modalContent.style.overflowY = 'visible';
        modalContent.style.maxHeight = 'none';
    }
}

// রিসাইজে চেক করো
window.addEventListener('resize', checkScreenSize);

// DOM লোডে চেক করো
document.addEventListener('DOMContentLoaded', checkScreenSize);


// Initialize immediately
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for other scripts to load
    setTimeout(initGroupCallFunctionality, 500);
});

// Also make functions globally available
window.openGroupCallModal = openGroupCallModal;
window.closeGroupCallModal = closeGroupCallModal;