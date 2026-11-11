/**
 * The party responsible for the site and its data, shown in the privacy dialog. It comes from the
 * public build variables `CONTROLLER_NAME` and `CONTACT_EMAIL`, so a copy of this repository never
 * shows the original owner's contact. Both values are public by nature: never use this for secrets.
 */
export type SiteContact = { name: string; email: string };

export type SiteContactVariables = {
  CONTROLLER_NAME?: string | undefined;
  CONTACT_EMAIL?: string | undefined;
};

export const SITE_CONTACT_VARIABLES = ['CONTROLLER_NAME', 'CONTACT_EMAIL'] as const;

const EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:.]{2,}$/;

/**
 * Returns the configured contact, or `null` when neither variable is set. A partial or malformed
 * configuration always throws; a missing one throws only when `required` (Vercel builds).
 */
export function resolveSiteContact(
  variables: SiteContactVariables,
  { required }: { required: boolean },
): SiteContact | null {
  const name = variables.CONTROLLER_NAME ?? '';
  const email = variables.CONTACT_EMAIL ?? '';
  if (name === '' && email === '') {
    if (required) throw new Error('CONTROLLER_NAME and CONTACT_EMAIL are required');
    return null;
  }
  if (name.trim() === '' || name !== name.trim() || name.length > 120) {
    throw new Error('Invalid CONTROLLER_NAME');
  }
  if (email !== email.trim() || email.length > 254 || !EMAIL.test(email)) {
    throw new Error('Invalid CONTACT_EMAIL');
  }
  return { name, email };
}

/**
 * Vite `define` entries exposing only these two variables to the client. Vite's `envPrefix` would
 * expose every variable sharing the prefix; `define` names each one explicitly.
 */
export function siteContactDefine(variables: SiteContactVariables): Record<string, string> {
  return Object.fromEntries(
    SITE_CONTACT_VARIABLES.map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(variables[key] ?? ''),
    ]),
  );
}
