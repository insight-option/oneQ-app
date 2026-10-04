import { useEffect, useMemo, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';

import { mapHtml, type MapData } from './mapHtml';

type Props = { data: MapData; style?: ViewStyle; onMarker?: (id: string) => void; onPick?: (lat: number, lng: number) => void };

// Web: the same Leaflet page in an iframe; marker taps and pin picks arrive as window messages.
export function OsmMap({ data, style, onMarker, onPick }: Props) {
  // The page reloads only when the map content changes (same markers, centre and pin = same page).
  const key = JSON.stringify(data);
  const html = useMemo(() => mapHtml(JSON.parse(key) as MapData), [key]);
  const frame = useRef<HTMLIFrameElement>(null);
  const handlers = useRef({ onMarker, onPick });
  useEffect(() => {
    handlers.current = { onMarker, onPick };
  });

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data) as { type: string; id?: string; lat?: number; lng?: number };
        if (m.type === 'marker' && m.id) handlers.current.onMarker?.(m.id);
        if (m.type === 'pick' && typeof m.lat === 'number' && typeof m.lng === 'number') handlers.current.onPick?.(m.lat, m.lng);
      } catch {
        // Ignore messages that are not ours.
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <View style={style}>
      <iframe ref={frame} title="map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
