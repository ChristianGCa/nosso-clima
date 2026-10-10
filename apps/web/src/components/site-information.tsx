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
            Ao buscar uma cidade, o termo pesquisado passa pelo NossoClima e é enviado à
            geocodificação da Open-Meteo. Ao escolher uma cidade, as coordenadas e o fuso horário
            dessa cidade são enviados para obter a previsão. Quando você volta ao site, consultamos
            novamente a previsão dessa cidade.
          </p>
          <p>
            Neste navegador, guardamos somente a última cidade escolhida. Ela é substituída quando
            você escolhe outra cidade e pode ser removida ao limpar os dados deste site no
            navegador. Não pedimos acesso à localização do dispositivo nem criamos uma conta.
          </p>
          <p>
            A hospedagem Vercel recebe o IP da conexão para entregar e proteger o site. Nossa API
            está configurada para executar na região de Washington, D.C., nos Estados Unidos. A
            Vercel pode manter registros de acesso segundo sua política de retenção. Para limitar
            consultas em excesso, nossa API cria um identificador temporário derivado desse IP,
            renovado a cada minuto. Não guardamos o IP original nesse contador nem nos logs da
            aplicação.
          </p>
          <p>
            Nossa base Upstash está na Virgínia do Norte, nos Estados Unidos. Os resultados ativos
            de busca expiram em até 24 horas e os de previsão em até 10 minutos. Eles podem incluir
            nomes, coordenadas e fuso da cidade. A base também guarda contadores temporários usados
            para limitar consultas. Os backups periódicos desta base estão desativados. A eventual
            retenção de logs e outras cópias dos fornecedores segue as políticas deles. As consultas
            à Open-Meteo são feitas pelo nosso servidor, sem encaminhar os cabeçalhos com o IP do
            visitante.
          </p>
          <p>
            A Open-Meteo recebe o endereço de conexão do nosso servidor e informa que seu serviço
            gratuito pode manter registros com coordenadas por até 90 dias. A Vercel, a Upstash e a
            Open-Meteo podem processar informações fora do Brasil.{' '}
            <a href="https://open-meteo.com/en/terms">
              Leia os termos e a privacidade da Open-Meteo
            </a>
            .
          </p>
          <p>
            Responsável pelo site: ChristianGCa. Contato:{' '}
            <a href="mailto:christiangca.dev@gmail.com">christiangca.dev@gmail.com</a>.
          </p>
        </section>
        <section id="sobre-o-projeto" aria-labelledby="sobre-o-projeto-titulo">
          <h2 id="sobre-o-projeto-titulo">Sobre o projeto</h2>
          <p>
            O NossoClima apresenta condições atuais e uma previsão de sete dias em linguagem
            simples. Os dados meteorológicos e as localidades são fornecidos pela Open-Meteo e
            adaptados para esta interface.
          </p>
          <p>
            <a href="https://github.com/ChristianGCa/nosso-clima">Repositório no GitHub</a>.
          </p>
        </section>
        <section id="licencas-e-creditos" aria-labelledby="licencas-e-creditos-titulo">
          <h2 id="licencas-e-creditos-titulo">Licenças e créditos</h2>
          <p>
            Dados de Open-Meteo e localidades baseadas em GeoNames, adaptados pelo NossoClima sob{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
          </p>
          <p>
            Ícones Meteocons de Bas Milius:{' '}
            <a href="/third-party-licenses.txt">Licença MIT dos ícones</a>.
          </p>
          <p>
            Código do NossoClima sob <a href="/code-license.txt">licença MIT</a>.
          </p>
          <p>Fundos criados no Gemini e logo criado no Claude para o NossoClima.</p>
        </section>
      </div>
      <a className="information-return" href="#inicio">
        Voltar à busca
      </a>
    </div>
  );
}
