import type { ForecastState } from '../hooks/use-forecast';
import { locationLabel } from './city-search';
import { CurrentConditions } from './current-conditions';
import { DailyForecast } from './daily-forecast';

type Props = { state: ForecastState; onRetry: () => void };

export function ForecastStatus({ state, onRetry }: Props) {
  if (state.status === 'idle') {
    return (
      <aside className="empty-panel" aria-label="Comece sua consulta">
        <div className="empty-icon" aria-hidden="true">
          ☼
        </div>
        <h2>Seu céu começa aqui.</h2>
        <p>
          Escolha uma cidade para descobrir a previsão local, com horários e medidas fáceis de
          entender.
        </p>
      </aside>
    );
  }

  if (state.status === 'loading') {
    return (
      <section className="forecast-panel" role="status" aria-live="polite" aria-busy="true">
        <h2>{locationLabel(state.location)}</h2>
        <p>Carregando previsão…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="forecast-panel" role="alert">
        <h2>{locationLabel(state.location)}</h2>
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
      </section>
    );
  }

  return (
    <section
      className="weather-result"
      aria-label={`Previsão para ${locationLabel(state.location)}`}
    >
      <h2>{locationLabel(state.location)}</h2>
      <CurrentConditions forecast={state.forecast} />
      <DailyForecast daily={state.forecast.daily} />
      <p className="attribution forecast-attribution">
        Previsão por <a href={state.forecast.attribution.providerUrl}>Open-Meteo</a>. Dados
        adaptados pelo Nosso Clima sob <a href={state.forecast.attribution.licenseUrl}>CC BY 4.0</a>
        .
      </p>
    </section>
  );
}
