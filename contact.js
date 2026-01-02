// contact.js - Contact System for Wave Talk App
// ============================================

// Firebase reference for contacts
let contactsRef = null;

// Contact state variables
let contacts = [];
let contactModalOpen = false;

// DOM Elements
let contactListButton = null;
let contactModal = null;
let addContactModal = null;

// ==================== INITIALIZATION ====================

function initializeContactSystem() {
    console.log("📇 Contact System: Initializing...");
    
    if (!currentUser || !myId) {
        console.error("❌ Contact System: User not authenticated");
        return;
    }
    
    // Setup Firebase reference
    contactsRef = database.ref(`contacts/${currentUser.uid}`);
    
    // Get DOM elements
    contactListButton = document.getElementById('contactListButton');
    contactModal = document.getElementById('contactModal');
    addContactModal = document.getElementById('addContactModal');
    
    // Setup event listeners
    setupEventListeners();
    
    // Load contacts
    loadContacts();
    
    console.log("✅ Contact System: Initialized successfully");
}

// Setup all event listeners
function setupEventListeners() {
    // Contact List Button
    if (contactListButton) {
        contactListButton.addEventListener('click', showContactModal);
    }
    
    // Contact Modal
    const addNewContactBtn = document.getElementById('addNewContact');
    const closeContactModalBtn = document.getElementById('closeContactModal');
    const contactSearch = document.getElementById('contactSearch');
    
    if (addNewContactBtn) {
        addNewContactBtn.addEventListener('click', showAddContactModal);
    }
    
    if (closeContactModalBtn) {
        closeContactModalBtn.addEventListener('click', hideContactModal);
    }
    
    if (contactSearch) {
        contactSearch.addEventListener('input', searchContacts);
    }
    
    // Add Contact Modal
    const newContactIdInput = document.getElementById('newContactId');
    const saveContactBtn = document.getElementById('saveContact');
    const cancelBtn = document.getElementById('cancelAddContact');
    
    if (newContactIdInput) {
        let debounceTimer;
        newContactIdInput.addEventListener('input', function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (this.value.trim().length >= 6) {
                    checkContactId(this.value.trim());
                } else {
                    hideContactPreview();
                }
            }, 500);
        });
        
        newContactIdInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.trim().length >= 6) {
                checkContactId(this.value.trim());
            }
        });
    }
    
    if (saveContactBtn) {
        saveContactBtn.addEventListener('click', saveContact);
        saveContactBtn.style.display = 'none';
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideAddContactModal);
    }
    
    // Close modals when clicking outside
    if (contactModal) {
        contactModal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideContactModal();
            }
        });
    }
    
    if (addContactModal) {
        addContactModal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideAddContactModal();
            }
        });
    }
}

// ==================== CONTACT MANAGEMENT ====================

// Load contacts from Firebase
function loadContacts() {
    if (!contactsRef) return;
    
    const emptyContacts = document.getElementById('emptyContacts');
    const contactsList = document.getElementById('contactsList');
    const contactsLoading = document.getElementById('contactsLoading');
    
    if (emptyContacts) emptyContacts.style.display = 'none';
    if (contactsList) contactsList.style.display = 'none';
    if (contactsLoading) contactsLoading.style.display = 'block';
    
    contactsRef.on('value', async (snapshot) => {
        contacts = [];
        
        if (contactsLoading) contactsLoading.style.display = 'none';
        
        if (!snapshot.exists()) {
            if (emptyContacts) emptyContacts.style.display = 'block';
            if (contactsList) contactsList.style.display = 'none';
            renderContactsList();
            return;
        }
        
        const contactsData = snapshot.val();
        const contactPromises = [];
        
        for (const contactId in contactsData) {
            if (contactsData.hasOwnProperty(contactId)) {
                const contactData = contactsData[contactId];
                contactPromises.push(
                    enhanceContactWithUserData(contactId, contactData)
                );
            }
        }
        
        const enhancedContacts = await Promise.all(contactPromises);
        contacts = enhancedContacts.filter(contact => contact !== null);
        
        // Sort: online > favorite > name
        contacts.sort((a, b) => {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            return a.displayName.localeCompare(b.displayName);
        });
        
        if (emptyContacts) emptyContacts.style.display = 'none';
        if (contactsList) contactsList.style.display = 'block';
        
        renderContactsList();
        console.log(`✅ Contact System: Loaded ${contacts.length} contacts`);
    }, (error) => {
        console.error("❌ Contact System: Error loading contacts:", error);
        if (contactsLoading) contactsLoading.style.display = 'none';
        if (emptyContacts) emptyContacts.style.display = 'block';
    });
}

// Enhance contact with user data
async function enhanceContactWithUserData(contactId, contactData) {
    try {
        if (contactId === myId) return null;
        
        const userSnapshot = await database.ref('users').orderByChild('walkieId').equalTo(contactId).once('value');
        
        let displayName = contactData.displayName || contactId;
        let email = contactId;
        let online = false;
        let lastSeen = 0;
        
        if (userSnapshot.exists()) {
            const users = userSnapshot.val();
            const userId = Object.keys(users)[0];
            const userData = users[userId];
            
            if (userData.displayName) displayName = userData.displayName;
            if (userData.email) email = userData.email;
            if (userData.online !== undefined) online = userData.online;
            if (userData.lastSeen) lastSeen = userData.lastSeen;
        }
        
        return {
            id: contactId,
            displayName: displayName,
            email: email,
            online: online,
            lastSeen: lastSeen,
            addedAt: contactData.addedAt || Date.now(),
            isFavorite: contactData.isFavorite || false
        };
    } catch (error) {
        console.error("Contact System: Error enhancing contact:", error);
        return {
            id: contactId,
            displayName: contactId,
            email: contactId,
            online: false,
            lastSeen: 0,
            addedAt: Date.now(),
            isFavorite: false
        };
    }
}

// Render contacts list
function renderContactsList() {
    const contactsList = document.getElementById('contactsList');
    const contactSearch = document.getElementById('contactSearch');
    const searchTerm = contactSearch ? contactSearch.value.toLowerCase() : '';
    
    if (!contactsList) return;
    
    // Filter contacts
    let filteredContacts = contacts;
    if (searchTerm) {
        filteredContacts = contacts.filter(contact => 
            contact.displayName.toLowerCase().includes(searchTerm) ||
            contact.id.toLowerCase().includes(searchTerm) ||
            contact.email.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredContacts.length === 0) {
        contactsList.innerHTML = `
            <div class="empty-search">
                <i class="fas fa-search"></i>
                <h3>No matching contacts</h3>
                <p>Try a different search term</p>
            </div>
        `;
        return;
    }
    
    // Group by online status
    const onlineContacts = filteredContacts.filter(c => c.online);
    const offlineContacts = filteredContacts.filter(c => !c.online);
    
    let html = '';
    
    // Online contacts
    if (onlineContacts.length > 0) {
        html += `
            <div class="section-header online">
                <i class="fas fa-circle"></i> Online (${onlineContacts.length})
            </div>
            ${onlineContacts.map(contact => renderContactItem(contact)).join('')}
        `;
    }
    
    // Offline contacts
    if (offlineContacts.length > 0) {
        html += `
            <div class="section-header offline">
                <i class="fas fa-circle"></i> Offline (${offlineContacts.length})
            </div>
            ${offlineContacts.map(contact => renderContactItem(contact)).join('')}
        `;
    }
    
    contactsList.innerHTML = html;
    
    // Add event listeners
    setTimeout(() => {
        document.querySelectorAll('.contact-item').forEach(item => {
            const contactId = item.dataset.contactId;
            const callBtn = item.querySelector('.call-btn');
            const deleteBtn = item.querySelector('.delete-btn');
            
            if (callBtn) {
                callBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    callContact(contactId);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteContact(contactId);
                });
            }
            
            // Click contact to call
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-btn') && 
                    !e.target.closest('.delete-btn')) {
                    callContact(contactId);
                }
            });
        });
    }, 50);
}

// Render single contact item
function renderContactItem(contact) {
    const timeAgo = getTimeAgo(contact.lastSeen);
    const statusClass = contact.online ? 'online' : 'offline';
    
    return `
        <div class="contact-item ${statusClass}" data-contact-id="${contact.id}">
            <div class="contact-avatar ${statusClass}">
                <i class="fas fa-user"></i>
                <div class="online-dot ${contact.online ? 'active' : 'inactive'}"></div>
            </div>
            
            <div class="contact-info">
                <h4 class="contact-name">${escapeHtml(contact.displayName)}</h4>
                <p class="contact-id">${escapeHtml(contact.id)}</p>
                <div class="contact-meta">
                    <span class="last-seen">
                        <i class="fas fa-clock"></i> ${timeAgo}
                    </span>
                    <span class="status-text ${statusClass}">
                        <i class="fas fa-circle"></i> ${contact.online ? 'Online' : 'Offline'}
                    </span>
                </div>
            </div>
            
            <div class="contact-actions">
                <button class="call-btn" title="Call ${contact.displayName}">
                    <i class="fas fa-phone"></i>
                    <span>Call</span>
                </button>
                <button class="delete-btn" title="Delete contact">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// ==================== CONTACT ACTIONS ====================

// Call a contact
function callContact(contactId) {
    if (!contactId) return;
    
    const friendIdInput = document.getElementById('friendId');
    if (friendIdInput) {
        friendIdInput.value = contactId;
        
        // Hide modal
        hideContactModal();
        
        // Highlight input
        friendIdInput.style.borderColor = 'var(--amoled-green)';
        friendIdInput.style.boxShadow = '0 0 10px var(--amoled-green)';
        setTimeout(() => {
            friendIdInput.style.borderColor = '';
            friendIdInput.style.boxShadow = '';
        }, 1000);
        
        // Scroll to input
        friendIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Auto-call after delay
        setTimeout(() => {
            const syncButton = document.getElementById('syncButton');
            if (syncButton) {
                syncButton.click();
            }
        }, 300);
    }
}

// Delete a contact
async function deleteContact(contactId) {
    if (!contactId || !contactsRef) return;
    
    if (!confirm(`Delete "${contactId}" from contacts?`)) {
        return;
    }
    
    try {
        await contactsRef.child(contactId).remove();
        console.log(`✅ Contact System: Deleted contact ${contactId}`);
        
        // Remove from local array
        contacts = contacts.filter(contact => contact.id !== contactId);
        
        // Show success message
        showToast('Contact deleted successfully', 'success');
        
        // Play sound
        if (window.AudioSystem && window.AudioSystem.playNotification) {
            window.AudioSystem.playNotification('message');
        }
        
    } catch (error) {
        console.error("❌ Contact System: Error deleting contact:", error);
        showToast('Failed to delete contact', 'error');
    }
}

// Check contact ID
async function checkContactId(contactId) {
    if (!contactId || contactId.length < 6) return;
    
    // Don't add yourself
    if (contactId === myId) {
        showAddContactStatus('You cannot add yourself as a contact', 'error');
        hideContactPreview();
        return;
    }
    
    // Check if already exists
    const existingContact = contacts.find(c => c.id === contactId);
    if (existingContact) {
        showAddContactStatus('Contact already in your list', 'error');
        hideContactPreview();
        return;
    }
    
    const loadingEl = document.getElementById('addContactLoading');
    const previewEl = document.getElementById('contactPreview');
    const saveBtn = document.getElementById('saveContact');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (previewEl) previewEl.style.display = 'none';
    if (saveBtn) {
        saveBtn.style.display = 'none';
        saveBtn.disabled = false;
    }
    
    hideAddContactStatus();
    
    try {
        // Get user info
        const userSnapshot = await database.ref('users').orderByChild('walkieId').equalTo(contactId).once('value');
        
        let displayName = contactId;
        let email = contactId;
        let online = false;
        
        if (userSnapshot.exists()) {
            const users = userSnapshot.val();
            const userId = Object.keys(users)[0];
            const userData = users[userId];
            
            if (userData.displayName) displayName = userData.displayName;
            if (userData.email) email = userData.email;
            if (userData.online !== undefined) online = userData.online;
        }
        
        // Update preview
        const previewName = document.getElementById('previewName');
        const previewId = document.getElementById('previewId');
        const previewStatus = document.getElementById('previewStatus');
        
        if (previewName) previewName.textContent = displayName;
        if (previewId) previewId.textContent = `ID: ${contactId}`;
        if (previewStatus) {
            previewStatus.innerHTML = `
                <div class="status-dot ${online ? 'online' : ''}"></div>
                <span>${online ? 'Online' : 'Offline'}</span>
            `;
        }
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (previewEl) previewEl.style.display = 'block';
        if (saveBtn) {
            saveBtn.style.display = 'block';
            saveBtn.disabled = false;
        }
        
        // Store data for saving
        window.tempContactData = {
            id: contactId,
            displayName: displayName,
            email: email,
            online: online
        };
        
    } catch (error) {
        console.error("Contact System: Error checking contact:", error);
        
        // Still allow adding
        const previewName = document.getElementById('previewName');
        const previewId = document.getElementById('previewId');
        const previewStatus = document.getElementById('previewStatus');
        
        if (previewName) previewName.textContent = contactId;
        if (previewId) previewId.textContent = `ID: ${contactId}`;
        if (previewStatus) {
            previewStatus.innerHTML = `
                <div class="status-dot"></div>
                <span>Status unknown</span>
            `;
        }
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (previewEl) previewEl.style.display = 'block';
        if (saveBtn) {
            saveBtn.style.display = 'block';
            saveBtn.disabled = false;
        }
        
        window.tempContactData = {
            id: contactId,
            displayName: contactId,
            email: contactId,
            online: false
        };
    }
}

// Save contact
async function saveContact() {
    const contactIdInput = document.getElementById('newContactId');
    if (!contactIdInput || !window.tempContactData || !contactsRef) return;
    
    const contactId = contactIdInput.value.trim();
    if (!contactId) return;
    
    const saveBtn = document.getElementById('saveContact');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        await contactsRef.child(contactId).set({
            displayName: window.tempContactData.displayName,
            email: window.tempContactData.email,
            addedAt: Date.now(),
            isFavorite: false
        });
        
        console.log(`✅ Contact System: Saved contact ${contactId}`);
        
        // Show success
        showAddContactStatus('Contact added successfully!', 'success');
        
        // Play sound
        if (window.AudioSystem && window.AudioSystem.playNotification) {
            window.AudioSystem.playNotification('message');
        }
        
        // Reset
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Contact';
            saveBtn.disabled = false;
        }
        
        contactIdInput.value = '';
        hideContactPreview();
        
        // Close after delay
        setTimeout(() => {
            hideAddContactModal();
        }, 1500);
        
    } catch (error) {
        console.error("❌ Contact System: Error saving contact:", error);
        showAddContactStatus('Failed to save contact', 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Contact';
        }
    }
}

// ==================== MODAL CONTROLS ====================

function showContactModal() {
    if (contactModalOpen) return;
    
    contactModalOpen = true;
    if (contactModal) {
        contactModal.style.display = 'flex';
        setTimeout(() => {
            contactModal.classList.add('show');
            
            // Focus search
            const searchInput = document.getElementById('contactSearch');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        }, 10);
        
        
    }
}

function hideContactModal() {
    contactModalOpen = false;
    if (contactModal) {
        contactModal.classList.remove('show');
        setTimeout(() => {
            contactModal.style.display = 'none';
            
            // Clear search
            const searchInput = document.getElementById('contactSearch');
            if (searchInput) searchInput.value = '';
        }, 300);
    }
}

function showAddContactModal() {
    hideContactModal();
    
    if (addContactModal) {
        addContactModal.style.display = 'flex';
        setTimeout(() => {
            addContactModal.classList.add('show');
            
            // Focus input
            const contactIdInput = document.getElementById('newContactId');
            if (contactIdInput) {
                contactIdInput.focus();
            }
        }, 10);
    }
}

function hideAddContactModal() {
    if (addContactModal) {
        addContactModal.classList.remove('show');
        setTimeout(() => {
            addContactModal.style.display = 'none';
            
            // Reset form
            const contactIdInput = document.getElementById('newContactId');
            const saveBtn = document.getElementById('saveContact');
            
            if (contactIdInput) contactIdInput.value = '';
            if (saveBtn) {
                saveBtn.style.display = 'none';
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Contact';
            }
            
            hideContactPreview();
            hideAddContactStatus();
        }, 300);
    }
}

function hideContactPreview() {
    const preview = document.getElementById('contactPreview');
    const loading = document.getElementById('addContactLoading');
    const saveBtn = document.getElementById('saveContact');
    
    if (preview) preview.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    
    delete window.tempContactData;
}

// ==================== UTILITIES ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

function showAddContactStatus(message, type = 'info') {
    const statusEl = document.getElementById('addContactStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        statusEl.style.display = 'block';
    }
}

function hideAddContactStatus() {
    const statusEl = document.getElementById('addContactStatus');
    if (statusEl) {
        statusEl.style.display = 'none';
    }
}

function searchContacts() {
    renderContactsList();
}

function getTimeAgo(timestamp) {
    if (!timestamp || timestamp === 0) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return 'Long ago';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== INITIALIZATION ====================

// Wait for main app to load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            initializeContactSystem();
        } else {
            // Check for auth
            const authCheck = setInterval(() => {
                if (typeof currentUser !== 'undefined' && currentUser) {
                    clearInterval(authCheck);
                    initializeContactSystem();
                }
            }, 500);
        }
    }, 2000);
});

// Integrate with main app
if (typeof integrateContactSystem === 'undefined') {
    window.integrateContactSystem = function() {
        initializeContactSystem();
    };
}

// Export for main script
window.ContactSystem = {
    initialize: initializeContactSystem,
    showContactModal: showContactModal,
    hideContactModal: hideContactModal
};