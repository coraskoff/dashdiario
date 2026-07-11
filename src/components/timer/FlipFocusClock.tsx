import { useEffect, useState, type ReactNode } from "react";

/** Hora atual, atualizada a cada 250ms. */
function useNow() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), 250);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

/** Um cartão flip (split-flap) que anima quando o valor muda. */
function FlipCard({ value, children }: { value: string; children?: ReactNode }) {
  const [display, setDisplay] = useState(value); // valor atualmente exibido
  const [incoming, setIncoming] = useState<string | null>(null); // valor entrando

  useEffect(() => {
    if (value !== display && incoming === null) {
      setIncoming(value);
      const t = window.setTimeout(() => {
        setDisplay(value);
        setIncoming(null);
      }, 600);
      return () => window.clearTimeout(t);
    }
  }, [value, display, incoming]);

  const flipping = incoming !== null;

  return (
    <div className="flip-card">
      {/* metade de cima estática — mostra o novo, revelado quando a aba tomba */}
      <div className="flip-half flip-top">
        <span>{flipping ? incoming : display}</span>
      </div>
      {/* metade de baixo estática — segura o antigo até ser coberta */}
      <div className="flip-half flip-bottom">
        <span>{display}</span>
      </div>
      {/* aba de cima — o antigo tombando pra frente */}
      <div className={"flip-flap flip-flap-top" + (flipping ? " anim" : "")}>
        <span>{display}</span>
      </div>
      {/* aba de baixo — o novo caindo no lugar */}
      {flipping && (
        <div className="flip-flap flip-flap-bottom anim">
          <span>{incoming}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** Relógio flip estilo Fliqlo — mostra a hora atual (HH:MM) com AM/PM. */
export function FlipFocusClock({ dim }: { dim?: boolean }) {
  const now = useNow();
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const HH = String(h).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");

  return (
    <div
      className="flip-clock"
      style={{ opacity: dim ? 0.4 : 1, transition: "opacity 300ms ease" }}
    >
      <FlipCard value={HH}>
        <span className="flip-ampm">{ampm}</span>
      </FlipCard>
      <FlipCard value={MM} />
    </div>
  );
}
