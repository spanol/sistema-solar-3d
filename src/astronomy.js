import * as Astronomy from 'astronomy-engine';
import { planets } from './planets.js';

const ASTRO_BODY = {
  mercury: 'Mercury',
  venus:   'Venus',
  earth:   'Earth',
  mars:    'Mars',
  jupiter: 'Jupiter',
  saturn:  'Saturn',
  uranus:  'Uranus',
  neptune: 'Neptune',
};

export function helioLonRad(bodyName, date) {
  return Astronomy.EclipticLongitude(bodyName, date) * Math.PI / 180;
}

export function setPlanetsToDate(date) {
  planets.forEach(p => {
    const body = ASTRO_BODY[p.data.id];
    if (!body) return;
    p.angle = helioLonRad(body, date);
    p.group.position.x = Math.cos(p.angle) * p.currentOrbitRadius;
    p.group.position.z = Math.sin(p.angle) * p.currentOrbitRadius;
  });
}

export function isMarsRetrograde(date) {
  const dt1 = new Date(date.getTime() + 86400000);
  function geoLon(d) {
    const gv = Astronomy.GeoVector('Mars', d, false);
    const ec = Astronomy.Ecliptic(gv);
    return ec.elon;
  }
  const lon0 = geoLon(date);
  const lon1 = geoLon(dt1);
  let delta = lon1 - lon0;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta < 0;
}
