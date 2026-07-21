import { Container, Tabs } from '@mantine/core';
import { IconList, IconRefresh } from '@tabler/icons-react';
import { SyncAllPage } from './components/SyncAllPage';
import { ContentListPage } from './components/ContentListPage';

export default function App() {
  return (
    <Container size="lg" py="xl">
      <Tabs defaultValue="syncAll" keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="syncAll" leftSection={<IconRefresh size={16} />}>
            Sync All
          </Tabs.Tab>
          <Tabs.Tab value="content" leftSection={<IconList size={16} />}>
            Content
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="syncAll">
          <SyncAllPage />
        </Tabs.Panel>

        <Tabs.Panel value="content">
          <ContentListPage />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
