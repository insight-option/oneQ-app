import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { qar } from '@/utils/format';

// Wallet (screens only): the balance stays zero and top-up says "Coming soon" — no payment and no financial
// records until the payment provider and legal review are decided.
export function WalletCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  return (
    <View style={styles.card}>
      <AppText variant="overline" color={colors.textTertiary}>
        {t('wallet.title')}
      </AppText>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText color={colors.textSecondary}>{t('wallet.balance')}</AppText>
          <AppText variant="titleL" lang="en">
            {qar(0)}
          </AppText>
        </View>
        <Button label={t('wallet.topUp')} onPress={() => toast(t('common.comingSoon'))} style={styles.button} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  button: { minWidth: 120 },
}));
