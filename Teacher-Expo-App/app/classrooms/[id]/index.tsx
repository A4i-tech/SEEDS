import { ClassroomDetailScreen } from '@features/classrooms';
import { useLocalSearchParams } from 'expo-router';

export default function ClassroomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <ClassroomDetailScreen classroomId={id} />;
}
