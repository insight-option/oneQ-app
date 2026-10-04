import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { makeStyles, radius, space, useTheme } from '@/theme';

// Guests browse freely; their first action (booking, subscribing) opens this sheet to sign in or create an
// account, then continues where they were ("next").
type AuthSheetState = { next: string | null; open: boolean; show: (next?: string) => void; hide: () => void };

export const useAuthSheet = create<AuthSheetState>()((set) => ({
  next: null,
  open: false,
  show: (next) => set({ open: true, next: next ?? null }),
  hide: () => set({ open: false }),
}));

export function AuthSheet() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { open, next, hide } = useAuthSheet();
  const go = (path: '/auth/sign-in' | '/auth/sign-up') => {
    hide();
    router.push(next ? { pathname: path, params: { next } } : path);
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={hide}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('authSheet.close')} style={styles.backdrop} onPress={hide} />
      <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]}>
        <View style={styles.handle} />
        <AppText variant="titleM">{t('authSheet.title')}</AppText>
        <AppText color={colors.textSecondary}>{t('authSheet.body')}</AppText>
        <Button label={t('profile.signIn')} onPress={() => go('/auth/sign-in')} />
        <Button variant="outlined" label={t('profile.createAccount')} onPress={() => go('/auth/sign-up')} />
        <Button variant="text" label={t('authSheet.notNow')} onPress={hide} style={styles.center} />
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlayDark },
  sheet: { gap: space.md, padding: space.xl, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, backgroundColor: colors.surface },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.outline, marginBottom: space.xs },
  center: { alignSelf: 'center' },
}));
