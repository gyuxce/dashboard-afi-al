const ADMIN_KEY = 'kpi-admin-mode';

/**
 * Agents only see ready-made data. File Center (CSV upload / manual sync) is for
 * admins: open the dashboard once with `?admin=1` (remembered in this browser,
 * `?admin=0` turns it off). Without a Sheets API key there is no live source, so
 * File Center stays available.
 */
export function isAdminMode(): boolean {
  if (!import.meta.env.VITE_SHEETS_API_KEY) return true;
  try {
    const param = new URLSearchParams(window.location.search).get('admin');
    if (param === '1') localStorage.setItem(ADMIN_KEY, '1');
    else if (param === '0') localStorage.removeItem(ADMIN_KEY);
    return localStorage.getItem(ADMIN_KEY) === '1';
  } catch {
    return false;
  }
}
