// Content script for tubemaster.ai to sync auth data with Chrome storage
// This runs in the background and monitors localStorage changes

class TubeMasterAuthSync {
  constructor() {
    this.init();
  }

  init() {
    // Sync auth data immediately when script loads
    this.syncAuthData();
    
    // Set up periodic sync (every 10 seconds)
    setInterval(() => {
      this.syncAuthData();
    }, 10000);
    
    // Listen for storage events (when localStorage changes)
    window.addEventListener('storage', (e) => {
      if (e.key === 'auth_session') {
        this.syncAuthData();
      }
    });
    
    // Also listen for custom events that the tubemaster.ai app might dispatch
    window.addEventListener('authStateChanged', () => {
      this.syncAuthData();
    });
    
    
    console.log('TubeMaster Auth Sync initialized');
  }

  async syncAuthData() {
    try {
      const authSession = localStorage.getItem('auth_session');
      const authData = authSession ? JSON.parse(authSession) : null;
      
      // Send to Chrome storage via the extension
      if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'syncAuthData',
          authData: authData,
          timestamp: Date.now()
        }).catch(() => {
          // Extension might not be available, ignore error
        });
      }
    } catch (error) {
      // Silently handle errors to avoid breaking the website
      console.log('TubeMaster Auth Sync error:', error);
    }
  }
}

// Initialize only if we're on tubemaster.ai
if (window.location.hostname.includes('tubemaster.ai')) {
  new TubeMasterAuthSync();
}
