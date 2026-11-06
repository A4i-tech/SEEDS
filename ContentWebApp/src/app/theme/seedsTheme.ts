import { Alert, Anchor, AppShell, Breadcrumbs, Burger, Button, Chip, createTheme, Modal, MultiSelect, NavLink, Paper, Progress, Select, Tabs, Text } from '@mantine/core';
import i18n from '../../shared/i18n';
import { seedsColors } from './seedsPalette';
import classes from './seedsComponents.module.css';
import { seedsTokens } from './seedsTokens';

const searchableDefaults = { searchable: true, nothingFoundMessage: i18n.t('common.nothingFound') };

export const seedsTheme = createTheme({
  colors: seedsColors,
  primaryColor: 'seeds',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  defaultRadius: 'md',
  components: {
    Button: Button.extend({ classNames: { root: classes.button } }),
    AppShell: AppShell.extend({ classNames: { header: classes.topbar, navbar: classes.navbar, main: classes.main } }),
    Burger: Burger.extend({ defaultProps: { color: 'var(--seeds-nav-topbar-text)' } }),
    Select: Select.extend({ defaultProps: searchableDefaults }),
    MultiSelect: MultiSelect.extend({ defaultProps: searchableDefaults }),
    Breadcrumbs: Breadcrumbs.extend({
      styles: {
        root: { flexWrap: 'wrap' },
        breadcrumb: { whiteSpace: 'normal', overflowWrap: 'anywhere' },
      },
    }),
    Text: Text.extend({ defaultProps: { size: 'sm' }, classNames: { root: classes.text } }),
    Anchor: Anchor.extend({ defaultProps: { size: 'sm' }, classNames: { root: classes.anchor } }),
    Modal: Modal.extend({ defaultProps: { closeButtonProps: { 'aria-label': i18n.t('common.close') } } }),
    NavLink: NavLink.extend({ classNames: { root: classes.navLink, label: classes.navLinkLabel } }),
    Paper: Paper.extend({ defaultProps: { withBorder: true }, classNames: { root: classes.paper } }),
    Alert: Alert.extend({ defaultProps: { color: 'red', variant: 'light' } }),
    Tabs: Tabs.extend({ classNames: { list: classes.tabList, tab: classes.tab } }),
    Chip: Chip.extend({ classNames: { label: classes.chipLabel, iconWrapper: classes.chipIcon } }),
    Progress: Progress.extend({ classNames: { root: classes.progressTrack, section: classes.progressFill } }),
  },
  fontFamily: `'${seedsTokens.fontBody}', system-ui, sans-serif`,
  headings: {
    fontFamily: `'${seedsTokens.fontBody}', system-ui, sans-serif`,
    sizes: {
      h1: { fontSize: `${seedsTokens.textH2}px`, lineHeight: '1.3', fontWeight: '700' },
      h3: { fontSize: `${seedsTokens.textH3}px`, lineHeight: '1.3', fontWeight: '700' },
      h4: { fontSize: `${seedsTokens.textH4}px`, lineHeight: '1.3', fontWeight: '700' },
    },
  },
  fontSizes: {
    xs: `${seedsTokens.textCaption}px`,
    sm: `${seedsTokens.textBody}px`,
    md: `${seedsTokens.textH4}px`,
    lg: `${seedsTokens.textH2}px`,
    xl: '48px',
  },
  spacing: {
    xs: `${seedsTokens.space1}px`,
    sm: `${seedsTokens.space2}px`,
    md: `${seedsTokens.space3}px`,
    lg: `${seedsTokens.space4}px`,
    xl: `${seedsTokens.space6}px`,
  },
  radius: {
    xs: `${seedsTokens.radiusSm}px`,
    sm: `${seedsTokens.radiusSm}px`,
    md: `${seedsTokens.radiusMd}px`,
    lg: `${seedsTokens.radiusLg}px`,
    xl: `${seedsTokens.radiusFull}px`,
  },
});
