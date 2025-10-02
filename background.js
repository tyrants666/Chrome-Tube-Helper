class TubeTitleGeneratorBackground {
  constructor() {
    this.init();
  }

  // Authentication methods
  async isUserAuthenticated() {
    try {
      // First check if we can access tubemaster.ai localStorage
      const authData = await this.getAuthDataFromTubeMaster();
      if (authData && authData.token) {
        return true;
      }
      
      // Fallback to local storage (for backward compatibility)
      const result = await chrome.storage.local.get(['authToken', 'userInfo']);
      return !!(result.authToken && result.userInfo);
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  // Get auth data from Chrome storage (synced from tubemaster.ai)
  async getAuthDataFromTubeMaster() {
    try {
      // Try to get from Chrome storage first (most efficient)
      const result = await chrome.storage.local.get(['tubemaster_auth_session']);
      if (result.tubemaster_auth_session) {
        return result.tubemaster_auth_session;
      }

      // If not in storage, try existing tabs as fallback (but don't create new ones)
      const tabs = await chrome.tabs.query({url: "https://tubemaster.ai/*"});
      
      if (tabs.length > 0) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            try {
              const authSession = localStorage.getItem('auth_session');
              return authSession ? JSON.parse(authSession) : null;
            } catch (e) {
              return null;
            }
          }
        });
        
        if (results && results[0] && results[0].result) {
          // Store in Chrome storage for future use
          await chrome.storage.local.set({
            tubemaster_auth_session: results[0].result,
            tubemaster_auth_timestamp: Date.now()
          });
          
          return results[0].result;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting auth data from TubeMaster:', error);
      return null;
    }
  }

  // Handle auth data sync from tubemaster.ai content script
  async handleAuthDataSync(authData, timestamp) {
    try {
      if (authData && authData.token) {
        // Store in Chrome storage
        await chrome.storage.local.set({
          tubemaster_auth_session: authData,
          tubemaster_auth_timestamp: timestamp
        });
        
        console.log('TubeMaster: Auth data synced from tubemaster.ai');
        
        // Notify YouTube Studio tabs that auth state might have changed
        chrome.tabs.query({url: "https://studio.youtube.com/*"}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'authenticationComplete' });
          });
        });
      } else {
        // Auth data is null/empty, user might have signed out
        await chrome.storage.local.remove(['tubemaster_auth_session', 'tubemaster_auth_timestamp']);
        
        console.log('TubeMaster: Auth data cleared from tubemaster.ai');
        
        // Notify YouTube Studio tabs that user signed out
        chrome.tabs.query({url: "https://studio.youtube.com/*"}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'userSignedOut' });
          });
        });
      }
    } catch (error) {
      console.error('Error handling auth data sync:', error);
      throw error;
    }
  }



  async clearAuthData() {
    try {
      // Clear auth data from tubemaster.ai localStorage
      await this.clearAuthDataFromTubeMaster();
      
      // Clear Chrome storage
      await chrome.storage.local.remove([
        'tubemaster_auth_session',
        'tubemaster_auth_timestamp'
      ]);
      
      return true;
    } catch (error) {
      console.error('Error clearing auth data:', error);
      return false;
    }
  }

  // Clear auth data from tubemaster.ai localStorage (but don't trigger logout)
  async clearAuthDataFromTubeMaster() {
    try {
      // Only clear from existing tabs, don't create new ones
      const tabs = await chrome.tabs.query({url: "https://tubemaster.ai/*"});
      
      if (tabs.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            try {
              // Only clear auth session, don't trigger website logout
              localStorage.removeItem('auth_session');
              console.log('TubeMaster: Cleared auth_session from localStorage');
              return true;
            } catch (e) {
              console.error('Error clearing auth session:', e);
              return false;
            }
          }
        });
        console.log('TubeMaster: Cleared auth data from existing tubemaster.ai tab');
      } else {
        console.log('TubeMaster: No tubemaster.ai tabs open, auth data will be cleared when user visits the site');
      }
      
      return true;
    } catch (error) {
      console.error('Error clearing auth data from TubeMaster:', error);
      return false;
    }
  }

  async getAuthToken() {
    try {
      const authData = await this.getAuthDataFromTubeMaster();
      return authData && authData.token ? authData.token : null;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  async openAuthWindow() {
    try {
      const width = 500;
      const height = 700;

      // Get display info using chrome.system.display
      return new Promise((resolve) => {
        chrome.system.display.getInfo(async (displays) => {
          try {
            const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
            const screenWidth = primaryDisplay.workArea.width;
            const screenHeight = primaryDisplay.workArea.height;

            const left = Math.round((screenWidth - width) / 2);
            const top = Math.round((screenHeight - height) / 2);

            const authWindow = await chrome.windows.create({
              url: 'https://tubemaster.ai/auth?extension=true',
              type: 'popup',
              width,
              height,
              left,
              top,
              focused: true
            });

            // Set up monitoring for authentication completion
            this.monitorAuthWindow(authWindow.id);

            resolve({ success: true, windowId: authWindow.id });
          } catch (error) {
            resolve({ success: false, error: error.message });
          }
        });
      });
    } catch (error) {
      console.error('Error opening auth window:', error);
      return { success: false, error: error.message };
    }
  }

  // Monitor auth window for authentication completion
  async monitorAuthWindow(windowId) {
    const checkInterval = setInterval(async () => {
      try {
        // Check if window still exists
        const window = await chrome.windows.get(windowId);
        if (!window) {
          clearInterval(checkInterval);
          return;
        }

        // Get the active tab in the auth window
        const tabs = await chrome.tabs.query({ windowId: windowId });
        if (tabs.length === 0) {
          clearInterval(checkInterval);
          return;
        }

        const tab = tabs[0];
        
        // Check if we're still on tubemaster.ai domain
        if (tab.url && tab.url.includes('tubemaster.ai')) {
          // Execute script to check for auth_session in localStorage
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              try {
                const authSession = localStorage.getItem('auth_session');
                return authSession ? JSON.parse(authSession) : null;
              } catch (e) {
                return null;
              }
            }
          });

          if (results && results[0] && results[0].result && results[0].result.token) {
            // Authentication successful! Close the popup
            clearInterval(checkInterval);
            chrome.windows.remove(windowId);
            
            // Sync the auth data immediately
            await this.handleAuthDataSync(results[0].result, Date.now());
            
            // Check if YouTube Studio tab is already open before creating new one
            chrome.tabs.query({url: "https://studio.youtube.com/*"}, (existingTabs) => {
              if (existingTabs.length === 0) {
                // No YouTube Studio tab open, create one
                chrome.tabs.create({
                  url: 'https://studio.youtube.com',
                  active: true
                });
              } else {
                // Focus existing YouTube Studio tab
                chrome.tabs.update(existingTabs[0].id, { active: true });
              }
            });
            
            // Also open the main popup after a short delay
            setTimeout(() => {
              chrome.action.openPopup().catch(() => {
                console.log('Could not open popup after authentication');
              });
            }, 1000);
            
            // Notify content scripts that authentication is complete
            chrome.tabs.query({url: "https://studio.youtube.com/*"}, (tabs) => {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: 'authenticationComplete' });
              });
            });
          }
        }
      } catch (error) {
        // Window might be closed, stop monitoring
        clearInterval(checkInterval);
      }
    }, 1000); // Check every second

    // Stop monitoring after 5 minutes to prevent memory leaks
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 5 * 60 * 1000);
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      return this.handleMessage(request, sender, sendResponse);
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

  async handleInstallation(details) {
    if (details.reason === 'install') {
      console.log('TubeMaster Tools installed');
      
      // Set default settings
      chrome.storage.local.set({
        settings: {
          autoSuggest: true,
          suggestionDelay: 1000,
          maxSuggestions: 8
        }
      });

      // Always redirect to YouTube Studio and open popup after installation
      setTimeout(() => {
        this.redirectToYouTubeStudio();
        // Open popup after a short delay
        setTimeout(() => {
          chrome.action.openPopup().catch(() => {
            console.log('Could not open popup after installation');
          });
        }, 1500);
      }, 1000);
      
      console.log('TubeMaster Tools installed successfully, redirecting to YouTube Studio');
    }
  }


  // Helper method to redirect to YouTube Studio (prevents duplicate tabs)
  redirectToYouTubeStudio() {
    chrome.tabs.query({url: "https://studio.youtube.com/*"}, (existingTabs) => {
      if (existingTabs.length === 0) {
        // No YouTube Studio tab open, create one
        chrome.tabs.create({
          url: 'https://studio.youtube.com',
          active: true
        });
      } else {
        // Focus existing YouTube Studio tab
        chrome.tabs.update(existingTabs[0].id, { active: true });
        console.log('TubeMaster: Focused existing YouTube Studio tab');
      }
    });
  }

  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'openPopup':
        this.openPopup(sender.tab)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'checkAuth':
        this.isUserAuthenticated()
          .then(isAuth => sendResponse({ success: true, isAuthenticated: isAuth }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'getUserInfo':
        this.getAuthDataFromTubeMaster()
          .then(authData => {
            if (authData) {
              sendResponse({ success: true, userInfo: authData });
            } else {
              sendResponse({ success: false, error: 'No user info available' });
            }
          })
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'syncAuthData':
        // Handle auth data sync from tubemaster.ai content script
        this.handleAuthDataSync(request.authData, request.timestamp)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'signOut':
        this.clearAuthData()
          .then(success => {
            if (success) {
              // Notify all YouTube Studio tabs that user signed out
              chrome.tabs.query({url: "https://studio.youtube.com/*"}, (tabs) => {
                tabs.forEach(tab => {
                  chrome.tabs.sendMessage(tab.id, { action: 'userSignedOut' });
                });
              });
            }
            sendResponse({ success });
          })
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'openAuthWindow':
        this.openAuthWindow()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'generateTitles':
        // Check authentication first
        this.isUserAuthenticated()
          .then(isAuth => {
            if (!isAuth) {
              throw new Error('User not authenticated');
            }
            return this.generateTitles(request.input, request.type);
          })
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
        // Check authentication first
        this.isUserAuthenticated()
          .then(isAuth => {
            if (!isAuth) {
              throw new Error('User not authenticated');
            }
            return this.generateThumbnails(request.description, request.type);
          })
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
        // Check authentication first
        this.isUserAuthenticated()
          .then(isAuth => {
            if (!isAuth) {
              throw new Error('User not authenticated');
            }
            return this.generateDescription(request.idea, request.keywords, request.title);
          })
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
        this.injectCSSWithCacheBusting(sender.tab.id)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
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

      } else {
        // Even if content script exists, ensure CSS is injected with fresh styles
        try {
          await this.injectCSSWithCacheBusting(tabId);
        } catch (cssError) {
          console.log('TubeMaster: CSS injection error:', cssError);
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
      console.error('TubeMaster: Direct CSS injection failed, trying fallback method:', error);
      
      // Method 2: Fallback to file injection (may use cached version)
      try {
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content.css']
        });
      } catch (fallbackError) {
        console.error('TubeMaster: Both CSS injection methods failed:', fallbackError);
        
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
        console.log('TubeMaster: Minimal CSS injected as last resort');
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
    try {
      await chrome.action.openPopup();
    } catch (error) {
      console.error('Could not open popup programmatically:', error);
    }
  }

  async generateTitles(input, type = 'mainPopup') {
    try {
      const response = await this.makeApiCall(input, type);
      return response.suggestions;
    } catch (error) {
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

  async generateDescription(idea, keywords, title) {
    try {
      const response = await this.makeDescriptionApiCall(idea, keywords, title);
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


    try {
      // Get auth token and prepare headers
      const authToken = await this.getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'TubeMaster-Extension/1.2'
      };
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Make the actual API call that will be visible in Network tab
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: headers,
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
      console.info('TubeMaster: API call failed, using fallback data:', error.message);
      
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

    console.log('TubeMaster: Making thumbnail API request to', API_ENDPOINT);

    try {
      // Get auth token and prepare headers
      const authToken = await this.getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'TubeMaster-Extension/1.2'
      };
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: headers,
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
      console.error('TubeMaster: Thumbnail API call failed:', error.message);
    }
  }

  async makeDescriptionApiCall(idea, keywords, title) {
    const API_ENDPOINT = 'https://api.tubemaster.ai/api/generate-description';
    
    const requestPayload = {
      idea: idea || '',
      keywords: keywords || [],
      title: title || ''
    };


    try {
      // Get auth token and prepare headers
      const authToken = await this.getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'TubeMaster-Extension/1.2'
      };
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: headers,
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
      console.error('TubeMaster: Description API call failed:', error.message);
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
