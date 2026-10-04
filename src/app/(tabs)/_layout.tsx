import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// Bottom tabs (v3): Home · Map · Gifts · Orders (the existing bookings) · Account (settings + wallet).
// Favorites stay reachable from the account screen.
const TABS: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'home', label: 'tabs.home', icon: 'home-outline', iconActive: 'home' },
  { name: 'map', label: 'tabs.map', icon: 'map-outline', iconActive: 'map' },
  { name: 'gifts', label: 'tabs.gifts', icon: 'gift-outline', iconActive: 'gift' },
  { name: 'bookings', label: 'tabs.orders', icon: 'calendar-blank-outline', iconActive: 'calendar-blank' },
  { name: 'profile', label: 'tabs.account', icon: 'account-outline', iconActive: 'account' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { arabicFonts, colors, fonts, isRTL } = useTheme();
  const labelFont = isRTL ? arabicFonts.bodySemi : fonts.bodySemi;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Android resizes the window for the keyboard; without this the tab bar rides up above it (Home search).
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        // lineHeight keeps descenders (g, y, Arabic tails) inside the label box instead of clipping them.
        tabBarLabelStyle: { fontFamily: labelFont, fontSize: 12, lineHeight: 18 },
        // 64 pt + safe area (03 §2). Each item already pads 5 pt around its 28 pt icon box, so the bar keeps its
        // own padding small; 6 pt left the label only 13 pt and cut the glyphs.
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 3,
          paddingBottom: insets.bottom + 3,
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
          borderTopWidth: 1,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons name={focused ? tab.iconActive : tab.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}
