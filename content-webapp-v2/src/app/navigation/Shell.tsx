import {
  AppShell as MantineAppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  Text,
  UnstyledButton,
} from '@mantine/core';
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
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@app/store/useUiStore';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { routePaths } from './routePaths';
import classes from './Shell.module.css';

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
  const collapsed = useUiStore((s) => s.railCollapsed);
  const toggleRail = useUiStore((s) => s.toggleRail);
  const logout = useAuthStore((s) => s.logout);
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
        void navigate(routePaths.login);
      },
    });
  };

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: collapsed ? 72 : 240, breakpoint: 'sm', collapsed: { mobile: false } }}
      padding="md"
    >
      <MantineAppShell.Header className={classes.header}>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={!collapsed}
              onClick={toggleRail}
              aria-label={t('nav.home')}
              size="sm"
              color="var(--seeds-nav-topbar-text)"
            />
            <div className={classes.brand}>
              <img src="/seeds-logo.png" alt="SEEDS" width={36} height={36} className={classes.brandmark} />
              <Text fw={700} size="md" className={classes.brandName}>
                SEEDS Content Studio
              </Text>
            </div>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label={t('account.menu')}>
                <User size={20} aria-hidden />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => void navigate('/account/profile')}>
                {t('account.profile')}
              </Menu.Item>
              <Menu.Item onClick={() => void navigate('/account/settings')}>
                {t('account.settings')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item onClick={confirmSignOut}>{t('account.signOut')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="xs" aria-label="Primary">
        {destinations.map(({ to, key, Icon }) => {
          const label = t(key);
          const active =
            location.pathname === to || (to !== routePaths.home && location.pathname.startsWith(to));
          return (
            <NavLink
              key={to}
              label={collapsed ? undefined : label}
              leftSection={<Icon size={20} aria-hidden />}
              active={active}
              aria-label={label}
              title={collapsed ? label : undefined}
              onClick={() => void navigate(to)}
              className={active ? classes.active : undefined}
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
