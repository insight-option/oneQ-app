import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, LoadingState } from '@/components/StateView';
import { errorMessage } from '@/utils/errorMessage';
import { SummaryCard } from '@/components/SummaryCard';
import { useBooking } from '@/data';
import type { Booking } from '@/domain/models';
import { ltr } from '@/i18n';
import { space, useTheme } from '@/theme';
import { localizeTime, longDate, qar } from '@/utils/format';

import { planName } from './BookingCard';
import { FreezePanel } from './FreezePanel';
import { useAddToCalendar } from './useAddToCalendar';

// S17 summary rows; only rows with a value are shown. Shared with S15.
export function useBookingRows(b: Booking) {
  const { t } = useTranslation();
  return [
    { label: t('booking.gym'), value: b.gymName },
    { label: t('bookingDetails.location'), value: b.gymLocation },
    { label: t('booking.trainer'), value: b.trainerName },
    { label: t('checkout.plan'), value: planName(b, t) },
    { label: t('booking.date'), value: b.date ? longDate(b.date) : null },
    { label: t('booking.time'), value: b.timeLabel ? localizeTime(b.timeLabel) : null },
    { label: t('checkout.guest'), value: b.guest.fullName },
    { label: t('bookingDetails.phone'), value: ltr(b.guest.phone) },
    { label: t('bookingDetails.status'), value: t(`bookings.status.${b.status}`) },
  ];
}

// S17
export function BookingDetailsScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const booking = useBooking(id);

  if (booking.isPending) return <Screen edges={[]}><LoadingState /></Screen>;
  if (booking.isError) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('bookingDetails.errorTitle')}
          body={errorMessage(booking.error)}
          action={{ label: t('common.retry'), onPress: () => booking.refetch() }}
        />
      </Screen>
    );
  }
  if (!booking.data) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="calendar-remove-outline"
          title={t('bookingDetails.notFoundTitle')}
          body={t('bookingDetails.notFoundBody')}
          action={{ label: t('bookingDetails.bookingsButton'), onPress: () => router.navigate('/bookings') }}
        />
      </Screen>
    );
  }
  return <Details booking={booking.data} />;
}

function Details({ booking }: { booking: Booking }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const calendar = useAddToCalendar();
  const rows = useBookingRows(booking);
  return (
    <Screen scroll edges={[]} contentStyle={styles.content}>
      {booking.trainerUnavailable && booking.status === 'confirmed' ? (
        <View style={[styles.notice, { backgroundColor: colors.primaryTint }]}>
          <AppText variant="label">{t('bookings2.trainerUnavailable')}</AppText>
        </View>
      ) : null}
      <SummaryCard title={t('booking.summary')} rows={rows} total={{ label: t('checkout.total'), value: qar(booking.priceQar) }} />
      <FreezePanel booking={booking} />
      <View style={styles.actions}>
        <Button variant="outlined" label={t('success.addToCalendar')} onPress={() => calendar.add(booking)} loading={calendar.busy} />
        <Button label={t('success.backToHome')} onPress={() => router.navigate('/home')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xxl },
  actions: { gap: space.md },
  notice: { padding: space.lg, borderRadius: 16 },
});
