import { Anchor, Breadcrumbs, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
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
        {crumbs.map(({ label, to }, index) =>
          to ? (
            <Anchor
              key={label}
              component={Link}
              to={to}
              variant="rowAction"
              display="inline-flex"
              style={{ alignItems: 'center', gap: 4 }}
            >
              {index === 0 && <ArrowLeft size={16} aria-hidden />}
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
