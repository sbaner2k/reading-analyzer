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
    const start = new Date(startTime).toLocaleTimeString();
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
        const response = await chrome.runtime.sendMessage({ action: 'startSession' });
        console.log('Start session response:', response);
        if (response && response.success) {
            isSessionActive = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            console.log('Session started successfully');
            updateSessionTime(response.currentTime, response.totalTime);
        }
    } catch (error) {
        console.error('Error starting session:', error);
    }
}

async function stopSession() {
    console.log('Stop button clicked');
    try {
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
            sessionElement.innerHTML = `
                <span class="session-number">${filteredSessions.length - index}.</span>
                <span class="session-date">${formatDate(session.startTime)}</span>
                <span class="session-time">${formatTimeRange(session.startTime, session.endTime)}</span>
                <span class="session-duration">Duration: ${formatTime(session.duration)}</span>
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
    if (isNaN(currentTime) || isNaN(totalTime)) {
        console.error('Received NaN values for session time:', { currentTime, totalTime });
    }
    currentSessionTimeElement.textContent = formatTime(currentTime);
    totalSessionTimeElement.textContent = formatTime(totalTime);
}

// Initialize
async function initialize() {
    // Load initial session history
    await loadSessionHistory();

    // Check initial session status
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getSessionStatus' });
        if (response) {
            isSessionActive = response.isActive;
            startBtn.disabled = isSessionActive;
            stopBtn.disabled = !isSessionActive;
            updateSessionTime(response.currentTime || 0, response.totalTime || 0);
        }
    } catch (error) {
        console.error('Error getting session status:', error);
    }

    // Initial calculation
    await calculateReadingTime();

    // Listen for session time updates
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'updateSessionTime') {
            updateSessionTime(request.currentTime, request.totalTime);
        } else if (request.action === 'sessionStarted') {
            isSessionActive = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            updateSessionTime(request.currentTime, request.totalTime);
        } else if (request.action === 'sessionStopped') {
            isSessionActive = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            updateSessionTime(0, request.totalTime);
            loadSessionHistory();
        }
    });
}

// Event Listeners
calculateBtn.addEventListener('click', calculateReadingTime);
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
clearSessionsBtn.addEventListener('click', clearSessions);

// Start the application
initialize(); 