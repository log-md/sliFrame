/*
    known bugs 
    [ ] need to refresh after deleting slides 
    [ ] presenter mode loads from scratch 
    [ ] sometimes have to do pre/next slide  to update. 
*/

function isValidURL(text) {
    return text.includes('www') ||
           text.includes('http://') || 
           text.includes('https://') || 
           text.includes(".com/")  ||
           text.includes(".ai/"); 
}

function fixUrl(url) {
    let end = '';
    if (url.includes("?")) end = "&slide";
    else end = "?slide";
    if (!url.includes("www") && !url.includes("http")) return "https://" + url + end; 
    if (url.includes("rcsb.ai")) return url + end;
    return url; 
}

function getSlideId() {
    const match = location.href.match(/#slide=id\.([\w\d_]+)/);
    return match ? match[1] : null;
}

function getGrandparent(element, editorId) {
    while (element.parentElement && element.parentElement.id !== editorId) {
        element = element.parentElement;
    }
    return element;
}

function calculateOverlayDimensions(grandParent) {
    let svg = grandParent;
    while (svg && svg.tagName !== 'svg') svg = svg.parentElement;
    
    const svgRect = svg.getBoundingClientRect();
    const grandParentBox = grandParent.getBBox();
    
    const scaleX = svgRect.width / svg.viewBox.baseVal.width;
    const scaleY = svgRect.height / svg.viewBox.baseVal.height;
    
    const transformGroup = svg.querySelector('g[transform]');
    const transform = transformGroup ? transformGroup.getAttribute('transform') : '';
    const scale = transform && transform.match(/scale\(([\d.]+)\)/) ? parseFloat(transform.match(/scale\(([\d.]+)\)/)[1]) : 1;
    
    const parentRect = grandParent.getBoundingClientRect();
    
    const textElement = grandParent.querySelector('text') || grandParent;
    const textHeight = textElement.getBoundingClientRect().height;
    
    
    const dim = {
        left: parentRect.left,
        top: parentRect.top,
        width: grandParentBox.width * scale * scaleX,
        height: grandParentBox.height * scale * scaleY,
        textHeight: textHeight
    };

    return dim;
}

function overlayGrandparent(grandParent, text, index) {
    const dimensions = calculateOverlayDimensions(grandParent);
    
    // Create a container for both the iframe and the textbox
    const container = document.createElement("div");
    const slideId = getSlideId();
    
    container.id = `gsiframe-container-${slideId}-${index}`;
    container.classList.add("gsiframe-container");
    container.style.cssText = `
        position: fixed;
        top: ${dimensions.top}px;
        left: ${dimensions.left}px;
        width: ${dimensions.width}px;
        height: ${dimensions.height}px; 
        z-index: 1000;
    `;
    
    // Create the iframe
    const overlay = document.createElement("iframe");
    overlay.id = `gsiframe-overlay-${slideId}-${index}`;
    overlay.classList.add("gsiframe-overlay");
    let top = dimensions.textHeight;
    overlay.style.cssText = `
        width: 100%;
        height: calc(100% - ${top}px); /* Leave space for textbox */
        border: 1px solid #34d399;
        border-radius: 4px 4px 0 0;
        padding: 0;
    `;
    
    if (isValidURL(text)) overlay.src = fixUrl(text);
    
    // Add element to container 
    container.appendChild(overlay);

    // add container to body or iframe depending on fullscreen. 
    if (!isFullscreen) {
        document.body.appendChild(container);
    }
    else{
        const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
        const activeIframe = presentIframes.find(f => f.offsetParent !== null);
        activeIframe.contentWindow.document.body.appendChild(container);
    }

    return container; 
}


function findPresentationTextElement(textContent) {
    // Find the active presentation iframe
    const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
    const activeIframe = presentIframes.find(f => f.offsetParent !== null);
    
    // Find the element in the presentation iframe with matching aria-label
    const presentDoc = activeIframe.contentWindow.document;
    const elements = presentDoc.querySelectorAll('[aria-label]');
    
    for (const element of elements) {
        if (element.getAttribute('aria-label') === textContent) {
            return element;
        }
    }
    
    return null;
}

function updateIframePositions() {
    const slideId = getSlideId();
    if (!slideId) return;
    
    const editorP = document.querySelector(`#pages #editor-${slideId}`);
    if (!editorP) return;
    
    editorP.querySelectorAll('text').forEach((textElement, index) => {
        if (!isValidURL(textElement.textContent)) return;
        
        // Get the appropriate document context
        let doc = document;
        if (isFullscreen) {
            const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
            const activeIframe = presentIframes.find(f => f.offsetParent !== null);
            if (!activeIframe) return;
            doc = activeIframe.contentWindow.document;
        }
        
        const container = doc.getElementById(`gsiframe-container-${slideId}-${index}`);
        if (!container) return;
        
        const url = textElement.textContent;
        const iframe = container.querySelector('iframe');
        if (iframe.src != fixUrl(url)) iframe.src = fixUrl(url);
        
        let dimensions;
        
        if (isFullscreen) {
            // Find the corresponding element in the presentation iframe
            const presentationElement = findPresentationTextElement(url);
            if (!presentationElement) {console.log('bad');return;}
            const rect = presentationElement.getBoundingClientRect();
            dimensions = {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height-40,
                textHeight: 40
            };
        } else {
            const grandParent = getGrandparent(textElement, `editor-${slideId}`);
            dimensions = calculateOverlayDimensions(grandParent);
        }
        
        let top = dimensions.textHeight * 1.3;
        container.style.marginTop = `${top}px`;
        
        container.style.top = `${dimensions.top}px`;
        container.style.left = `${dimensions.left}px`;
        container.style.width = `${dimensions.width}px`; 
        container.style.height = `${dimensions.height}px`; 
    });
}

// document.getElementById(..) gets confused when moving into presenter iframe. 
let iframes = {};

async function refreshIframes() {
    // Clear existing iframes
    document.querySelectorAll(".gsiframe-container").forEach(
        container => container.style.display = "none"
    );
    
    // Clear presenter iframes if in fullscreen
    if (isFullscreen) {
        const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
        const activeIframe = presentIframes.find(f => f.offsetParent !== null);
        if (activeIframe) {
            activeIframe.contentWindow.document.querySelectorAll('.gsiframe-container').forEach(
                container => container.style.display = "none"
            );
        }
    }

    const slideId = getSlideId();
    if (!slideId) return;
    let editorP = document.querySelector(`#pages #editor-${slideId}`);
    if (!editorP) return;
    
    // Process text elements
    editorP.querySelectorAll('text').forEach((textElement, index) => {
        if (!isValidURL(textElement.textContent)) return;

        // Get the appropriate document context
        let doc = document;
        if (isFullscreen) {
            const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
            const activeIframe = presentIframes.find(f => f.offsetParent !== null);
            if (!activeIframe) return;
            doc = activeIframe.contentWindow.document;
        }
        
        let container = doc.getElementById(`gsiframe-container-${slideId}-${index}`);

        if (container) {
            container.style.display = "inline";
        } else {
            const grandParent = getGrandparent(textElement, `editor-${slideId}`);
            
            if (isFullscreen) {
                // For fullscreen, create directly in the presentation iframe
                const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
                const activeIframe = presentIframes.find(f => f.offsetParent !== null);
                if (!activeIframe) return;
                
                // Force redraw by creating a new container and appending it
                container = overlayGrandparent(grandParent, textElement.textContent, index);
            } else {
                // For editor view
                container = overlayGrandparent(grandParent, textElement.textContent, index);
            }
        }
    });
    
    // Update positions after creating/showing all iframes
    setTimeout(updateIframePositions, 50);
}

// Track slide content changes
let currentSlideId = '';
let textContentMap = new Map(); // Store text content for comparison
let isFullscreen = false;

function mainLoop() {
    // Check if in fullscreen mode
    let _isFullscreen = !!document.fullscreenElement || !!document.webkitFullscreenElement || 
                        !!document.mozFullScreenElement || !!document.msFullscreenElement;
    
    if (_isFullscreen !== isFullscreen) {
        console.log(_isFullscreen ? "Enter Fullscreen" : "Exit Fullscreen");
        isFullscreen = _isFullscreen;
        // Give time for the presentation mode to fully initialize
        setTimeout(refreshIframes, 300);
    } 
    
    const slideId = getSlideId();
    if (!slideId) return;
    
    // Check if slide changed
    if (slideId !== currentSlideId) {
        currentSlideId = slideId;
        refreshIframes();
    }

    // Update iframe positions periodically
    updateIframePositions();
}

// poor/none event handling, manually check every 30ms :'(
setInterval(mainLoop, 30);