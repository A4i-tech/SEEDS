import { Breadcrumbs, createTheme, MultiSelect, Select } from '@mantine/core';
import i18n from '../../shared/i18n';
import { seedsTokens } from './seedsTokens';

const searchableDefaults = { searchable: true, nothingFoundMessage: i18n.t('common.nothingFound') };

export const seedsTheme = createTheme({
  components: {
    Select: Select.extend({ defaultProps: searchableDefaults }),
    MultiSelect: MultiSelect.extend({ defaultProps: searchableDefaults }),
    Breadcrumbs: Breadcrumbs.extend({
      styles: {
        root: { flexWrap: 'wrap' },
        breadcrumb: { whiteSpace: 'normal', overflowWrap: 'anywhere' },
      },
    }),
  },
  fontFamily: `'${seedsTokens.fontBody}', system-ui, sans-serif`,
  headings: {
    fontFamily: `'${seedsTokens.fontBody}', system-ui, sans-serif`,
    sizes: {
      h2: { fontSize: `${seedsTokens.textH2}px`, lineHeight: '1.3', fontWeight: '700' },
      h3: { fontSize: `${seedsTokens.textH3}px`, lineHeight: '1.3', fontWeight: '700' },
      h4: { fontSize: `${seedsTokens.textH4}px`, lineHeight: '1.3', fontWeight: '700' },
    },
  },
  fontSizes: {
    xs: `${seedsTokens.textCaption}px`,
    sm: `${seedsTokens.textBody}px`,
    md: `${seedsTokens.textH4}px`,
    lg: `${seedsTokens.textH2}px`,
    xl: '40px',
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
