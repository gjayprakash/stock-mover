/**
 * PUBLIC demo logins, shown on the sign-in page so judges can get in without asking.
 * Anyone who opens the site or this repository can read them: remove or change these accounts' passwords
 * after the demo. Empty list = the demo box does not render. Nothing else in the code may contain them.
 */
export type DemoLogin = { label: string; email: string; password: string };

export const DEMO_LOGINS: DemoLogin[] = [
  { label: 'Super admin: sees every store', email: 'jay@fleapo.com', password: '1234567890' },
  { label: 'Store manager: sees one store', email: 'asjad@fleapo.com', password: 'asjad@A123' },
];
