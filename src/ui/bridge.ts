/**
 * Host bridge, protocol "pepe-game/1".
 *
 * Inbound (from window.parent only):
 *   { protocol: "pepe-game/1", type: "init",   channel: string }
 *   { protocol: "pepe-game/1", type: "pause",  channel }   // must match init channel
 *   { protocol: "pepe-game/1", type: "resume", channel }
 * Outbound (to window.parent, targetOrigin "*" because a sandboxed frame has an opaque origin):
 *   { protocol: "pepe-game/1", type: "ready",    channel }
 *   { protocol: "pepe-game/1", type: "gameover", channel, score }   // once per completed match
 *
 * The game never reads the parent's DOM and works standalone when no init arrives.
 */
export const PROTOCOL = 'pepe-game/1';

export interface BridgeHandlers { pause(): void; resume(): void }

export class Bridge {
  channel: string | null = null;
  private embedded: boolean;
  constructor(private h: BridgeHandlers) {
    let embedded = false;
    try { embedded = window.parent !== window; } catch { embedded = true; }
    this.embedded = embedded;
    if (embedded) window.addEventListener('message', this.onMessage);
  }

  private onMessage = (e: MessageEvent) => {
    if (e.source !== window.parent) return;
    const d = e.data as { protocol?: unknown; type?: unknown; channel?: unknown } | null;
    if (!d || typeof d !== 'object' || d.protocol !== PROTOCOL) return;
    if (d.type === 'init') {
      if (typeof d.channel !== 'string' || !d.channel) return;
      this.channel = d.channel;
      this.post({ type: 'ready', channel: this.channel });
      return;
    }
    if (this.channel === null || d.channel !== this.channel) return;
    if (d.type === 'pause') this.h.pause();
    else if (d.type === 'resume') this.h.resume();
  };

  private post(msg: Record<string, unknown>) {
    if (!this.embedded) return;
    try { window.parent.postMessage({ protocol: PROTOCOL, ...msg }, '*'); } catch { /* host gone */ }
  }

  /** Report Player 1's final score for a completed match. */
  gameOver(score: number) {
    if (this.channel === null) return;
    this.post({ type: 'gameover', channel: this.channel, score: Math.max(0, Math.floor(score)) });
  }
}
