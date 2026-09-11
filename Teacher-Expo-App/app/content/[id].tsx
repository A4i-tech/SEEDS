import { ContentDetailScreen } from '@features/content';
import { useLocalSearchParams } from 'expo-router';

export default function ContentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContentDetailScreen contentId={id} />;
}
