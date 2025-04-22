// Get all text content from the page
function getPageText() {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let text = '';
    let node;
    while (node = walker.nextNode()) {
        if (node.parentElement.tagName !== 'SCRIPT' && 
            node.parentElement.tagName !== 'STYLE') {
            text += node.textContent + ' ';
        }
    }
    return text;
}

// Calculate word count
function calculateWordCount(text) {
    return text.trim().split(/\s+/).length;
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getReadingTime') {
        const text = getPageText();
        const wordCount = calculateWordCount(text);
        sendResponse({ wordCount });
    }
    return true;
}); 