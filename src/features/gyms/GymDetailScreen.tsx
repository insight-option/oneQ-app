import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon, type IconName } from '@/components/Icon';
import { RatingInline } from '@/components/RatingInline';
import { ReviewCard } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SelectableCard } from '@/components/SelectableCard';
import { EmptyState, LoadingState } from '@/components/StateView';
import { errorMessage } from '@/utils/errorMessage';
import { useGym, useGymReviews, usePlans, useTrainers } from '@/data';
import { gymLocation, type AmenityKey, type Gym } from '@/domain/models';
import { ContactButtons } from '@/features/facility/ContactButtons';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { ReviewPrompt } from '@/features/reviews/ReviewPrompt';
import { track } from '@/services/analytics';
import { makeStyles, radius, screenPadding, space, useTheme } from '@/theme';
import { qar } from '@/utils/format';

type Tab = 'overview' | 'reviews' | 'memberships';

const AMENITY_ICONS: Record<AmenityKey, IconName> = {
  weights: 'dumbbell',
  cardio: 'run',
  pool: 'pool',
  sauna: 'hot-tub',
  lockers: 'lock-outline',
  parking: 'parking',
};

// S07
export function GymDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const gym = useGym(id);
  const found = !!gym.data;

  useEffect(() => {
    if (found) track({ name: 'view_gym', gymId: id });
  }, [found, id]);

  if (gym.isPending) return <Screen edges={['top']}><LoadingState /></Screen>;
  if (gym.isError || !gym.data) {
    const notFound = !gym.isError;
    return (
      <Screen edges={['top']}>
        <BackButton />
        <EmptyState
          icon={notFound ? 'store-remove-outline' : 'alert-circle-outline'}
          title={t(notFound ? 'gym.notFoundTitle' : 'gym.errorTitle')}
          body={t(notFound ? 'gym.notFoundBody' : 'gym.errorBody')}
          action={
            notFound
              ? { label: t('common.browseGyms'), onPress: () => router.navigate('/home') }
              : { label: t('common.retry'), onPress: () => gym.refetch() }
          }
        />
      </Screen>
    );
  }
  return <GymDetail gym={gym.data} />;
}

function GymDetail({ gym }: { gym: Gym }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');
  const trainers = useTrainers(gym.id, null);
  // Trainer sessions are priced per session; show the lowest session price (fixes 01 §5.13).
  const fromSession = trainers.data?.length ? Math.min(...trainers.data.map((tr) => tr.pricePerSession)) : null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Hero gym={gym} />
      <View style={styles.body}>
        <View style={styles.titleBlock}>
          <AppText variant="displayL">{gym.name}</AppText>
          <AppText color={colors.textSecondary}>{gymLocation(gym)}</AppText>
          <RatingInline rating={gym.rating} reviewCount={gym.reviewCount} />
        </View>
        {/* Call / WhatsApp / website: shown only when the gym has these contacts. */}
        <ContactButtons facility={gym} />

        <View style={styles.section}>
          <AppText variant="headline">{t('gym.chooseHow')}</AppText>
          <PathCard
            icon="dumbbell"
            title={t('gym.membershipTitle')}
            subtitle={t('gym.membershipSubtitle')}
            price={t('common.fromPerMonth', { price: qar(gym.monthlyPrice) })}
            onPress={() => router.push({ pathname: '/gym/[id]/plans', params: { id: gym.id } })}
          />
          <PathCard
            highlighted
            icon="account"
            title={t('gym.trainerTitle')}
            subtitle={t('gym.trainerSubtitle')}
            price={fromSession != null ? t('common.fromPerSession', { price: qar(fromSession) }) : ''}
            onPress={() => router.push({ pathname: '/gym/[id]/trainers', params: { id: gym.id } })}
          />
        </View>

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={(['overview', 'reviews', 'memberships'] as const).map((v) => ({ value: v, label: t(`gym.tabs.${v}`) }))}
        />
        {tab === 'overview' ? <Overview gym={gym} /> : tab === 'reviews' ? <Reviews gymId={gym.id} gymName={gym.name} /> : <Memberships gymId={gym.id} />}
      </View>
    </ScrollView>
  );
}

function BackButton({ overlay }: { overlay?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={4}
      onPress={() => (router.canGoBack() ? router.back() : router.navigate('/home'))}
      style={[styles.circle, overlay && styles.circleOverlay]}
    >
      <Icon name="arrow-left" directional color={overlay ? colors.onPrimary : colors.textPrimary} />
    </Pressable>
  );
}

function Hero({ gym }: { gym: Gym }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  return (
    <View>
      <FlatList
        horizontal
        pagingEnabled
        data={gym.images}
        keyExtractor={(uri) => uri}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Image source={item} style={{ width, height: 242 + insets.top, backgroundColor: colors.surfaceVariant }} contentFit="cover" />
        )}
      />
      <View style={[styles.heroButtons, { top: insets.top + space.sm }]}>
        <BackButton overlay />
        <FavoriteButton gymId={gym.id} variant="overlay" />
      </View>
      {gym.images.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {gym.images.map((uri, i) => (
            <View key={uri} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type PathCardProps = { icon: IconName; title: string; subtitle: string; price: string; highlighted?: boolean; onPress: () => void };

function PathCard({ icon, title, subtitle, price, highlighted, onPress }: PathCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <SelectableCard role="button" selected={false} onPress={onPress} accessibilityLabel={`${title}. ${subtitle}. ${price}`} style={highlighted ? styles.pathHighlighted : undefined}>
      <View style={[styles.iconTile, highlighted && styles.iconTileFilled]}>
        <Icon name={icon} color={highlighted ? colors.onPrimary : colors.primary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="bodyS" color={colors.textSecondary}>
          {subtitle}
        </AppText>
        {price ? (
          <AppText variant="label" color={colors.primary} style={styles.pathPrice}>
            {price}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-right" directional color={colors.textSecondary} />
    </SelectableCard>
  );
}

function Overview({ gym }: { gym: Gym }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.tabBody}>
      <View style={styles.section}>
        <AppText variant="headline">{t('gym.about')}</AppText>
        <AppText variant="bodyL">{gym.description}</AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="headline">{t('gym.facilities')}</AppText>
        <View style={styles.wrap}>
          {gym.amenities.map((a) => (
            <Chip key={a} label={t(`amenities.${a}`)} icon={AMENITY_ICONS[a]} />
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <AppText variant="headline">{t('gym.openingHours')}</AppText>
        {gym.openingHours.map((h) => (
          <View key={h.day} style={styles.hoursRow}>
            <AppText>{t(`days.${h.day}`)}</AppText>
            <AppText color={colors.textSecondary}>{`${h.open} – ${h.close}`}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <AppText variant="headline">{t('gym.location')}</AppText>
        <AppText variant="bodyL">{gym.address}</AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="headline">{t('gym.morePhotos')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.thumbs}>
          {gym.images.map((uri) => (
            <Image key={uri} source={uri} style={styles.thumb} contentFit="cover" />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function Reviews({ gymId, gymName }: { gymId: string; gymName: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reviews = useGymReviews(gymId);
  const prompt = <ReviewPrompt target={{ type: 'gym', id: gymId }} name={gymName} />;
  if (reviews.isPending) return <LoadingState />;
  if (reviews.isError) {
    return <EmptyState icon="alert-circle-outline" title={t('gym.reviewsErrorTitle')} body={errorMessage(reviews.error)} action={{ label: t('common.retry'), onPress: () => reviews.refetch() }} />;
  }
  return (
    <View style={styles.tabBody}>
      {prompt}
      {reviews.data.length === 0 ? <AppText color={colors.textSecondary}>{t('gym.noReviews')}</AppText> : null}
      {reviews.data.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </View>
  );
}

function Memberships({ gymId }: { gymId: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const plans = usePlans(gymId);
  if (plans.isPending) return <LoadingState />;
  if (plans.isError) {
    return <EmptyState icon="alert-circle-outline" title={t('gym.plansError')} body={errorMessage(plans.error)} action={{ label: t('common.retry'), onPress: () => plans.refetch() }} />;
  }

  const openPlans = (planId?: string) => router.push({ pathname: '/gym/[id]/plans', params: { id: gymId, ...(planId ? { planId } : {}) } });
  return (
    <View style={styles.tabBody}>
      {plans.data.map((p) => (
        <SelectableCard key={p.id} role="button" selected={false} onPress={() => openPlans(p.id)}>
          <View style={styles.flex}>
            <AppText variant="label">{t(`plans.${p.kind}.name`)}</AppText>
            {p.badge ? (
              <AppText variant="bodyS" color={colors.accent}>
                {t(`plans.badges.${p.badge}`)}
              </AppText>
            ) : null}
          </View>
          <AppText variant="price" color={colors.primary}>
            {qar(p.price)}
          </AppText>
        </SelectableCard>
      ))}
      <Button variant="text" label={t('gym.viewAllPlans')} onPress={() => openPlans()} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: space.xxxl },
  body: { paddingHorizontal: screenPadding, paddingTop: space.xl, gap: space.xxl },
  titleBlock: { gap: space.xs },
  section: { gap: space.md },
  tabBody: { gap: space.xl },
  flex: { flex: 1, gap: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bleed: { marginHorizontal: -screenPadding },
  thumbs: { gap: space.md, paddingHorizontal: screenPadding },
  thumb: { width: 148, height: 108, borderRadius: radius.sm, backgroundColor: colors.surfaceVariant },
  heroButtons: { position: 'absolute', start: space.lg, end: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  circleOverlay: { backgroundColor: colors.overlayDark },
  dots: { position: 'absolute', bottom: space.md, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { width: 18, backgroundColor: colors.onPrimary },
  iconTile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryTint },
  iconTileFilled: { backgroundColor: colors.primary },
  pathHighlighted: { borderColor: colors.primary, borderWidth: 1.4 },
  pathPrice: { marginTop: space.xs, fontSize: 14 },
}));
