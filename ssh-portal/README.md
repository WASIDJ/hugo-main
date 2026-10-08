# mini-t / SSH WASM

A minimal browser SSH client connected to the real Mac mini. SSH authentication,
host verification and encryption run in Go WebAssembly; the Go gateway only
relays encrypted WebSocket bytes to the local OpenSSH server.

```sh
npm run ssh:build
npm run ssh:test
npm run ssh:deploy -- mini-t
```

The deploy command requires an already verified SSH alias and installs a user
LaunchAgent, a separate user CA authorization and a private Tailscale Serve
endpoint. No existing SSH private key is copied. Runtime configuration, CA and
built assets stay outside Git and GitHub Pages.

See [usage, architecture, verification and rollback](../docs/mac-mini-terminal-plan.md).
