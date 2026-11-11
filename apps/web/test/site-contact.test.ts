import { describe, expect, it } from 'vitest';
import { resolveSiteContact, siteContactDefine } from '../src/site-contact';

describe('site contact', () => {
  it('returns the configured name and e-mail', () => {
    expect(
      resolveSiteContact(
        { CONTROLLER_NAME: 'Pessoa Exemplo', CONTACT_EMAIL: 'contato@example.com' },
        { required: true },
      ),
    ).toEqual({ name: 'Pessoa Exemplo', email: 'contato@example.com' });
  });

  it('returns null when unset, unless the build requires a contact', () => {
    expect(resolveSiteContact({}, { required: false })).toBeNull();
    expect(
      resolveSiteContact({ CONTROLLER_NAME: '', CONTACT_EMAIL: '' }, { required: false }),
    ).toBeNull();
    expect(() => resolveSiteContact({}, { required: true })).toThrow(
      'CONTROLLER_NAME and CONTACT_EMAIL are required',
    );
  });

  it('rejects a partial or malformed name', () => {
    for (const name of [undefined, '', ' ', ' Pessoa', 'Pessoa ', 'x'.repeat(121)]) {
      expect(() =>
        resolveSiteContact(
          { CONTROLLER_NAME: name, CONTACT_EMAIL: 'contato@example.com' },
          { required: false },
        ),
      ).toThrow('Invalid CONTROLLER_NAME');
    }
  });

  it('rejects a partial or malformed e-mail', () => {
    for (const email of [
      undefined,
      '',
      'contato',
      'contato@example',
      'mailto:contato@example.com',
      ' contato@example.com',
      'contato@example.com ',
      'a b@example.com',
      '"x"@example.com',
      `${'x'.repeat(250)}@example.com`,
    ]) {
      expect(() =>
        resolveSiteContact(
          { CONTROLLER_NAME: 'Pessoa Exemplo', CONTACT_EMAIL: email },
          { required: false },
        ),
      ).toThrow('Invalid CONTACT_EMAIL');
    }
  });

  it('defines only the two contact variables for the client', () => {
    expect(
      siteContactDefine({
        CONTROLLER_NAME: 'Pessoa Exemplo',
        CONTACT_EMAIL: 'contato@example.com',
      }),
    ).toEqual({
      'import.meta.env.CONTROLLER_NAME': '"Pessoa Exemplo"',
      'import.meta.env.CONTACT_EMAIL': '"contato@example.com"',
    });
    expect(siteContactDefine({})).toEqual({
      'import.meta.env.CONTROLLER_NAME': '""',
      'import.meta.env.CONTACT_EMAIL': '""',
    });
  });
});
