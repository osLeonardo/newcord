import type { FastifyInstance } from "fastify";
import type {
  LiveSocket,
  LiveSocketOpener,
} from "../../src/main/session/live-socket";

const ABNORMAL_CLOSURE = 1006;

/** Opens live sockets to the in-process server's `/ws` through `injectWS`, without a network port. */
export function createInjectedSocketOpener(
  app: FastifyInstance,
): LiveSocketOpener {
  return (listener): LiveSocket => {
    let closeRequested = false;
    const connected = app.injectWS(
      "/ws",
      {},
      {
        onInit: (client) => {
          client.on("message", (data, isBinary) => {
            if (!isBinary && Buffer.isBuffer(data)) {
              listener.received(data.toString("utf8"));
            }
          });
          client.on("close", (code) => listener.closed(code));
        },
      },
    );
    connected.then(
      (client) => {
        if (closeRequested) client.close();
        else listener.opened();
      },
      () => listener.closed(ABNORMAL_CLOSURE),
    );
    return {
      send: (text): void => {
        void connected.then((client) => client.send(text));
      },
      close: (): void => {
        closeRequested = true;
        void connected.then((client) => client.close());
      },
    };
  };
}
