import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import type { Gym } from '@/domain/models';
import { makeStyles, radius, space, useTheme } from '@/theme';

// Call (tel:), WhatsApp (wa.me) and the facility's shop/website link. Shown only for the contacts it has.
export function ContactButtons({ facility }: { facility: Pick<Gym, 'phone' | 'whatsapp' | 'storeUrl'> }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const digits = (p: string) => p.replace(/[^\d]/g, '');
  const items: { key: string; icon: IconName; label: string; url: string }[] = [
    ...(facility.phone ? [{ key: 'call', icon: 'phone-outline' as IconName, label: t('facility.call'), url: `tel:${facility.phone}` }] : []),
    ...(facility.whatsapp ? [{ key: 'whatsapp', icon: 'whatsapp' as IconName, label: t('facility.whatsapp'), url: `https://wa.me/${digits(facility.whatsapp)}` }] : []),
    ...(facility.storeUrl ? [{ key: 'store', icon: 'web' as IconName, label: t('facility.website'), url: facility.storeUrl }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <View style={styles.row}>
      {items.map((i) => (
        <ContactButton key={i.key} icon={i.icon} label={i.label} onPress={() => Linking.openURL(i.url)} />
      ))}
    </View>
  );
}

function ContactButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={colors.primary} />
      <AppText variant="label" color={colors.primary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
}));
