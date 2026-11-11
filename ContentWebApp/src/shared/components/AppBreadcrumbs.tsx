import { Anchor, Breadcrumbs, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

interface Crumb {
  label: string;
  to?: string;
}

export function AppBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('a11y.breadcrumb')}>
      <Breadcrumbs>
        {crumbs.map(({ label, to }) =>
          to ? (
            <Anchor key={label} component={Link} to={to} variant="rowAction">
              {label}
            </Anchor>
          ) : (
            <Text key={label} aria-current="page">
              {label}
            </Text>
          ),
        )}
      </Breadcrumbs>
    </nav>
  );
}
