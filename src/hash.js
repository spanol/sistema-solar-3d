import { state } from './state.js';

export function parseHash() {
  const h = location.hash.slice(1);
  if (!h) return {};
  return Object.fromEntries(
    h.split('&').filter(Boolean).map(p => {
      const eq = p.indexOf('=');
      return eq === -1 ? [p, ''] : [p.slice(0, eq), decodeURIComponent(p.slice(eq + 1))];
    })
  );
}

export function serializeHash() {
  const parts = [];
  if (state.activePlanet) parts.push(`planet=${state.activePlanet.data.id}`);
  parts.push(`orbits=${state.showOrbits ? 1 : 0}`);
  parts.push(`labels=${state.showLabels ? 1 : 0}`);
  if (!state.showComets)      parts.push('comets=0');
  if (!state.showGalaxies)   parts.push('galaxies=0');
  if (!state.showStars)      parts.push('stars=0');
  if (!state.showKuiperBelt) parts.push('kuiper=0');
  parts.push(`speed=${state.timeSpeed}`);
  if (state.realScale) parts.push('realscale=1');
  if (state.realtimeMode) parts.push('realtime=1');
  const dp = document.getElementById('date-picker');
  if (dp && dp.value) parts.push(`date=${encodeURIComponent(dp.value)}`);
  return '#' + parts.join('&');
}

export function updateHash() {
  history.replaceState(null, '', serializeHash());
}
