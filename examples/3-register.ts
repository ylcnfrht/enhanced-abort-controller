// Run cleanup when a signal aborts, and stop listening once the work is done.
import { EnhancedAbortController, register } from '@ylcnfrht/enhanced-abort-controller';

class Connection {
  closed = false;
  close(reason: unknown) {
    this.closed = true;
    console.log('connection closed:', reason);
  }
}

async function main() {
  const controller = new EnhancedAbortController();

  // The controller's own signal has register() and whenAborted built in.
  const conn = new Connection();
  controller.signal.register((reason) => conn.close(reason));

  // Any AbortSignal works with the standalone register(); `using` unregisters at the end of the block.
  {
    using _watch = register(controller.signal, () => console.log('never printed: unregistered before the abort'));
  }

  setTimeout(() => controller.abort('shutting down'), 10);
  console.log('aborted with:', await controller.signal.whenAborted);
  console.log('closed?', conn.closed);
}

await main();
