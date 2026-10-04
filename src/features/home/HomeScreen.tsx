import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { RatingInline } from '@/components/RatingInline';
import { Screen } from '@/components/Screen';
import { EmptyState, LoadingState } from '@/components/StateView';
import { useInputTextStyle } from '@/components/TextField';
import { useFacilities, useSections } from '@/data';
import { gymLocation, type Gym, type Section } from '@/domain/models';
import { greetingKey, matchesQuery } from '@/domain/rules';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { GymListCard, openGym } from '@/features/gyms/GymListCard';
import { alignStart } from '@/i18n';
import { track } from '@/services/analytics';
import { makeStyles, radius, screenPadding, sectionPalette, space, useTheme, type SectionColorKey } from '@/theme';
import { perMonthLabel } from '@/utils/format';

export const sectionName = (s: Pick<Section, 'nameAr' | 'nameEn'>, isRTL: boolean) => (isRTL ? s.nameAr : s.nameEn || s.nameAr);
export const accentOf = (colorKey: string | undefined) => sectionPalette[(colorKey ?? 'burgundy') as SectionColorKey] ?? sectionPalette.burgundy;

// Gyms open their gym page (memberships and trainers); other facilities open the page built from their blocks.
export function openFacility(f: Gym) {
  if (!f.sectionId || f.sectionId === 'gym') openGym(f);
  else router.push({ pathname: '/facility/[id]', params: { id: f.id } } as unknown as Href);
}

// Home: the visible sections from the data in the admin's order (the first one large in its colour), then the
// facilities. Search covers every section.
export function HomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const sections = useSections();
  const facilities = useFacilities();
  const searching = query.trim().length > 0;

  // One event per search (debounced), with the result count only — never the search text.
  useEffect(() => {
    if (!searching || !facilities.data) return;
    const all = facilities.data;
    const timer = setTimeout(() => track({ name: 'search', resultCount: all.filter((g) => matchesQuery(g, query)).length }), 800);
    return () => clearTimeout(timer);
  }, [query, searching, facilities.data]);

  const renderBody = () => {
    if (sections.isPending || facilities.isPending) return <LoadingState />;
    if (sections.isError || facilities.isError) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('home.errorTitle')}
          body={t('home.errorBody')}
          action={{ label: t('common.retry'), onPress: () => Promise.all([sections.refetch(), facilities.refetch()]) }}
        />
      );
    }
    const all = facilities.data;
    if (searching) {
      const results = all.filter((g) => matchesQuery(g, query));
      if (results.length === 0) return <EmptyState icon="magnify-close" title={t('home.noResultsTitle')} body={t('home.noResultsBody')} />;
      return <FacilityList title={t('home.results')} facilities={results} sections={sections.data} />;
    }
    return (
      <>
        <SectionGrid sections={sections.data} />
        <Featured facilities={all.filter((g) => g.isFeatured)} />
        <FacilityList title={t('home2.allFacilities')} facilities={all} sections={sections.data} />
      </>
    );
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppText variant="titleM" color={colors.primary} style={styles.wordmark} lang="en">
        OneQ
      </AppText>
      <View style={styles.headings}>
        <AppText color={colors.textSecondary}>{t(`greeting.${greetingKey()}`)}</AppText>
        <AppText variant="displayL">{t('home2.headline')}</AppText>
      </View>
      <SearchField value={query} onChange={setQuery} />
      {renderBody()}
    </Screen>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { arabicFonts, colors, fonts, isRTL } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const inputTextStyle = useInputTextStyle();
  const [focused, setFocused] = useState(false);
  const fontFamily = isRTL ? arabicFonts.body : fonts.body;
  return (
    <View style={[styles.search, focused && styles.searchFocused]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('home2.searchPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={t('home2.searchPlaceholder')}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[inputTextStyle, { fontFamily, textAlign: alignStart() }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('home.clearSearch')} hitSlop={10} onPress={() => onChange('')}>
          <Icon name="close-circle" color={colors.textTertiary} />
        </Pressable>
      ) : (
        <Icon name="magnify" color={colors.textSecondary} />
      )}
    </View>
  );
}

function SectionGrid({ sections }: { sections: Section[] }) {
  const { t } = useTranslation();
  const { colors, isRTL } = useTheme();
  const styles = useStyles();
  if (sections.length === 0) return null;
  const [first, ...rest] = sections;
  const open = (s: Section) => router.push({ pathname: '/section/[slug]', params: { slug: s.slug } } as unknown as Href);
  const firstAccent = accentOf(first!.colorKey);
  return (
    <View style={styles.section}>
      <AppText variant="headline">{t('home2.sections')}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={sectionName(first!, isRTL)} onPress={() => open(first!)} style={[styles.wide, { backgroundColor: firstAccent.accent }]}>
        <Icon name={first!.icon as IconName} size={32} color={colors.onPrimary} />
        <AppText variant="titleM" color={colors.onPrimary}>
          {sectionName(first!, isRTL)}
        </AppText>
        {first!.descAr ? <AppText color={colors.onPrimary}>{isRTL ? first!.descAr : first!.descEn || first!.descAr}</AppText> : null}
      </Pressable>
      <View style={styles.grid}>
        {rest.map((s) => {
          const accent = accentOf(s.colorKey);
          return (
            <Pressable key={s.slug} accessibilityRole="button" accessibilityLabel={sectionName(s, isRTL)} onPress={() => open(s)} style={[styles.tile, { backgroundColor: accent.accentSoft }]}>
              <Icon name={s.icon as IconName} size={26} color={accent.accent} />
              <AppText variant="label" color={accent.accentInk}>
                {sectionName(s, isRTL)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const FEATURED_WIDTH = 228;

function Featured({ facilities }: { facilities: Gym[] }) {
  const { t } = useTranslation();
  const styles = useStyles();
  if (facilities.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText variant="headline">{t('home.featured')}</AppText>
      <FlatList
        horizontal
        data={facilities}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => <FeaturedCard facility={item} />}
        showsHorizontalScrollIndicator={false}
        snapToInterval={FEATURED_WIDTH + space.lg}
        decelerationRate="fast"
        style={styles.bleed}
        contentContainerStyle={styles.carousel}
      />
    </View>
  );
}

function FeaturedCard({ facility }: { facility: Gym }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.featured}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${facility.name}, ${gymLocation(facility)}`} onPress={() => openFacility(facility)}>
        <Image source={facility.images[0]} style={styles.featuredImage} contentFit="cover" transition={150} />
        <AppText variant="headline" style={styles.featuredName} numberOfLines={1}>
          {facility.name}
        </AppText>
        <AppText color={colors.textSecondary} numberOfLines={1}>
          {gymLocation(facility)}
        </AppText>
        <View style={styles.featuredFooter}>
          {facility.monthlyPrice > 0 ? (
            <AppText variant="price" color={colors.primary}>
              {perMonthLabel(facility.monthlyPrice)}
            </AppText>
          ) : (
            <View />
          )}
          <RatingInline rating={facility.rating} />
        </View>
      </Pressable>
      <View style={styles.featuredFav}>
        <FavoriteButton gymId={facility.id} variant="overlay" />
      </View>
    </View>
  );
}

export function FacilityList({ title, facilities, sections }: { title: string; facilities: Gym[]; sections: Section[] }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <AppText variant="headline">{title}</AppText>
      {facilities.map((f) =>
        !f.sectionId || f.sectionId === 'gym' ? <GymListCard key={f.id} gym={f} /> : <FacilityCard key={f.id} facility={f} section={sections.find((s) => s.slug === f.sectionId)} />,
      )}
    </View>
  );
}

export function FacilityCard({ facility, section, distance }: { facility: Gym; section?: Section; distance?: string }) {
  const { t } = useTranslation();
  const { colors, isRTL } = useTheme();
  const styles = useStyles();
  const accent = accentOf(section?.colorKey);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${facility.name}, ${gymLocation(facility)}`} onPress={() => openFacility(facility)} style={styles.card}>
      <View style={styles.cardBody}>
        <AppText variant="headline" numberOfLines={1}>
          {facility.name}
        </AppText>
        <AppText color={colors.textSecondary} numberOfLines={1}>
          {[gymLocation(facility), distance].filter(Boolean).join(' · ')}
        </AppText>
        <RatingInline rating={facility.rating} reviewCount={facility.reviewCount} />
        <View style={styles.tags}>
          {section ? (
            <View style={[styles.tag, { backgroundColor: accent.accentSoft }]}>
              <AppText variant="bodyS" color={accent.accentInk}>
                {sectionName(section, isRTL)}
              </AppText>
            </View>
          ) : null}
          {facility.serviceMode === 'home' || facility.serviceMode === 'both' ? (
            <View style={[styles.tag, { backgroundColor: colors.surfaceVariant }]}>
              <AppText variant="bodyS" color={colors.textSecondary}>
                {t('map.homeService')}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      <Image source={facility.images[0]} style={styles.cardImage} contentFit="cover" transition={150} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: space.xl },
  wordmark: { fontSize: 22 },
  headings: { gap: space.xs },
  search: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  searchFocused: { borderColor: colors.primary, borderWidth: 1.2 },
  section: { gap: space.md },
  wide: { gap: space.xs, padding: space.xl, borderRadius: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 96, gap: space.sm, padding: space.lg, borderRadius: 20, justifyContent: 'flex-end' },
  bleed: { marginHorizontal: -screenPadding },
  carousel: { gap: space.lg, paddingHorizontal: screenPadding },
  featured: { width: FEATURED_WIDTH },
  featuredImage: { width: FEATURED_WIDTH, height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceVariant },
  featuredFav: { position: 'absolute', top: space.md, start: space.md },
  featuredName: { marginTop: space.md, fontSize: 20 },
  featuredFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  card: {
    minHeight: 114,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  cardBody: { flex: 1, gap: space.xs },
  cardImage: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceVariant },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tag: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
}));

export const sectionsHref = (slug: string) => ({ pathname: '/section/[slug]', params: { slug } }) as unknown as Href;
export const useSectionBySlug = (slug: string) => {
  const sections = useSections();
  return useMemo(() => sections.data?.find((s) => s.slug === slug) ?? null, [sections.data, slug]);
};
