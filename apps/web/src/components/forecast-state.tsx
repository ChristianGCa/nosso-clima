import type { ForecastState } from '../hooks/use-forecast';
import { locationLabel } from './city-search';
import { CurrentConditions } from './current-conditions';
import { DailyForecast } from './daily-forecast';

type Props = { state: ForecastState; onRetry: () => void; onOpenInformation: () => void };

export function ForecastStatus({ state, onRetry, onOpenInformation }: Props) {
  if (state.status === 'idle') {
    return (
      <section className="state-panel state-panel--idle">
        <div className="state-inner">
          <h1>O clima da sua cidade, sem mistério.</h1>
          <p>Escolha uma cidade na busca acima para ver a previsão.</p>
          <div className="state-privacy-note">
            <p>
              Sua última cidade escolhida fica salva neste navegador. Antes de começar, veja quais
              dados passam pelo NossoClima e por seus fornecedores.
            </p>
            <button type="button" className="privacy-button" onClick={onOpenInformation}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Como usamos seus dados
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section className="state-panel" role="status" aria-live="polite" aria-busy="true">
        <div className="state-inner">
          <h1>{locationLabel(state.location)}</h1>
          <p>Carregando previsão…</p>
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="state-panel" role="alert">
        <div className="state-inner">
          <h1>{locationLabel(state.location)}</h1>
          <p>
            {state.failure.kind === 'rate_limited'
              ? 'Muitas consultas agora. Tente novamente em instantes.'
              : state.failure.kind === 'unavailable'
                ? 'A previsão está temporariamente indisponível.'
                : 'Não foi possível carregar a previsão. Tente novamente.'}
          </p>
          <button className="action-button" type="button" onClick={onRetry}>
            Tentar novamente
          </button>
          {state.failure.requestId && (
            <p className="support-id">Referência de suporte: {state.failure.requestId}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="weather-result">
      <div className="current-band">
        <div className="current-inner">
          <h1>{locationLabel(state.location)}</h1>
          <CurrentConditions forecast={state.forecast} />
        </div>
      </div>
      <DailyForecast daily={state.forecast.daily} />
    </div>
  );
}
