import { ConferenceCallScreen } from '@features/conference';
import { useLocalSearchParams } from 'expo-router';

export default function Conference() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <ConferenceCallScreen confId={id} />;
}
