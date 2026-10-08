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
import { routePaths } from './routePaths';

function requireAuth({ location }: { location: { href: string } }) {
  if (useAuthStore.getState().status !== 'authenticated') {
    throw redirect({ to: routePaths.login, search: { redirect: location.href } });
  }
}

function redirectSearch(search: Record<string, unknown>): { redirect: string } {
  const redirect = search.redirect;
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return { redirect: routePaths.home };
  }
  return { redirect };
}

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: redirectSearch,
  component: LoginScreen,
  beforeLoad: () => {
    if (useAuthStore.getState().status === 'authenticated') {
      throw redirect({ to: routePaths.home });
    }
  },
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  validateSearch: redirectSearch,
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
    throw redirect({ to: routePaths.home, replace: true });
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  shellRoute.addChildren([
    protectedRoute('/home', HomeScreen),
    protectedRoute('/library', LibraryScreen),
    protectedRoute('/library/$kind/$id', LibraryDetailScreen),
    protectedRoute('/library/course/$id', CourseViewScreen),
    protectedRoute('/library/$kind/$id/edit', ContentEditScreen),
    protectedRoute('/jobs', JobsScreen),
    protectedRoute('/jobs/$jobId', JobDetailScreen),
    protectedRoute('/ivr-view', ViewIvrScreen),
    protectedRoute('/registration', RegistrationScreen),
    protectedRoute('/analytics', AnalyticsScreen),
    protectedRoute('/create', CreateHubScreen),
    protectedRoute('/create/quiz', QuizBuilderScreen),
    protectedRoute('/create/ai', CreateAiScreen),
    protectedRoute('/create/upload', CreateUploadScreen),
    protectedRoute('/create/source', CreateSourceScreen),
    protectedRoute('/make-accessible', MakeAccessibleScreen),
    protectedRoute('/make-accessible/$jobId', MakeAccessibleJobScreen),
    protectedRoute('/localize', LocalizeSitesScreen),
    protectedRoute('/localize/add', LocalizeAddScreen),
    protectedRoute('/localize/sites/$siteId/edit', LocalizeAddScreen),
    protectedRoute('/localize/review', LocalizeReviewScreen),
    protectedRoute('/review', ReviewQueueScreen),
    protectedRoute('/review/text/$jobId', ReviewTextScreen),
    protectedRoute('/review/audio/$id', ReviewAudioScreen),
    protectedRoute('/review/audio/$id/edit', ReviewAudioEditScreen),
    protectedRoute('/review/quiz/$id', ReviewQuizScreen),
    protectedRoute('/review/remediate/$jobId', ReviewRemediateScreen),
    protectedRoute('/review/approved', ReviewApprovedScreen),
    protectedRoute('/account/profile', AccountProfileScreen),
    protectedRoute('/account/settings', AccountSettingsScreen),
    syncHistoryRoute,
    notFoundRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

useAuthStore.subscribe((state, prev) => {
  if (state.status !== prev.status) void router.invalidate();
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
