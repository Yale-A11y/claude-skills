async page => {
  const el = await page.getByRole('button', { name: 'Upload media by clicking or' });
  await el.focus();
  return 'focused';
}
