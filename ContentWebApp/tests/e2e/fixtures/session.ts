import type { Browser, BrowserContext, Page } from '@playwright/test';
import { getInstance, type Persona } from './instances';
import { login } from '../helpers';

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
