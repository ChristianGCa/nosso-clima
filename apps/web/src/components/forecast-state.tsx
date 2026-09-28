import type { ForecastState } from '../hooks/use-forecast';
import { locationLabel } from './city-search';
import { CurrentConditions } from './current-conditions';
import { DailyForecast } from './daily-forecast';

type Props = { state: ForecastState; onRetry: () => void };

export function ForecastStatus({ state, onRetry }: Props) {
  if (state.status === 'idle') {
    return (
      <section className="state-panel state-panel--idle">
        <div className="state-inner">
          <h1>O clima da sua cidade, sem mistério.</h1>
          <p>Escolha uma cidade na busca acima para ver a previsão.</p>
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
              : 'A previsão está temporariamente indisponível.'}
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
