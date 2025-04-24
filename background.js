let currentSessionTime = 0;
let totalSessionTimes = {};
let isSessionActive = false;
let updateInterval = null;
let currentUrl = '';

// Format time as HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Start a new session
function startSession() {
    console.log('Starting session...');
    if (!isSessionActive) {
        isSessionActive = true;
        currentSessionTime = 0;
        
        // Capture the URL of the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            currentUrl = activeTab.url;
            console.log('Session started for URL:', currentUrl);
            
            // Reset total session time for the new URL if not already tracked
            if (!totalSessionTimes[currentUrl]) {
                totalSessionTimes[currentUrl] = 0;
            }
            
            // Update time every second
            updateInterval = setInterval(() => {
                currentSessionTime++;
                totalSessionTimes[currentUrl]++;
                console.log('Current session time:', currentSessionTime);
                console.log('Total session time for URL:', totalSessionTimes[currentUrl]);
                
                // Update badge
                chrome.action.setBadgeText({ text: formatTime(currentSessionTime) });
                
                // Save to storage
                chrome.storage.local.set({ 
                    currentSessionTime,
                    totalSessionTimes
                });

                // Notify popup of time update
                chrome.runtime.sendMessage({
                    action: 'updateSessionTime',
                    currentTime: currentSessionTime,
                    totalTime: totalSessionTimes[currentUrl]
                }).then(response => {
                    console.log('Time update message sent, currentTime:', currentSessionTime);
                }).catch(error => {
                    // This is normal if the popup is closed - Chrome will throw an error
                    console.log('Could not send time update - popup might be closed');
                });
            }, 1000);
            
            // Enable badge
            chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
            chrome.action.setBadgeText({ text: '00:00:00' });

            // Notify popup that session has started
            chrome.runtime.sendMessage({
                action: 'sessionStarted',
                currentTime: 0,
                totalTime: totalSessionTimes[currentUrl] || 0
            }).then(response => {
                console.log('Session started message sent to popup, response:', response);
            }).catch(error => {
                console.error('Error sending session started message:', error);
            });

            // Store the session with the URL
            chrome.storage.local.get(['sessions'], (result) => {
                const sessions = result.sessions || [];
                sessions.push({
                    startTime: Date.now(),
                    url: currentUrl
                });
                chrome.storage.local.set({ sessions });
            });
        });
    }
}

// Stop the current session
function stopSession() {
    console.log('Stopping session...');
    if (isSessionActive) {
        isSessionActive = false;
        clearInterval(updateInterval);
        
        // Calculate the duration in seconds
        const duration = currentSessionTime;
        console.log('Session stopped. Duration:', duration);

        // Save session to history
        chrome.storage.local.get(['sessions'], (result) => {
            const sessions = result.sessions || [];
            if (sessions.length === 0) {
                console.error('No sessions found when stopping session');
                return;
            }
            
            const lastSession = sessions[sessions.length - 1];
            if (!lastSession) {
                console.error('Could not find the last session');
                return;
            }
            
            // Make sure we're updating the correct session (matching URL)
            if (lastSession.url === currentUrl) {
                lastSession.endTime = Date.now();
                lastSession.duration = duration;
                console.log('Updated session with endTime and duration:', lastSession);
                chrome.storage.local.set({ sessions });
            } else {
                console.error('Last session URL does not match current URL');
            }
        });
        
        // Reset current session
        currentSessionTime = 0;
        chrome.action.setBadgeText({ text: '' });

        // Notify popup that session has stopped
        chrome.runtime.sendMessage({
            action: 'sessionStopped',
            currentTime: 0,
            totalTime: totalSessionTimes[currentUrl] || 0
        });
    }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message from popup:', request);
    if (request.action === 'startSession') {
        startSession();
        sendResponse({ success: true });
    } else if (request.action === 'stopSession') {
        stopSession();
        sendResponse({ success: true });
    } else if (request.action === 'getSessionStatus') {
        // Check if there's a URL in the request to get the specific URL's total time
        const urlToCheck = request.url || currentUrl;
        const totalTimeForUrl = totalSessionTimes[urlToCheck] || 0;
        
        // Return the status of the currently *active* session,
        // including the total time accumulated for the URL associated with that session.
        sendResponse({
            isActive: isSessionActive,
            currentTime: currentSessionTime, // Time elapsed in the current active session
            totalTime: totalTimeForUrl, // Total time for the requested URL
            currentUrl: currentUrl // Let the popup know which URL is currently being tracked
        });
    } else if (request.action === 'clearUrlTime') {
        // Reset the total time for the specified URL
        const urlToClear = request.url || currentUrl;
        const forceReset = request.forceReset || false; // Check if this is a forced reset
        
        console.log(`Clearing URL time for ${urlToClear} (force: ${forceReset})`);
        
        // Always reset the total time for this URL
        totalSessionTimes[urlToClear] = 0;
        
        // Save the updated times to storage immediately
        chrome.storage.local.set({ totalSessionTimes }, () => {
            console.log('Saved resetted total times to storage');
        });
        
        // If this is the current active URL, reset the current session time too
        if (isSessionActive && urlToClear === currentUrl) {
            console.log('Resetting active session for current URL');
            
            // Reset the current session time
            currentSessionTime = 0;
            
            // Update badge
            chrome.action.setBadgeText({ text: '00:00:00' });
            
            // If this is a forced reset or we're resetting the current URL
            if (forceReset) {
                console.log('Sending forced reset notification to popup');
                
                // Stop any ongoing session if this is a force reset
                clearInterval(updateInterval);
                updateInterval = null;
                
                // Notify popup of the reset with a forced flag
                chrome.runtime.sendMessage({
                    action: 'sessionReset',
                    currentTime: 0,
                    totalTime: 0,
                    forced: true
                });
            }
        }
        
        console.log('Reset total time for URL:', urlToClear);
        
        sendResponse({ success: true });
    }
    return true;
});

// Initialize
chrome.storage.local.get(['totalSessionTimes'], (result) => {
    totalSessionTimes = result.totalSessionTimes || {};
}); 