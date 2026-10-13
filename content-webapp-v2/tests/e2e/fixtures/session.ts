import type { Browser, BrowserContext, Page } from '@playwright/test';
import { getInstance, type Persona } from './instances';
import { login } from '../helpers';

/**
 * Logs in as a different persona in a brand-new browser context (no cookies
 * inherited from the current session) instead of logging out and re-logging
 * in on the same page. Logout-then-relogin looked like it should work, but was
 * confirmed live against legacy: after a mutating action, logging out and
 * immediately navigating to '/' would silently re-authenticate before the login
 * form ever rendered — matching an already-tracked bug (A4i-tech/.github#591,
 * "refresh-token leak, unverified logout teardown"). A fresh context has no
 * cookies to silently resurrect a session with, sidestepping the bug entirely —
 * and is arguably the more correct way to test "does account B see what
 * account A did" regardless.
 *
 * Caller is responsible for closing the returned context when done.
 */
export async function loginInNewContext(
  browser: Browser,
  identifier: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: getInstance().baseURL });
  const page = await context.newPage();
  await login(page, identifier, password);
  return { context, page };
}

/**
 * Best-effort teardown for test.afterAll(): if an earlier test in the file
 * failed partway through and never reached its own delete step, this logs
 * back in and tries to clean up anyway. Failures here are only warned, not
 * thrown — a broken cleanup attempt shouldn't fail an already-passing run,
 * but it must be visible, not silent.
 */
export async function bestEffortCleanup(
  browser: Browser,
  persona: Persona,
  fn: (page: Page) => Promise<void>,
): Promise<void> {
  const { context, page } = await loginInNewContext(browser, persona.identifier, persona.password);
  try {
    await fn(page);
  } catch (err) {
    console.warn(`bestEffortCleanup failed for ${persona.identifier}:`, (err as Error).stack || (err as Error).message);
  } finally {
    await context.close();
  }
}
