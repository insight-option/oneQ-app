import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { repository } from '@/data';
import { RepositoryError } from '@/data/repository';
import type { Booking } from '@/domain/models';
import { useSession } from '@/features/auth/sessionStore';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { errorMessage } from '@/utils/errorMessage';
import { shortDate } from '@/utils/format';

const LIMIT = { count: 2, days: 30 };

// Membership freeze from the app, when the gym allows it: up to 2 freezes of up to 30 days each; the end date
// moves by the frozen days. After both are used, a request tells the gym to contact the customer.
export function FreezePanel({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const signedIn = useSession((s) => s.user !== null);
  const active = signedIn && booking.type === 'membership' && booking.status === 'confirmed' && !!booking.membershipEnd && booking.membershipEnd >= format(new Date(), 'yyyy-MM-dd');
  const plans = useQuery({ queryKey: ['plans', booking.gymId], queryFn: () => repository.getPlans(booking.gymId), enabled: active });
  const freezes = useQuery({ queryKey: ['freezes', booking.id], queryFn: () => repository.listFreezes(booking.id), enabled: active });
  const [days, setDays] = useState('7');
  const [start, setStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState(false);

  const plan = plans.data?.find((p) => p.id === booking.planId);
  if (!active || !plan?.allowFreeze || !freezes.data) return null;
  const used = freezes.data.length;
  const daysValue = /^\d{1,2}$/.test(days) && Number(days) >= 1 && Number(days) <= LIMIT.days ? Number(days) : null;
  const startOk = /^\d{4}-\d{2}-\d{2}$/.test(start);

  const freeze = async () => {
    setBusy(true);
    try {
      const result = await repository.freezeMembership(booking.id, start, daysValue ?? 1);
      toast(t('freeze.done', { date: shortDate(result.membershipEnd) }));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['freezes', booking.id] }), queryClient.invalidateQueries({ queryKey: ['booking'] }), queryClient.invalidateQueries({ queryKey: ['bookings'] })]);
    } catch (e) {
      if (e instanceof RepositoryError && e.code === 'FREEZE_LIMIT') setContact(true);
      else toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel}>
      <AppText variant="headline">{t('freeze.title')}</AppText>
      <AppText color={colors.textSecondary}>{t('freeze.used', { used, count: LIMIT.count, days: LIMIT.days })}</AppText>
      {freezes.data.map((f) => (
        <AppText key={f.id} variant="bodyS" color={colors.textSecondary}>{`• ${shortDate(f.startDate)} → ${shortDate(f.endDate)} (${t('freeze.days', { count: f.days })})`}</AppText>
      ))}
      {contact ? (
        <View style={styles.notice}>
          <AppText variant="label">{t('freeze.contact')}</AppText>
        </View>
      ) : used >= LIMIT.count ? (
        <>
          <AppText color={colors.textSecondary}>{t('freeze.exhausted')}</AppText>
          <Button variant="outlined" label={t('freeze.requestMore')} onPress={freeze} loading={busy} />
        </>
      ) : (
        <>
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField label={t('freeze.start')} value={start} onChangeText={setStart} autoCapitalize="none" error={!startOk ? t('dashboard.availability.dateFormat') : undefined} />
            </View>
            <View style={styles.flex}>
              <TextField label={t('freeze.daysLabel', { max: LIMIT.days })} value={days} onChangeText={setDays} keyboardType="number-pad" error={daysValue === null ? t('freeze.daysError', { max: LIMIT.days }) : undefined} />
            </View>
          </View>
          <Button label={t('freeze.submit')} onPress={freeze} loading={busy} disabled={daysValue === null || !startOk} />
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  panel: { gap: space.sm, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  pair: { flexDirection: 'row', gap: space.md },
  notice: { padding: space.md, borderRadius: radius.sm, backgroundColor: colors.primaryTint },
}));
