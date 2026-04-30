import { test, expect } from '@playwright/test';

test('admin can log in, create customer, create job, close job', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@auction-os.local');
  await page.getByLabel('Password').fill('admin1234!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/customers/);

  // Create customer with a unique name
  const customerName = `Smoke Test ${Date.now()}`;
  await page.getByRole('button', { name: 'New customer' }).click();
  await page.getByLabel('Name').fill(customerName);
  await page.getByRole('button', { name: 'Create' }).click();

  // Click into it
  await page.getByText(customerName).first().click();
  await expect(page.getByRole('heading', { name: customerName })).toBeVisible();

  // Create a job
  const jobNumber = `J-${Date.now()}`;
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Job number').fill(jobNumber);
  await page.getByRole('button', { name: 'Create' }).click();

  // Close it
  await page.getByRole('row', { name: new RegExp(jobNumber) }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('row', { name: new RegExp(jobNumber) }).getByText('Closed')).toBeVisible();
});
