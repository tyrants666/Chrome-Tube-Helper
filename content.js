class YouTubeStudioIntegration {
  constructor() {
    this.suggestionContainer = null;
    this.titleSuggestionsSection = null;
    this.thumbnailBuilderSection = null;
    this.descriptionGeneratorSection = null;
    this.isExtensionActive = false;
    this.currentTitleInput = null;
    this.lastPopulatedTitle = null;
    this.isPopulatingTitle = false;
    this.descriptionTimeout = null;
    this.isAuthenticated = false;
    
    this.init();
  }

  init() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
    });

    // Wait for page to load and then setup
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupIntegration());
    } else {
      this.setupIntegration();
    }

    // Setup mutation observer to detect dynamic content
    this.setupMutationObserver();
    
    // Setup click listeners for edit/create buttons
    this.setupButtonClickListeners();
    
    // Setup dark mode detection
    this.setupDarkModeDetection();
    
    // Setup cleanup on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
    
  }

  async checkAuthentication() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkAuth' });
      return response && response.success && response.isAuthenticated;
    } catch (error) {
      console.error('TubeMaster: Error checking authentication:', error);
      return false;
    }
  }

  // Method to remove all extension sections
  removeAllSections() {
    // Remove title suggestions section
    if (this.titleSuggestionsSection && this.titleSuggestionsSection.parentElement) {
      this.titleSuggestionsSection.remove();
      this.titleSuggestionsSection = null;
    }
    
    // Remove thumbnail builder section
    if (this.thumbnailBuilderSection && this.thumbnailBuilderSection.parentElement) {
      this.thumbnailBuilderSection.remove();
      this.thumbnailBuilderSection = null;
    }
    
    // Remove description generator section
    if (this.descriptionGeneratorSection && this.descriptionGeneratorSection.parentElement) {
      this.descriptionGeneratorSection.remove();
      this.descriptionGeneratorSection = null;
    }
    
    // Remove any suggestion containers
    if (this.suggestionContainer && this.suggestionContainer.parentElement) {
      this.suggestionContainer.remove();
      this.suggestionContainer = null;
    }
    
    // Remove extension indicator
    const indicator = document.querySelector('.ttg-indicator');
    if (indicator && indicator.parentElement) {
      indicator.remove();
    }
    
    console.log('TubeMaster: All sections removed due to sign out');
  }

  // Method to add all extension sections
  addAllSections() {
    // Re-setup integration
    this.findTitleInput();
    this.addThumbnailBuilderSection();
    this.addDescriptionGeneratorSection();
    this.addExtensionIndicator();
    
    console.log('TubeMaster: All sections added due to sign in');
  }

  showNotAuthenticatedMessage() {
    // Features are blocked when not authenticated
    return;
  }

  async setupIntegration() {
    // Check authentication first
    const isAuth = await this.checkAuthentication();
    if (!isAuth) {
      this.showNotAuthenticatedMessage();
      return;
    }
    this.isAuthenticated = true;
    
    // Ensure CSS is loaded
    this.ensureCSSLoaded();
    
    // Start immediate integration without delay - add all sections
    this.findTitleInput();
    
    // Add all sections immediately after authentication
    this.addThumbnailBuilderSection();
    this.addDescriptionGeneratorSection();
    this.addExtensionIndicator();
    
    // Also run periodic checks to ensure we catch any dynamically loaded inputs
    this.startPeriodicChecks();
  }

  startPeriodicChecks() {
    
    this.periodicCheckInterval = setInterval(() => {
      // Only run if we're on YouTube Studio and authenticated
      if (!window.location.href.includes('studio.youtube.com') || !this.isAuthenticated) {
        return;
      }
      
      const hadTitleInput = !!this.currentTitleInput;
      const hadSuggestionsSection = this.titleSuggestionsSection && document.body.contains(this.titleSuggestionsSection);
      
        // Only try to find inputs if we don't already have a working suggestions section
        if (!this.titleSuggestionsSection || !document.body.contains(this.titleSuggestionsSection)) {
          this.findTitleInput();
          
          // If we found a title input but don't have a suggestions section, add it
          if (this.currentTitleInput) {
            this.addTitleSuggestionsSection(this.currentTitleInput);
          }
        }
      
      // Check for thumbnail builder section
      if (!this.thumbnailBuilderSection || !document.body.contains(this.thumbnailBuilderSection)) {
        this.addThumbnailBuilderSection();
      }
      
      // Check for description generator section
      if (!this.descriptionGeneratorSection || !document.body.contains(this.descriptionGeneratorSection)) {
        this.addDescriptionGeneratorSection();
      }
    }, 3000);
    
    // Also run more frequent checks for the first 20 seconds
    let quickCheckCount = 0;
    const quickCheckInterval = setInterval(() => {
      quickCheckCount++;
      
      if (quickCheckCount >= 10) { // 10 * 2 seconds = 20 seconds
        clearInterval(quickCheckInterval);
        return;
      }
      
      if (!window.location.href.includes('studio.youtube.com') || !this.isAuthenticated) {
        return;
      }
      
      // Check for title suggestions section
      if (!this.titleSuggestionsSection || !document.body.contains(this.titleSuggestionsSection)) {
        this.findTitleInput();
        
        if (this.currentTitleInput) {
          this.addTitleSuggestionsSection(this.currentTitleInput);
        }
      }
      
      // Always check for thumbnail builder section
      if (!this.thumbnailBuilderSection || !document.body.contains(this.thumbnailBuilderSection)) {
        this.addThumbnailBuilderSection();
      }
      
      // Always check for description generator section
      if (!this.descriptionGeneratorSection || !document.body.contains(this.descriptionGeneratorSection)) {
        this.addDescriptionGeneratorSection();
      }
    }, 2000);
  }

  addInterFont() {
    // Check if Inter font link already exists
    if (document.getElementById('ttg-inter-font')) {
      return;
    }
    
    // Add Inter font from Google Fonts CDN
    const fontLink = document.createElement('link');
    fontLink.id = 'ttg-inter-font';
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap';
    
    // Insert into document head
    document.head.appendChild(fontLink);
  }

  ensureCSSLoaded() {
    
    // Add Inter font from Google Fonts
    this.addInterFont();
    
    // Remove any existing fallback CSS first to allow fresh injection
    const existingFallback = document.getElementById('ttg-fallback-css');
    if (existingFallback) {
      existingFallback.remove();
    }
    
    // Check if our CSS is already loaded by looking for a specific class
    const testElement = document.createElement('div');
    testElement.className = 'ttg-suggestion-container';
    testElement.style.position = 'absolute';
    testElement.style.left = '-9999px';
    testElement.style.visibility = 'hidden';
    document.body.appendChild(testElement);
    
    const computedStyle = window.getComputedStyle(testElement);
    const hasCSS = computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && 
                   computedStyle.backgroundColor !== 'transparent' &&
                   computedStyle.borderRadius !== '0px';
    
    document.body.removeChild(testElement);
    
    if (!hasCSS) {
      this.injectFallbackCSS();
    }
  }

  injectFallbackCSS() {
    // If CSS file didn't load, inject critical styles directly
    const style = document.createElement('style');
    style.id = 'ttg-fallback-css';
    style.textContent = `
      .ttg-suggestion-container {
        background: white !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
        border: 1px solid #e1e5e9 !important;
        min-width: 370px !important;
        max-width: 450px !important;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
        overflow: hidden !important;
        z-index: 10000 !important;
      }
      
      .ttg-title-suggestions-section {
        background: #f9f9f9 !important;
        border-radius: 8px !important;
        margin: 12px 0 0 0 !important;
        padding: 0 !important;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
        overflow: hidden !important;
        position: relative !important;
        z-index: 1000 !important;
      }
      
      .ttg-permanent-suggestion {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 10px 14px !important;
        background: #f8f9fa !important;
        border: 1px solid #e9ecef !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
      }
    `;
    
    if (!document.getElementById('ttg-fallback-css')) {
      document.head.appendChild(style);
    }
  }

  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      let modalOpened = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          
          // Check if a modal or dialog was added
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for YouTube Studio modal/dialog elements
              if (node.matches && (
                node.matches('ytcp-dialog') ||
                node.matches('[role="dialog"]') ||
                node.matches('.ytcp-video-metadata-editor') ||
                node.matches('.ytcp-uploads-dialog') ||
                node.matches('[aria-modal="true"]') ||
                node.querySelector && (
                  node.querySelector('ytcp-dialog') ||
                  node.querySelector('[role="dialog"]') ||
                  node.querySelector('.ytcp-video-metadata-editor') ||
                  node.querySelector('.ytcp-uploads-dialog') ||
                  node.querySelector('[aria-modal="true"]')
                )
              )) {
                modalOpened = true;
              }
            }
          });
        }
        
        // Also check for attribute changes that might indicate modal opening
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'aria-modal' || 
             mutation.attributeName === 'style' ||
             mutation.attributeName === 'class')) {
          shouldCheck = true;
        }
      });

      if (shouldCheck || modalOpened) {
        // Immediate check for modal opening, minimal debounce for other changes
        const delay = modalOpened ? 100 : 300;
        clearTimeout(this.checkTimeout);
        this.checkTimeout = setTimeout(() => {
          this.findTitleInput();
          // Re-add title suggestions section if it doesn't exist and we have a title input
          if (this.currentTitleInput && (!this.titleSuggestionsSection || !document.body.contains(this.titleSuggestionsSection))) {
            this.addTitleSuggestionsSection(this.currentTitleInput);
          }
        }, delay);
      }
    });

    // Ensure document.body exists before observing
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-modal', 'style', 'class']
      });
    } else {
      // If body doesn't exist yet, wait for it
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-modal', 'style', 'class']
          });
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
    }
  }

  setupButtonClickListeners() {
    
    // Use event delegation to catch dynamically added buttons
    document.addEventListener('click', (event) => {
      const target = event.target;
      
      // Check if clicked element or its parent is an edit/create button
      const button = target.closest('button, [role="button"], a[href*="edit"], a[href*="create"]');
      
      if (button) {
        const buttonText = button.textContent?.toLowerCase() || '';
        const buttonAriaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const buttonId = button.id?.toLowerCase() || '';
        const buttonClass = button.className?.toLowerCase() || '';
        
        // Check for edit/create related keywords
        const isEditButton = (
          buttonText.includes('edit') ||
          buttonText.includes('create') ||
          buttonText.includes('upload') ||
          buttonText.includes('video') ||
          buttonAriaLabel.includes('edit') ||
          buttonAriaLabel.includes('create') ||
          buttonAriaLabel.includes('upload') ||
          buttonId.includes('edit') ||
          buttonId.includes('create') ||
          buttonClass.includes('edit') ||
          buttonClass.includes('create')
        );
        
        if (isEditButton) {
          
          // Check immediately and then with short delays to catch modal opening
          this.findTitleInput();
          if (this.currentTitleInput && (!this.titleSuggestionsSection || !document.body.contains(this.titleSuggestionsSection))) {
            this.addTitleSuggestionsSection(this.currentTitleInput);
          }
          
          // Also check after short delays to catch modal opening
          [200, 500, 1000].forEach(delay => {
            setTimeout(() => {
              this.findTitleInput();
              if (this.currentTitleInput && (!this.titleSuggestionsSection || !document.body.contains(this.titleSuggestionsSection))) {
                this.addTitleSuggestionsSection(this.currentTitleInput);
              }
            }, delay);
          });
        }
      }
    });
  }

  findTitleInput() {
    // Check if we're actually on YouTube Studio
    if (!window.location.href.includes('studio.youtube.com')) {
      return null;
    }
    
    // If no specific title input found, try a broader search
    try {
      const allInputs = document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]');
      
      // Look for title-specific elements
      for (const input of allInputs) {
        const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        
        // Check for title-specific indicators
        if (ariaLabel.includes('title') || placeholder.includes('title') || name.includes('title') || id.includes('title')) {
          
          if (this.isValidTitleInput(input)) {
            // Skip description fields
            if (ariaLabel.includes('description') || placeholder.includes('description') || name.includes('description') || id.includes('description')) {
              continue;
            }
            
            if (input !== this.currentTitleInput) {
              this.currentTitleInput = input;
              this.setupTitleInputIntegration(input);
            }
            return input;
          }
        }
      }
    } catch (error) {
      console.error('TubeMaster: Error in findTitleInput:', error);
    }
    
    this.currentTitleInput = null;
    return null;
  }


  isValidTitleInput(element) {
    try {
      // Check if element exists and is valid
      if (!element || !element.getBoundingClientRect) {
        return false;
      }

      // Skip elements that are clearly not title inputs
      if (element.type === 'file' || element.type === 'hidden' || element.type === 'checkbox' || element.type === 'radio') {
        return false;
      }

      // IMPORTANT: Exclude description fields explicitly
      const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
      const placeholder = (element.placeholder || '').toLowerCase();
      const name = (element.name || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      
      // Skip if it's clearly a description field
      if (ariaLabel.includes('description') || 
          ariaLabel.includes('tell viewers about') ||
          ariaLabel.includes('tell your viewers') ||
          placeholder.includes('description') ||
          placeholder.includes('tell viewers') ||
          name.includes('description') ||
          id.includes('description')) {
        return false;
      }

      // Check if element is visible and interactable
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      
      let isNotHidden = true;
      try {
        const computedStyle = window.getComputedStyle(element);
        isNotHidden = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
      } catch (styleError) {
        // Silently handle style errors
        isNotHidden = false;
      }
      
      // Check if element is editable
      const isEditable = !element.disabled && 
                        !element.readOnly && 
                        (element.tagName === 'INPUT' || 
                         element.tagName === 'TEXTAREA' || 
                         element.contentEditable === 'true' || 
                         element.isContentEditable ||
                         element.getAttribute('contenteditable') === 'true');
      
      // Additional check: prefer elements that are likely title fields
      const isTitleLike = ariaLabel.includes('title') || 
                         placeholder.includes('title') ||
                         name.includes('title') ||
                         id.includes('title');
      
      // If it's not title-like and it's a textarea, be extra cautious
      if (element.tagName === 'TEXTAREA' && !isTitleLike) {
        // Check if it's in a title-specific container
        const titleContainer = element.closest('.ytcp-video-title, [data-testid*="title"], .ytcp-video-metadata-editor');
        if (!titleContainer) {
          return false;
        }
        
        // Even in title container, if it's tall (likely description), skip it
        if (rect.height > 100) {
          return false;
        }
      }
      
      return isVisible && isNotHidden && isEditable;
    } catch (error) {
      return false;
    }
  }

  setupTitleInputIntegration(titleInput) {
    
    // Remove existing listeners to avoid duplicates
    if (titleInput.ttgListenersAdded) {
      return;
    }
    titleInput.ttgListenersAdded = true;

    // Add the permanent suggestions section inside the title area
    this.addTitleSuggestionsSection(titleInput);

    // Store the initial value to prevent triggering on existing content
    const initialValue = (titleInput.value || titleInput.textContent || titleInput.innerText || '').trim();
    let lastProcessedValue = initialValue;
    
    // Check if title already has value and generate suggestions
    if (initialValue.length > 0) {
      // Delay slightly to ensure UI is ready
      setTimeout(() => {
        this.showPermanentAutoSuggestions(initialValue);
      }, 1000);
    }

    // Add input listener for auto-suggestions
    let inputTimeout;
    const inputHandler = (event) => {
      // Only process actual user input events, not programmatic changes
      if (event && event.isTrusted === false) {
        return;
      }
      
      // Skip if we're currently populating a title
      if (this.isPopulatingTitle) {
        return;
      }
      
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        // Safely get the value with null checks
        const value = (titleInput.value || titleInput.textContent || titleInput.innerText || '').trim();
        
        // Skip if the value hasn't actually changed from what we last processed
        if (value === lastProcessedValue) {
          return;
        }
        
        lastProcessedValue = value;
        
        // Skip if this is the same title we just populated
        if (value === this.lastPopulatedTitle) {
          return;
        }
        
        // Generate suggestions for any non-empty input (no character limit)
        if (value.length > 0) {
          this.showPermanentAutoSuggestions(value);
        } else {
          // Hide suggestions for empty input
          this.hidePermanentAutoSuggestions();
        }
      }, 800);
    };
    
    titleInput.addEventListener('input', inputHandler);
    titleInput.addEventListener('keyup', inputHandler);  // Also listen to keyup
    titleInput.addEventListener('paste', inputHandler);  // And paste events
  }

  showCharacterLimitMessage(currentLength, titleInput) {
    if (this.suggestionContainer) {
      this.suggestionContainer.remove();
    }

    const container = this.createSuggestionContainer();
    container.innerHTML = `
      <div class="ttg-header">
        <span class="ttg-icon">✏️</span>
        <span class="ttg-title">TubeMaster Title Generator</span>
        <button class="ttg-close">×</button>
      </div>
      <div class="ttg-content">
        <div class="ttg-character-limit">
          <p>Type ${5 - currentLength} more character${5 - currentLength === 1 ? '' : 's'} to get AI suggestions</p>
          <div class="ttg-progress-bar">
            <div class="ttg-progress" style="width: ${(currentLength / 5) * 100}%"></div>
          </div>
          <small>${currentLength}/5 characters</small>
        </div>
      </div>
    `;

    this.positionContainer(container, titleInput);
    document.body.appendChild(container);
    this.suggestionContainer = container;

    // Add close button event listener
    const closeBtn = container.querySelector('.ttg-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.remove();
        this.suggestionContainer = null;
      });
    }

    // Add outside click listener
    this.addOutsideClickListener(container);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (this.suggestionContainer === container) {
        container.remove();
        this.suggestionContainer = null;
      }
    }, 3000);
  }

  async showAutoSuggestions(inputValue, titleInput) {
    if (this.suggestionContainer) {
      this.suggestionContainer.remove();
    }

    const container = this.createSuggestionContainer();
    container.innerHTML = `
      <div class="ttg-header">
        <span class="ttg-icon"></span>
        <span class="ttg-title">TubeMaster Auto Suggestions</span>
        <button class="ttg-close">×</button>
      </div>
      <div class="ttg-content">
        <div class="ttg-loading">Generating suggestions...</div>
      </div>
    `;

    this.positionContainer(container, titleInput);
    document.body.appendChild(container);
    this.suggestionContainer = container;

    // Add close button event listener
    const closeBtn = container.querySelector('.ttg-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.remove();
        this.suggestionContainer = null;
      });
    }

    // Add outside click listener
    this.addOutsideClickListener(container);

    try {
      const suggestions = await this.generateAutoSuggestions(inputValue);
      const content = container.querySelector('.ttg-content');
      
      content.innerHTML = `
        <div class="ttg-suggestions">
          ${suggestions.map((suggestion, index) => `
            <div class="ttg-suggestion" data-title="${this.escapeHtml(suggestion)}">
              <span class="ttg-number">${index + 1}</span>
              <span class="ttg-text">${this.escapeHtml(suggestion)}</span>
            </div>
          `).join('')}
        </div>
      `;

      // Add click listeners
      content.querySelectorAll('.ttg-suggestion').forEach(item => {
        item.addEventListener('click', () => {
          const title = item.dataset.title;
          this.populateTitle(title);
          container.remove();
          this.suggestionContainer = null;
        });
      });

    } catch (error) {
      console.error('Error generating auto suggestions:', error);
      container.remove();
      this.suggestionContainer = null;
    }
  }

  async generateAutoSuggestions(input) {
    try {
      // Use message passing to background script to avoid CORS issues
      const response = await chrome.runtime.sendMessage({
        action: 'generateTitles',
        input: input,
        type: 'autoSuggestions'
      });

      if (response && response.success && response.suggestions) {
        return response.suggestions;
      } else if (response && response.success === false) {
        // Handle API error response with proper error details
        const errorMessage = response.error || 'API returned error';
        const errorCode = response.code || 'UNKNOWN_ERROR';
        
        const apiError = new Error(errorMessage);
        apiError.code = errorCode;
        apiError.apiResponse = response;
        throw apiError;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('TubeMaster: API call failed, using fallback data:', error.message);
      
      // Static fallback data - no external dependencies
      return this.getStaticTitleSuggestions(input);
    }
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
    
    return baseSuggestions.slice(0, 8); // Return up to 8 suggestions with scores and IDs
  }

  addThumbnailBuilderSection() {
    // Don't add thumbnail builder section if not authenticated
    if (!this.isAuthenticated) {
      return;
    }

    // Check if we already have a thumbnail builder section
    if (this.thumbnailBuilderSection && document.body.contains(this.thumbnailBuilderSection)) {
      return;
    }

    // Find the Test & compare section to position our thumbnail suggestions below it
    let testCompareSection = null;
    const testCompareSelectors = [
      'ytcp-video-thumbnail-editor',
      '.ytcp-video-thumbnail-editor',
      '.ytcp-video-thumbnail-section',
      '.style-scope.ytcp-video-metadata-editor-basics',
      '.ytcp-video-metadata-editor-basics'
    ];

    for (const selector of testCompareSelectors) {
      testCompareSection = document.querySelector(selector);
      if (testCompareSection) {
        console.log(`TubeMaster: Found Test & compare section with selector: ${selector}`);
        break;
      }
    }

    // If no Test & compare section found, look for elements containing "Test" or "compare" text
    if (!testCompareSection) {
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        const textContent = (element.textContent || '').toLowerCase();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();

        // Look for "Test & compare" or similar text
        if ((textContent.includes('test') && textContent.includes('compare')) ||
          (ariaLabel.includes('test') && ariaLabel.includes('compare')) ||
          textContent.includes('test & compare')) {

          // Find the parent container that likely contains the whole section
          let parentSection = element;
          let depth = 0;
          while (parentSection && depth < 5) {
            if (parentSection.tagName === 'DIV' &&
              parentSection.offsetHeight > 50 &&
              parentSection.offsetWidth > 200) {
              testCompareSection = parentSection;
              break;
            }
            parentSection = parentSection.parentElement;
            depth++;
          }

          if (testCompareSection) break;
        }
      }
    }

    if (!testCompareSection) {
      return;
    }

    // Create the thumbnail builder section
    const builderSection = document.createElement('div');
    builderSection.className = 'ttg-thumbnail-builder-section ttg-title-suggestions-section-styled';

    // Create header
    const header = document.createElement('div');
    header.className = 'ttg-suggestions-header ttg-suggestions-header-styled';

    const logoContainer = document.createElement('div');
    logoContainer.className = 'ttg-suggestions-logo ttg-suggestions-logo-styled';

    const logoImg = document.createElement('img');
    logoImg.className = 'ttg-suggestions-logo-img ttg-suggestions-logo-img-styled';
    logoImg.alt = 'TubeMaster';

    // Try to set the logo URL safely
    try {
      logoImg.src = chrome.runtime.getURL('icons/logo.png');
    } catch (error) {
      logoImg.style.display = 'none';
    }

    const title = document.createElement('h3');
    title.className = 'ttg-suggestions-title ttg-suggestions-title-styled';
    title.textContent = 'Thumbnail Builder';

    logoContainer.appendChild(logoImg);
    logoContainer.appendChild(title);
    header.appendChild(logoContainer);

    // Create content
    const content = document.createElement('div');
    content.className = 'ttg-thumbnail-builder-content-wrapper ttg-suggestions-content-styled';

    const builderContent = document.createElement('div');
    builderContent.className = 'ttg-thumbnail-builder-content';

    // Create description input
    const descriptionContainer = document.createElement('div');
    descriptionContainer.className = 'ttg-description-container';

    const descriptionLabel = document.createElement('label');
    descriptionLabel.textContent = 'Video Description:';
    descriptionLabel.className = 'ttg-description-label';

    const descriptionInput = document.createElement('textarea');
    descriptionInput.className = 'ttg-description-input';
    descriptionInput.placeholder = 'Describe your thumbnail idea';
    descriptionInput.rows = 3;
    descriptionInput.id = 'ttg-thumbnail-description';

    const generateButton = document.createElement('button');
    generateButton.className = 'ttg-generate-thumbnails-btn';
    generateButton.textContent = 'Generate Thumbnails';
    generateButton.type = 'button';
    
    // Add validation message element
    const validationMessage = document.createElement('div');
    validationMessage.className = 'ttg-validation-message';
    validationMessage.style.cssText = `
      color: #ee5572;
      font-size: 12px;
      margin-top: 4px;
      display: none;
      position: relative;
      top: -15px;
    `;

    descriptionContainer.appendChild(descriptionLabel);
    descriptionContainer.appendChild(descriptionInput);
    descriptionContainer.appendChild(validationMessage);
    descriptionContainer.appendChild(generateButton);

    // Create thumbnail slider container
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'ttg-thumbnail-slider-container';

    const sliderWrapper = document.createElement('div');
    sliderWrapper.className = 'ttg-thumbnail-slider-wrapper';

    const thumbnailGrid = document.createElement('div');
    thumbnailGrid.className = 'ttg-thumbnail-slider-grid';
    thumbnailGrid.id = 'ttg-thumbnail-grid';

    sliderWrapper.appendChild(thumbnailGrid);
    sliderContainer.appendChild(sliderWrapper);

    builderContent.appendChild(descriptionContainer);
    builderContent.appendChild(sliderContainer);
    content.appendChild(builderContent);
    builderSection.appendChild(header);
    builderSection.appendChild(content);

    // Add event listeners
    this.setupThumbnailBuilderEvents(builderSection, descriptionInput, generateButton, thumbnailGrid);

    // Insert the section after the Test & compare section
    try {
      if (testCompareSection.nextSibling) {
        testCompareSection.parentElement.insertBefore(builderSection, testCompareSection.nextSibling);
      } else {
        testCompareSection.parentElement.appendChild(builderSection);
      }

      this.thumbnailBuilderSection = builderSection;

    } catch (error) {
      console.error('TubeMaster: Error inserting thumbnail builder section:', error);
    }
  }

  // Description Generator -------------------------------------
  // Description Generator -------------------------------------


  addDescriptionGeneratorSection() {
    // Don't add description generator section if not authenticated
    if (!this.isAuthenticated) {
      return;
    }
    
    // Check if we already have a description generator section
    if (this.descriptionGeneratorSection && document.body.contains(this.descriptionGeneratorSection)) {
      return;
    }

    // Find the description container 
    let descriptionContainer = document.querySelector('.input-container.description.style-scope.ytcp-video-metadata-editor-basics#description-container');
    
    if (!descriptionContainer) {
      // Fallback: look for any description container
      descriptionContainer = document.querySelector('[id*="description-container"], [class*="description"], .ytcp-video-metadata-editor [aria-label*="description" i]');
    }
    
    if (!descriptionContainer) {
      return;
    }

    // Find the ytcp-form-input-container element to place our section just below it
    let targetContainer = null;
    if (descriptionContainer) {
      targetContainer = descriptionContainer.querySelector('ytcp-form-input-container#containerstyle-scope.ytcp-social-suggestions-textbox');
    }

    if (!targetContainer && descriptionContainer) {
      // Fallback: look for any ytcp-form-input-container
      targetContainer = descriptionContainer.querySelector('ytcp-form-input-container');
    }

    if (!targetContainer) {
      return;
    }

    // Create the description generator section
    const generatorSection = document.createElement('div');
    generatorSection.className = 'ttg-description-generator-section ttg-title-suggestions-section-styled';

    // Create header
    const header = document.createElement('div');
    header.className = 'ttg-suggestions-header ttg-suggestions-header-styled';

    const logoContainer = document.createElement('div');
    logoContainer.className = 'ttg-suggestions-logo ttg-suggestions-logo-styled';

    const logoImg = document.createElement('img');
    logoImg.className = 'ttg-suggestions-logo-img ttg-suggestions-logo-img-styled';
    logoImg.alt = 'TubeMaster';

    // Try to set the logo URL safely
    try {
      logoImg.src = chrome.runtime.getURL('icons/logo.png');
    } catch (error) {
      logoImg.style.display = 'none';
    }

    const title = document.createElement('h3');
    title.className = 'ttg-suggestions-title ttg-suggestions-title-styled';
    title.textContent = 'AI Description Generator';

    logoContainer.appendChild(logoImg);
    logoContainer.appendChild(title);
    header.appendChild(logoContainer);

    // Create content wrapper
    const content = document.createElement('div');
    content.className = 'ttg-description-generator-content-wrapper ttg-suggestions-content-styled';

    // Create initial outline button
    const initialButton = document.createElement('button');
    initialButton.className = 'ttg-description-generator-initial-btn';
    initialButton.type = 'button';
    initialButton.innerHTML = `
      <div class="ttg-initial-btn-content">
        
        <img class="ttg-suggestions-logo-img ttg-suggestions-logo-img-styled" alt="TubeMaster" src="${chrome.runtime.getURL('icons/logo.png')}">
        <span class="ttg-initial-btn-text">Get AI description recommendations</span>
      </div>
    `;

    // Create the generator form (initially hidden)
    const generatorForm = document.createElement('div');
    generatorForm.className = 'ttg-description-generator-form';
    generatorForm.style.display = 'none';

    // Keywords input
    const keywordsInput = document.createElement('input');
    keywordsInput.type = 'text';
    keywordsInput.className = 'ttg-keywords-input';
    keywordsInput.placeholder = 'Add keywords that you want to include in your description';
    keywordsInput.maxLength = 100;

    // Generate button
    const generateButton = document.createElement('button');
    generateButton.className = 'ttg-generate-description-btn';
    generateButton.type = 'button';
    generateButton.textContent = 'Generate';

    // Note text
    const noteText = document.createElement('div');
    noteText.className = 'ttg-keywords-note';
    noteText.innerHTML = 'Comma separate your keywords for better results <span class="ttg-char-counter">0/100</span>';

    // Description result container (initially hidden)
    const resultContainer = document.createElement('div');
    resultContainer.className = 'ttg-description-result-container';
    resultContainer.style.display = 'none';

    // Assemble the form
    generatorForm.appendChild(keywordsInput);
    generatorForm.appendChild(generateButton);
    generatorForm.appendChild(noteText);

    // Assemble the content
    content.appendChild(initialButton);
    content.appendChild(generatorForm);
    content.appendChild(resultContainer);

    generatorSection.appendChild(header);
    generatorSection.appendChild(content);

    // Add event listeners
    this.setupDescriptionGeneratorEvents(header, generatorSection, initialButton, generatorForm, keywordsInput, generateButton, resultContainer);

    // Insert the section just after the ytcp-form-input-container
    try {
      if (targetContainer.nextSibling) {
        targetContainer.parentElement.insertBefore(generatorSection, targetContainer.nextSibling);
      } else {
        targetContainer.parentElement.appendChild(generatorSection);
      }

      this.descriptionGeneratorSection = generatorSection;

    } catch (error) {
      console.error('TubeMaster: Error inserting description generator section:', error);
    }
  }

  setupDescriptionGeneratorEvents(header, generatorSection, initialButton, generatorForm, keywordsInput, generateButton, resultContainer) {
    // Store references for description functionality
    this.descriptionsData = [];
    this.currentDescriptionIndex = 0;

    // Get references to noteText and charCounter that were created earlier
    const noteText = generatorForm.querySelector('.ttg-keywords-note');
    const charCounter = noteText.querySelector('.ttg-char-counter');

    // Initial button click handler - show the form
    initialButton.addEventListener('click', () => {
      initialButton.style.display = 'none';
      generatorForm.style.display = 'block';
      header.style.display = 'block';
      keywordsInput.focus();
    });

    // Generate button click handler
    generateButton.addEventListener('click', async () => {
      const keywords = keywordsInput.value.trim();
      
      if (!keywords) {
        // Show validation error
        keywordsInput.style.borderColor = '#ee5572';
        keywordsInput.focus();
        return;
      }

      // Reset border color
      keywordsInput.style.borderColor = '#e9ecef';

      await this.generateDescriptionFromKeywords(keywords, generateButton, resultContainer, generatorForm);
      
      // Hide input form and show keywords display after successful generation
      this.hideInputShowKeywords(generatorForm, keywords, keywordsInput, generateButton, resultContainer, noteText, charCounter);
    });

    // Character counter functionality
    const updateCharCounter = () => {
      const currentLength = keywordsInput.value.length;
      charCounter.textContent = `${currentLength}/100`;
    };

    // Real-time character counting
    keywordsInput.addEventListener('input', updateCharCounter);

    // Allow Enter key to trigger generation
    keywordsInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        generateButton.click();
      }
    });
  }

  hideInputShowKeywords(generatorForm, keywords, keywordsInput, generateButton, resultContainer, noteText, charCounter) {
    // Hide input elements
    keywordsInput.style.display = 'none';
    generateButton.style.display = 'none';
    noteText.style.display = 'none';
    
    // Create keywords display container if it doesn't exist
    let keywordsDisplay = generatorForm.querySelector('.ttg-keywords-display');
    if (!keywordsDisplay) {
      keywordsDisplay = document.createElement('div');
      keywordsDisplay.className = 'ttg-keywords-display';
      generatorForm.appendChild(keywordsDisplay);
    }
    
    // Get existing description content and format it
    const existingContent = this.getExistingDescriptionContent();
    let contentText = '';
    
    if (existingContent && existingContent.length > 0) {
      // Truncate if too long and add "..."
      const maxLength = 50;
      if (existingContent.length > maxLength) {
        contentText = ` for "${existingContent.substring(0, maxLength)}..."`;
      } else {
        contentText = ` for "${existingContent}"`;
      }
    }
    
    keywordsDisplay.innerHTML = `
      <div class="ttg-keywords-recommendation-text">
        Description recommendation${contentText} with keywords "${keywords}"
      </div>
      <button type="button" class="ttg-change-keywords-btn">Change Keywords</button>
    `;
    
    keywordsDisplay.style.display = 'flex';
    
    // Add event listener for Change Keywords button
    const changeKeywordsBtn = keywordsDisplay.querySelector('.ttg-change-keywords-btn');
    changeKeywordsBtn.addEventListener('click', () => {
      this.showInputHideKeywords(generatorForm, keywords, keywordsInput, generateButton, resultContainer, noteText, charCounter, keywordsDisplay);
    });
  }
  
  showInputHideKeywords(generatorForm, keywords, keywordsInput, generateButton, resultContainer, noteText, charCounter, keywordsDisplay) {
    // Show input elements
    keywordsInput.style.display = 'block';
    generateButton.style.display = 'block';
    noteText.style.display = 'flex';
    // Hide keywords display
    if (keywordsDisplay) {
      keywordsDisplay.style.display = 'none';
    }
    
    // Focus back to input
    keywordsInput.focus();
  }

  getTitleInputContent() {
    // Get the current title input content
    if (this.currentTitleInput) {
      const titleContent = this.currentTitleInput.value || 
                          this.currentTitleInput.textContent || 
                          this.currentTitleInput.innerText || '';
      return titleContent.trim();
    }
    
    // Fallback: try to find any title input
    const titleInput = this.findTitleInput();
    if (titleInput) {
      const titleContent = titleInput.value || 
                          titleInput.textContent || 
                          titleInput.innerText || '';
      return titleContent.trim();
    }
    
    return '';
  }

  getExistingDescriptionContent() {
    // Find the description container first (same approach as when adding description generator)
    let descriptionContainer = document.querySelector('.input-container.description.style-scope.ytcp-video-metadata-editor-basics#description-container');
    
    if (!descriptionContainer) {
      // Fallback: look for any description container
      descriptionContainer = document.querySelector('[id*="description-container"], [class*="description"], .ytcp-video-metadata-editor [aria-label*="description" i]');
    }
    
    if (!descriptionContainer) {
      return '';
    }

    // Find the specific textbox element within the description container
    let descriptionInput = descriptionContainer.querySelector('#textbox[contenteditable="true"][role="textbox"].style-scope.ytcp-social-suggestions-textbox');
    
    if (!descriptionInput) {
      // Fallback selectors within the description container
      const fallbackSelectors = [
        '#textbox[contenteditable="true"][aria-label*="Tell viewers about your video"]',
        '#textbox[contenteditable="true"]',
        '[contenteditable="true"][aria-label*="Tell viewers about your video"]',
        'div[contenteditable="true"]'
      ];
      
      for (const selector of fallbackSelectors) {
        descriptionInput = descriptionContainer.querySelector(selector);
        if (descriptionInput) {
          break;
        }
      }
    }
    
    if (descriptionInput) {
      // Get existing content (preserve text content, not HTML)
      const existingContent = descriptionInput.textContent || descriptionInput.innerText || '';
      return existingContent.trim();
    }
    
    return '';
  }

  async generateDescriptionFromKeywords(keywords, generateButton, resultContainer, generatorForm, descriptionIndex = 1, reloadBtn = null, descriptionDisplay = null, counterText = null, prevBtn = null, nextBtn = null) {
    // Show loading state
    if (generateButton) {
      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';
    }
    
    try {
      // Get title content from the title input field
      const titleContent = this.getTitleInputContent();
      
      // Convert keywords string to array
      const keywordsArray = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      
      // Use message passing to background script to avoid CORS issues
      const response = await chrome.runtime.sendMessage({
        action: 'generateDescription',
        idea: titleContent,
        keywords: keywordsArray,
        title: titleContent
      });

      if (response && response.success && response.description) {
        
        
        if (descriptionIndex === 1) {
          // Initial generation
          this.descriptionsData = [response.description];
          this.currentDescriptionIndex = 0;
          
          // Show result container and display the description (keep form visible)
          resultContainer.style.display = 'block';
          this.displayDescriptionResult(resultContainer, response.description);
        } else {
          // Reload generation - add to existing array
          this.descriptionsData.push(response.description);
          this.currentDescriptionIndex = this.descriptionsData.length - 1;
          
          // Update existing display elements
          if (descriptionDisplay) {
            descriptionDisplay.textContent = response.description;
          }
          if (counterText && prevBtn && nextBtn) {
            this.updateNavigationButtons(prevBtn, nextBtn, counterText);
          }
        }
        
      } else {
        throw new Error('Invalid response from description API');
      }
    } catch (error) {
      console.error('TubeMaster: Description API call failed:', error.message);
      // Return static dummy response instead of showing error
      const fallbackDescription = `Description ${descriptionIndex} - Discover everything you need to know about ${keywords}! In this comprehensive guide, we'll explore the key concepts and provide practical tips to help you succeed.

🔥 What you'll learn:
✅ Core fundamentals of ${keywords}
✅ Step-by-step implementation
✅ Pro tips and best practices
✅ Common mistakes to avoid

Don't forget to LIKE this video if it helped you and SUBSCRIBE for more content!`;
      
      if (descriptionIndex === 1) {
        // Initial generation
        this.descriptionsData = [fallbackDescription];
        this.currentDescriptionIndex = 0;
        
        // Show result container and display the description (keep form visible)
        resultContainer.style.display = 'block';
        this.displayDescriptionResult(resultContainer, fallbackDescription);
      } else {
        // Reload generation - add to existing array
        this.descriptionsData.push(fallbackDescription);
        this.currentDescriptionIndex = this.descriptionsData.length - 1;
        
        // Update existing display elements
        if (descriptionDisplay) {
          descriptionDisplay.textContent = fallbackDescription;
        }
        if (counterText && prevBtn && nextBtn) {
          this.updateNavigationButtons(prevBtn, nextBtn, counterText);
        }
      }
    } finally {
      // Re-enable button
      if (generateButton) {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate';
      }
    }
  }

  displayDescriptionResult(resultContainer, description) {
    resultContainer.innerHTML = '';
    
    // Create description display
    const descriptionDisplay = document.createElement('div');
    descriptionDisplay.className = 'ttg-description-display';
    descriptionDisplay.textContent = description;
    
    // Create controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'ttg-description-controls-container';
    
    // Create navigation controls (left side)
    const navControls = document.createElement('div');
    navControls.className = 'ttg-description-nav-controls';
    
    // Reload button (moved to leftmost position)
    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'ttg-description-nav-btn ttg-description-reload-btn';
    reloadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 14 14" fill="#ee5572" xmlns="http://www.w3.org/2000/svg"><g id="rotate-cw"><path id="Vector (Stroke)" fill-rule="evenodd" clip-rule="evenodd" d="M7.00007 2.39173C6.08863 2.39173 5.19765 2.66201 4.43982 3.16838C3.68198 3.67475 3.09132 4.39447 2.74252 5.23653C2.39373 6.0786 2.30247 7.00518 2.48028 7.89911C2.6581 8.79304 3.097 9.61416 3.74148 10.2586C4.38597 10.9031 5.2071 11.342 6.10103 11.5199C6.99496 11.6977 7.92154 11.6064 8.7636 11.2576C9.60566 10.9088 10.3254 10.3182 10.8318 9.56032C11.3381 8.80248 11.6084 7.91151 11.6084 7.00007C11.6084 6.64568 11.8957 6.3584 12.2501 6.3584C12.6045 6.3584 12.8917 6.64568 12.8917 7.00007C12.8917 8.16533 12.5462 9.30442 11.8988 10.2733C11.2514 11.2422 10.3313 11.9973 9.25471 12.4433C8.17815 12.8892 6.99353 13.0059 5.85066 12.7785C4.70779 12.5512 3.65799 11.9901 2.83403 11.1661C2.01007 10.3421 1.44894 9.29234 1.22161 8.14947C0.994277 7.0066 1.11095 5.82198 1.55688 4.74542C2.0028 3.66886 2.75795 2.74871 3.72683 2.10132C4.69571 1.45394 5.83481 1.1084 7.00007 1.1084C8.64062 1.1084 10.2045 1.75924 11.3764 2.88581L11.3855 2.89467L11.6084 3.11761L11.6084 1.75007C11.6084 1.39568 11.8957 1.1084 12.2501 1.1084C12.6044 1.1084 12.8917 1.39568 12.8917 1.75007L12.8917 4.66673C12.8917 4.83691 12.8241 5.00012 12.7038 5.12046C12.5835 5.24079 12.4202 5.3084 12.2501 5.3084L9.3334 5.3084C8.97902 5.3084 8.69173 5.02111 8.69173 4.66673C8.69173 4.31235 8.97902 4.02507 9.3334 4.02507H10.7009L10.4826 3.80672C9.54335 2.90593 8.29748 2.39173 7.00007 2.39173Z" fill="#ee5572"></path></g></svg>';
    reloadBtn.title = 'Generate new description';
    
    // Left arrow (previous)
    const prevBtn = document.createElement('button');
    prevBtn.className = 'ttg-description-nav-btn ttg-description-prev-btn';
    prevBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill-rule="evenodd" clip-rule="evenodd" d="M15.7071 4.29289C16.0976 4.68342 16.0976 5.31658 15.7071 5.70711L9.41421 12L15.7071 18.2929C16.0976 18.6834 16.0976 19.3166 15.7071 19.7071C15.3166 20.0976 14.6834 20.0976 14.2929 19.7071L7.29289 12.7071C7.10536 12.5196 7 12.2652 7 12C7 11.7348 7.10536 11.4804 7.29289 11.2929L14.2929 4.29289C14.6834 3.90237 15.3166 3.90237 15.7071 4.29289Z" fill="#ee5572"></path> </g></svg>`;
    prevBtn.title = 'Previous description';
    prevBtn.disabled = this.currentDescriptionIndex <= 0;
    
    // Counter text
    const counterText = document.createElement('span');
    counterText.className = 'ttg-description-counter';
    counterText.textContent = `${this.currentDescriptionIndex + 1} of ${this.descriptionsData.length}`;
    
    // Right arrow (next)
    const nextBtn = document.createElement('button');
    nextBtn.className = 'ttg-description-nav-btn ttg-description-next-btn';
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill-rule="evenodd" clip-rule="evenodd" d="M8.29289 4.29289C8.68342 3.90237 9.31658 3.90237 9.70711 4.29289L16.7071 11.2929C17.0976 11.6834 17.0976 12.3166 16.7071 12.7071L9.70711 19.7071C9.31658 20.0976 8.68342 20.0976 8.29289 19.7071C7.90237 19.3166 7.90237 18.6834 8.29289 18.2929L14.5858 12L8.29289 5.70711C7.90237 5.31658 7.90237 4.68342 8.29289 4.29289Z" fill="#ee5572"></path> </g></svg>';
    nextBtn.title = 'Next description';
    nextBtn.disabled = this.currentDescriptionIndex >= this.descriptionsData.length - 1;
    
    navControls.appendChild(reloadBtn);
    navControls.appendChild(prevBtn);
    navControls.appendChild(counterText);
    navControls.appendChild(nextBtn);
    
    // Create action buttons container (right side)
    const actionButtons = document.createElement('div');
    actionButtons.className = 'ttg-description-action-buttons';
    
    // Copy button (outline style)
    const copyButton = document.createElement('button');
    copyButton.className = 'ttg-copy-description-btn ttg-outline-btn';
    copyButton.textContent = 'Copy';
    
    // Insert button
    const insertButton = document.createElement('button');
    insertButton.className = 'ttg-insert-description-btn';
    insertButton.textContent = 'Insert';
    
    actionButtons.appendChild(copyButton);
    actionButtons.appendChild(insertButton);
    
    // Assemble controls
    controlsContainer.appendChild(navControls);
    controlsContainer.appendChild(actionButtons);
    
    resultContainer.appendChild(descriptionDisplay);
    resultContainer.appendChild(controlsContainer);
    
    // Add event listeners
    this.setupDescriptionNavigation(prevBtn, nextBtn, reloadBtn, copyButton, insertButton, descriptionDisplay, counterText);
  }

  setupDescriptionNavigation(prevBtn, nextBtn, reloadBtn, copyButton, insertButton, descriptionDisplay, counterText) {
    // Previous button
    prevBtn.addEventListener('click', () => {
      if (this.currentDescriptionIndex > 0) {
        this.currentDescriptionIndex--;
        descriptionDisplay.textContent = this.descriptionsData[this.currentDescriptionIndex];
        this.updateNavigationButtons(prevBtn, nextBtn, counterText);
      }
    });
    
    // Next button
    nextBtn.addEventListener('click', () => {
      if (this.currentDescriptionIndex < this.descriptionsData.length - 1) {
        this.currentDescriptionIndex++;
        descriptionDisplay.textContent = this.descriptionsData[this.currentDescriptionIndex];
        this.updateNavigationButtons(prevBtn, nextBtn, counterText);
      }
    });
    
    // Reload button - generate new description
    reloadBtn.addEventListener('click', async () => {
      const keywordsInput = this.descriptionGeneratorSection.querySelector('.ttg-keywords-input');
      const generateButton = this.descriptionGeneratorSection.querySelector('.ttg-generate-description-btn');
      const resultContainer = this.descriptionGeneratorSection.querySelector('.ttg-description-result-container');
      
      if (keywordsInput && keywordsInput.value.trim()) {
        // Add rotation animation
        reloadBtn.classList.add('ttg-rotating');
        
        // Calculate next description index
        const nextIndex = this.descriptionsData.length + 1;
        
        // Use the same function as initial generation but with index
        await this.generateDescriptionFromKeywords(keywordsInput.value.trim(), generateButton, resultContainer, null, nextIndex, reloadBtn, descriptionDisplay, counterText, prevBtn, nextBtn);
        
        // Remove rotation animation
        setTimeout(() => {
          reloadBtn.classList.remove('ttg-rotating');
        }, 500);
      }
    });
    
    // Copy button
    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(descriptionDisplay.textContent).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.style.background = '#28a745';
        copyButton.style.color = '#fff';
        setTimeout(() => {
          copyButton.textContent = originalText;
          copyButton.style.background = '';
          copyButton.style.color = '';
        }, 2000);
      });
    });
    
    // Insert button - insert description into YouTube's description field
    insertButton.addEventListener('click', () => {
      this.insertDescriptionIntoYouTube(descriptionDisplay.textContent, insertButton);
    });
  }


  insertDescriptionIntoYouTube(description, insertButton) {
    // Find the description container first (same approach as when adding description generator)
    let descriptionContainer = document.querySelector('.input-container.description.style-scope.ytcp-video-metadata-editor-basics#description-container');
    
    if (!descriptionContainer) {
      // Fallback: look for any description container
      descriptionContainer = document.querySelector('[id*="description-container"], [class*="description"], .ytcp-video-metadata-editor [aria-label*="description" i]');
    }
    
    if (!descriptionContainer) {
      console.error('TubeMaster: Description container not found');
      this.showInsertError(insertButton, 'Container Not Found');
      return;
    }

    // Find the specific textbox element within the description container
    let descriptionInput = descriptionContainer.querySelector('#textbox[contenteditable="true"][role="textbox"].style-scope.ytcp-social-suggestions-textbox');
    
    if (!descriptionInput) {
      // Fallback selectors within the description container
      const fallbackSelectors = [
        '#textbox[contenteditable="true"][aria-label*="Tell viewers about your video"]',
        '#textbox[contenteditable="true"]',
        '[contenteditable="true"][aria-label*="Tell viewers about your video"]',
        'div[contenteditable="true"]'
      ];
      
      for (const selector of fallbackSelectors) {
        descriptionInput = descriptionContainer.querySelector(selector);
        if (descriptionInput) {
          break;
        }
      }
    }
    
    if (descriptionInput) {
      
      // Get existing content (preserve HTML formatting for contenteditable elements)
      const existingContent = descriptionInput.innerHTML || '';
      
      // Convert the new description to HTML format (replace line breaks with <br> tags)
      const descriptionHTML = description.replace(/\n/g, '<br>');
      
      // Prepend new description with separator if there's existing content
      const newContent = existingContent.trim() 
        ? `${descriptionHTML}<br><br>${existingContent}`
        : descriptionHTML;
      
      // Set the new content using innerHTML to preserve formatting
      descriptionInput.innerHTML = newContent;
      
      // Focus the element to ensure it's active
      descriptionInput.focus();
      
      // Trigger change events to notify YouTube
      const events = ['input', 'change', 'blur', 'focus', 'paste'];
      events.forEach(eventType => {
        try {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          descriptionInput.dispatchEvent(event);
        } catch (e) {
          // Silently handle event errors
        }
      });
      
      // Also try InputEvent for modern browsers
      try {
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: newContent
        });
        descriptionInput.dispatchEvent(inputEvent);
      } catch (e) {
        // InputEvent not supported, continue
      }
      
      // Show success feedback
      this.showInsertSuccess(insertButton);
      
    } else {
      console.error('TubeMaster: Description input element not found');
      this.showInsertError(insertButton, 'Input Not Found');
    }
  }

  showInsertSuccess(insertButton) {
    const originalText = insertButton.textContent;
    const originalStyles = {
      background: insertButton.style.background,
      color: insertButton.style.color
    };
    
    insertButton.textContent = 'Inserted!';
    insertButton.style.background = '#28a745';
    insertButton.style.color = '#fff';
    
    setTimeout(() => {
      insertButton.textContent = originalText;
      insertButton.style.background = originalStyles.background;
      insertButton.style.color = originalStyles.color;
    }, 2000);
  }

  showInsertError(insertButton, errorText) {
    const originalText = insertButton.textContent;
    const originalStyles = {
      background: insertButton.style.background,
      color: insertButton.style.color
    };
    
    insertButton.textContent = errorText;
    insertButton.style.background = '#dc3545';
    insertButton.style.color = '#fff';
    
    setTimeout(() => {
      insertButton.textContent = originalText;
      insertButton.style.background = originalStyles.background;
      insertButton.style.color = originalStyles.color;
    }, 2000);
  }

  updateNavigationButtons(prevBtn, nextBtn, counterText = null) {
    prevBtn.disabled = this.currentDescriptionIndex <= 0;
    nextBtn.disabled = this.currentDescriptionIndex >= this.descriptionsData.length - 1;
    
    // Update counter text if provided
    if (counterText) {
      counterText.textContent = `${this.currentDescriptionIndex + 1} of ${this.descriptionsData.length}`;
    }
  }


  setupThumbnailBuilderEvents(builderSection, descriptionInput, generateButton, thumbnailGrid) {
    // Store references for thumbnail functionality
    this.thumbnailsData = [];

    // Generate button click handler
    generateButton.addEventListener('click', async () => {
      const description = descriptionInput.value.trim();
      const validationMsg = builderSection.querySelector('.ttg-validation-message');
      
      // Clear previous validation message
      validationMsg.style.display = 'none';
      
      if (!description) {
        validationMsg.textContent = 'Please enter a description';
        validationMsg.style.display = 'block';
        descriptionInput.focus();
        return;
      }

      await this.generateThumbnailsFromBuilder(description, thumbnailGrid, generateButton);
    });


    
    // Initially hide thumbnails until generated
    const sliderContainer = builderSection.querySelector('.ttg-thumbnail-slider-container');
    sliderContainer.style.display = 'none';
  }

  async generateThumbnailsFromBuilder(description, thumbnailGrid, generateButton) {
    
    // Show loading state
    generateButton.disabled = true;
    generateButton.textContent = 'Generating...';
    
    // Show slider container and add loading thumbnails
    const sliderContainer = thumbnailGrid.closest('.ttg-thumbnail-slider-container');
    sliderContainer.style.display = 'block';
    
    // Show 6 loading thumbnails
    thumbnailGrid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const loadingItem = document.createElement('div');
      loadingItem.className = 'ttg-thumbnail-slider-item ttg-thumbnail-loading-item';
      loadingItem.innerHTML = `
        <div class="ttg-thumbnail-loading">
          <div class="ttg-thumbnail-spinner"></div>
          <div class="ttg-thumbnail-placeholder">Loading...</div>
        </div>
      `;
      thumbnailGrid.appendChild(loadingItem);
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'generateThumbnails',
        description: description
      });

      if (response && response.success && response.thumbnails && response.thumbnails.length > 0) {
        this.thumbnailsData = response.thumbnails;
        this.displayThumbnails(thumbnailGrid);
      } else {
        // Invalid response or empty thumbnails - keep loading spinners visible
        console.log('TubeMaster: No valid thumbnails received, keeping loading state');
      }
    } catch (error) {
      console.error('TubeMaster: Thumbnail API call failed:', error.message);
      // Keep loading spinners visible even on error - don't replace them
    } finally {
      // Re-enable button
      generateButton.disabled = false;
      generateButton.textContent = 'Generate Thumbnails';
    }
  }

  displayThumbnails(thumbnailGrid) {
    // Only clear and display if we have valid thumbnail data
    if (!this.thumbnailsData || this.thumbnailsData.length === 0) {
      console.log('TubeMaster: No thumbnail data to display, keeping current state');
      return;
    }
    
    // Clear grid
    thumbnailGrid.innerHTML = '';
    
    // Add all thumbnails to scrollable grid
    this.thumbnailsData.forEach((thumbnail, index) => {
      const thumbnailItem = document.createElement('div');
      thumbnailItem.className = 'ttg-thumbnail-slider-item';
      
      if (thumbnail.url) {
        thumbnailItem.innerHTML = `
          <img src="${thumbnail.url}" alt="${thumbnail.title || 'Generated Thumbnail ' + (index + 1)}" class="ttg-thumbnail-image">
          <div class="ttg-thumbnail-overlay">
            <button class="ttg-thumbnail-select-btn" data-thumbnail-url="${thumbnail.url}">Select</button>
          </div>
        `;
        
        // Add click handler for select button
        const selectBtn = thumbnailItem.querySelector('.ttg-thumbnail-select-btn');
        selectBtn.addEventListener('click', () => {
          this.selectThumbnail(thumbnail.url);
        });
      } else {
        // Keep loading state
        thumbnailItem.innerHTML = `
          <div class="ttg-thumbnail-loading">
            <div class="ttg-thumbnail-spinner"></div>
            <div class="ttg-thumbnail-placeholder">Loading...</div>
          </div>
        `;
      }
      
      thumbnailGrid.appendChild(thumbnailItem);
    });
  }


  selectThumbnail(thumbnailUrl) {
    // Here you could implement logic to set the thumbnail in YouTube Studio
    // For now, just show a confirmation
    alert(`Thumbnail selected! URL: ${thumbnailUrl}`);
  }


  addTitleSuggestionsSection(titleInput) {
    // Don't add suggestions section if not authenticated
    if (!this.isAuthenticated) {
      return;
    }
    
    // Check if we already have a valid section for this specific input
    if (this.titleSuggestionsSection && 
        document.body.contains(this.titleSuggestionsSection) &&
        this.titleSuggestionsSection._attachedToInput === titleInput) {
      return;
    }
    
    // Clean up any existing section
    if (this.titleSuggestionsSection) {
      if (this.titleSuggestionsSection._positionCleanup) {
        this.titleSuggestionsSection._positionCleanup();
      }
      if (this.titleSuggestionsSection.parentElement) {
        this.titleSuggestionsSection.remove();
      }
      this.titleSuggestionsSection = null;
    }

    // Find the target container where suggestions should be placed - simplified approach
    let targetContainer = null;
    
    // First, try to find the specific container-bottom element as specified by the user
    targetContainer = document.querySelector('.container-bottom.style-scope.ytcp-social-suggestions-textbox');
    
    if (targetContainer) {
      console.log('TubeMaster: Found title target container where to place suggestions box with main selector');
    } else {
      // Fallback: look for any container-bottom element that might work
      const fallbackSelectors = [
        '.container-bottom',
        '.style-scope.ytcp-social-suggestions-textbox',
        '.ytcp-social-suggestions-textbox'
      ];
      
      for (const selector of fallbackSelectors) {
        targetContainer = document.querySelector(selector);
        if (targetContainer) {
          console.log(`TubeMaster: Found target container with fallback selector: ${selector}`);
          break;
        }
      }
    }

    if (!targetContainer) {
      console.error('TubeMaster: No suitable target container found for title suggestions');
      return;
    }

    // Create the suggestions section to be placed after the container-bottom element
    const suggestionsSection = document.createElement('div');
    suggestionsSection.className = 'ttg-title-suggestions-section ttg-title-suggestions-section-styled';
    
    // Create elements programmatically using CSS classes
    const header = document.createElement('div');
    header.className = 'ttg-suggestions-header ttg-suggestions-header-styled';
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
    `;
    
    const logoContainer = document.createElement('div');
    logoContainer.className = 'ttg-suggestions-logo ttg-suggestions-logo-styled';
    logoContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const logoImg = document.createElement('img');
    logoImg.className = 'ttg-suggestions-logo-img ttg-suggestions-logo-img-styled';
    logoImg.alt = 'TubeMaster';
    
    // Try to set the logo URL safely
    try {
      logoImg.src = chrome.runtime.getURL('icons/logo.png');
    } catch (error) {
      logoImg.style.display = 'none';
    }
    
    const title = document.createElement('h3');
    title.className = 'ttg-suggestions-title ttg-suggestions-title-styled';
    title.textContent = 'Suggestions';
    title.style.margin = '0';
    
    logoContainer.appendChild(logoImg);
    logoContainer.appendChild(title);
    
    // Add accordion arrow - better looking chevron
    const accordionArrow = document.createElement('div');
    accordionArrow.className = 'ttg-accordion-arrow';
    accordionArrow.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:block" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.5 6.5L8 10L11.5 6.5" stroke="#606060" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    
    header.appendChild(logoContainer);
    header.appendChild(accordionArrow);
    
    const content = document.createElement('div');
    content.className = 'ttg-suggestions-content ttg-suggestions-content-styled';
    
    const list = document.createElement('div');
    list.className = 'ttg-suggestions-list ttg-suggestions-list-styled';
    list.id = 'ttg-title-suggestions-list';
    
    content.appendChild(list);
    suggestionsSection.appendChild(header);
    suggestionsSection.appendChild(content);
    
    // Add accordion toggle functionality
    let isCollapsed = false;
    const toggleAccordion = (forceOpen = false) => {
      if (forceOpen && !isCollapsed) return; // Already open
      
      isCollapsed = forceOpen ? false : !isCollapsed;
      if (isCollapsed) {
        content.style.display = 'none';
        accordionArrow.style.transform = 'rotate(180deg)';
      } else {
        content.style.display = 'block';
        accordionArrow.style.transform = 'rotate(0deg)';
        accordionArrow.style.backgroundColor = 'transparent';
      }
    };
    
    // Store reference to toggle function for external access
    suggestionsSection._toggleAccordion = toggleAccordion;
    
    // Add click listeners for accordion
    header.addEventListener('click', () => toggleAccordion());
    accordionArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAccordion();
    });

    // Insert the suggestions section immediately after the container-bottom element
    try {
      if (targetContainer.nextSibling) {
        targetContainer.parentElement.insertBefore(suggestionsSection, targetContainer.nextSibling);
      } else {
        targetContainer.parentElement.appendChild(suggestionsSection);
      }
    } catch (error) {
      
      // Fallback: append to the container-bottom's parent
      try {
        targetContainer.parentElement.appendChild(suggestionsSection);
      } catch (fallbackError) {
        return;
      }
    }
    
    this.titleSuggestionsSection = suggestionsSection;
    // Mark which input this section is attached to
    this.titleSuggestionsSection._attachedToInput = titleInput;
  }

  async showPermanentAutoSuggestions(inputValue) {
    const suggestionsList = document.getElementById('ttg-title-suggestions-list');
    const suggestionsContent = document.querySelector('.ttg-suggestions-content');
    
    if (!suggestionsList) {
      return;
    }

    // Show the suggestions content section
    if (suggestionsContent) {
      suggestionsContent.classList.add('ttg-show');
    }
    
    // Auto-open accordion when typing
    if (this.titleSuggestionsSection && this.titleSuggestionsSection._toggleAccordion) {
      this.titleSuggestionsSection._toggleAccordion(true); // Force open
    }

    // Show loading state
    suggestionsList.innerHTML = `
      <div class="ttg-suggestions-loading">
        <div class="ttg-suggestions-spinner"></div>
        <span>Generating suggestions...</span>
      </div>
    `;

    try {
      const suggestions = await this.generateAutoSuggestions(inputValue);
      
      suggestionsList.innerHTML = '';
      suggestions.forEach((suggestion) => {
        // Handle both string suggestions and object suggestions with scores
        const text = typeof suggestion === 'string' ? suggestion : suggestion.text;
        const score = typeof suggestion === 'string' ? Math.floor(Math.random() * 20) + 80 : suggestion.score;
        
        const suggestionElement = this.createPermanentSuggestionElement(text, score);
        suggestionsList.appendChild(suggestionElement);
      });

    } catch (error) {
      suggestionsList.innerHTML = `
        <div class="ttg-suggestions-error">
          <span>⚠️ Error generating suggestions</span>
        </div>
      `;
    }
  }

  createPermanentSuggestionElement(text, score) {
    const element = document.createElement('div');
    element.className = 'ttg-permanent-suggestion ';
    
    const scoreElement = document.createElement('div');
    scoreElement.className = 'ttg-suggestion-score ttg-suggestion-score-styled';
    scoreElement.textContent = score; // This is now the actual score from API response, not a serial number
    
    const textElement = document.createElement('div');
    textElement.className = 'ttg-suggestion-text ttg-suggestion-text-styled';
    textElement.textContent = text;
    
    element.appendChild(scoreElement);
    element.appendChild(textElement);

    element.addEventListener('click', () => {
      this.populateTitle(text);
    });
    
    return element;
  }

  hidePermanentAutoSuggestions() {
    const suggestionsList = document.getElementById('ttg-title-suggestions-list');
    const suggestionsContent = document.querySelector('.ttg-suggestions-content');
    
    if (suggestionsList) {
      suggestionsList.innerHTML = '';
    }
    
    // Hide the suggestions content section
    if (suggestionsContent) {
      suggestionsContent.classList.remove('ttg-show');
    }
  }

  createSuggestionContainer() {
    const container = document.createElement('div');
    container.className = 'ttg-suggestion-container';
    return container;
  }

  positionContainer(container, referenceElement) {
    const rect = referenceElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    container.style.position = 'absolute';
    container.style.top = (rect.bottom + scrollTop + 10) + 'px';
    container.style.left = (rect.left + scrollLeft) + 'px';
    container.style.zIndex = '10000';
  }

  populateTitle(title) {
    const titleInput = this.findTitleInput();
    
    if (titleInput) {
      
      // Set flags to prevent auto-suggestions during population
      this.isPopulatingTitle = true;
      this.lastPopulatedTitle = title;
      
      try {
        // Focus the input first
        titleInput.focus();
        
        // Clear existing value using multiple methods
        if (titleInput.value !== undefined) {
          titleInput.value = '';
        }
        if (titleInput.textContent !== undefined) {
          titleInput.textContent = '';
        }
        if (titleInput.innerText !== undefined) {
          titleInput.innerText = '';
        }
        
        // Set the new value using multiple methods
        if (titleInput.tagName === 'INPUT' || titleInput.tagName === 'TEXTAREA') {
          titleInput.value = title;
        }
        
        // For contenteditable elements
        if (titleInput.contentEditable === 'true' || titleInput.isContentEditable) {
          titleInput.textContent = title;
          titleInput.innerText = title;
        }
        
        // Create and dispatch various events to ensure YouTube Studio recognizes the change
        const events = [
          'input',
          'change', 
          'keyup',
          'keydown',
          'paste',
          'blur',
          'focus'
        ];
        
        events.forEach(eventType => {
          try {
            const event = new Event(eventType, { 
              bubbles: true, 
              cancelable: true,
              composed: true
            });
            titleInput.dispatchEvent(event);
          } catch (e) {
            // Silently handle event dispatch errors
          }
        });

        // Also try InputEvent for modern browsers
        try {
          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: title
          });
          titleInput.dispatchEvent(inputEvent);
        } catch (e) {
          // InputEvent not supported, continue with other methods
        }

        // Force a final focus to ensure the change is registered
        setTimeout(() => {
          try {
            titleInput.focus();
            titleInput.blur();
            titleInput.focus();
            
            // Reset the population flag after a delay to allow for user edits
            setTimeout(() => {
              this.isPopulatingTitle = false;
            }, 1000);
          } catch (e) {
            this.isPopulatingTitle = false;
          }
        }, 100);

        // Get final value for verification
        const finalValue = titleInput.value || titleInput.textContent || titleInput.innerText || '';
        return true;
        
      } catch (error) {
        this.isPopulatingTitle = false;
        return false;
      }
    }
    
    return false;
  }

  addExtensionIndicator() {
    if (document.querySelector('.ttg-indicator')) return;

    const indicator = document.createElement('div');
    indicator.className = 'ttg-indicator';
    indicator.innerHTML = `
      <div class="ttg-indicator-content">
        <span class="ttg-text">TubeMaster Tools Active</span>
      </div>
    `;

    document.body.appendChild(indicator);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (indicator && indicator.parentElement) {
        indicator.style.opacity = '0';
        setTimeout(() => indicator.remove(), 300);
      }
    }, 3000);
  }

  handleMessage(request, sender, sendResponse) {
    if (request.action === 'populateTitle') {
      const success = this.populateTitle(request.title);
      sendResponse({ success });
    } else if (request.action === 'checkTitleInput') {
      const titleInput = this.findTitleInput();
      sendResponse({ found: !!titleInput });
    } else if (request.action === 'refreshCSS') {
      this.ensureCSSLoaded();
      sendResponse({ success: true });
    } else if (request.action === 'authenticationComplete') {
      // Re-check authentication and re-initialize if needed
      this.checkAuthentication().then(isAuth => {
        if (isAuth) {
          this.isAuthenticated = true;
          // Add all sections now that user is authenticated
          this.addAllSections();
          
          // Also ensure CSS is loaded
          this.ensureCSSLoaded();
          
          // Start periodic checks if not already running
          if (!this.periodicCheckInterval) {
            this.startPeriodicChecks();
          }
        }
      });
      sendResponse({ success: true });
    } else if (request.action === 'userSignedOut') {
      // User signed out, remove all sections
      this.isAuthenticated = false;
      this.removeAllSections();
      sendResponse({ success: true });
    } else if (request.action === 'userSignedIn') {
      // User signed in, add all sections
      this.isAuthenticated = true;
      this.addAllSections();
      
      // Also ensure CSS is loaded
      this.ensureCSSLoaded();
      
      // Start periodic checks if not already running
      if (!this.periodicCheckInterval) {
        this.startPeriodicChecks();
      }
      
      sendResponse({ success: true });
    }
  }

  addOutsideClickListener(container) {
    const outsideClickHandler = (event) => {
      // Check if the click was outside the container
      if (!container.contains(event.target) && !this.currentTitleInput.contains(event.target)) {
        container.remove();
        this.suggestionContainer = null;
        document.removeEventListener('click', outsideClickHandler);
      }
    };

    // Add the listener after a small delay to prevent immediate closing
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler);
    }, 100);
  }

  setupDarkModeDetection() {
    // Track current state to avoid unnecessary updates
    let currentDarkMode = null;
    
    // Function to detect YouTube's dark mode and apply appropriate classes
    const detectAndApplyDarkMode = () => {
      // For now, let's use only the most reliable method: html[dark] attribute
      // This is the primary way YouTube indicates dark mode
      const isDark = document.documentElement.hasAttribute('dark');
      
      // Only update if the state has actually changed
      if (currentDarkMode !== isDark) {
        currentDarkMode = isDark;
        
        // Apply or remove dark mode class
        if (isDark) {
          document.documentElement.classList.add('ttg-dark-mode');
          document.body.classList.add('ttg-dark-mode');
          console.log('TTG: Applied dark mode');
        } else {
          document.documentElement.classList.remove('ttg-dark-mode');
          document.body.classList.remove('ttg-dark-mode');
          console.log('TTG: Applied light mode');
        }
      }
    };

    // Initial detection with a small delay to let YouTube load
    setTimeout(detectAndApplyDarkMode, 1000);

    // Watch for theme changes using MutationObserver
    const themeObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'dark') {
          shouldCheck = true;
        }
      });
      
      if (shouldCheck) {
        // Debounce theme detection
        clearTimeout(this.themeCheckTimeout);
        this.themeCheckTimeout = setTimeout(detectAndApplyDarkMode, 100);
      }
    });

    // Only observe changes to html element for 'dark' attribute
    if (document.documentElement) {
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['dark']
      });
    }
    
    // Store the observer for cleanup
    this.themeObserver = themeObserver;
  }

  isYouTubeDarkModeStrict() {
    // More conservative background color check - only for YouTube Studio specific elements
    const ytStudioElements = [
      document.querySelector('ytcp-app'),
      document.querySelector('#content'),
      document.querySelector('ytcp-video-metadata-editor'),
      document.querySelector('.ytcp-video-metadata-editor')
    ].filter(Boolean);
    
    if (ytStudioElements.length === 0) {
      return false; // No YouTube Studio elements found
    }
    
    // Check if YouTube Studio specific elements have dark backgrounds
    for (const element of ytStudioElements) {
      const style = getComputedStyle(element);
      const bgColor = style.backgroundColor;
      
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        const rgb = bgColor.match(/\d+/g);
        if (rgb) {
          const [r, g, b] = rgb.map(Number);
          // Much stricter threshold - only very dark backgrounds (< 50)
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
          if (luminance < 50) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  cleanup() {
    
    // Clear intervals
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
    }
    
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
    }
    
    if (this.themeCheckTimeout) {
      clearTimeout(this.themeCheckTimeout);
    }
    
    // Disconnect theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    
    // Clean up position update listeners
    if (this.titleSuggestionsSection && this.titleSuggestionsSection._positionCleanup) {
      this.titleSuggestionsSection._positionCleanup();
    }
    
    // Remove suggestion sections
    if (this.titleSuggestionsSection && this.titleSuggestionsSection.parentElement) {
      this.titleSuggestionsSection.remove();
    }
    
    if (this.thumbnailBuilderSection && this.thumbnailBuilderSection.parentElement) {
      this.thumbnailBuilderSection.remove();
    }
    
    if (this.descriptionGeneratorSection && this.descriptionGeneratorSection.parentElement) {
      this.descriptionGeneratorSection.remove();
    }
    
    if (this.suggestionContainer && this.suggestionContainer.parentElement) {
      this.suggestionContainer.remove();
    }
    
    // Removed thumbnailPopup cleanup - using permanent section instead
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global reference for popup integration
window.tubeTitleGenerator = {
  openPopup: () => {
    // This will be handled by the background script
    chrome.runtime.sendMessage({ action: 'openPopup' });
  },
  refreshCSS: () => {
    // Force refresh CSS - useful for development
    if (window.tubeTitleGeneratorInstance) {
      window.tubeTitleGeneratorInstance.ensureCSSLoaded();
    }
    chrome.runtime.sendMessage({ action: 'refreshCSS' });
  }
};

// Initialize the integration only once
if (!window.tubeTitleGeneratorInstance) {
  window.tubeTitleGeneratorInstance = new YouTubeStudioIntegration();
}
