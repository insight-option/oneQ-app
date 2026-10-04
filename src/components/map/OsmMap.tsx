import { useMemo } from 'react';
import { TurboModuleRegistry, View, type ViewStyle } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';

import { mapHtml, type MapData } from './mapHtml';
import { MapUnavailable } from './MapUnavailable';

type Props = { data: MapData; style?: ViewStyle; onMarker?: (id: string) => void; onPick?: (lat: number, lng: number) => void };
type WebViewModule = typeof import('react-native-webview');

// Loaded on first use: an installed build made before the map has no WebView module, and the map then shows
// "unavailable" instead of the app crashing when the screen loads. The native module is checked before the
// package is required, because a require that fails after start-up is reported as fatal even inside try/catch.
let loaded: WebViewModule | null | undefined;
function webViewModule(): WebViewModule | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = TurboModuleRegistry.get('RNCWebViewModule') ? (require('react-native-webview') as WebViewModule) : null;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

// Native: Leaflet + OpenStreetMap tiles inside a WebView (no Google Maps, no key).
export function OsmMap({ data, style, onMarker, onPick }: Props) {
  // The page reloads only when the map content changes (same markers, centre and pin = same page).
  const key = JSON.stringify(data);
  const html = useMemo(() => mapHtml(JSON.parse(key) as MapData), [key]);
  const native = webViewModule();
  if (!native) return <MapUnavailable style={style} />;
  const { WebView } = native;
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; id?: string; lat?: number; lng?: number };
      if (m.type === 'marker' && m.id) onMarker?.(m.id);
      if (m.type === 'pick' && typeof m.lat === 'number' && typeof m.lng === 'number') onPick?.(m.lat, m.lng);
    } catch {
      // Ignore messages that are not ours.
    }
  };
  return (
    <View style={style}>
      <WebView originWhitelist={['*']} source={{ html }} onMessage={onMessage} style={{ flex: 1 }} setSupportMultipleWindows={false} />
    </View>
  );
}
