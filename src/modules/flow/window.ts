/**
 * Transforma a janela principal do Dash na "companheira" flutuante do modo Fluxo
 * (sem bordas, sempre no topo, pequena, num canto) e a restaura no fim.
 * Tudo protegido por try/catch — fora do Tauri (navegador) vira no-op.
 */

const COMPANION_W = 360;
const COMPANION_H = 156;

export async function enterCompanion(): Promise<void> {
  try {
    const { getCurrentWindow, currentMonitor, LogicalSize, LogicalPosition } = await import(
      "@tauri-apps/api/window"
    );
    const w = getCurrentWindow();
    await w.setResizable(true);
    await w.setDecorations(false);
    await w.setAlwaysOnTop(true);
    await w.setSkipTaskbar(true);
    await w.setSize(new LogicalSize(COMPANION_W, COMPANION_H));

    // canto inferior direito, acima da barra de tarefas
    let x = 40;
    let y = 40;
    try {
      const mon = await currentMonitor();
      if (mon) {
        const sf = mon.scaleFactor || 1;
        const sw = mon.size.width / sf;
        const sh = mon.size.height / sf;
        x = Math.max(8, sw - COMPANION_W - 24);
        y = Math.max(8, sh - COMPANION_H - 64);
      }
    } catch {
      /* sem info de monitor — usa canto padrão */
    }
    await w.setPosition(new LogicalPosition(x, y));
    await w.setResizable(false);
  } catch {
    /* fora do Tauri */
  }
}

export async function exitCompanion(): Promise<void> {
  try {
    const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.setAlwaysOnTop(false);
    await w.setSkipTaskbar(false);
    await w.setResizable(true);
    await w.setDecorations(true);
    await w.setSize(new LogicalSize(1200, 820));
    await w.center();
    await w.setFocus();
  } catch {
    /* fora do Tauri */
  }
}
