import type { Forecast } from '../api/forecast';
import { dayLabel, metric, uvRiskLabel } from '../format/weather-format';

export function DailyForecast({ daily }: { daily: Forecast['daily'] }) {
  return (
    <section className="daily-section" aria-labelledby="daily-title">
      <div className="daily-heading">
        <p className="section-kicker">PLANEJE OS PRÓXIMOS DIAS</p>
        <h3 id="daily-title">Previsão de 7 dias</h3>
      </div>
      <div className="daily-grid">
        {daily.map((day) => (
          <article className="day-card" key={day.date}>
            <h4>{dayLabel(day.date)}</h4>
            <p className="day-condition">
              <span>Condição mais severa</span>
              <strong>{day.condition.labelPt}</strong>
            </p>
            <dl className="day-metrics">
              <div>
                <dt>Máxima / mínima</dt>
                <dd>
                  {metric(day.temperatureMaxC, '°C')} / {metric(day.temperatureMinC, '°C')}
                </dd>
              </div>
              <div>
                <dt>Sensação máxima / mínima</dt>
                <dd>
                  {metric(day.apparentTemperatureMaxC, '°C')} /{' '}
                  {metric(day.apparentTemperatureMinC, '°C')}
                </dd>
              </div>
              <div>
                <dt>Chance de chuva</dt>
                <dd>{metric(day.precipitationProbabilityMaxPercent, '%')}</dd>
              </div>
              <div>
                <dt>Volume de chuva</dt>
                <dd>{metric(day.precipitationSumMm, 'mm')}</dd>
              </div>
              <div>
                <dt>Vento máximo</dt>
                <dd>{metric(day.windSpeedMaxKmh, 'km/h')}</dd>
              </div>
              <div>
                <dt>Índice UV máximo</dt>
                <dd>{metric(day.uvIndexMax, '')}</dd>
              </div>
              <div>
                <dt>Risco UV</dt>
                <dd>{uvRiskLabel(day.uvRisk)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
