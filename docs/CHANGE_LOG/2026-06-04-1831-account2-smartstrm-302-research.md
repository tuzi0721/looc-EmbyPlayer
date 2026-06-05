# 2026-06-04 18:31 - Account 2 `/smartstrm` 404: SmartStrm 302 direct-link setup (server-infra, not a client bug)

## Scope

- Research round only. No product code changed.
- Goal: find how other players handle account 2's custom `/smartstrm` stream endpoint (the user could not
  capture the request because the server specially blocks/obfuscates it).

## Finding

- Account 2's `DirectStreamUrl` path `/smartstrm` belongs to **SmartStrm**
  (https://github.com/Cp0204/SmartStrm): a STRM-file generator + **302 direct-link proxy** for
  Emby/Jellyfin/Plex. Media items are `.strm` files pointing to cloud direct links (Quark/115/etc.).
- The `/smartstrm` endpoint is SmartStrm's **302 proxy**: on playback it returns a `302` redirect to the
  cloud direct link so the player streams straight from the cloud (bypassing NAS bandwidth). SmartStrm docs
  note this "return 302 early" behavior is experimental and "compatibility is best with Emby clients".
- Account 2 also fronts everything with a Cloudflare Worker (`target: https://emby.pivkeyu.com:443`) that
  blocks browsers ("请使用EMBY客户端访问"), blocks bots/curl/JP, and rewrites upstream `302` `Location`
  headers to a self-proxied `/<encoded-url>` path.

## Why our client gets 404 (and why it's server-side)

- The standard way players handle SmartStrm is simply to **follow the `302`** to the cloud direct link.
  Our stream proxy already does this: reqwest follows redirects by default for both the Range probe and the
  actual stream fetch, and the local proxy serves the followed result to mpv.
- The `404` happens because account 2's Cloudflare Worker forwards to the **bare Emby** host
  (`emby.pivkeyu.com`), which bypasses the SmartStrm 302-proxy layer that actually serves `/smartstrm`. So
  `/smartstrm` (and the synthesized `/Videos/{id}/stream`) resolve against raw Emby and return `404` JSON.
- This is an account-2 infrastructure mismatch (two proxy layers not chained: the public Worker should point
  at SmartStrm's 302 proxy, not raw Emby), not a Hills Lite client defect.

## Conclusion / recommendation

- Client side: no change required for correctness — Hills Lite already follows `302` redirects to direct
  links and serves them with Range via its local proxy. (Account 1's standard Emby-behind-nginx case is
  fully fixed by the `/emby` + DirectStreamUrl probing committed earlier today.)
- Account 2: resolve on the server — point the public proxy at the SmartStrm 302 proxy endpoint (so
  `/smartstrm` is reachable), or have Emby advertise a DirectStreamUrl base that the public Worker actually
  serves.

## Next

- Optional client hardening (only if desired): when all stream candidates return `404`, surface a clearer
  "source endpoint not reachable (strm/302 proxy?)" diagnostic. Otherwise account 2 is a server-config item.
