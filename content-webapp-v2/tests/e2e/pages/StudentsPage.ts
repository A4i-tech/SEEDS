import type { Locator, Page } from '@playwright/test';
import { gotoRowPage } from './pagination';

// Both phone inputs are controlled with per-keystroke handling — verify the
// fill actually landed before proceeding, retrying a couple of times if not.
async function fillAndVerify(locator: Locator, value: string, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    await locator.fill(value);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`fillAndVerify: "${value}" didn't stick after ${attempts} attempts`);
}

export class StudentsPage {
  readonly page: Page;
  readonly registrationLink: Locator;
  readonly studentsTab: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.registrationLink = page.getByRole('link', { name: 'Registration' });
    this.studentsTab = page.getByRole('tab', { name: 'Students' });
    this.addButton = page.getByRole('button', { name: 'Add student' });
  }

  async open(): Promise<void> {
    // Don't return before the students list GET has resolved — a caller that
    // checks for a row immediately after can otherwise race the fetch.
    // Deliberately not swallowed: fail here with a clear cause instead of
    // later on an unrelated, confusing assertion.
    const studentsFetched = this.page.waitForResponse(
      (res) => res.url().endsWith('/student') && res.request().method() === 'GET',
      { timeout: 10000 },
    );
    await this.registrationLink.click();
    await this.studentsTab.click();
    await this.addButton.waitFor();
    await studentsFetched;
  }

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async addStudent(name: string, phone: string): Promise<number> {
    const response = this.page.waitForResponse(
      (res) => res.url().endsWith('/student') && res.request().method() === 'POST',
    );
    await this.addButton.click();
    const dialog = this.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill(name);
    await fillAndVerify(dialog.getByLabel('Phone number *', { exact: true }), phone);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    return (await response).status();
  }

  row(phone: string): Locator {
    return this.page.locator('tr', { has: this.page.getByText(phone, { exact: true }) });
  }

  async editStudent(phone: string): Promise<void> {
    await gotoRowPage(this.page, this.row(phone));
    await this.row(phone).getByRole('button', { name: 'Edit', exact: true }).click();
    await this.dialog().getByLabel('Name *', { exact: true }).waitFor();
  }

  async saveEditName(name: string): Promise<number> {
    const response = this.page.waitForResponse(
      (res) => /\/student\//.test(res.url()) && res.request().method() === 'PATCH',
    );
    const dialog = this.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    return (await response).status();
  }

  async saveEditPhone(phone: string): Promise<number> {
    const response = this.page.waitForResponse(
      (res) => /\/student\//.test(res.url()) && res.request().method() === 'PATCH',
    );
    const dialog = this.dialog();
    await fillAndVerify(dialog.getByLabel('Phone number *', { exact: true }), phone);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    return (await response).status();
  }

  async deleteStudent(phone: string): Promise<number> {
    await gotoRowPage(this.page, this.row(phone));
    const response = this.page.waitForResponse(
      (res) => /\/student\//.test(res.url()) && res.request().method() === 'DELETE',
    );
    await this.row(phone).getByRole('button', { name: 'Delete', exact: true }).click();
    // v2 delete goes through a Mantine confirm modal (legacy had no confirm
    // for students) — confirm explicitly instead of relying on auto-dismiss.
    await this.dialog().getByRole('button', { name: 'Delete', exact: true }).click();
    return (await response).status();
  }
}
