import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import type { FunctionComponent } from 'react';
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
import { Shell } from './Shell';

function requireAuth() {
  if (useAuthStore.getState().status !== 'authenticated') {
    throw redirect({ to: '/' });
  }
}

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LoginScreen,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterScreen,
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: Shell,
  beforeLoad: requireAuth,
});

function protectedRoute<const TPath extends string>(path: TPath, component: FunctionComponent) {
  return createRoute({ getParentRoute: () => shellRoute, path, component });
}

const homeRoute = protectedRoute('/home', HomeScreen);
const libraryRoute = protectedRoute('/library', LibraryScreen);
const libraryDetailRoute = protectedRoute('/library/$kind/$id', LibraryDetailScreen);
const courseViewRoute = protectedRoute('/library/course/$id', CourseViewScreen);
const contentEditRoute = protectedRoute('/library/$kind/$id/edit', ContentEditScreen);
const libraryViewRoute = protectedRoute('/library/$kind/$id/view', LibraryViewScreen);
const jobsRoute = protectedRoute('/jobs', JobsScreen);
const jobDetailRoute = protectedRoute('/jobs/$jobId', JobDetailScreen);
const ivrViewRoute = protectedRoute('/ivr-view', ViewIvrScreen);
const registrationRoute = protectedRoute('/registration', RegistrationScreen);
const analyticsRoute = protectedRoute('/analytics', AnalyticsScreen);
const createHubRoute = protectedRoute('/create', CreateHubScreen);
const quizBuilderRoute = protectedRoute('/create/quiz', QuizBuilderScreen);
const createAiRoute = protectedRoute('/create/ai', CreateAiScreen);
const createUploadRoute = protectedRoute('/create/upload', CreateUploadScreen);
const createSourceRoute = protectedRoute('/create/source', CreateSourceScreen);
const makeAccessibleRoute = protectedRoute('/make-accessible', MakeAccessibleScreen);
const makeAccessibleJobRoute = protectedRoute('/make-accessible/$jobId', MakeAccessibleJobScreen);
const localizeRoute = protectedRoute('/localize', LocalizeSitesScreen);
const localizeAddRoute = protectedRoute('/localize/add', LocalizeAddScreen);
const localizeEditRoute = protectedRoute('/localize/sites/$siteId/edit', LocalizeAddScreen);
const localizeReviewRoute = protectedRoute('/localize/review', LocalizeReviewScreen);
const reviewRoute = protectedRoute('/review', ReviewQueueScreen);
const reviewTextRoute = protectedRoute('/review/text/$jobId', ReviewTextScreen);
const reviewAudioRoute = protectedRoute('/review/audio/$id', ReviewAudioScreen);
const reviewAudioEditRoute = protectedRoute('/review/audio/$id/edit', ReviewAudioEditScreen);
const reviewQuizRoute = protectedRoute('/review/quiz/$id', ReviewQuizScreen);
const reviewRemediateRoute = protectedRoute('/review/remediate/$jobId', ReviewRemediateScreen);
const reviewApprovedRoute = protectedRoute('/review/approved', ReviewApprovedScreen);
const accountProfileRoute = protectedRoute('/account/profile', AccountProfileScreen);
const accountSettingsRoute = protectedRoute('/account/settings', AccountSettingsScreen);

const syncHistoryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/content/sync-history',
  beforeLoad: () => {
    throw redirect({ to: '/jobs' });
  },
});

const notFoundRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '$',
  beforeLoad: () => {
    throw redirect({ to: '/home' });
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  shellRoute.addChildren([
    homeRoute,
    libraryRoute,
    libraryDetailRoute,
    courseViewRoute,
    contentEditRoute,
    libraryViewRoute,
    jobsRoute,
    jobDetailRoute,
    ivrViewRoute,
    registrationRoute,
    analyticsRoute,
    createHubRoute,
    quizBuilderRoute,
    createAiRoute,
    createUploadRoute,
    createSourceRoute,
    makeAccessibleRoute,
    makeAccessibleJobRoute,
    localizeRoute,
    localizeAddRoute,
    localizeEditRoute,
    localizeReviewRoute,
    reviewRoute,
    reviewTextRoute,
    reviewAudioRoute,
    reviewAudioEditRoute,
    reviewQuizRoute,
    reviewRemediateRoute,
    reviewApprovedRoute,
    accountProfileRoute,
    accountSettingsRoute,
    syncHistoryRoute,
    notFoundRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
