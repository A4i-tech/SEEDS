// @ts-check
const { getInstance } = require('./instances');
const { LoginPage } = require('../pages/LoginPage');

/**
 * Logs in as a different persona in a brand-new browser context (no cookies
 * inherited from the current session) instead of logging out and re-logging
 * in on the same page. Logout-then-relogin looked like it should work, but
 * confirmed live: after a mutating action (content edit, teacher/content-
 * creator transfer), logging out and immediately navigating to '/' would
 * silently re-authenticate before the login form ever rendered — matching an
 * already-tracked bug (A4i-tech/.github#591, "refresh-token leak, unverified
 * logout teardown": a refresh-token cookie that wasn't properly revoked
 * silently mints a fresh access token on the next request). A fresh context
 * has no cookies to silently resurrect a session with, sidestepping the bug
 * entirely — and is arguably the more correct way to test "does account B see
 * what account A did" regardless.
 *
 * Caller is responsible for closing the returned context when done.
 */
async function loginInNewContext(browser, identifier, password) {
  const context = await browser.newContext({ baseURL: getInstance().baseURL });
  const page = await context.newPage();
  await new LoginPage(page).login(identifier, password);
  return { context, page };
}

module.exports = { loginInNewContext };
