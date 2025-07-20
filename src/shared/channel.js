export const serverChannel = ({
  sendLastOnConnect = true,
  onConnect = null,
  onDisconnect = null,
} = {}) => {
  const listeners = new Set();
  const listenersById = new Map();
  let lastMessage;

  let channelId = 0;

  const send = (o) => {
    const json = JSON.stringify(o);
    listeners.forEach((response) => {
      response.write(`data: ${json}\n\n`);
    });
    lastMessage = o;
  };

  const handler = (request, response) => {
    console.log("[channel] new client");
    listeners.add(response);

    const id = ++channelId;
    listenersById.set(id, response);

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    response.write("retry: 5000\n\n");

    if (onConnect) {
      onConnect(id, (o) => response.write(`data: ${JSON.stringify(o)}\n\n`));
    }

    if (lastMessage && sendLastOnConnect) {
      response.write(`data: ${JSON.stringify(lastMessage)}\n\n`);
    }

    response.on("close", () => {
      console.log("[channel] closing");
      listeners.delete(response);
      listenersById.delete(id);
      if (onDisconnect) {
        onDisconnect(id);
      }
    });
  };

  return [handler, send];
};

export const clientChannel = (url, cb, { withCredentials = false } = {}) => {
  let source;

  const connect = () => {
    source = new EventSource(url, { withCredentials });

    source.addEventListener("message", (e) => {
      cb(JSON.parse(e.data));
    });

    source.addEventListener("error", (e) => {
      console.log("[live] connection closed");
    });
  };

  connect();

  return () => {
    console.log("[channel] closing source");
    source.close();
  };
};
