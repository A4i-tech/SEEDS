import { Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';

export function PageTitle({ title }: { title: string }) {
  useDocumentTitle(title);
  return <Title>{title}</Title>;
}
