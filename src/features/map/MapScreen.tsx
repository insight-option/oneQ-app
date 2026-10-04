import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { locationModule } from '@/components/map/location';
import { DOHA, distanceKm, type MapPoint } from '@/components/map/mapHtml';
import { OsmMap } from '@/components/map/OsmMap';
import { Screen } from '@/components/Screen';
import { EmptyState, LoadingState } from '@/components/StateView';
import { useToast } from '@/components/Toast';
import { useFacilities, useSections } from '@/data';
import type { Gym, Section } from '@/domain/models';
import { accentOf, FacilityCard, openFacility, sectionName } from '@/features/home/HomeScreen';
import { makeStyles, radius, screenPadding, space, useTheme } from '@/theme';

const RATINGS = [0, 3, 4, 4.5];
const PRICES = [0, 250, 350, 500];
type Mode = 'all' | 'inShop' | 'home';

// Map (OpenStreetMap, no key): choose a section first, then its filters — clinics: specialty, nearest, rating;
// salons: in the salon / at home, service type, nearest, rating; gyms: nearest, price, rating. "Nearest" asks for
// the device location. A home-service salon shows at its area with a "home service" badge.
export function MapScreen() {
  const { t } = useTranslation();
  const { colors, isRTL } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const params = useLocalSearchParams<{ focus?: string }>();
  const sections = useSections();
  const facilities = useFacilities();
  const [chosen, setSlug] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('all');
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [me, setMe] = useState<MapPoint | null>(null);
  const [nearest, setNearest] = useState(false);
  // Null in an installed build without the location module: "nearest" is then disabled.
  const geo = locationModule();
  // Opened from a facility page: start on its section until the customer picks one.
  const slug = chosen ?? (params.focus ? (facilities.data?.find((x) => x.id === params.focus)?.sectionId ?? null) : null);

  const section: Section | undefined = sections.data?.find((s) => s.slug === slug);
  const chooseSection = (s: string) => {
    setSlug(s);
    setCategory(null);
    setMode('all');
    setMaxPrice(0);
  };

  const askLocation = async () => {
    if (nearest) return setNearest(false);
    if (!geo) return;
    try {
      const permission = await geo.requestForegroundPermissionsAsync();
      if (!permission.granted) return toast(t('map.locationDenied'));
      const position = await geo.getCurrentPositionAsync({ accuracy: geo.Accuracy.Balanced });
      setMe({ lat: position.coords.latitude, lng: position.coords.longitude });
      setNearest(true);
    } catch {
      toast(t('map.locationError'));
    }
  };

  const results = useMemo(() => {
    const list = (facilities.data ?? []).filter((f) => f.sectionId === slug && f.lat != null && f.lng != null);
    const filtered = list.filter(
      (f) =>
        f.rating >= minRating &&
        (!category || (f.categoryIds ?? []).includes(category)) &&
        (mode === 'all' || (mode === 'home' ? f.serviceMode === 'home' || f.serviceMode === 'both' : f.serviceMode !== 'home')) &&
        (!maxPrice || f.monthlyPrice <= maxPrice),
    );
    const withDistance = filtered.map((f) => ({ f, km: me ? distanceKm(me, { lat: f.lat!, lng: f.lng! }) : null }));
    return nearest && me ? withDistance.sort((a, b) => (a.km ?? 0) - (b.km ?? 0)) : withDistance;
  }, [facilities.data, slug, minRating, category, mode, maxPrice, me, nearest]);

  const accentColor = accentOf(section?.colorKey).accent;
  const mapData = {
    center: me ?? DOHA,
    zoom: 11,
    markers: results.map(({ f }) => ({ id: f.id, lat: f.lat!, lng: f.lng!, title: f.name, color: accentColor })),
    me,
    meColor: colors.textPrimary,
  };
  const open = (id: string) => {
    const f = facilities.data?.find((x) => x.id === id);
    if (f) openFacility(f);
  };

  if (sections.isPending || facilities.isPending) return <Screen><LoadingState /></Screen>;
  if (sections.isError || facilities.isError) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t('home.errorTitle')} body={t('home.errorBody')} action={{ label: t('common.retry'), onPress: () => Promise.all([sections.refetch(), facilities.refetch()]) }} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppText variant="titleL">{t('map.title')}</AppText>
      <AppText color={colors.textSecondary}>{t('map.chooseSection')}</AppText>
      <Row>
        {(sections.data ?? []).map((s) => (
          <Chip key={s.slug} label={sectionName(s, isRTL)} selected={slug === s.slug} onPress={() => chooseSection(s.slug)} />
        ))}
      </Row>
      {section ? (
        <>
          {section.presetType === 'salon' ? (
            <Row>
              {(['all', 'inShop', 'home'] as const).map((m) => (
                <Chip key={m} label={t(`map.mode.${m}`)} selected={mode === m} onPress={() => setMode(m)} />
              ))}
            </Row>
          ) : null}
          {section.categories.length > 0 && section.presetType !== 'gym' ? (
            <Row>
              <Chip label={section.presetType === 'clinic' ? t('map.anySpecialty') : t('map.anyService')} selected={!category} onPress={() => setCategory(null)} />
              {section.categories.map((c) => (
                <Chip key={c.id} label={isRTL ? c.nameAr : c.nameEn || c.nameAr} selected={category === c.id} onPress={() => setCategory(c.id)} />
              ))}
            </Row>
          ) : null}
          {section.presetType === 'gym' ? (
            <Row>
              {PRICES.map((p) => (
                <Chip key={p} label={p ? t('map.maxPrice', { price: p }) : t('map.anyPrice')} selected={maxPrice === p} onPress={() => setMaxPrice(p)} />
              ))}
            </Row>
          ) : null}
          <Row>
            <View style={geo ? undefined : styles.disabled}>
              <Chip icon="crosshairs-gps" label={t('map.nearest')} selected={nearest} onPress={geo ? askLocation : undefined} />
            </View>
            {RATINGS.map((r) => (
              <Chip key={r} label={r ? t('map.minRating', { rating: r }) : t('map.anyRating')} selected={minRating === r} onPress={() => setMinRating(r)} />
            ))}
          </Row>
          <OsmMap data={mapData} style={styles.map} onMarker={open} />
          {results.length === 0 ? (
            <EmptyState icon="map-marker-off-outline" title={t('map.emptyTitle')} body={t('map.emptyBody')} />
          ) : (
            <View style={styles.list}>
              {results.map(({ f, km }) => (
                <FacilityCard key={f.id} facility={f} section={section} distance={km != null ? t('map.km', { km: km.toFixed(1) }) : undefined} />
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.placeholder}>
          <AppText color={colors.textSecondary}>{t('map.pickFirst')}</AppText>
        </View>
      )}
    </Screen>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
      {children}
    </ScrollView>
  );
}

export type MapFacility = Gym;

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: space.md },
  bleed: { marginHorizontal: -screenPadding },
  chips: { gap: space.sm, paddingHorizontal: screenPadding },
  map: { height: 320, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surfaceVariant },
  list: { gap: space.md },
  placeholder: { padding: space.xl, borderRadius: radius.md, backgroundColor: colors.surfaceVariant, alignItems: 'center' },
  disabled: { opacity: 0.45 },
}));
