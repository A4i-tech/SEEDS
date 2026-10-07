import { Center, Loader } from '@mantine/core';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { LoginScreen } from '@features/auth/screens/LoginScreen';
import { RegisterScreen } from '@features/auth/screens/RegisterScreen';
import { JobsScreen } from '@features/jobs/screens/JobsScreen';
import { JobDetailScreen } from '@features/jobs/screens/JobDetailScreen';
import { ViewIvrScreen } from '@features/ivr/screens/ViewIvrScreen';
import { AccountProfileScreen } from '@features/account/screens/AccountProfileScreen';
import { AccountSettingsScreen } from '@features/account/screens/AccountSettingsScreen';
import { LibraryScreen } from '@features/library/screens/LibraryScreen';
import { LibraryDetailScreen } from '@features/library/screens/LibraryDetailScreen';
import { LibraryViewScreen } from '@features/library/screens/LibraryViewScreen';
import { CourseViewScreen } from '@features/library/screens/CourseViewScreen';
import { ContentEditScreen } from '@features/library/screens/ContentEditScreen';
import { CreateHubScreen } from '@features/create/screens/CreateHubScreen';
import { CreateAiScreen } from '@features/create/screens/CreateAiScreen';
import { CreateUploadScreen } from '@features/create/screens/CreateUploadScreen';
import { CreateSourceScreen } from '@features/create/screens/CreateSourceScreen';
import { QuizBuilderScreen } from '@features/create/screens/QuizBuilderScreen';
import { ReviewQueueScreen } from '@features/review/screens/ReviewQueueScreen';
import { ReviewTextScreen } from '@features/review/screens/ReviewTextScreen';
import { ReviewAudioScreen } from '@features/review/screens/ReviewAudioScreen';
import { ReviewAudioEditScreen } from '@features/review/screens/ReviewAudioEditScreen';
import { ReviewQuizScreen } from '@features/review/screens/ReviewQuizScreen';
import { ReviewRemediateScreen } from '@features/review/screens/ReviewRemediateScreen';
import { ReviewApprovedScreen } from '@features/review/screens/ReviewApprovedScreen';
import { RegistrationScreen } from '@features/registration/screens/RegistrationScreen';
import { AnalyticsScreen } from '@features/analytics/screens/AnalyticsScreen';
import { LocalizeSitesScreen } from '@features/localize/screens/LocalizeSitesScreen';
import { LocalizeAddScreen } from '@features/localize/screens/LocalizeAddScreen';
import { LocalizeReviewScreen } from '@features/localize/screens/LocalizeReviewScreen';
import { MakeAccessibleScreen } from '@features/make-accessible/screens/MakeAccessibleScreen';
import { MakeAccessibleJobScreen } from '@features/make-accessible/screens/MakeAccessibleJobScreen';
import { HomeScreen } from '@features/home/screens/HomeScreen';
import { routePaths } from './routePaths';
import { Shell } from './Shell';

function ProtectedShell() {
  const status = useAuthStore((s) => s.status);
  if (status === 'idle') {
    return (
      <Center h="100vh">
        <Loader aria-label="Loading" />
      </Center>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to={routePaths.login} replace />;
  }
  return <Shell />;
}

export function RootNavigator() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path={routePaths.login} element={<LoginScreen />} />
        <Route path={routePaths.register} element={<RegisterScreen />} />
        <Route element={<ProtectedShell />}>
          <Route path={routePaths.home} element={<HomeScreen />} />
          <Route path={routePaths.library} element={<LibraryScreen />} />
          <Route path={`${routePaths.library}/:kind/:id`} element={<LibraryDetailScreen />} />
          <Route path={`${routePaths.library}/course/:id`} element={<CourseViewScreen />} />
          <Route path={`${routePaths.library}/:kind/:id/edit`} element={<ContentEditScreen />} />
          <Route path={`${routePaths.library}/:kind/:id/view`} element={<LibraryViewScreen />} />
          <Route path={routePaths.jobs} element={<JobsScreen />} />
          <Route path={`${routePaths.jobs}/:jobId`} element={<JobDetailScreen />} />
          <Route path={routePaths.ivrView} element={<ViewIvrScreen />} />
          <Route path={routePaths.registration} element={<RegistrationScreen />} />
          <Route path={routePaths.analytics} element={<AnalyticsScreen />} />
          <Route path={routePaths.create} element={<CreateHubScreen />} />
          <Route path={`${routePaths.create}/quiz`} element={<QuizBuilderScreen />} />
          <Route path={`${routePaths.create}/ai`} element={<CreateAiScreen />} />
          <Route path={`${routePaths.create}/upload`} element={<CreateUploadScreen />} />
          <Route path={`${routePaths.create}/source`} element={<CreateSourceScreen />} />
          <Route path={routePaths.makeAccessible} element={<MakeAccessibleScreen />} />
          <Route path={`${routePaths.makeAccessible}/:jobId`} element={<MakeAccessibleJobScreen />} />
          <Route path={routePaths.localize} element={<LocalizeSitesScreen />} />
          <Route path={routePaths.localizeAdd} element={<LocalizeAddScreen />} />
          <Route path={routePaths.localizeEdit} element={<LocalizeAddScreen />} />
          <Route path={routePaths.localizeReview} element={<LocalizeReviewScreen />} />
          <Route path={routePaths.review} element={<ReviewQueueScreen />} />
          <Route path={`${routePaths.review}/text/:jobId`} element={<ReviewTextScreen />} />
          <Route path={`${routePaths.review}/audio/:id`} element={<ReviewAudioScreen />} />
          <Route path={`${routePaths.review}/audio/:id/edit`} element={<ReviewAudioEditScreen />} />
          <Route path={`${routePaths.review}/quiz/:id`} element={<ReviewQuizScreen />} />
          <Route path={`${routePaths.review}/remediate/:jobId`} element={<ReviewRemediateScreen />} />
          <Route path={`${routePaths.review}/approved`} element={<ReviewApprovedScreen />} />
          <Route path="/account/profile" element={<AccountProfileScreen />} />
          <Route path="/account/settings" element={<AccountSettingsScreen />} />
          <Route path={routePaths.syncHistory} element={<Navigate to={routePaths.jobs} replace />} />
          <Route path="*" element={<Navigate to={routePaths.home} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
