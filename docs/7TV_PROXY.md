# 7TV proxy

7TV is not reachable from every network. The extension works without a proxy
using mirrors and published snapshots, but arbitrary 7TV set IDs need a mirror
that serves both the API and the CDN.

The extension accepts one HTTPS base URL in **Settings → Images**. It uses:

- `<base>/v3/...` for the 7TV API;
- `<base>/emote/...`, `<base>/avatars/...`, `<base>/badges/...` for images.

A Cloudflare Worker that forwards those paths is enough. It does not need
cookies or a database.

```js
const API = 'https://7tv.io';
const CDN = 'https://cdn.7tv.app';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    let target;
    if (incoming.pathname.startsWith('/v3/')) {
      target = new URL(incoming.pathname + incoming.search, API);
    } else if (
      incoming.pathname.startsWith('/emote/') ||
      incoming.pathname.startsWith('/avatars/') ||
      incoming.pathname.startsWith('/badges/')
    ) {
      target = new URL(incoming.pathname + incoming.search, CDN);
    } else {
      return new Response('Not found', { status: 404 });
    }

    const upstream = await fetch(target, {
      headers: { accept: request.headers.get('accept') ?? '*/*' },
    });
    const headers = new Headers(upstream.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=86400');
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
```

Deploy it, then paste `https://<worker>.<account>.workers.dev` into the
extension. A custom domain works too.

Notes:

- Only the emote API and image paths are forwarded. Do not turn this into an
  open proxy.
- The extension still applies byte limits, timeouts, URL validation and the
  emote cache.
- A proxy sees the requested 7TV paths and your IP address, like any network
  request. It does not receive chat text.
- Use **Retry providers** after changing the URL.
