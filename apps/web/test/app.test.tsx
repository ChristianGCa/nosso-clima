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
    expect(screen.getByRole('combobox', { name: 'Qual cidade você quer consultar?' })).toBeTruthy();
    expect(screen.getByText('Seu céu começa aqui.')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
