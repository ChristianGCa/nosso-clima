// Substituir pelo endereço público quando o repositório estiver disponível.
const REPOSITORY_URL: string | null = null;

export function SiteInformation() {
  return (
    <div className="site-information">
      <nav className="information-nav" aria-label="Informações do site">
        <a href="#seus-dados">Seus dados</a>
        <a href="#sobre-o-projeto">Sobre o projeto</a>
        <a href="#licencas-e-creditos">Licenças e créditos</a>
      </nav>
      <div className="information-sections">
        <section id="seus-dados" aria-labelledby="seus-dados-titulo">
          <h2 id="seus-dados-titulo">Seus dados</h2>
          <p>
            Ao buscar uma cidade, o termo pesquisado passa pelo Nosso Clima e é enviado à
            geocodificação da Open-Meteo. Ao escolher uma cidade, as coordenadas e o fuso horário
            dessa cidade são enviados para obter a previsão. Quando você volta ao site, consultamos
            novamente a previsão dessa cidade.
          </p>
          <p>
            Guardamos somente a última cidade escolhida neste navegador. Ela é substituída quando
            você escolhe outra cidade e pode ser removida ao limpar os dados deste site no
            navegador. Não pedimos acesso à localização do dispositivo nem criamos uma conta.
          </p>
          <p>
            A Open-Meteo informa que seu serviço gratuito pode manter logs com coordenadas por até
            90 dias.{' '}
            <a href="https://open-meteo.com/en/terms">
              Leia os termos e a privacidade da Open-Meteo
            </a>
            .
          </p>
        </section>
        <section id="sobre-o-projeto" aria-labelledby="sobre-o-projeto-titulo">
          <h2 id="sobre-o-projeto-titulo">Sobre o projeto</h2>
          <p>
            O Nosso Clima apresenta condições atuais e uma previsão de sete dias em linguagem
            simples. Os dados meteorológicos e as localidades são fornecidos pela Open-Meteo e
            adaptados para esta interface.
          </p>
          {REPOSITORY_URL ? (
            <a href={REPOSITORY_URL}>Ver repositório do projeto</a>
          ) : (
            <p>Link do repositório em breve.</p>
          )}
        </section>
        <section id="licencas-e-creditos" aria-labelledby="licencas-e-creditos-titulo">
          <h2 id="licencas-e-creditos-titulo">Licenças e créditos</h2>
          <p>
            Dados de Open-Meteo e localidades baseadas em GeoNames, adaptados pelo Nosso Clima sob{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
          </p>
          <p>
            Ícones Meteocons de Bas Milius:{' '}
            <a href="/third-party-licenses.txt">Licença MIT dos ícones</a>.
          </p>
          <p>O código do Nosso Clima ainda não tem licença definida.</p>
          <p>Os direitos de publicação das imagens de fundo ainda estão em análise.</p>
        </section>
      </div>
      <a className="information-return" href="#inicio">
        Voltar à busca
      </a>
    </div>
  );
}
