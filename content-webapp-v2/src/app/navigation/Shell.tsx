import {
  AppShell as MantineAppShell,
  Burger,
  Group,
  Image,
  Menu,
  NavLink,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Home,
  Languages,
  Microscope,
  PlusSquare,
  ScanEye,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAnalyticsRole } from '@features/analytics/hooks/useAnalytics';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { routePaths } from './routePaths';

const destinations = [
  { to: routePaths.home, key: 'nav.home', Icon: Home },
  { to: routePaths.library, key: 'nav.library', Icon: BookOpen },
  { to: routePaths.jobs, key: 'nav.jobs', Icon: Briefcase },
  { to: routePaths.registration, key: 'nav.registration', Icon: Users },
  { to: routePaths.analytics, key: 'nav.analytics', Icon: BarChart3 },
  { to: routePaths.create, key: 'nav.create', Icon: PlusSquare },
  { to: routePaths.makeAccessible, key: 'nav.makeAccessible', Icon: ScanEye },
  { to: routePaths.localize, key: 'nav.localize', Icon: Languages },
  { to: routePaths.review, key: 'nav.review', Icon: Microscope },
] as const;

export function Shell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const logout = useAuthStore((s) => s.logout);
  const analyticsRole = useAnalyticsRole();
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [collapsed, { toggle: toggleRail }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 47.99em)');
  const railCollapsed = collapsed && !isMobile;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.focus();
  }, [location.pathname]);

  const confirmSignOut = () => {
    openConfirmDialog({
      title: t('account.signOutTitle'),
      body: t('account.signOutBody'),
      confirmLabel: t('account.signOutConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        logout();
        void navigate({ to: routePaths.login });
      },
    });
  };

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: railCollapsed ? 72 : 240, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap" miw={0}>
            <Burger
              hiddenFrom="sm"
              opened={mobileOpened}
              onClick={toggleMobile}
              aria-label={t('nav.menu')}
              aria-expanded={mobileOpened}
              size="sm"
            />
            <Burger
              visibleFrom="sm"
              opened={!collapsed}
              onClick={toggleRail}
              aria-label={t('nav.menu')}
              aria-expanded={!collapsed}
              size="sm"
            />
            <Group gap="md" wrap="nowrap" miw={0}>
              <Image src="/seeds-logo.png" alt="SEEDS" h={36} w={36} radius="md" />
              <Text fw={700} size="md" truncate>
                SEEDS Content Studio
              </Text>
            </Group>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label={t('account.menu')}>
                <User size={20} aria-hidden />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => void navigate({ to: '/account/profile' })}>
                {t('account.profile')}
              </Menu.Item>
              <Menu.Item onClick={() => void navigate({ to: '/account/settings' })}>
                {t('account.settings')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item onClick={confirmSignOut}>{t('account.signOut')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="xs" aria-label="Primary">
        {destinations
          .filter(({ to }) => to !== routePaths.analytics || analyticsRole !== undefined)
          .map(({ to, key, Icon }) => {
          const label = t(key);
          return (
            <NavLink
              key={to}
              label={!railCollapsed && label}
              leftSection={<Icon size={20} aria-hidden />}
              active={Boolean(matchRoute({ to, fuzzy: true }))}
              variant="light"
              aria-label={label}
              title={railCollapsed ? label : undefined}
              component={Link}
              to={to}
              onClick={closeMobile}
            />
          );
        })}
      </MantineAppShell.Navbar>

      <MantineAppShell.Main ref={mainRef} tabIndex={-1}>
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
