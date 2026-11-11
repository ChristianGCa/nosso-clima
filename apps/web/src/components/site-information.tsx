import { useEffect, useRef } from 'react';
import type { SiteContact } from '../site-contact';

type Props = { open: boolean; onClose: () => void; contact: SiteContact | null };

export function SiteInformationDialog({ open, onClose, contact }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // A click whose target is the dialog itself landed on the backdrop, outside the panel.
    const closeFromBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog.addEventListener('click', closeFromBackdrop);
    return () => dialog.removeEventListener('click', closeFromBackdrop);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="info-dialog"
      aria-labelledby="info-dialog-title"
      onClose={onClose}
    >
      <div className="info-dialog-panel">
        <div className="info-dialog-header">
          <h2 id="info-dialog-title">Privacidade e informações</h2>
          <button type="button" className="info-dialog-close" aria-label="Fechar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="information-sections">
          <section id="seus-dados" aria-labelledby="seus-dados-titulo">
            <h3 id="seus-dados-titulo">Seus dados</h3>
            <p>
              Ao buscar uma cidade, o termo pesquisado passa pelo NossoClima e é enviado à
              geocodificação da Open-Meteo. Ao escolher uma cidade, as coordenadas e o fuso horário
              dessa cidade são enviados para obter a previsão. Quando você volta ao site,
              consultamos novamente a previsão dessa cidade.
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
              de busca expiram em até 24 horas e os de previsão em até 10 minutos. Eles podem
              incluir nomes, coordenadas e fuso da cidade. A base também guarda contadores
              temporários usados para limitar consultas. Os backups periódicos desta base estão
              desativados. A eventual retenção de logs e outras cópias dos fornecedores segue as
              políticas deles. As consultas à Open-Meteo são feitas pelo nosso servidor, sem
              encaminhar os cabeçalhos com o IP do visitante.
            </p>
            <p>
              A Open-Meteo recebe o endereço de conexão do nosso servidor e informa que seu serviço
              gratuito pode manter registros com coordenadas por até 90 dias.{' '}
              <a href="https://open-meteo.com/en/terms">
                Leia os termos e a privacidade da Open-Meteo
              </a>
              .
            </p>
            <p>
              Para entender como o site é encontrado e usado, a Vercel gera estatísticas de visitas
              sem cookies: página acessada, site de origem, localização aproximada estimada pelo IP
              (país, região e cidade), tipo de dispositivo, sistema e navegador. O identificador de
              visita é derivado da conexão e descartado em até 24 horas; vemos apenas números
              agregados, sem o IP. A eventual retenção desses registros pela Vercel segue a política
              dela. O termo buscado e a cidade escolhida não são enviados a essas estatísticas. Se o
              seu navegador enviar o sinal Global Privacy Control ou Do Not Track, elas não são
              carregadas.
            </p>
            <p>
              Usamos esses dados só para responder às suas consultas, proteger o site contra abuso e
              medir de forma agregada o uso do site, com base no legítimo interesse previsto na
              LGPD. Eles são tratados fora do Brasil pelos serviços citados. Não há publicidade,
              venda de dados nem criação de perfis.
            </p>
          </section>
          <section id="seus-direitos" aria-labelledby="seus-direitos-titulo">
            <h3 id="seus-direitos-titulo">Seus direitos</h3>
            <p>
              Você pode pedir acesso, correção ou eliminação dos seus dados, saber com quem são
              compartilhados ou se opor ao uso. Como não guardamos o IP nem criamos contas,
              normalmente não temos dados que identifiquem você.
            </p>
            <p>
              Para não participar das estatísticas de visitas, ative o Global Privacy Control ou o
              Do Not Track no navegador; bloqueadores de conteúdo também as impedem. Você também
              pode se opor pelo contato abaixo.
            </p>
            <p>
              Respondemos em até 15 dias pelo contato abaixo. Em caso de incidente de segurança
              relevante, avisaremos a ANPD e as pessoas afetadas.
            </p>
            {contact ? (
              <p>
                Responsável pelo site e pelos dados: {contact.name}. Contato:{' '}
                <a href={`mailto:${contact.email}`}>{contact.email}</a>.
              </p>
            ) : (
              <p>Responsável e contato não configurados nesta instalação.</p>
            )}
          </section>
          <section id="sobre-o-projeto" aria-labelledby="sobre-o-projeto-titulo">
            <h3 id="sobre-o-projeto-titulo">Sobre o projeto</h3>
            <p>
              O NossoClima apresenta condições atuais e uma previsão de sete dias em linguagem
              simples. Os dados meteorológicos e as localidades são fornecidos pela Open-Meteo e
              adaptados para esta interface.
            </p>
            <p>
              As previsões são estimativas automáticas e podem conter erros. Use-as apenas como
              referência e não como única fonte para decisões de segurança. Em situações de risco,
              siga os alertas da Defesa Civil e do INMET.
            </p>
            <p>
              <a href="https://github.com/ChristianGCa/nosso-clima">Repositório no GitHub</a>.
            </p>
          </section>
          <section id="licencas-e-creditos" aria-labelledby="licencas-e-creditos-titulo">
            <h3 id="licencas-e-creditos-titulo">Licenças e créditos</h3>
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
      </div>
    </dialog>
  );
}
