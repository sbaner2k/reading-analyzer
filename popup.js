// DOM Elements
const wordCountElement = document.getElementById('wordCount');
const readingTimeElement = document.getElementById('readingTime');
const calculateBtn = document.getElementById('calculateBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const currentSessionTimeElement = document.getElementById('currentSessionTime');
const totalSessionTimeElement = document.getElementById('totalSessionTime');
const noSessionsElement = document.getElementById('noSessions');
const sessionListElement = document.getElementById('sessionList');
const clearSessionsBtn = document.getElementById('clearSessionsBtn');

// State
let isSessionActive = false;
let currentUrl = '';
let popupTimerInterval = null;
let localSessionTime = 0;

// Helper Functions
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}

function formatTimeRange(startTime, endTime) {
    if (!startTime) {
        return 'Invalid time range';
    }
    
    const start = new Date(startTime).toLocaleTimeString();
    
    // Check if endTime is valid
    if (!endTime) {
        return `${start} - In progress...`;
    }
    
    const end = new Date(endTime).toLocaleTimeString();
    return `${start} - ${end}`;
}

// Event Handlers
async function calculateReadingTime() {
    console.log('Calculate Reading Time button clicked');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentUrl = tab.url;
        console.log('Active tab URL:', currentUrl);
        
        // Get total time for this URL to update the display
        const timeResponse = await chrome.runtime.sendMessage({ 
            action: 'getSessionStatus',
            url: currentUrl
        });
        if (timeResponse) {
            // Update total time for this URL, but keep current session time if there's an active session
            if (isSessionActive && timeResponse.currentUrl === currentUrl) {
                // Active session for this URL - update both times
                updateSessionTime(timeResponse.currentTime || 0, timeResponse.totalTime || 0);
            } else {
                // No active session for this URL - only update total time
                updateSessionTime(0, timeResponse.totalTime || 0);
            }
        }
        
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getReadingTime' });
        console.log('Response from content script:', response);
        
        if (response && response.wordCount) {
            wordCountElement.textContent = response.wordCount.toLocaleString();
            const minutes = Math.ceil(response.wordCount / 200); // Assuming 200 words per minute
            readingTimeElement.textContent = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
    } catch (error) {
        console.error('Error calculating reading time:', error);
        wordCountElement.textContent = '0';
        readingTimeElement.textContent = '0 minutes';
    }
}

async function startSession() {
    console.log('Start button clicked');
    try {
        // Get the latest total time for this URL before starting
        const timeResponse = await chrome.runtime.sendMessage({ 
            action: 'getSessionStatus',
            url: currentUrl
        });
        const initialTotalTime = timeResponse?.totalTime || 0;
        
        // Immediately update UI to show session has started
        isSessionActive = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        // Initialize timer display to 00:00:00, but keep the total time
        localSessionTime = 0;
        updateSessionTime(0, initialTotalTime);
        
        // Start a local timer to update the UI every second
        if (popupTimerInterval) {
            clearInterval(popupTimerInterval);
        }
        
        popupTimerInterval = setInterval(() => {
            localSessionTime++;
            // Update UI with local time (this will be replaced by background updates when they arrive)
            const currentElement = document.getElementById('currentSessionTime');
            if (currentElement) {
                currentElement.textContent = formatTime(localSessionTime);
            }
            
            // Also update total time by adding to the initial value
            const totalElement = document.getElementById('totalSessionTime');
            if (totalElement) {
                totalElement.textContent = formatTime(initialTotalTime + localSessionTime);
            }
        }, 1000);
        
        // Send message to background script to start session
        const response = await chrome.runtime.sendMessage({ action: 'startSession' });
        console.log('Start session response:', response);
        if (!response || !response.success) {
            // Reset UI if background script fails to start session
            isSessionActive = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            // Clear local timer
            clearInterval(popupTimerInterval);
            popupTimerInterval = null;
            console.error('Failed to start session');
        } else {
            console.log('Session started successfully');
        }
    } catch (error) {
        console.error('Error starting session:', error);
        // Reset UI if there's an error
        isSessionActive = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        // Clear local timer
        clearInterval(popupTimerInterval);
        popupTimerInterval = null;
    }
}

async function stopSession() {
    console.log('Stop button clicked');
    try {
        // Clear local timer
        if (popupTimerInterval) {
            clearInterval(popupTimerInterval);
            popupTimerInterval = null;
        }
        
        const response = await chrome.runtime.sendMessage({ action: 'stopSession' });
        console.log('Stop session response:', response);
        if (response && response.success) {
            isSessionActive = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            console.log('Session stopped successfully');
            await loadSessionHistory();
        }
    } catch (error) {
        console.error('Error stopping session:', error);
    }
}

async function loadSessionHistory() {
    try {
        const result = await chrome.storage.local.get('sessions');
        const sessions = result.sessions || [];
        const filteredSessions = sessions.filter(session => session.url === currentUrl);
        
        if (filteredSessions.length === 0) {
            noSessionsElement.style.display = 'block';
            sessionListElement.style.display = 'none';
            return;
        }

        noSessionsElement.style.display = 'none';
        sessionListElement.style.display = 'block';
        sessionListElement.innerHTML = '';

        filteredSessions.reverse().forEach((session, index) => {
            const sessionElement = document.createElement('div');
            sessionElement.className = 'session-entry';
            
            // Validate duration - if it's not a valid number, display "n/a"
            const durationDisplay = (typeof session.duration === 'number' && !isNaN(session.duration)) 
                ? formatTime(session.duration) 
                : 'n/a';
            
            sessionElement.innerHTML = `
                <span class="session-number">${filteredSessions.length - index}.</span>
                <span class="session-date">${formatDate(session.startTime)}</span>
                <span class="session-time">${formatTimeRange(session.startTime, session.endTime)}</span>
                <span class="session-duration">Duration: ${durationDisplay}</span>
            `;
            sessionListElement.appendChild(sessionElement);
        });
    } catch (error) {
        console.error('Error loading session history:', error);
    }
}

async function clearSessions() {
    try {
        const result = await chrome.storage.local.get('sessions');
        const sessions = result.sessions || [];
        const remainingSessions = sessions.filter(session => session.url !== currentUrl);
        await chrome.storage.local.set({ sessions: remainingSessions });
        await loadSessionHistory();
    } catch (error) {
        console.error('Error clearing sessions:', error);
    }
}

function updateSessionTime(currentTime, totalTime) {
    console.log('Updating session time with values:', { currentTime, totalTime });
    
    // Ensure values are numbers and not NaN
    const currentTimeValue = typeof currentTime === 'number' && !isNaN(currentTime) ? currentTime : 0;
    const totalTimeValue = typeof totalTime === 'number' && !isNaN(totalTime) ? totalTime : 0;
    
    const currentFormatted = formatTime(currentTimeValue);
    const totalFormatted = formatTime(totalTimeValue);
    
    console.log('Formatted time values:', { currentFormatted, totalFormatted });
    
    // Get fresh references to DOM elements in case they changed
    const currentElement = document.getElementById('currentSessionTime');
    const totalElement = document.getElementById('totalSessionTime');
    
    if (currentElement) {
        currentElement.textContent = currentFormatted;
        console.log('Updated current session time element to:', currentFormatted);
    } else {
        console.error('Could not find currentSessionTime element');
    }
    
    if (totalElement) {
        totalElement.textContent = totalFormatted;
        console.log('Updated total session time element to:', totalFormatted);
    } else {
        console.error('Could not find totalSessionTime element');
    }
}

// Initialize
async function initialize() {
    // Load initial session history
    await loadSessionHistory();

    // Check initial session status
    try {
        const response = await chrome.runtime.sendMessage({ 
            action: 'getSessionStatus',
            url: currentUrl // Send the current URL to get the correct total time
        });
        if (response) {
            isSessionActive = response.isActive;
            startBtn.disabled = isSessionActive;
            stopBtn.disabled = !isSessionActive;
            
            // If there's an active session but it's for a different URL, only update totalTime
            if (isSessionActive && response.currentUrl !== currentUrl) {
                // Don't show current session time for a different URL
                updateSessionTime(0, response.totalTime || 0);
            } else {
                // Update both current and total time
                updateSessionTime(response.currentTime || 0, response.totalTime || 0);
            }
        }
    } catch (error) {
        console.error('Error getting session status:', error);
    }

    // Initial calculation
    await calculateReadingTime();

    // Listen for session time updates
    const messageListener = (request) => {
        console.log('[Popup Listener] Received message:', request);
        
        if (request.action === 'updateSessionTime') {
            console.log('[Popup Listener] Updating time with:', request.currentTime, request.totalTime);
            // Sync our local timer with the background time
            localSessionTime = request.currentTime;
            updateSessionTime(request.currentTime, request.totalTime);
        } else if (request.action === 'sessionStarted') {
            console.log('[Popup Listener] Session started with time:', request.currentTime, request.totalTime);
            isSessionActive = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            localSessionTime = 0;
            updateSessionTime(request.currentTime, request.totalTime);
        } else if (request.action === 'sessionStopped') {
            console.log('[Popup Listener] Session stopped');
            isSessionActive = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            // Clear local timer
            if (popupTimerInterval) {
                clearInterval(popupTimerInterval);
                popupTimerInterval = null;
            }
            localSessionTime = 0;
            updateSessionTime(0, request.totalTime);
            loadSessionHistory();
        }
        return true; // Important: tells Chrome this listener handled the message
    };
    
    chrome.runtime.onMessage.addListener(messageListener);
}

// Event Listeners
calculateBtn.addEventListener('click', calculateReadingTime);
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
clearSessionsBtn.addEventListener('click', clearSessions);

// Start the application
initialize(); 

// Clean up when popup closes
window.addEventListener('unload', () => {
    if (popupTimerInterval) {
        clearInterval(popupTimerInterval);
        popupTimerInterval = null;
    }
}); 