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
                });
            }, 1000);
            
            // Enable badge
            chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
            chrome.action.setBadgeText({ text: '00:00:00' });

            // Notify popup that session has started
            chrome.runtime.sendMessage({
                action: 'sessionStarted',
                currentTime: currentSessionTime,
                totalTime: totalSessionTimes[currentUrl]
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
            const lastSession = sessions[sessions.length - 1];
            lastSession.endTime = Date.now();
            lastSession.duration = duration;
            chrome.storage.local.set({ sessions });
        });
        
        // Reset current session
        currentSessionTime = 0;
        chrome.action.setBadgeText({ text: '' });

        // Notify popup that session has stopped
        chrome.runtime.sendMessage({
            action: 'sessionStopped',
            currentTime: 0,
            totalTime: totalSessionTimes[currentUrl]
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
        sendResponse({
            isActive: isSessionActive,
            currentTime: currentSessionTime,
            totalTime: totalSessionTimes[currentUrl] || 0
        });
    }
    return true;
});

// Initialize
chrome.storage.local.get(['totalSessionTimes'], (result) => {
    totalSessionTimes = result.totalSessionTimes || {};
}); 