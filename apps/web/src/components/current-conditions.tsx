import type { Forecast } from '../api/forecast';
import { localClock, metric, retrievedTime } from '../format/weather-format';

export function CurrentConditions({ forecast }: { forecast: Forecast }) {
  const { current } = forecast;
  return (
    <section className="current-conditions" aria-labelledby="current-title">
      <div>
        <p className="section-kicker">AGORA NA CIDADE</p>
        <h3 id="current-title">Condições atuais</h3>
        <p className="current-condition">{current.condition.labelPt}</p>
        <p className="valid-time">
          Condições válidas às {localClock(current.validAtLocal)} (horário local)
        </p>
        <p className="retrieved-time">
          Dados consultados às {retrievedTime(forecast.retrievedAtUtc, forecast.timezone)} (horário
          local)
        </p>
      </div>
      <div className="current-numbers">
        <p className="temperature">{metric(current.temperatureC, '°C')}</p>
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
      </div>
    </section>
  );
}
