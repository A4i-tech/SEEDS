// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ClassroomListPage } = require('../pages/ClassroomListPage');

test('TC-TAUTH-001 teacher login with valid credentials redirects to /classrooms', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const classroomListPage = new ClassroomListPage(page);
  const { identifier, password } = PERSONAS.teacher;

  await loginPage.login(identifier, password);
  await classroomListPage.heading.waitFor();

  expect(new URL(page.url()).pathname).toBe('/classrooms');
});

test('TC-TAUTH-002 login fails with wrong password for a registered phone number', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const { identifier } = PERSONAS.teacher;

  await loginPage.login(identifier, 'WrongPass@1');

  await expect(page.getByRole('alert').getByText('Invalid phone or password', { exact: true })).toBeVisible({
    timeout: 10000,
  });
  expect(new URL(page.url()).pathname).not.toBe('/classrooms');
});

test('TC-TAUTH-003 login fails with an unregistered phone number', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.login('9999999999', 'SomePass@1');

  await expect(page.getByRole('alert').getByText('Invalid phone or password', { exact: true })).toBeVisible({
    timeout: 10000,
  });
  expect(new URL(page.url()).pathname).not.toBe('/classrooms');
});

test('TC-TAUTH-004 login fails when phone number field is left blank', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();

  await loginPage.passwordInput.fill('SomePass@1');
  await loginPage.submitButton.click();

  await expect(page.getByText(/all fields are required/i)).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/classrooms');
});

test('TC-TAUTH-005 login fails when password field is left blank', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const { identifier } = PERSONAS.teacher;
  await loginPage.goto();

  await loginPage.phoneInput.fill(identifier);
  await loginPage.submitButton.click();

  await expect(page.getByText(/all fields are required/i)).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/classrooms');
});

test('TC-TAUTH-006 session persists on page reload', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const classroomListPage = new ClassroomListPage(page);
  const { identifier, password } = PERSONAS.teacher;

  await loginPage.login(identifier, password);
  await classroomListPage.heading.waitFor();

  await page.reload();

  await classroomListPage.heading.waitFor();
  expect(new URL(page.url()).pathname).toBe('/classrooms');
});

test('TC-TAUTH-007 logout signs the teacher out and redirects to the login page', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const classroomListPage = new ClassroomListPage(page);
  const { identifier, password } = PERSONAS.teacher;

  await loginPage.login(identifier, password);
  await classroomListPage.heading.waitFor();

  await classroomListPage.logout();

  await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
  await loginPage.phoneInput.waitFor();
});

test('REG-595-LOGIN [#595 regression] login with an already-created test teacher account reaches /classrooms', async ({
  page,
}) => {
  const loginPage = new LoginPage(page);
  const classroomListPage = new ClassroomListPage(page);
  const { identifier, password } = PERSONAS.teacher;

  await loginPage.login(identifier, password);
  await classroomListPage.heading.waitFor();

  expect(new URL(page.url()).pathname).toBe('/classrooms');
});

test('TC-TNEG-007 login shows an error when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        getItem: () => null,
        removeItem: () => {},
      },
      writable: true,
    });
  });

  const loginPage = new LoginPage(page);
  const { identifier, password } = PERSONAS.teacher;
  await loginPage.login(identifier, password);

  await expect(page.getByText(/local storage is not available/i)).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/classrooms');
});
