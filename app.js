// ===================================
// Configuration & Constants
// ===================================
const CONFIG = {
  STORAGE_KEYS: {
    SONGS: "songbook_songs",
    FAVORITES: "songbook_favorites",
    THEME: "songbook_theme",
  },
  PERFORMANCE: {
    VIRTUAL_SCROLL_ENABLED: true,
    ITEMS_PER_PAGE: 50, // Number of songs to render at once
    DEBOUNCE_DELAY: 300, // ms delay for search input
    RENDER_BATCH_SIZE: 20, // Songs to render per batch
  },
};

// ===================================
// State Management
// ===================================
let songs = [];
let favorites = new Set();
let currentFilter = "all"; // 'all' or 'favorites'
let currentSort = "title"; // 'title' or 'artist'
let currentPage = 0;
let isRendering = false;
let searchDebounceTimer = null;
let scrollObserver = null; // Used for infinite scrolling

// ===================================
// DOM Elements
// ===================================
const elements = {
  searchInput: document.getElementById("searchInput"),
  showFavorites: document.getElementById("showFavorites"),
  sortToggle: document.getElementById("sortToggle"),
  songList: document.getElementById("songList"),
  songCount: document.getElementById("songCount"),
  favoriteCount: document.getElementById("favoriteCount"),
  themeToggle: document.getElementById("themeToggle"),
  scrollToTop: document.getElementById("scrollToTop"),
};

// ===================================
// Initialize App
// ===================================
async function init() {
  loadTheme();
  await loadFromStorage();
  attachEventListeners();
  renderSongs();

  // Register Service Worker for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("service-worker.js")
      .then(() => console.log("Service Worker registered"))
      .catch((err) => console.log("Service Worker registration failed:", err));
  }
}

// ===================================
// Theme Management
// ===================================
function loadTheme() {
  const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);

  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);
  } else {
    // Default to dark mode when no user preference is saved
    const theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeIcon(theme);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const iconBtn = document.getElementById("themeToggle");
  if (theme === "dark") {
    // Sun icon for dark mode (click to switch to light)
    iconBtn.innerHTML = `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>`;
  } else {
    // Moon icon for light mode (click to switch to dark)
    iconBtn.innerHTML = `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>`;
  }
}

// ===================================
// Local Storage Management
// ===================================
async function loadFromStorage() {
  // Always load songs from songs.json file
  try {
    const response = await fetch("assets/songs.json");
    if (response.ok) {
      const data = await response.json();
      songs = data.songs || data || [];
      // Save to localStorage for caching
      saveToStorage();
    }
  } catch (error) {
    console.error("Error loading songs.json:", error);
    // Fallback to localStorage if fetch fails
    const savedSongs = localStorage.getItem(CONFIG.STORAGE_KEYS.SONGS);
    if (savedSongs) {
      songs = JSON.parse(savedSongs);
    }
  }

  // Load favorites
  const savedFavorites = localStorage.getItem(CONFIG.STORAGE_KEYS.FAVORITES);
  if (savedFavorites) {
    favorites = new Set(JSON.parse(savedFavorites));
  }
}

function saveToStorage() {
  localStorage.setItem(CONFIG.STORAGE_KEYS.SONGS, JSON.stringify(songs));
  localStorage.setItem(
    CONFIG.STORAGE_KEYS.FAVORITES,
    JSON.stringify([...favorites])
  );
}

// ===================================
// Event Listeners
// ===================================
function attachEventListeners() {
  // Search with debouncing for better performance
  elements.searchInput.addEventListener("input", (e) => {
    // Clear existing timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    // Set new timer
    searchDebounceTimer = setTimeout(() => {
      currentPage = 0; // Reset to first page on new search
      renderSongs();
    }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);
  });

  // Show favorites filter
  elements.showFavorites.addEventListener("click", () => {
    currentFilter = currentFilter === "all" ? "favorites" : "all";
    elements.showFavorites.classList.toggle("active");
    
    // Update button content to use SVGs
    if (currentFilter === "favorites") {
      elements.showFavorites.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg><span>Show All</span>`;
    } else {
      elements.showFavorites.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg><span>Show Favorites</span>`;
    }
    
    currentPage = 0; // Reset to first page
    renderSongs();
  });

  // Sort toggle
  elements.sortToggle.addEventListener("click", () => {
    currentSort = currentSort === "title" ? "artist" : "title";
    
    // Update button content to use SVGs
    if (currentSort === "title") {
      elements.sortToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg><span>Sort by Title</span>`;
    } else {
      elements.sortToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg><span>Sort by Artist</span>`;
    }
    
    currentPage = 0; // Reset to first page
    renderSongs();
  });

  // Theme toggle
  elements.themeToggle.addEventListener("click", toggleTheme);

  // Scroll to top
  elements.scrollToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Show/hide scroll button
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      elements.scrollToTop.classList.remove("hidden");
    } else {
      elements.scrollToTop.classList.add("hidden");
    }
  });
}

// ===================================
// Favorites Management
// ===================================
function toggleFavorite(songId) {
  if (favorites.has(songId)) {
    favorites.delete(songId);
  } else {
    favorites.add(songId);
  }
  saveToStorage();
  updateStats();

  // Update only the specific button
  const btn = document.querySelector(`[data-song-id="${songId}"]`);
  if (btn) {
    btn.classList.toggle("active", favorites.has(songId));
  }
}

// ===================================
// Rendering (Optimized for Large Lists)
// ===================================
function renderSongs() {
  if (isRendering) return; // Prevent concurrent renders
  isRendering = true;

  const searchTerm = elements.searchInput.value.toLowerCase().trim();

  // Show loading indicator for large lists
  const shouldShowLoading = songs.length > 100;
  if (shouldShowLoading) {
    elements.songList.innerHTML = '<div class="loading">Loading songs...</div>';
  }

  // Use requestAnimationFrame for smooth rendering
  requestAnimationFrame(() => {
    // Filter songs
    let filteredSongs = songs.filter((song) => {
      // Search filter - normalize both search term and song data for flexible matching
      // This allows searching "The Chainsmokers" or "TheChainsmokers" to match "TheChainsmokers"
      const normalizedSearchTerm = normalizeForSearch(searchTerm);
      const normalizedTitle = normalizeForSearch(song.title);
      const normalizedArtist = normalizeForSearch(song.artist);
      const normalizedNumber = song.number.replace(/\s+/g, "");

      const matchesSearch =
        !normalizedSearchTerm ||
        normalizedTitle.includes(normalizedSearchTerm) ||
        normalizedArtist.includes(normalizedSearchTerm) ||
        normalizedNumber.includes(normalizedSearchTerm);

      // Favorites filter
      const matchesFavorites =
        currentFilter === "all" || favorites.has(song.number);

      return matchesSearch && matchesFavorites;
    });

    // Sort songs
    filteredSongs.sort((a, b) => {
      if (currentSort === "title") {
        return a.title.localeCompare(b.title);
      } else {
        return a.artist.localeCompare(b.artist);
      }
    });

    // Clear current list
    elements.songList.innerHTML = "";

    // Render songs or empty state
    if (filteredSongs.length === 0) {
      if (songs.length === 0) {
        elements.songList.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            <p>No songs loaded yet</p>
            <p class="empty-subtitle">Songs will load from assets/songs.json</p>
          </div>
        `;
      } else {
        elements.songList.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <p>No songs match your search</p>
            <p class="empty-subtitle">Try a different search term</p>
          </div>
        `;
      }
      updateStats();
      isRendering = false;
      return;
    }

    // Performance optimization: Render in batches for large lists
    if (filteredSongs.length > CONFIG.PERFORMANCE.ITEMS_PER_PAGE) {
      renderSongsVirtual(filteredSongs);
    } else {
      // Small list - render all at once
      renderSongsImmediate(filteredSongs);
    }

    updateStats();
    isRendering = false;
  });
}

// Immediate rendering for small lists
function renderSongsImmediate(filteredSongs) {
  const fragment = document.createDocumentFragment();

  filteredSongs.forEach((song) => {
    const songElement = createSongElement(song);
    fragment.appendChild(songElement);
  });

  elements.songList.appendChild(fragment);
}

// Virtual scrolling for large lists
function renderSongsVirtual(filteredSongs) {
  // Disconnect existing observer if it exists
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }

  const totalSongs = filteredSongs.length;
  const itemsPerPage = CONFIG.PERFORMANCE.ITEMS_PER_PAGE;
  let loadedCount = Math.min(itemsPerPage, totalSongs);

  // Initial render - first batch
  const initialSongs = filteredSongs.slice(0, loadedCount);
  const fragment = document.createDocumentFragment();

  initialSongs.forEach((song) => {
    const songElement = createSongElement(song);
    fragment.appendChild(songElement);
  });

  elements.songList.appendChild(fragment);

  // Set up infinite scroll trigger if there are more songs
  if (totalSongs > loadedCount) {
    const triggerDiv = document.createElement("div");
    triggerDiv.className = "infinite-scroll-trigger";
    triggerDiv.innerHTML = '<div class="loading">Loading more...</div>';
    elements.songList.appendChild(triggerDiv);

    // Setup Intersection Observer
    scrollObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        // Get next batch
        const nextBatch = filteredSongs.slice(loadedCount, loadedCount + itemsPerPage);
        const newFragment = document.createDocumentFragment();
        
        nextBatch.forEach((song) => {
          newFragment.appendChild(createSongElement(song));
        });
        
        // Insert before the trigger element
        elements.songList.insertBefore(newFragment, triggerDiv);
        loadedCount += nextBatch.length;

        // If all songs are loaded, clean up
        if (loadedCount >= totalSongs) {
          triggerDiv.remove();
          scrollObserver.disconnect();
          scrollObserver = null;
        }
      }
    }, {
      rootMargin: "300px" // Trigger loading before the user reaches the absolute bottom
    });

    scrollObserver.observe(triggerDiv);
  }
}

function createSongElement(song) {
  const div = document.createElement("div");
  div.className = "song-item";

  const isFavorite = favorites.has(song.number);

  // Add spaces to title and artist for display
  const displayTitle = addSpacesToText(song.title);
  const displayArtist = addSpacesToText(song.artist);

  div.innerHTML = `
        <div class="song-info">
            <div class="song-title">${escapeHtml(displayTitle)}</div>
            <div class="song-meta">
                <span class="song-id">#${escapeHtml(song.number)}</span>
                <span class="song-artist">${escapeHtml(displayArtist)}</span>
            </div>
        </div>
        <button 
            class="favorite-btn ${isFavorite ? "active" : ""}" 
            data-song-id="${song.number}"
            aria-label="Toggle favorite"
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
        </button>
    `;

  // Add favorite button listener
  const favoriteBtn = div.querySelector(".favorite-btn");
  favoriteBtn.addEventListener("click", () => toggleFavorite(song.number));

  return div;
}

function updateStats() {
  elements.songCount.textContent = `${songs.length} ${
    songs.length === 1 ? "song" : "songs"
  }`;
  elements.favoriteCount.textContent = `${favorites.size} ${
    favorites.size === 1 ? "favorite" : "favorites"
  }`;
}

// ===================================
// Utility Functions
// ===================================
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Add spaces before capital letters in camelCase/PascalCase text
function addSpacesToText(text) {
  if (!text) return text;
  // Add space before capital letters that follow lowercase letters or numbers
  // This handles: "TheChainsmokers" -> "The Chainsmokers"
  //               "GloriaEstefan" -> "Gloria Estefan"
  //               "1StepForward,3StepsBack" -> "1 Step Forward,3 Steps Back"
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

// Remove spaces from text for flexible search matching
function normalizeForSearch(text) {
  if (!text) return "";
  return text.toLowerCase().replace(/\s+/g, "");
}

// ===================================
// Start the app
// ===================================
document.addEventListener("DOMContentLoaded", init);
