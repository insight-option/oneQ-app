// OpenStreetMap through Leaflet (free, no API key), rendered in a WebView (native) or an iframe (web).
// Messages back to the app: { type: 'marker', id } when a marker is tapped, { type: 'pick', lat, lng } in pick mode.

export type MapMarker = { id: string; lat: number; lng: number; title: string; color: string };
export type MapPoint = { lat: number; lng: number };

export type MapData = {
  center: MapPoint;
  zoom: number;
  markers: MapMarker[];
  me?: MapPoint | null;
  meColor?: string;
  pick?: MapPoint | null; // pick mode: a draggable pin the owner places once
  pickColor?: string;
};

// Doha
export const DOHA: MapPoint = { lat: 25.2854, lng: 51.531 };

export function mapHtml(data: MapData) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;padding:0}.leaflet-control-attribution{font-size:10px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var data = ${json};
var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([data.center.lat, data.center.lng], data.zoom);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
function post(m) { var s = JSON.stringify(m); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if (window.parent) window.parent.postMessage(s, '*'); }
data.markers.forEach(function (m) {
  L.circleMarker([m.lat, m.lng], { radius: 10, color: m.color, fillColor: m.color, fillOpacity: 0.85, weight: 2 })
    .addTo(map).bindTooltip(m.title).on('click', function () { post({ type: 'marker', id: m.id }); });
});
if (data.me) L.circleMarker([data.me.lat, data.me.lng], { radius: 7, color: data.meColor, fillColor: data.meColor, fillOpacity: 1, weight: 3 }).addTo(map);
if (data.markers.length > 1 && !data.pick) {
  try { map.fitBounds(data.markers.map(function (m) { return [m.lat, m.lng]; }), { padding: [30, 30], maxZoom: 14 }); } catch (e) {}
}
if (data.pick) {
  var pin = L.circleMarker([data.pick.lat, data.pick.lng], { radius: 11, color: data.pickColor, fillColor: data.pickColor, fillOpacity: 0.9, weight: 3 }).addTo(map);
  map.on('click', function (e) { pin.setLatLng(e.latlng); post({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng }); });
}
</script></body></html>`;
}

// Great-circle distance in kilometres.
export function distanceKm(a: MapPoint, b: MapPoint) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
