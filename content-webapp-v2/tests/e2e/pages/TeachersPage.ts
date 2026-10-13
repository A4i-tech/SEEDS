import type { Locator, Page } from '@playwright/test';
import { gotoRowPage } from './pagination';

// Mantine TextInputs are controlled — verify the fill landed before proceeding.
async function fillAndVerify(locator: Locator, value: string, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    await locator.fill(value);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`fillAndVerify: "${value}" didn't stick after ${attempts} attempts`);
}

const ROLE_LABELS: Record<string, string> = {
  teacher: 'Teacher',
  content_creator: 'Creator',
};

export class TeachersPage {
  readonly page: Page;
  readonly registrationLink: Locator;
  readonly teachersTab: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.registrationLink = page.getByRole('link', { name: 'Registration' });
    this.teachersTab = page.getByRole('tab', { name: 'Teachers' });
    this.addButton = page.getByRole('button', { name: 'Add teacher' });
  }

  async open(): Promise<void> {
    // Arm the wait for the table's own GET before navigating, so it can't
    // resolve too early or miss it. Deliberately not swallowed: a failed list
    // fetch fails here with a clear cause instead of later confusion.
    const teachersFetched = this.page.waitForResponse(
      (res) => res.url().includes('/school/teachers') && res.request().method() === 'GET',
      { timeout: 10000 },
    );
    await this.registrationLink.click();
    await this.teachersTab.click();
    await this.addButton.waitFor();
    const res = await teachersFetched;
    if (!res.ok()) {
      throw new Error(`TeachersPage.open(): teachers list fetch failed with status ${res.status()}`);
    }
  }

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async register({
    name,
    phone,
    password,
    role = 'teacher',
  }: {
    name: string;
    phone: string;
    password: string;
    role?: string;
  }): Promise<void> {
    await this.addButton.click();
    const dialog = this.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill(name);
    await fillAndVerify(dialog.getByLabel('Phone number *', { exact: true }), phone);
    // Create dialog holds exactly one password input (edit dialog has one too, optional — this path only opens create).
    await dialog.locator('input[type="password"]').fill(password);
    // The create form defaults to teacher — only touch the Mantine combobox
    // when a non-default role is requested.
    if (role !== 'teacher') {
      await dialog.getByLabel('Role', { exact: true }).click();
      await this.page.getByRole('option', { name: ROLE_LABELS[role] ?? role, exact: true }).click();
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  row(phone: string): Locator {
    return this.page.locator('tr', { has: this.page.getByText(phone, { exact: true }) });
  }

  async editTeacher(phone: string): Promise<void> {
    await gotoRowPage(this.page, this.row(phone));
    await this.row(phone).getByRole('button', { name: 'Edit', exact: true }).click();
    await this.dialog().getByLabel('Name *', { exact: true }).waitFor();
  }

  async saveEdit(name: string): Promise<void> {
    const dialog = this.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async deleteTeacher(phone: string): Promise<void> {
    await gotoRowPage(this.page, this.row(phone));
    await this.row(phone).getByRole('button', { name: 'Remove', exact: true }).click();
    // v2 delete goes through a Mantine confirm modal (not window.confirm).
    await this.dialog().getByRole('button', { name: 'Remove', exact: true }).click();
  }

  async transferTeacher(phone: string, targetSchoolName: string): Promise<void> {
    await gotoRowPage(this.page, this.row(phone));
    await this.row(phone).getByRole('button', { name: 'Transfer', exact: true }).click();
    const dialog = this.dialog();
    await dialog.getByLabel('Target school', { exact: true }).click();
    await this.page.getByRole('option', { name: targetSchoolName, exact: true }).click();
    await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
  }
}
