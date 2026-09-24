import { CitySearch } from './components/city-search';
import { ForecastStatus } from './components/forecast-state';
import { useForecast } from './hooks/use-forecast';
import { useWeatherBackground } from './hooks/use-weather-background';

export function App() {
  const forecast = useForecast();
  const background = useWeatherBackground(forecast.state);
  return (
    <div
      className={`site-shell${background ? ' has-image' : ''}`}
      style={background ? { backgroundImage: `url("${background}")` } : undefined}
    >
      <header className="site-header">
        <a className="brand" href="/" aria-label="Nosso Clima, início">
          <span className="brand-mark" aria-hidden="true">
            ◒
          </span>
          <span>nosso clima</span>
        </a>
        <span className="header-note">O tempo perto de você</span>
      </header>
      <main className={`main-content${forecast.state.status === 'ready' ? ' has-forecast' : ''}`}>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">PREVISÃO DO TEMPO</p>
          <h1 id="page-title">O clima da sua cidade, sem mistério.</h1>
          <p className="intro-copy">
            Encontre uma cidade para ver as condições de agora e os próximos sete dias.
          </p>
          <CitySearch onSelect={forecast.choose} />
        </section>
        <ForecastStatus state={forecast.state} onRetry={forecast.retry} />
      </main>
      <footer className="site-footer">Nosso Clima · informações para planejar o seu dia</footer>
    </div>
  );
}
