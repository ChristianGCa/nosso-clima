import type { Forecast } from '../api/forecast';
import { localClock, metric, retrievedTime } from '../format/weather-format';
import { ConditionIcon } from './condition-icon';

/** Decorative line icons for the current-condition tiles; the visible label carries the meaning. */
function MetricGlyph({ kind }: { kind: 'feels-like' | 'wind' }) {
  return (
    <svg className="metric-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === 'feels-like' ? (
        <>
          <path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z" />
          <path d="M12 9v7" />
        </>
      ) : (
        <>
          <path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5" />
          <path d="M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5" />
          <path d="M3 16h7" />
        </>
      )}
    </svg>
  );
}

export function CurrentConditions({ forecast }: { forecast: Forecast }) {
  const { current } = forecast;
  return (
    <section className="current-conditions" aria-labelledby="current-title">
      <div className="current-icon">
        <ConditionIcon category={current.condition.category} isDay={current.isDay} />
      </div>
      <div className="current-main">
        <h2 id="current-title">Condições atuais</h2>
        <p className="temperature">{metric(current.temperatureC, '°C')}</p>
        <p className="current-condition">{current.condition.labelPt}</p>
        <p className="valid-time">
          Condições válidas às {localClock(current.validAtLocal)} (horário local)
        </p>
        <p className="retrieved-time">
          Dados consultados às {retrievedTime(forecast.retrievedAtUtc, forecast.timezone)} (horário
          local)
        </p>
      </div>
      <dl className="current-metrics">
        <div className="current-metric">
          <dt>
            <MetricGlyph kind="feels-like" />
            Sensação térmica
          </dt>
          <dd>{metric(current.apparentTemperatureC, '°C')}</dd>
        </div>
        <div className="current-metric">
          <dt>
            <MetricGlyph kind="wind" />
            Vento
          </dt>
          <dd>{metric(current.windSpeedKmh, 'km/h')}</dd>
        </div>
      </dl>
    </section>
  );
}
