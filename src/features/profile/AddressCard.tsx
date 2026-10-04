import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { repository } from '@/data';
import type { Address } from '@/domain/models';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { errorMessage } from '@/utils/errorMessage';

// The customer's full address (area, street, house), stored in their profile record — not in Cognito.
export function AddressCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const address = useQuery({ queryKey: ['bookings', 'address'], queryFn: () => repository.getAddress() });
  const [editing, setEditing] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await repository.saveAddress(editing);
      await queryClient.invalidateQueries({ queryKey: ['bookings', 'address'] });
      toast(t('dashboard.saved'));
      setEditing(null);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const a = address.data;
  const summary = a && (a.region || a.street || a.house) ? [a.region, a.street, a.house ? t('address.houseShort', { house: a.house }) : ''].filter(Boolean).join('، ') : t('address.none');

  return (
    <View style={styles.card}>
      <AppText variant="overline" color={colors.textTertiary}>
        {t('address.title')}
      </AppText>
      {editing ? (
        <>
          <TextField label={t('address.region')} value={editing.region} onChangeText={(v) => setEditing((x) => (x ? { ...x, region: v } : x))} />
          <TextField label={t('address.street')} value={editing.street} onChangeText={(v) => setEditing((x) => (x ? { ...x, street: v } : x))} />
          <TextField label={t('address.house')} value={editing.house} onChangeText={(v) => setEditing((x) => (x ? { ...x, house: v } : x))} />
          <View style={styles.pair}>
            <Button label={t('dashboard.save')} onPress={save} loading={busy} style={styles.flex} />
            <Button variant="outlined" label={t('dashboard.cancel')} onPress={() => setEditing(null)} style={styles.flex} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <AppText style={styles.flex}>{address.isPending ? '…' : summary}</AppText>
          <Button variant="text" label={t('dashboard.edit')} onPress={() => setEditing(a ?? { region: '', street: '', house: '' })} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pair: { flexDirection: 'row', gap: space.md },
}));
