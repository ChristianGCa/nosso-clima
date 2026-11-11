import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens from the prominent first-visit button with privacy, project and licence details', () => {
    vi.stubEnv('CONTROLLER_NAME', 'Pessoa Exemplo');
    vi.stubEnv('CONTACT_EMAIL', 'contato@example.com');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Como usamos seus dados' }));

    const dialog = screen.getByRole('dialog', { name: 'Privacidade e informações' });
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Seus dados' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Seus direitos' })).toBeTruthy();
    expect(dialog.textContent).toContain('legítimo interesse previsto na LGPD');
    expect(dialog.textContent).toContain('tratados fora do Brasil');
    expect(dialog.textContent).toContain('avisaremos a ANPD');
    expect(dialog.textContent).toContain('estatísticas de visitas sem cookies');
    expect(dialog.textContent).toContain('localização aproximada estimada pelo IP');
    expect(dialog.textContent).toContain('descartado em até 24 horas');
    expect(dialog.textContent).toContain(
      'O termo buscado e a cidade escolhida não são enviados a essas estatísticas',
    );
    expect(dialog.textContent).toContain('medir de forma agregada o uso do site');
    expect(dialog.textContent).toContain('Global Privacy Control ou o Do Not Track');
    expect(dialog.textContent).toContain(
      'Não há publicidade, venda de dados nem criação de perfis',
    );
    expect(dialog.textContent).not.toContain('análise de audiência');
    expect(screen.getByRole('heading', { name: 'Sobre o projeto' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Licenças e créditos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Repositório no GitHub' }).getAttribute('href')).toBe(
      'https://github.com/ChristianGCa/nosso-clima',
    );
    expect(dialog.textContent).toContain('Responsável pelo site e pelos dados: Pessoa Exemplo.');
    expect(screen.getByRole('link', { name: 'contato@example.com' }).getAttribute('href')).toBe(
      'mailto:contato@example.com',
    );
    expect(dialog.textContent).toContain(
      'As previsões são estimativas automáticas e podem conter erros.',
    );
    expect(dialog.textContent).toContain('não como única fonte para decisões de segurança');
    expect(dialog.textContent).toContain('siga os alertas da Defesa Civil e do INMET');
    expect(screen.getByRole('link', { name: 'Licença MIT dos ícones' }).getAttribute('href')).toBe(
      '/third-party-licenses.txt',
    );
    expect(screen.getByRole('link', { name: 'licença MIT' }).getAttribute('href')).toBe(
      '/code-license.txt',
    );
  });

  it('shows no contact when the installation does not configure one', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacidade e créditos' }));
    const dialog = screen.getByRole('dialog', { name: 'Privacidade e informações' });
    expect(dialog.textContent).toContain(
      'Responsável e contato não configurados nesta instalação.',
    );
    expect(dialog.textContent).not.toContain('Responsável pelo site e pelos dados');
    expect(dialog.querySelector('a[href^="mailto:"]')).toBeNull();
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
