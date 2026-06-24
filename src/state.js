export const isMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 768;

export const state = {
  viewMode: 'top',
  activePlanet: null,
  hoveredPlanet: null,
  showOrbits: true,
  showLabels: true,
  showComets: true,
  showGalaxies: true,
  showStars: true,
  showKuiperBelt: true,
  timeSpeed: 1,
  realtimeMode: false,
  positionFrozen: true,
  _realtimeInterval: null,
  realScale: false,
  realScaleLerpT: 0,
  qualityPixelRatio: null,
  bloomEnabled: null,
  starDensity: null,
};

state.qualityPixelRatio = isMobile ? 0.75 : 1.0;
state.bloomEnabled = !isMobile;
state.starDensity = isMobile ? 'low' : 'high';
