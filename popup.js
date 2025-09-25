class TubeMatePopup {
  constructor() {
    this.studioBtn = document.getElementById('studioBtn');
    this.init();
  }

  init() {
    // Check if studio button exists
    if (!this.studioBtn) {
      console.error('Studio button element not found');
      return;
    }
    
    // Add click listener for studio button
    this.studioBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.openYouTubeStudio();
    });
    
    console.log('TubeMate popup initialization complete');
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
  new TubeMatePopup();
});
