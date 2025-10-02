class TubeMasterPopup {
  constructor() {
    this.isAuthenticated = false;
    this.init();
  }

  async init() {
    // Show loading view initially
    this.showView('loadingView');
    
    // Check authentication status
    await this.checkAuthenticationStatus();
    
    // Setup event listeners
    this.setupEventListeners();
  }

  async checkAuthenticationStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkAuth' });
      
      if (response && response.success) {
        this.isAuthenticated = response.isAuthenticated;
        
        if (this.isAuthenticated) {
          // Get user info
          await this.loadUserInfo();
        }
        
        this.updateUI();
      } else {
        this.showNotAuthenticatedView();
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
      this.showNotAuthenticatedView();
    }
  }

  async loadUserInfo() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getUserInfo' });
      
      if (response && response.success && response.userInfo) {
        const userInfo = response.userInfo;
        
        // Update user email
        const userEmailElement = document.getElementById('userEmail');
        if (userEmailElement && userInfo.user && userInfo.user.email) {
          userEmailElement.textContent = userInfo.user.email;
        }
        
        // Update user role
        const userRoleElement = document.getElementById('userRole');
        if (userRoleElement && userInfo.user && userInfo.user.roles && userInfo.user.roles.length > 0) {
          const role = userInfo.user.roles[0];
          userRoleElement.textContent = role.display_name || role.name || 'User';
        }
      }
    } catch (error) {
      console.error('Error loading user info:', error);
      // Set fallback values
      const userEmailElement = document.getElementById('userEmail');
      const userRoleElement = document.getElementById('userRole');
      if (userEmailElement) userEmailElement.textContent = 'User';
      if (userRoleElement) userRoleElement.textContent = 'Member';
    }
  }

  updateUI() {
    if (this.isAuthenticated) {
      this.showAuthenticatedView();
    } else {
      this.showNotAuthenticatedView();
    }
  }

  showView(viewId) {
    // Hide all views
    const views = ['loadingView', 'notAuthenticatedView', 'authenticatedView'];
    views.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
      }
    });
    
    // Show the specified view
    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.style.display = 'block';
    }
  }

  showAuthenticatedView() {
    this.showView('authenticatedView');
  }

  showNotAuthenticatedView() {
    this.showView('notAuthenticatedView');
  }

  setupEventListeners() {
    // Sign in button
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => this.handleSignIn());
    }

    // Sign up button (same as sign in)
    const signUpBtn = document.getElementById('signUpBtn');
    if (signUpBtn) {
      signUpBtn.addEventListener('click', () => this.handleSignIn());
    }

    // Sign out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.handleSignOut());
    }

    // Studio button
    const studioBtn = document.getElementById('studioBtn');
    if (studioBtn) {
      studioBtn.addEventListener('click', () => this.openYouTubeStudio());
    }
  }

  async handleSignIn() {
    try {
      // Show loading state
      const signInBtn = document.getElementById('signInBtn');
      const signUpBtn = document.getElementById('signUpBtn');
      
      if (signInBtn) {
        signInBtn.textContent = 'Opening...';
        signInBtn.disabled = true;
      }
      if (signUpBtn) {
        signUpBtn.textContent = 'Opening...';
        signUpBtn.disabled = true;
      }

      const response = await chrome.runtime.sendMessage({ action: 'openAuthWindow' });
      
      if (response && response.success) {
        // Close the popup immediately when OAuth window opens
        window.close();
      } else {
        console.error('Failed to open authentication window. Please try again.');
        // Reset buttons
        if (signInBtn) {
          signInBtn.textContent = 'Sign In';
          signInBtn.disabled = false;
        }
        if (signUpBtn) {
          signUpBtn.textContent = 'Sign up';
          signUpBtn.disabled = false;
        }
      }
    } catch (error) {
      console.error('Error opening authentication window:', error);
      // Reset buttons
      const signInBtn = document.getElementById('signInBtn');
      const signUpBtn = document.getElementById('signUpBtn');
      if (signInBtn) {
        signInBtn.textContent = 'Sign In';
        signInBtn.disabled = false;
      }
      if (signUpBtn) {
        signUpBtn.textContent = 'Sign up';
        signUpBtn.disabled = false;
      }
    }
  }

  async handleSignOut() {
    try {
      // Show loading state
      const signOutBtn = document.getElementById('signOutBtn');
      if (signOutBtn) {
        signOutBtn.textContent = 'Signing Out...';
        signOutBtn.disabled = true;
      }

      // Send sign out message
      const response = await chrome.runtime.sendMessage({ action: 'signOut' });
      
      if (response && response.success) {
        this.isAuthenticated = false;
        this.updateUI();
      } else {
        console.error('Failed to sign out. Please try again.');
      }
    } catch (error) {
      console.error('Error during sign out:', error);
    } finally {
      // Reset sign out button
      const signOutBtn = document.getElementById('signOutBtn');
      if (signOutBtn) {
        signOutBtn.textContent = 'Sign Out';
        signOutBtn.disabled = false;
      }
    }
  }

  async openYouTubeStudio() {
    try {
      // Open YouTube Studio in a new tab
      await chrome.tabs.create({
        url: 'https://studio.youtube.com',
        active: true
      });
      
      // Close the popup after opening the studio
      window.close();
    } catch (error) {
      console.error('Error opening YouTube Studio:', error);
    }
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TubeMasterPopup();
});
