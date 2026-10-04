import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { useGym, useTrainer } from '@/data';
import type { Booking } from '@/domain/models';
import { planKindFromId } from '@/domain/rules';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { formatDate, localizeTime } from '@/utils/format';

export const planName = (b: Booking, t: TFunction) => {
  const kind = b.planId ? planKindFromId(b.planId) : null;
  return kind ? t(`plans.${kind}.name`) : b.planName;
};

// S16 booking card: title = trainer ?? plan ?? "Membership" (09 §1).
export function BookingCard({ booking }: { booking: Booking }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const trainer = useTrainer(booking.trainerId ?? '');
  const gym = useGym(booking.gymId);
  const image = booking.type === 'session' ? trainer.data?.image : gym.data?.images[0];
  const title = booking.trainerName ?? planName(booking, t) ?? t('bookings.membership');
  const status = t(`bookings.status.${booking.status}`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, booking.gymName, booking.timeLabel, status].filter(Boolean).join(', ')}
      onPress={() => router.push({ pathname: '/bookings/[id]', params: { id: booking.id } })}
      style={styles.card}
    >
      {booking.date ? (
        <View style={styles.badge}>
          <AppText variant="titleM" style={styles.badgeDay}>
            {formatDate(booking.date, 'd')}
          </AppText>
          <AppText variant="overline" color={colors.textSecondary}>
            {formatDate(booking.date, 'MMM')}
          </AppText>
        </View>
      ) : null}
      <View style={styles.body}>
        {/* Two lines: beside the date badge and photo the body is only ~100 pt wide on a 360 pt phone. */}
        <AppText variant="headline" numberOfLines={2}>
          {title}
        </AppText>
        <AppText color={colors.textSecondary} numberOfLines={1}>
          {booking.gymName}
        </AppText>
        {booking.timeLabel ? <AppText variant="bodyS">{localizeTime(booking.timeLabel)}</AppText> : null}
        <View style={styles.status}>
          <AppText variant="bodyS" color={colors.success}>
            {status}
          </AppText>
        </View>
        {booking.trainerUnavailable && booking.status === 'confirmed' ? (
          <AppText variant="bodyS" color={colors.accent} numberOfLines={2}>
            {t('bookings2.trainerUnavailable')}
          </AppText>
        ) : null}
      </View>
      <Image source={image} style={styles.image} contentFit="cover" transition={150} />
      <Icon name="chevron-right" directional color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    minHeight: 115,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  badge: { width: 44, alignItems: 'center' },
  badgeDay: { fontSize: 22 },
  body: { flex: 1, gap: 2 },
  status: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.successTint,
  },
  image: { width: 72, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceVariant },
}));
