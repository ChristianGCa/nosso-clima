import { act, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.queryByRole('heading', { name: 'Seus dados' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Como usamos seus dados' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Privacidade e créditos' })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('site information dialog', () => {
  it('opens from the prominent first-visit button with privacy, project and licence details', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Como usamos seus dados' }));

    const dialog = screen.getByRole('dialog', { name: 'Privacidade e informações' });
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Seus dados' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sobre o projeto' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Licenças e créditos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Repositório no GitHub' }).getAttribute('href')).toBe(
      'https://github.com/ChristianGCa/nosso-clima',
    );
    expect(
      screen.getByRole('link', { name: 'christiangca.dev@gmail.com' }).getAttribute('href'),
    ).toBe('mailto:christiangca.dev@gmail.com');
    expect(screen.getByRole('link', { name: 'Licença MIT dos ícones' }).getAttribute('href')).toBe(
      '/third-party-licenses.txt',
    );
    expect(screen.getByRole('link', { name: 'licença MIT' }).getAttribute('href')).toBe(
      '/code-license.txt',
    );
  });

  it('closes with the corner button and reopens from the discreet footer option', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacidade e créditos' }));
    const dialog = screen.getByRole('dialog', { name: 'Privacidade e informações' });
    expect(dialog.hasAttribute('open')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(dialog.hasAttribute('open')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Privacidade e créditos' }));
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('closes on a backdrop click or a native close, but not on clicks inside the panel', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Como usamos seus dados' }));
    const dialog = screen.getByRole('dialog', { name: 'Privacidade e informações' });

    fireEvent.click(screen.getByRole('heading', { name: 'Seus dados' }));
    expect(dialog.hasAttribute('open')).toBe(true);

    fireEvent.click(dialog);
    expect(dialog.hasAttribute('open')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Como usamos seus dados' }));
    act(() => (dialog as HTMLDialogElement).close());
    expect(dialog.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Como usamos seus dados' }));
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
