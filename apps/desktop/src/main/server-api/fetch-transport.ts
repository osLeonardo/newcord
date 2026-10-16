/** A POST to the server: its path, and a JSON body and an access token when the route needs them. */
export interface ServerPost {
  readonly path: string;
  readonly body?: object;
  readonly accessToken?: string;
}

/** The server's answer: its status, and its JSON body, or undefined when it is empty or not JSON. */
export interface ServerReply {
  readonly status: number;
  readonly body: unknown;
}

/** Sends requests to the server; rejects only when the server cannot be reached. */
export interface ServerTransport {
  post(request: ServerPost): Promise<ServerReply>;
}

export interface FetchInit {
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly redirect: "error";
}

export interface FetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

/** The part of the Fetch API the transport uses; the global `fetch` fits it. */
export type FetchFunction = (
  url: string,
  init: FetchInit,
) => Promise<FetchResponse>;

/**
 * Sends the app's requests with `fetch` to the server address built into this build (D65).
 * @example const transport = createFetchTransport(builtInServerAddress, fetch);
 */
export function createFetchTransport(
  serverAddress: string,
  fetchFunction: FetchFunction,
): ServerTransport {
  return {
    post: async (request: ServerPost): Promise<ServerReply> => {
      const response = await fetchFunction(
        new URL(request.path, serverAddress).href,
        fetchInitFor(request),
      );
      return {
        status: response.status,
        body: jsonOrUndefined(await response.text()),
      };
    },
  };
}

function fetchInitFor(request: ServerPost): FetchInit {
  // POST /logout refuses a JSON content type with an empty body, so both go only with a body.
  const headers: Record<string, string> = {};
  if (request.body !== undefined) headers["content-type"] = "application/json";
  if (request.accessToken !== undefined) {
    headers["authorization"] = `Bearer ${request.accessToken}`;
  }
  return {
    method: "POST",
    headers,
    redirect: "error",
    ...(request.body === undefined
      ? {}
      : { body: JSON.stringify(request.body) }),
  };
}

function jsonOrUndefined(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // A proxy's error page, for example; the caller treats a missing body as an unexpected reply.
    return undefined;
  }
}
