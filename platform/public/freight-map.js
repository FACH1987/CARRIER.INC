function freightMapUrl(latitude, longitude) {
  const edge = 0.025;
  const bounds = [Math.max(-180, longitude - edge), Math.max(-85, latitude - edge),
    Math.min(180, longitude + edge), Math.min(85, latitude + edge)];
  const url = new URL('https://www.openstreetmap.org/export/embed.html');
  url.search = new URLSearchParams({ bbox: bounds.join(','), layer: 'mapnik', marker: latitude + ',' + longitude });
  return url.href;
}

function freightDistanceKm(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const firstLatitude = radians(a.latitude);
  const secondLatitude = radians(b.latitude);
  const latitude = secondLatitude - firstLatitude;
  const longitude = radians(b.longitude - a.longitude);
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(arc)));
}
