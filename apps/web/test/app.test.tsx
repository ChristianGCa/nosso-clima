import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app';

describe('neutral first screen', () => {
  it('asks for a city without requesting data', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'O clima da sua cidade, sem mistério.',
    );
    expect(screen.getByRole('combobox', { name: 'Buscar cidade' })).toBeTruthy();
    const brandImage = screen
      .getByRole('link', { name: 'NossoClima, início' })
      .querySelector('img');
    expect(brandImage?.getAttribute('src')).toBeTruthy();
    expect(brandImage?.getAttribute('alt')).toBe('');
    expect(screen.queryByRole('heading', { name: 'Previsão de 7 dias' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Como usamos seus dados' }).getAttribute('href')).toBe(
      '#seus-dados',
    );
    expect(screen.getByRole('heading', { name: 'Seus dados' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sobre o projeto' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Licenças e créditos' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /repositório/i })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'christiangca.dev@gmail.com' }).getAttribute('href'),
    ).toBe('mailto:christiangca.dev@gmail.com');
    expect(screen.getByRole('link', { name: 'Licença MIT dos ícones' }).getAttribute('href')).toBe(
      '/third-party-licenses.txt',
    );
    expect(screen.getByRole('link', { name: 'licença MIT' }).getAttribute('href')).toBe(
      '/code-license.txt',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
