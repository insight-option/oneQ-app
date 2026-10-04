import { useTranslation } from 'react-i18next';
import { View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { makeStyles, space, useTheme } from '@/theme';

// Shown in place of the map when the installed build has no WebView module (built before the map was added).
export function MapUnavailable({ style }: { style?: ViewStyle }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[style, styles.card]}>
      <Icon name="map-marker-off-outline" size={28} color={colors.primary} />
      <AppText variant="titleM" style={styles.center}>
        {t('map.unavailable')}
      </AppText>
      <AppText color={colors.textSecondary} style={styles.center}>
        {t('map.unavailableBody')}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg, backgroundColor: colors.surfaceVariant },
  center: { textAlign: 'center' },
}));
