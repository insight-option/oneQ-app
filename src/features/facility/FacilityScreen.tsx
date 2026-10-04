import { Image } from 'expo-image';
import { router, Stack, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { RatingInline } from '@/components/RatingInline';
import { ReviewCard } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { EmptyState, LoadingState } from '@/components/StateView';
import { useToast } from '@/components/Toast';
import { useDepartments, useFacilityServicesPublic, useGym, useGymReviews, useSections, useTrainers } from '@/data';
import { gymLocation } from '@/domain/models';
import { useAuthSheet } from '@/features/auth/AuthSheet';
import { useSession } from '@/features/auth/sessionStore';
import { accentOf, sectionName } from '@/features/home/HomeScreen';
import { makeStyles, radius, screenPadding, space, useTheme } from '@/theme';
import { qar } from '@/utils/format';

import { ContactButtons } from './ContactButtons';

const label = (ar: string, en: string | null | undefined, isRTL: boolean) => (isRTL ? ar : en || ar);

// A facility page built from its section's blocks (BRIEF v2 §5.3): cover, contacts, departments, services by
// category, practitioners, gallery, location and reviews. Each part shows only when its block is on and it has data.
export function FacilityScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { colors, isRTL } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const signedIn = useSession((s) => s.user !== null);
  const facility = useGym(id);
  const sections = useSections();
  const services = useFacilityServicesPublic(id);
  const departments = useDepartments(id);
  const practitioners = useTrainers(id, null);
  const reviews = useGymReviews(id);

  if (facility.isPending || sections.isPending) return <Screen edges={[]}><LoadingState /></Screen>;
  if (!facility.data) return <Screen edges={[]}><EmptyState icon="store-remove-outline" title={t('gym.notFoundTitle')} body={t('gym.notFoundBody')} /></Screen>;
  const f = facility.data;
  const section = sections.data?.find((s) => s.slug === f.sectionId);
  const accent = accentOf(section?.colorKey);
  const serviceList = services.data ?? [];
  const categories = section?.categories ?? [];
  const groups = [...categories.map((c) => ({ id: c.id as string | null, name: label(c.nameAr, c.nameEn, isRTL) })), { id: null, name: t('dashboard.services.uncategorized') }]
    .map((g) => ({ ...g, items: serviceList.filter((s) => (g.id ? s.categoryId === g.id : !categories.some((c) => c.id === s.categoryId))) }))
    .filter((g) => g.items.length > 0);
  const practitionerTitle = section?.practitionerLabelAr ? label(section.practitionerLabelAr, section.practitionerLabelEn, isRTL) : t('facility.team');

  // Booking needs an account (first action → sign-in sheet); appointment booking itself is not live yet.
  const book = () => (signedIn ? toast(t('common.comingSoon')) : useAuthSheet.getState().show());

  return (
    <Screen scroll edges={[]} contentStyle={styles.content} footer={<Button label={t('facility.book')} onPress={book} />}>
      <Stack.Screen options={{ title: f.name }} />
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.bleed}>
        {(f.images.length ? f.images : ['']).map((uri, i) => (
          <Image key={`${uri}-${i}`} source={uri || undefined} style={[styles.cover, { width }]} contentFit="cover" />
        ))}
      </ScrollView>
      <View style={styles.titleBlock}>
        {section ? (
          <View style={[styles.tag, { backgroundColor: accent.accentSoft }]}>
            <AppText variant="bodyS" color={accent.accentInk}>
              {sectionName(section, isRTL)}
            </AppText>
          </View>
        ) : null}
        <AppText variant="displayL">{f.name}</AppText>
        <AppText color={colors.textSecondary}>{gymLocation(f)}</AppText>
        <RatingInline rating={f.rating} reviewCount={f.reviewCount} />
        {f.serviceMode && f.serviceMode !== 'inShop' ? <AppText variant="bodyS" color={accent.accentInk}>{t(`facility.serviceMode.${f.serviceMode}`)}</AppText> : null}
      </View>
      <ContactButtons facility={f} />
      {f.description ? <AppText variant="bodyL">{f.description}</AppText> : null}

      {section?.hasDepartments && (departments.data ?? []).length > 0 ? (
        <View style={styles.section}>
          <AppText variant="headline">{t('facility.departments')}</AppText>
          <View style={styles.wrap}>
            {departments.data!.map((d) => (
              <Chip key={d.id} label={label(d.nameAr, d.nameEn, isRTL)} />
            ))}
          </View>
        </View>
      ) : null}

      {section?.hasServices && groups.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="headline">{t('facility.services')}</AppText>
          {groups.map((g) => (
            <View key={g.id ?? 'none'} style={styles.group}>
              <AppText variant="label" color={accent.accentInk}>
                {g.name}
              </AppText>
              {g.items.map((s) => (
                <View key={s.id} style={styles.serviceRow}>
                  <View style={styles.flex}>
                    <AppText>{label(s.nameAr, s.nameEn, isRTL)}</AppText>
                    <AppText variant="bodyS" color={colors.textSecondary}>
                      {t('dashboard.services.minutes', { count: s.durationMinutes })}
                      {s.homeAvailable ? ` · ${t('map.homeService')}` : ''}
                    </AppText>
                  </View>
                  <AppText variant="price" color={colors.primary} lang="en">
                    {qar(s.priceQar)}
                  </AppText>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {section?.hasPractitioners && (practitioners.data ?? []).length > 0 ? (
        <View style={styles.section}>
          <AppText variant="headline">{practitionerTitle}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.people}>
            {practitioners.data!.map((p) => (
              <View key={p.id} style={styles.person}>
                <Image source={p.image} style={styles.personPhoto} contentFit="cover" />
                <AppText variant="label" numberOfLines={1}>
                  {p.name}
                </AppText>
                <AppText variant="bodyS" color={colors.textSecondary} numberOfLines={1}>
                  {p.title}
                </AppText>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {section?.hasGallery && f.images.length > 1 ? (
        <View style={styles.section}>
          <AppText variant="headline">{t('facility.gallery')}</AppText>
          <View style={styles.gallery}>
            {f.images.map((uri) => (
              <Image key={uri} source={uri} style={styles.galleryImage} contentFit="cover" />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="headline">{t('gym.location')}</AppText>
        <AppText variant="bodyL">{f.address}</AppText>
        {f.lat != null && f.lng != null ? <Button variant="text" label={t('facility.openMap')} onPress={() => router.navigate({ pathname: '/map', params: { focus: f.id } } as unknown as Href)} /> : null}
      </View>

      <View style={styles.section}>
        <AppText variant="headline">{t('gym.tabs.reviews')}</AppText>
        {(reviews.data ?? []).length === 0 ? <AppText color={colors.textSecondary}>{t('gym.noReviews')}</AppText> : null}
        {(reviews.data ?? []).slice(0, 10).map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  content: { gap: space.xl },
  bleed: { marginHorizontal: -screenPadding },
  cover: { height: 220, backgroundColor: colors.surfaceVariant },
  titleBlock: { gap: space.xs },
  tag: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  section: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  group: { gap: space.xs },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceVariant },
  people: { gap: space.md, paddingHorizontal: screenPadding },
  person: { width: 120, gap: 2 },
  personPhoto: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceVariant },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  galleryImage: { width: '32%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceVariant },
}));
