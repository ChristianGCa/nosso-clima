/**
 * Temporary announcement of the hourly forecast. It stops showing at 23:59:59 on 2026-11-10 in
 * Brasília (UTC−3) with no new deploy; after that date this file is removed (tasks/vercel-todo.md).
 * Closing it lasts only for the current page: nothing is stored in the browser.
 */
export const HOURLY_NOTICE_ENDS_AT = Date.parse('2026-11-11T03:00:00Z');

export function hourlyNoticeActive(now: number): boolean {
  return now < HOURLY_NOTICE_ENDS_AT;
}

export function HourlyNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="feature-notice">
      <p>
        <strong className="notice-badge">Novidade</strong> Previsão por hora: toque em “Ver por
        hora” em qualquer dia para ver a condição, a temperatura e a chuva de cada hora.
      </p>
      <button
        type="button"
        className="notice-close"
        aria-label="Fechar aviso de novidade"
        onClick={onDismiss}
      >
        Fechar
      </button>
    </div>
  );
}
