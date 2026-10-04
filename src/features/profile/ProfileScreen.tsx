import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { signOut } from '@/features/auth/session';
import { useSession } from '@/features/auth/sessionStore';
import { currentLanguage, type Language } from '@/i18n';

import { AddressCard } from './AddressCard';
import { makeStyles, radius, space, useTheme } from '@/theme';

// S19
export function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const user = useSession((s) => s.user);

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppText variant="titleL">{t('profile.title')}</AppText>
      <View style={styles.card}>
        {user ? (
          <>
            <AppText variant="titleM" color={colors.primary} style={styles.wordmark} lang="en">
              OneQ
            </AppText>
            <AppText variant="headline">{user.fullName || t('profile.member')}</AppText>
            <AppText color={colors.textSecondary}>{t('profile.signedIn')}</AppText>
            <Button variant="outlined" label={t('profile.signOut')} onPress={signOut} style={styles.signOut} />
          </>
        ) : (
          <>
            <AppText variant="titleM" style={styles.wordmark}>
              {t('profile.welcome')}
            </AppText>
            <AppText color={colors.textSecondary}>{t('profile.welcomeBody')}</AppText>
            <View style={styles.actions}>
              <Button label={t('profile.signIn')} onPress={() => router.push('/auth/sign-in')} />
              <Button variant="outlined" label={t('profile.createAccount')} onPress={() => router.push('/auth/sign-up')} />
            </View>
          </>
        )}
      </View>

      {user?.isAdmin || user?.isOwner ? (
        <Group label={t('profile.management')}>
          <Row label={t('dashboard.profileLink')} href={'/dashboard' as Href} />
          {user.isAdmin ? <Row label={t('admin.title')} href="/admin" /> : null}
        </Group>
      ) : null}
      {user ? <AddressCard /> : null}
      <Group label={t('account.yourPlaces')}>
        <Row label={t('tabs.favorites')} href={'/favorites' as Href} />
      </Group>
      <Group label={t('profile.support')}>
        <Row label={t('profile.help')} href="/info/help" />
      </Group>
      <Group label={t('profile.settings')}>
        <Row label={t('profile.language')} value={t(`languageNames.${currentLanguage()}`)} valueLang={currentLanguage()} href="/info/language" />
      </Group>
      <Group label={t('profile.legal')}>
        <Row label={t('profile.terms')} href="/info/terms" />
        <Row label={t('profile.privacy')} href="/info/privacy" />
      </Group>
    </Screen>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <AppText variant="overline" color={colors.textTertiary}>
        {label}
      </AppText>
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

function Row({ label, value, valueLang, href }: { label: string; value?: string; valueLang?: Language; href: Href }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} onPress={() => router.push(href)} style={styles.row}>
      <AppText variant="bodyL" style={styles.flex}>
        {label}
      </AppText>
      {value ? (
        <AppText color={colors.textSecondary} lang={valueLang}>
          {value}
        </AppText>
      ) : null}
      <Icon name="chevron-right" directional color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: space.xxl },
  card: { gap: space.sm, padding: space.xl, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  wordmark: { fontSize: 22 },
  actions: { gap: space.md, marginTop: space.md },
  signOut: { minHeight: 44, marginTop: space.md },
  group: { gap: space.sm },
  rows: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, overflow: 'hidden' },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  flex: { flex: 1 },
}));
