import { addMonths, format } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useFacilities, useFacilityServicesPublic } from '@/data';
import { isValidQatarMobile } from '@/domain/validation';
import { makeStyles, radius, screenPadding, space, useTheme } from '@/theme';
import { formatDate, qar } from '@/utils/format';

// Gifts (screens and states only): no payment, no SMS and no financial records yet — every confirm button says
// "Coming soon" until the payment provider and the legal review are decided.
const AMOUNTS = [20, 50, 100, 250, 500, 750, 1000];

export function GiftsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(0);
  const [sheet, setSheet] = useState<'choose' | 'cash' | 'salon' | null>(null);
  const months = [0, -1, -2, -3, -4, -5].map((m) => addMonths(new Date(), m));

  return (
    <View style={styles.root}>
      <Screen scroll contentStyle={styles.content}>
        <AppText variant="titleL">{t('gifts.title')}</AppText>
        <AppText color={colors.textSecondary}>{t('gifts.subtitle')}</AppText>
        <AppText variant="headline">{t('gifts.history')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
          {months.map((d, i) => (
            <Chip key={format(d, 'yyyy-MM')} label={formatDate(d, 'MMMM y')} selected={month === i} onPress={() => setMonth(i)} />
          ))}
        </ScrollView>
        {/* No gift records exist yet (no financial data in the backend), so every month is empty. */}
        <EmptyState icon="gift-outline" title={t('gifts.emptyTitle')} body={t('gifts.emptyBody')} />
      </Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('gifts.give')}
        onPress={() => setSheet('choose')}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Icon name="gift" size={22} color={colors.onPrimary} />
        <AppText variant="label" color={colors.onPrimary}>
          {t('gifts.give')}
        </AppText>
      </Pressable>
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('authSheet.close')} style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]}>
          {sheet === 'choose' ? <ChooseGift onPick={setSheet} /> : null}
          {sheet === 'cash' ? <CashGift onDone={() => setSheet(null)} /> : null}
          {sheet === 'salon' ? <SalonGift onDone={() => setSheet(null)} /> : null}
        </View>
      </Modal>
    </View>
  );
}

function ChooseGift({ onPick }: { onPick: (kind: 'cash' | 'salon') => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <>
      <AppText variant="titleM">{t('gifts.chooseTitle')}</AppText>
      {(['cash', 'salon'] as const).map((kind) => (
        <Pressable key={kind} accessibilityRole="button" onPress={() => onPick(kind)} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Icon name={kind === 'cash' ? 'cash-multiple' : 'face-woman-shimmer'} size={26} color={colors.primary} />
          <View style={styles.flex}>
            <AppText variant="label">{t(`gifts.${kind}.title`)}</AppText>
            <AppText variant="bodyS" color={colors.textSecondary}>
              {t(`gifts.${kind}.hint`)}
            </AppText>
          </View>
          <Icon name="chevron-right" directional color={colors.textSecondary} />
        </Pressable>
      ))}
    </>
  );
}

function CashGift({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const ok = amount !== null && isValidQatarMobile(phone);
  return (
    <>
      <AppText variant="titleM">{t('gifts.cash.title')}</AppText>
      <View style={styles.amounts}>
        {AMOUNTS.map((a) => (
          <Chip key={a} label={qar(a)} selected={amount === a} onPress={() => setAmount(a)} />
        ))}
      </View>
      <TextField label={t('gifts.recipientPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" prefix="+974" />
      <TextField label={t('gifts.message')} value={message} onChangeText={setMessage} multiline />
      <Button label={t('gifts.confirm')} disabled={!ok} onPress={() => toast(t('common.comingSoon'))} />
      <Button variant="text" label={t('dashboard.cancel')} onPress={onDone} style={styles.center} />
    </>
  );
}

function SalonGift({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { colors, isRTL } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const salons = useFacilities('salon');
  const [salonId, setSalonId] = useState<string | null>(null);
  const services = useFacilityServicesPublic(salonId ?? '');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('18:00');
  const [phone, setPhone] = useState('');
  const ok = !!salonId && !!serviceId && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && isValidQatarMobile(phone);
  return (
    <ScrollView contentContainerStyle={styles.sheetScroll}>
      <AppText variant="titleM">{t('gifts.salon.title')}</AppText>
      <AppText variant="label">{t('gifts.salon.choose')}</AppText>
      {(salons.data ?? []).length === 0 ? <AppText color={colors.textSecondary}>{t('gifts.salon.none')}</AppText> : null}
      <View style={styles.amounts}>
        {(salons.data ?? []).map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            selected={salonId === s.id}
            onPress={() => {
              setSalonId(s.id);
              setServiceId(null);
            }}
          />
        ))}
      </View>
      {salonId ? (
        <>
          <AppText variant="label">{t('gifts.salon.service')}</AppText>
          <View style={styles.amounts}>
            {(services.data ?? []).map((s) => (
              <Chip key={s.id} label={`${isRTL ? s.nameAr : s.nameEn || s.nameAr} · ${qar(s.priceQar)}`} selected={serviceId === s.id} onPress={() => setServiceId(s.id)} />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.pair}>
        <View style={styles.flex}>
          <TextField label={t('gifts.salon.date')} value={date} onChangeText={setDate} autoCapitalize="none" />
        </View>
        <View style={styles.flex}>
          <TextField label={t('gifts.salon.time')} value={time} onChangeText={setTime} />
        </View>
      </View>
      <TextField label={t('gifts.recipientPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" prefix="+974" />
      <Button label={t('gifts.confirm')} disabled={!ok} onPress={() => toast(t('common.comingSoon'))} />
      <Button variant="text" label={t('dashboard.cancel')} onPress={onDone} style={styles.center} />
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { gap: space.lg, paddingBottom: 96 },
  bleed: { marginHorizontal: -screenPadding },
  chips: { gap: space.sm, paddingHorizontal: screenPadding },
  fab: {
    position: 'absolute',
    end: space.xl,
    bottom: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.8 },
  backdrop: { flex: 1, backgroundColor: colors.overlayDark },
  sheet: { maxHeight: '85%', gap: space.md, padding: space.xl, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, backgroundColor: colors.surface },
  sheetScroll: { gap: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline },
  amounts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pair: { flexDirection: 'row', gap: space.md },
  center: { alignSelf: 'center' },
}));
