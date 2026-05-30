'use strict';

const CONFIG = {
  API_KEY:        '6b410a4cd499da1e525741b1bde17161',
  BASE_URL:       'https://api.openweathermap.org/data/2.5/weather',
  ICON_BASE:      'https://openweathermap.org/img/wn/',
  UNITS:          'metric',
  MAX_RECENT:     5,
  REFRESH_SECS:   300,
  LS_RECENT_KEY:  'weatherscope_recent',
  LS_THEME_KEY:   'weatherscope_theme',
};

const dom = {
  cityInput:        document.getElementById('cityInput'),
  searchBtn:        document.getElementById('searchBtn'),
  clearBtn:         document.getElementById('clearBtn'),
  errorBanner:      document.getElementById('errorBanner'),
  errorText:        document.getElementById('errorText'),
  loaderWrap:       document.getElementById('loaderWrap'),
  weatherDashboard: document.getElementById('weatherDashboard'),
  recentWrap:       document.getElementById('recentWrap'),
  recentList:       document.getElementById('recentList'),
  clearRecentBtn:   document.getElementById('clearRecentBtn'),
  themeToggle:      document.getElementById('themeToggle'),
  clockTime:        document.getElementById('clockTime'),
  clockDate:        document.getElementById('clockDate'),
  refreshCountdown: document.getElementById('refreshCountdown'),
  cityName:         document.getElementById('cityName'),
  countryBadge:     document.getElementById('countryBadge'),
  weatherDesc:      document.getElementById('weatherDesc'),
  tempMain:         document.getElementById('tempMain'),
  feelsLike:        document.getElementById('feelsLike'),
  lastUpdated:      document.getElementById('lastUpdated'),
  weatherIcon:      document.getElementById('weatherIcon'),
  humidity:         document.getElementById('humidity'),
  humidityBar:      document.getElementById('humidityBar'),
  windSpeed:        document.getElementById('windSpeed'),
  pressure:         document.getElementById('pressure'),
  visibility:       document.getElementById('visibility'),
  tempMin:          document.getElementById('tempMin'),
  tempMax:          document.getElementById('tempMax'),
};

const state = {
  currentCity:   null,
  refreshTimer:  null,
  countdownTimer: null,
  refreshRemain: CONFIG.REFRESH_SECS,
};

async function fetchWeather(city) {
  const url = new URL(CONFIG.BASE_URL);
  url.searchParams.set('q',     city);
  url.searchParams.set('appid', CONFIG.API_KEY);
  url.searchParams.set('units', CONFIG.UNITS);

  let response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new Error('Network error — check your internet connection and try again.');
  }

  const data = await response.json();

  if (!response.ok) {
    switch (response.status) {
      case 401: throw new Error('Invalid API key. Check your OpenWeatherMap key.');
      case 404: throw new Error(`City "${city}" not found. Try a different name or check spelling.`);
      case 429: throw new Error('Too many requests. Please wait a moment and try again.');
      default:  throw new Error(data.message || `API error (${response.status}). Please try later.`);
    }
  }

  return data;
}

function formatTime(unix, tzOffset) {
  const localMs = (unix + tzOffset) * 1000;
  const date    = new Date(localMs);
  const hours   = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

function renderWeather(data) {
  const { name, sys, main, weather, wind, visibility, dt, timezone } = data;

  dom.cityName.textContent     = name;
  dom.countryBadge.textContent = sys.country;
  dom.weatherDesc.textContent  = weather[0].description;
  dom.tempMain.textContent     = round1(main.temp);
  dom.feelsLike.textContent    = round1(main.feels_like);
  dom.lastUpdated.textContent  = `Last updated: ${formatTime(dt, timezone)} local time`;

  const iconCode = weather[0].icon;
  dom.weatherIcon.src = `${CONFIG.ICON_BASE}${iconCode}@2x.png`;
  dom.weatherIcon.alt = weather[0].description;

  dom.humidity.textContent   = `${main.humidity}%`;
  dom.windSpeed.textContent  = `${round1(wind.speed)} m/s`;
  dom.pressure.textContent   = `${main.pressure} hPa`;
  dom.visibility.textContent = visibility >= 1000
    ? `${(visibility / 1000).toFixed(1)} km`
    : `${visibility} m`;
  dom.tempMin.textContent    = `${round1(main.temp_min)}°C`;
  dom.tempMax.textContent    = `${round1(main.temp_max)}°C`;

  requestAnimationFrame(() => {
    dom.humidityBar.style.width = `${main.humidity}%`;
  });

  applyMoodBackground(weather[0].id);
}

function applyMoodBackground(conditionId) {
  document.body.classList.remove(
    'mood-clear', 'mood-clouds', 'mood-rain',
    'mood-thunder', 'mood-snow', 'mood-mist'
  );

  let mood;
  if      (conditionId >= 200 && conditionId < 300) mood = 'mood-thunder';
  else if (conditionId >= 300 && conditionId < 600) mood = 'mood-rain';
  else if (conditionId >= 600 && conditionId < 700) mood = 'mood-snow';
  else if (conditionId >= 700 && conditionId < 800) mood = 'mood-mist';
  else if (conditionId === 800)                     mood = 'mood-clear';
  else if (conditionId > 800)                       mood = 'mood-clouds';

  if (mood) document.body.classList.add(mood);
}

function showLoader() {
  dom.loaderWrap.hidden       = false;
  dom.weatherDashboard.hidden = true;
  dom.errorBanner.hidden      = true;
}

function showDashboard() {
  dom.loaderWrap.hidden       = true;
  dom.weatherDashboard.hidden = false;
}

function showError(message) {
  dom.loaderWrap.hidden       = true;
  dom.weatherDashboard.hidden = true;
  dom.errorBanner.hidden      = false;
  dom.errorText.textContent   = message;
  setTimeout(() => { dom.errorBanner.hidden = true; }, 7000);
}

async function handleSearch(city) {
  const query = (city ?? dom.cityInput.value).trim();

  if (!query) {
    showError('Please enter a city name before searching.');
    dom.cityInput.focus();
    return;
  }
  if (query.length < 2) {
    showError('City name must be at least 2 characters long.');
    return;
  }

  showLoader();

  try {
    const data = await fetchWeather(query);
    renderWeather(data);
    showDashboard();

    state.currentCity = data.name;
    saveRecentCity(data.name);
    renderRecentCities();

    dom.cityInput.value = data.name;
    updateClearBtn();
    startAutoRefresh();

  } catch (err) {
    showError(err.message);
  }
}

function startAutoRefresh() {
  clearInterval(state.refreshTimer);
  clearInterval(state.countdownTimer);
  state.refreshRemain = CONFIG.REFRESH_SECS;

  state.countdownTimer = setInterval(() => {
    state.refreshRemain -= 1;
    dom.refreshCountdown.textContent = formatCountdown(state.refreshRemain);
    if (state.refreshRemain <= 0) clearInterval(state.countdownTimer);
  }, 1000);

  state.refreshTimer = setInterval(async () => {
    if (!state.currentCity) return;
    state.refreshRemain = CONFIG.REFRESH_SECS;
    try {
      const data = await fetchWeather(state.currentCity);
      renderWeather(data);
    } catch {}
  }, CONFIG.REFRESH_SECS * 1000);
}

function formatCountdown(secs) {
  const m = String(Math.floor(Math.max(secs, 0) / 60)).padStart(1, '0');
  const s = String(Math.max(secs, 0) % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function loadRecentCities() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.LS_RECENT_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveRecentCity(cityName) {
  let recent = loadRecentCities();
  recent = recent.filter(c => c.toLowerCase() !== cityName.toLowerCase());
  recent.unshift(cityName);
  recent = recent.slice(0, CONFIG.MAX_RECENT);
  localStorage.setItem(CONFIG.LS_RECENT_KEY, JSON.stringify(recent));
}

function renderRecentCities() {
  const recent = loadRecentCities();

  if (recent.length === 0) {
    dom.recentWrap.hidden = true;
    return;
  }

  dom.recentList.innerHTML = '';
  recent.forEach(city => {
    const li   = document.createElement('li');
    const chip = document.createElement('button');
    chip.className   = 'recent-chip';
    chip.textContent = city;
    chip.setAttribute('aria-label', `Search for ${city}`);
    chip.addEventListener('click', () => {
      dom.cityInput.value = city;
      updateClearBtn();
      handleSearch(city);
    });
    li.appendChild(chip);
    dom.recentList.appendChild(li);
  });

  dom.recentWrap.hidden = false;
}

function clearRecentCities() {
  localStorage.removeItem(CONFIG.LS_RECENT_KEY);
  dom.recentWrap.hidden    = true;
  dom.recentList.innerHTML = '';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(CONFIG.LS_THEME_KEY, next);
}

function initTheme() {
  const saved  = localStorage.getItem(CONFIG.LS_THEME_KEY);
  const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', saved ?? system);
}

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function updateClock() {
  const now = new Date();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  const s   = String(now.getSeconds()).padStart(2, '0');
  dom.clockTime.textContent = `${h}:${m}:${s}`;
  dom.clockDate.textContent = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

function updateClearBtn() {
  dom.clearBtn.hidden = dom.cityInput.value.trim().length === 0;
}

dom.searchBtn.addEventListener('click', () => handleSearch());
dom.cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSearch(); });
dom.cityInput.addEventListener('input', updateClearBtn);
dom.clearBtn.addEventListener('click', () => {
  dom.cityInput.value    = '';
  dom.errorBanner.hidden = true;
  dom.cityInput.focus();
  updateClearBtn();
});
dom.clearRecentBtn.addEventListener('click', clearRecentCities);
dom.themeToggle.addEventListener('click', toggleTheme);

function init() {
  initTheme();
  updateClock();
  setInterval(updateClock, 1000);
  renderRecentCities();
  dom.cityInput.focus();

  const recent = loadRecentCities();
  if (recent.length > 0) {
    dom.cityInput.value = recent[0];
    updateClearBtn();
  }
}

init();