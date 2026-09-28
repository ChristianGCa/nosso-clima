import type { Forecast } from '../api/forecast';
import { localClock, metric, retrievedTime } from '../format/weather-format';
import { ConditionIcon } from './condition-icon';

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
        <div>
          <dt>Sensação térmica</dt>
          <dd>{metric(current.apparentTemperatureC, '°C')}</dd>
        </div>
        <div>
          <dt>Vento</dt>
          <dd>{metric(current.windSpeedKmh, 'km/h')}</dd>
        </div>
      </dl>
    </section>
  );
}
