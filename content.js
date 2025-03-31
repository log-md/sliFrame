/*
    known bugs 
    [ ] need to refresh after deleting slides 
    [ ] presenter mode loads from scratch 
    [ ] sometimes have to do pre/next slide  to update. 
*/
let iframes = {};

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

function calculateOverlayDimensions(textElement) {
    if (isFullscreen){
        const url = textElement.textContent;
        const presentationElement = findPresentationTextElement(url);
        if (!presentationElement) { return;}
        const rect = presentationElement.getBoundingClientRect();
        // in edit mode we make space for the text so it can be changed.
        // in presenter mode we don't need to see text so hide it 
        // by having iframe take up full height. 
        const textHeight = 0; 

        const dimensions = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            textHeight: textHeight
        };
        return dimensions;
    }
    else{
        const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        
        // firefox editor differs to chrome 
        if (isFirefox) {
            const slideId = getSlideId();
            const mainSlideArea = document.querySelector(`#editor-${slideId}`);
            const allTexts = mainSlideArea.querySelectorAll('text[text-rendering="geometricPrecision"]');
            
            // find text element with the right text. 
            let targetText = null;
            for (const text of allTexts) {
                if (text.textContent.trim() === textElement.textContent.trim()) {
                    targetText = text;
                    break;
                }
            }
            try {
                // get sibling of 8'th ancestor. 
                let ancestor = targetText;
                for (let i = 0; i < 8; i++) ancestor = ancestor.parentElement;
                const previousSibling = ancestor.previousElementSibling;
                const siblingRect = previousSibling.getBoundingClientRect();
                return {
                    left: siblingRect.left+8,
                    top: siblingRect.top+8,
                    width: siblingRect.width-16,
                    height: siblingRect.height-16,
                    textHeight: targetText.getBoundingClientRect().height*1.2
                };
            }
            catch(e){ return null; }
        }
        
        // Original Chrome approach
        const slideId = getSlideId();
        const grandParent = getGrandparent(textElement, `editor-${slideId}`);
        
        let svg = grandParent;
        while (svg && svg.tagName !== 'svg') {
            svg = svg.parentElement;
        }
        
        if (!svg) {console.log('no svg found'); return null;}
        
        const svgRect = svg.getBoundingClientRect();
        const grandParentBox = grandParent.getBBox();
        
        const scaleX = svgRect.width / svg.viewBox.baseVal.width;
        const scaleY = svgRect.height / svg.viewBox.baseVal.height;
        
        const transformGroup = svg.querySelector('g[transform]');
        const transform = transformGroup ? transformGroup.getAttribute('transform') : '';
        const scale = transform && transform.match(/scale\(([\d.]+)\)/) ? parseFloat(transform.match(/scale\(([\d.]+)\)/)[1]) : 1;
        const parentRect = grandParent.getBoundingClientRect();
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
}

function createOverlaidIframeContainer(textElement, index) {
    const slideId = getSlideId();
    let text = textElement.textContent;
    
    // Create container for iframe. 
    const container = document.createElement("div");
    container.id = `gsiframe-container-${slideId}-${index}`;
    container.classList.add("gsiframe-container");

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.id = `gsiframe-overlay-${slideId}-${index}`;
    iframe.classList.add("gsiframe-overlay");
    iframe.style.cssText = `
        width: 100%;
        height: 100%; 
        border: 1px solid #34d399;
        border-radius: 4px 4px 0 0;
    `;
    if (isValidURL(text)) iframe.src = fixUrl(text);
    // Append iframe to container. 
    container.appendChild(iframe);

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

async function refreshIframes() {
    const slideId = getSlideId();
    
    // Clear iframes in editor that don't match current slideId
    document.querySelectorAll(".gsiframe-container").forEach(container => {
        if (!container.id || !container.id.includes(`-${slideId}-`)) container.style.display = "none";
    });
    
    // Clear iframes in presenter (if fullscreen) that don't match current slideId
    if (isFullscreen) {
        const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
        const activeIframe = presentIframes.find(f => f.offsetParent !== null);
        if (activeIframe) {
            activeIframe.contentWindow.document.querySelectorAll('.gsiframe-container').forEach(container => {
                if (!container.id || !container.id.includes(`-${slideId}-`)) container.style.display = "none";
            });
        }
    }

    if (!slideId) return;
    let editorP = document.querySelector(`#pages #editor-${slideId}`);
    if (!editorP) return;
    
    // Find each text element in **editor** show/create iframe.
    // Loops over **editor** but also handles **presenter** (their text/iframes match).
    editorP.querySelectorAll('text').forEach((textElement, index) => {
        if (!isValidURL(textElement.textContent)) return;

        // Get the appropriate document context
        // OBS: the presenter is an iframe itself 
        //      it somehow blocks rendering other iframes on top of it. 
        //      => have to `presenter_iframe.appendChild(content_iframe)` :(
        let doc = document;
        if (isFullscreen) {
            const presentIframes = [...document.querySelectorAll('.punch-present-iframe')];
            const activeIframe = presentIframes.find(f => f.offsetParent !== null);
            if (!activeIframe) return;
            doc = activeIframe.contentWindow.document;
            // wait for presenter iframe to load (i.e. wait for next few mainLoop iteration)
            if (!doc.body) return; 
        }
        
        let container = doc.getElementById(`gsiframe-container-${slideId}-${index}`);

        // if container exists show it 
        if (container) container.style.display = "inline";
        else {  // if container doesn't exist create it. 
            container = createOverlaidIframeContainer(textElement, index);
            doc.body.appendChild(container); // doc is editor/presenter depending on isFullscreen
        }

        const url = textElement.textContent;
        const iframe = container.querySelector('iframe');
        if (iframe.src != fixUrl(url)) iframe.src = fixUrl(url);

        // Make iframe container position/size match textarea. 
        try {
            let dimensions = calculateOverlayDimensions(textElement);
            console.log('dimensions:', dimensions);
            let top = dimensions.textHeight * 1.4;
            container.style.marginTop = `${top}px`;
            container.style.top = `${dimensions.top}px`;
            container.style.left = `${dimensions.left}px`;
            container.style.width = `${dimensions.width}px`; 
            container.style.height = `${dimensions.height}px`; 
            container.style.position = 'fixed'; 
            container.style.zIndex = '1000';
            iframe.style.height = `calc(100% - ${top}px)`;
        }
        catch(e){ console.log('.');} // presenter iframe may not have loaded yet. 
    });
}

// Track slide content changes
let currentSlideId = '';
let isFullscreen = false;

function mainLoop() {
    // Check if in fullscreen mode
    isFullscreen = !!document.fullscreenElement;
    refreshIframes();
}

// poor/none event handling, manually fix every 50ms=20fps. 
setInterval(mainLoop, 50);