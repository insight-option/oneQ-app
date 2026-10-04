import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type LocationModule = typeof import('expo-location');

// Loaded on first use: an installed build made before the map has no ExpoLocation module, and "nearest" is then
// unavailable instead of the app crashing when the map screen loads. The native module is checked before the
// package is required, because a require that fails after start-up is reported as fatal even inside try/catch.
let loaded: LocationModule | null | undefined;
export function locationModule(): LocationModule | null {
  if (loaded === undefined) {
    try {
      const present = Platform.OS === 'web' || requireOptionalNativeModule('ExpoLocation') != null;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = present ? (require('expo-location') as LocationModule) : null;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}
