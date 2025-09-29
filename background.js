class TubeTitleGeneratorBackground {
  constructor() {
    this.init();
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
    });

    // Handle extension icon click
    chrome.action.onClicked.addListener((tab) => {
      this.handleIconClick(tab);
    });

    // Handle tab updates to detect YouTube Studio navigation
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });
  }

  handleInstallation(details) {
    if (details.reason === 'install') {
      console.log('TubeMate Tools installed');
      
      // Set default settings
      chrome.storage.local.set({
        settings: {
          autoSuggest: true,
          suggestionDelay: 1000,
          maxSuggestions: 8
        }
      });

      // Redirect to YouTube Studio after installation
      chrome.tabs.create({
        url: 'https://studio.youtube.com'
      });
      
      console.log('TubeMate Tools installed successfully, redirecting to YouTube Studio');
    }
  }

  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'openPopup':
        this.openPopup(sender.tab);
        break;
        
      case 'generateTitles':
        this.generateTitles(request.input, request.type)
          .then(suggestions => sendResponse({ success: true, suggestions }))
          .catch(error => {
            // Pass through API error details if available
            const errorResponse = {
              success: false,
              error: error.message
            };
            
            // Include error code if it's an API error
            if (error.code) {
              errorResponse.code = error.code;
            }
            
            // Include original API response if available
            if (error.apiResponse) {
              errorResponse.apiResponse = error.apiResponse;
            }
            
            sendResponse(errorResponse);
          });
        return true; // Keep message channel open for async response

      case 'generateThumbnails':
        this.generateThumbnails(request.description, request.type)
          .then(thumbnails => {
            sendResponse({ success: true, thumbnails });
          })
          .catch(error => {
            const errorResponse = {
              success: false,
              error: error.message
            };
            
            if (error.code) {
              errorResponse.code = error.code;
            }
            
            if (error.apiResponse) {
              errorResponse.apiResponse = error.apiResponse;
            }
            
            sendResponse(errorResponse);
          });
        return true;

      case 'generateDescription':
        this.generateDescription(request.keywords)
          .then(description => {
            sendResponse({ success: true, description });
          })
          .catch(error => {
            const errorResponse = {
              success: false,
              error: error.message
            };
            
            if (error.code) {
              errorResponse.code = error.code;
            }
            
            if (error.apiResponse) {
              errorResponse.apiResponse = error.apiResponse;
            }
            
            sendResponse(errorResponse);
          });
        return true;
        
      case 'checkYouTubeStudio':
        this.checkYouTubeStudio(sender.tab)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ isYouTubeStudio: false, error: error.message }));
        return true;
        
      case 'refreshCSS':
        console.log('TubeMate: Received CSS refresh request for tab:', sender.tab.id);
        this.injectCSSWithCacheBusting(sender.tab.id)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      default:
        console.log('Unknown message action:', request.action);
    }
  }

  handleIconClick(tab) {
    // The popup will open automatically due to manifest configuration
    // This is just for additional logic if needed
    console.log('Extension icon clicked on tab:', tab.url);
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    // Check if user navigated to YouTube Studio
    if (changeInfo.status === 'complete' && 
        tab.url && 
        tab.url.includes('studio.youtube.com')) {
      
      // Inject content script if not already injected
      this.ensureContentScriptInjected(tabId);
      
      // Update extension badge
      this.updateBadge(tabId, 'ON');
    } else if (changeInfo.status === 'complete' && 
               tab.url && 
               !tab.url.includes('studio.youtube.com')) {
      // Clear badge when leaving YouTube Studio
      this.updateBadge(tabId, '');
    }
  }

  async ensureContentScriptInjected(tabId) {
    try {
      // Check if content script is already injected
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.tubeTitleGenerator !== undefined
      });

      if (!results[0].result) {
        // Content script not found, inject it
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });

        // Always inject CSS to ensure styles are loaded
        await this.injectCSSWithCacheBusting(tabId);

        console.log('TubeMate: Content script and CSS injected successfully');
      } else {
        // Even if content script exists, ensure CSS is injected with fresh styles
        try {
          await this.injectCSSWithCacheBusting(tabId);
        } catch (cssError) {
          console.log('TubeMate: CSS injection error:', cssError);
        }
      }
    } catch (error) {
      console.error('Error injecting content script:', error);
    }
  }

  async injectCSSWithCacheBusting(tabId) {
    try {
      // Method 1: Try to inject CSS directly as text to bypass caching
      const cssResponse = await fetch(chrome.runtime.getURL('content.css'));
      const cssText = await cssResponse.text();
      
      // Add a timestamp comment to ensure it's treated as new content
      const timestampedCSS = `/* Injected at ${Date.now()} */\n${cssText}`;
      
      await chrome.scripting.insertCSS({
        target: { tabId },
        css: timestampedCSS
      });
      
    } catch (error) {
      console.log('TubeMate: Direct CSS injection failed, trying fallback method:', error);
      
      // Method 2: Fallback to file injection (may use cached version)
      try {
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content.css']
        });
        console.log('TubeMate: CSS injected via file (may be cached)');
      } catch (fallbackError) {
        console.error('TubeMate: Both CSS injection methods failed:', fallbackError);
        
        // Method 3: Last resort - inject minimal styles directly
        const minimalCSS = `
          .ttg-suggestion-container {
            background: white !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
            border: 1px solid #e1e5e9 !important;
            min-width: 370px !important;
            font-family: 'Segoe UI', sans-serif !important;
            z-index: 10000 !important;
          }
          .ttg-title-suggestions-section {
            background: #f9f9f9 !important;
            border-radius: 8px !important;
            margin: 12px 0 0 0 !important;
            font-family: 'Segoe UI', sans-serif !important;
            z-index: 1000 !important;
          }
        `;
        
        await chrome.scripting.insertCSS({
          target: { tabId },
          css: minimalCSS
        });
        console.log('TubeMate: Minimal CSS injected as last resort');
      }
    }
  }

  updateBadge(tabId, text) {
    chrome.action.setBadgeText({
      tabId: tabId,
      text: text
    });

    if (text === 'ON') {
      chrome.action.setBadgeBackgroundColor({
        tabId: tabId,
        color: '#4CAF50'
      });
    }
  }

  async openPopup(tab) {
    // Focus on the extension popup (this is handled automatically by Chrome)
    // But we can trigger the popup programmatically if needed
    try {
      await chrome.action.openPopup();
    } catch (error) {
      console.log('Could not open popup programmatically:', error);
    }
  }

  async generateTitles(input, type = 'mainPopup') {
    try {
      // Make actual API call that will appear in Network tab
      const response = await this.makeApiCall(input, type);
      // Return all suggestions without filtering - same response for both auto-suggestions and main popup
      return response.suggestions;
    } catch (error) {
      // Fallback to static data if API fails
      const suggestions = this.getStaticTitleSuggestions(input);
      return suggestions;
    }
  }

  async generateThumbnails(description, type = 'thumbnailSuggestions') {
    try {
      const response = await this.makeThumbnailApiCall(description, type);
      return response.thumbnails;
    } catch (error) {
      // For now, return empty array to keep loading spinners as requested
      return [];
    }
  }

  async generateDescription(keywords) {
    try {
      const response = await this.makeDescriptionApiCall(keywords);
      return response.description;
    } catch (error) {
      // Return fallback description
      return this.getStaticDescription(keywords);
    }
  }

  async makeApiCall(input, type) {
    const API_ENDPOINT = 'https://api.tubemaster.ai/api/generate-titles';
    
    const requestPayload = {
      title: input
    };

    console.log('TubeMate: Making API request to', API_ENDPOINT);

    try {
      // Make the actual API call that will be visible in Network tab
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TubeMate-Extension/1.0'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle API error responses with success: false
      if (data && data.success === false) {
        const errorMessage = data.error || 'API returned error';
        const errorCode = data.code || 'UNKNOWN_ERROR';
        
        const apiError = new Error(errorMessage);
        apiError.code = errorCode;
        apiError.apiResponse = data;
        throw apiError;
      }
      
      return data;
      
    } catch (error) {
      console.log('TubeMate: API call failed, using fallback data:', error.message);
      
      // Fallback to static data when API fails
      const mockResponse = {
        success: true,
        suggestions: this.getStaticTitleSuggestions(input),
        title: input
      };

      return mockResponse;
    }
  }


  async makeThumbnailApiCall(description) {
    
    const API_ENDPOINT = 'https://api.tubemaster.ai/api/generate-thumbnails';
    
    const requestPayload = {
      description: description,
    };

    console.log('TubeMate: Making thumbnail API request to', API_ENDPOINT);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TubeMate-Extension/1.0'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.success === false) {
        const errorMessage = data.error || 'Thumbnail API returned error';
        const errorCode = data.code || 'UNKNOWN_ERROR';
        
        const apiError = new Error(errorMessage);
        apiError.code = errorCode;
        apiError.apiResponse = data;
        throw apiError;
      }
      
      return {
        thumbnails: data.thumbnails
      };
      
    } catch (error) {
      console.log('TubeMate: Thumbnail API call failed:', error.message);
    }
  }

  async makeDescriptionApiCall(keywords) {
    const API_ENDPOINT = 'https://api.tubemaster.ai/api/generate-description';
    
    const requestPayload = {
      keywords: keywords,
    };

    console.log('TubeMate: Making description API request to', API_ENDPOINT);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TubeMate-Extension/1.0'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.success === false) {
        const errorMessage = data.error || 'Description API returned error';
        const errorCode = data.code || 'UNKNOWN_ERROR';
        
        const apiError = new Error(errorMessage);
        apiError.code = errorCode;
        apiError.apiResponse = data;
        throw apiError;
      }
      
      return {
        description: data.description
      };
      
    } catch (error) {
      console.log('TubeMate: Description API call failed:', error.message);
      throw error; // Re-throw to be caught by generateDescription
    }
  }

  getStaticDescription(keywords) {
    // Fallback static description generation
    const keywordsList = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    const templates = [
      `Discover everything you need to know about ${keywordsList.join(', ')}! In this comprehensive guide, we'll explore the key concepts and provide practical tips to help you succeed.`,
      
      `Looking to learn more about ${keywordsList.join(', ')}? This video covers all the essential information you need, from beginner basics to advanced techniques.`,
      
      `Join us as we dive deep into ${keywordsList.join(', ')}. Whether you're just starting out or looking to expand your knowledge, this video has something for everyone.`,
      
      `Everything you need to know about ${keywordsList.join(', ')} in one place! We'll break down the concepts, share proven strategies, and help you get started today.`
    ];
    
    // Return a random template
    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex] + '\n\n#' + keywordsList.join(' #');
  }

  getStaticTitleSuggestions(input) {
    // Static suggestions with scores and IDs - easy for backend developers to modify
    const baseSuggestions = [
      { id: 'title_1', text: `${input} - Complete Guide`, score: 95 },
      { id: 'title_2', text: `How to ${input} in 2024`, score: 92 },
      { id: 'title_3', text: `${input}: Everything You Need to Know`, score: 89 },
      { id: 'title_4', text: `The Ultimate ${input} Tutorial`, score: 87 },
      { id: 'title_5', text: `${input} Tips and Tricks`, score: 85 },
      { id: 'title_6', text: `Mastering ${input}: Step by Step`, score: 82 },
      { id: 'title_7', text: `${input} for Beginners`, score: 80 },
      { id: 'title_8', text: `Advanced ${input} Techniques`, score: 78 }
    ];
    
    return baseSuggestions;
  }

  async checkYouTubeStudio(tab) {
    const isYouTubeStudio = tab && tab.url && tab.url.includes('studio.youtube.com');
    
    return {
      isYouTubeStudio,
      url: tab?.url,
      title: tab?.title
    };
  }
}

// Initialize the background script
new TubeTitleGeneratorBackground();
