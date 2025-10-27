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

// ===================================
// DOM Elements
// ===================================
const elements = {
  searchInput: document.getElementById("searchInput"),
  showFavorites: document.getElementById("showFavorites"),
  sortToggle: document.getElementById("sortToggle"),
  clearAll: document.getElementById("clearAll"),
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
    // Auto-detect system theme
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const theme = prefersDark ? "dark" : "light";
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
  const icon = document.querySelector(".theme-icon");
  icon.textContent = theme === "dark" ? "☀️" : "🌙";
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
    elements.showFavorites.textContent =
      currentFilter === "favorites" ? "📋 Show All" : "⭐ Show Favorites";
    currentPage = 0; // Reset to first page
    renderSongs();
  });

  // Sort toggle
  elements.sortToggle.addEventListener("click", () => {
    currentSort = currentSort === "title" ? "artist" : "title";
    elements.sortToggle.textContent =
      currentSort === "title" ? "🔤 Sort by Title" : "👤 Sort by Artist";
    currentPage = 0; // Reset to first page
    renderSongs();
  });

  // Clear all
  elements.clearAll.addEventListener("click", () => {
    Swal.fire({
      title: "Clear All Songs?",
      text: "This will remove all songs and favorites. This action cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e74c3c",
      cancelButtonColor: "#95a5a6",
      confirmButtonText: "Yes, clear all!",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        songs = [];
        favorites.clear();
        saveToStorage();
        renderSongs();

        Swal.fire({
          icon: "success",
          title: "Cleared!",
          text: "All songs have been removed.",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    });
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
            <p>📚 No songs loaded yet</p>
            <p class="empty-subtitle">Songs will load from assets/songs.json</p>
          </div>
        `;
      } else {
        elements.songList.innerHTML = `
          <div class="empty-state">
            <p>🔍 No songs match your search</p>
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
  const totalSongs = filteredSongs.length;
  const itemsPerPage = CONFIG.PERFORMANCE.ITEMS_PER_PAGE;

  // Initial render - first page
  const initialSongs = filteredSongs.slice(0, itemsPerPage);
  const fragment = document.createDocumentFragment();

  initialSongs.forEach((song) => {
    const songElement = createSongElement(song);
    fragment.appendChild(songElement);
  });

  elements.songList.appendChild(fragment);

  // Add "Load More" button if there are more songs
  if (totalSongs > itemsPerPage) {
    const loadMoreBtn = document.createElement("div");
    loadMoreBtn.className = "load-more-container";
    loadMoreBtn.innerHTML = `
      <button class="btn btn-secondary load-more-btn" data-loaded="${itemsPerPage}" data-total="${totalSongs}">
        📄 Load More (${itemsPerPage} of ${totalSongs} shown)
      </button>
    `;

    elements.songList.appendChild(loadMoreBtn);

    // Add click handler
    const btn = loadMoreBtn.querySelector(".load-more-btn");
    btn.addEventListener("click", () => loadMoreSongs(filteredSongs, btn));
  }
}

// Load more songs when button is clicked
function loadMoreSongs(allSongs, button) {
  const loaded = parseInt(button.dataset.loaded);
  const total = parseInt(button.dataset.total);
  const itemsPerPage = CONFIG.PERFORMANCE.ITEMS_PER_PAGE;

  // Get next batch
  const nextBatch = allSongs.slice(loaded, loaded + itemsPerPage);
  const fragment = document.createDocumentFragment();

  nextBatch.forEach((song) => {
    const songElement = createSongElement(song);
    fragment.appendChild(songElement);
  });

  // Insert before the load more button
  const loadMoreContainer = button.parentElement;
  elements.songList.insertBefore(fragment, loadMoreContainer);

  const newLoaded = loaded + nextBatch.length;
  button.dataset.loaded = newLoaded;

  // Update button text
  if (newLoaded >= total) {
    // All songs loaded
    loadMoreContainer.remove();
  } else {
    button.innerHTML = `📄 Load More (${newLoaded} of ${total} shown)`;
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
            ❤️
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
