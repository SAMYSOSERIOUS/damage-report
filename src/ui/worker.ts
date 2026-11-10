import { Session } from './engine';

let session: Session | null = null;

self.onmessage = (e: MessageEvent<{ id: number; type: string; [k: string]: unknown }>) => {
  const { id, type } = e.data;
  try {
    if (type === 'analyze') {
      session = new Session(e.data.name as string, e.data.bytes as Uint8Array);
      self.postMessage({ id, ok: true, result: session.analyze() });
    } else if (!session) {
      throw new Error('No file is loaded.');
    } else if (type === 'prepare') {
      self.postMessage({ id, ok: true, result: session.prepare(e.data.settings as never) });
    } else if (type === 'export') {
      self.postMessage({ id, ok: true, result: session.export(e.data.kind as never, e.data.decisions as never) });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
