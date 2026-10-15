// @ts-check
const { getInstance } = require('./instances');
const { LoginPage } = require('../pages/LoginPage');
const { ClassroomListPage } = require('../pages/ClassroomListPage');

async function loginInNewContext(browser, identifier, password) {
  const context = await browser.newContext({ baseURL: getInstance().baseURL });
  const page = await context.newPage();
  await new LoginPage(page).login(identifier, password);
  await new ClassroomListPage(page).heading.waitFor();
  return { context, page };
}

async function bestEffortCleanup(browser, persona, fn) {
  const { context, page } = await loginInNewContext(browser, persona.identifier, persona.password);
  try {
    await fn(page);
  } catch (err) {
    console.warn(`bestEffortCleanup failed for ${persona.identifier}:`, err.stack || err.message);
  } finally {
    await context.close();
  }
}

module.exports = { loginInNewContext, bestEffortCleanup };
