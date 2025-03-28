const toggle = document.getElementById('iframeToggle');

// Load the stored state
chrome.storage.local.get('iframeEnabled', (data) => {
  toggle.checked = data.iframeEnabled !== false; // Default to true
});

// Save the state when the toggle changes
toggle.addEventListener('change', () => {
  chrome.storage.local.set({ iframeEnabled: toggle.checked });
  //send message to content script to re-evaluate.
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {iframeEnabled: toggle.checked});
  });
});
