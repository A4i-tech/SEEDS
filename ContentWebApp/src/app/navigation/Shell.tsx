import {
  AppShell as MantineAppShell,
  Avatar,
  Burger,
  Divider,
  Group,
  Image,
  Menu,
  NavLink,
  Text,
  UnstyledButton,
} from '@mantine/core';
import classes from '@app/theme/seedsComponents.module.css';
import { useDisclosure } from '@mantine/hooks';
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Home,
  Languages,
  Microscope,
  PlusSquare,
  ScanEye,
  Users,
} from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '@features/account/hooks/useAccount';
import { useAuthStore, useRole } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { canAccess } from './roleAccess';

const destinations = [
  { to: '/home', key: 'nav.home', Icon: Home },
  { to: '/library', key: 'nav.library', Icon: BookOpen },
  { to: '/jobs', key: 'nav.jobs', Icon: Briefcase },
  { to: '/registration', key: 'nav.registration', Icon: Users },
  { to: '/analytics', key: 'nav.analytics', Icon: BarChart3 },
  { to: '/create', key: 'nav.create', Icon: PlusSquare },
  { to: '/make-accessible', key: 'nav.makeAccessible', Icon: ScanEye },
  { to: '/localize', key: 'nav.localize', Icon: Languages },
  { to: '/review', key: 'nav.review', Icon: Microscope },
] as const;

export function Shell() {
  const status = useAuthStore((s) => s.status);
  return status === 'authenticated' && <AuthenticatedShell />;
}

function AuthenticatedShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const logout = useAuthStore((s) => s.logout);
  const role = useRole();
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [collapsed, { toggle: toggleRail }] = useDisclosure(false);
  const mainRef = useRef<HTMLElement>(null);
  const me = useMe();

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
        void navigate({ to: '/' });
      },
    });
  };

  return (
    <>
    <a href="#main-content" className={classes.skipLink}>{t('common.skipToContent')}</a>
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !mobileOpened, desktop: collapsed } }}
      padding="xl"
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
              size="md"
            />
            <Burger
              visibleFrom="sm"
              opened={!collapsed}
              onClick={toggleRail}
              aria-label={t('nav.menu')}
              aria-expanded={!collapsed}
              size="md"
            />
            <Group gap="md" wrap="nowrap" miw={0}>
              <Image src="/seeds-logo.png" alt="SEEDS" h={36} w={36} radius="md" />
              <Text variant="rowTitle" size="md" truncate>
                SEEDS Content Studio
              </Text>
            </Group>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label={t('account.menu')} p="xs">
                <Avatar className={classes.avatar} radius="xl" size={32}>{me.data?.name?.trim().charAt(0).toUpperCase()}</Avatar>
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
              <Menu.Item color="red" onClick={confirmSignOut}>{t('account.signOut')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="xs" aria-label={t('a11y.primary')}>
        {destinations
          .filter(({ to }) => canAccess(role, to))
          .map(({ to, key, Icon }) => {
          const label = t(key);
          return (
            <Fragment key={to}>
            {to === '/create' && <Divider className={classes.navDivider} />}
            <NavLink
              label={label}
              leftSection={<Icon size={20} aria-hidden />}
              active={Boolean(matchRoute({ to, fuzzy: true }))}
              aria-label={label}
              component={Link}
              to={to}
              onClick={closeMobile}
            />
            </Fragment>
          );
        })}
      </MantineAppShell.Navbar>

      <MantineAppShell.Main id="main-content" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
    </>
  );
}
