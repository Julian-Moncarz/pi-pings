# pi-pings

A [pi](https://github.com/badlogic/pi-mono) extension. Agents write executable scripts to `pings/` — each script's stdout lines get injected into the agent's conversation via `followUp()`.

## Install

```bash
cp pings.ts ~/.pi/agent/extensions/pings.ts
# or: pi -e ./pings.ts
```

## How it works

- Executable scripts in `pings/` are auto-spawned as background processes
- Each stdout line → `[PING:scriptname] line` injected as a user message
- Exit 0 → restart (loop pattern). Exit non-0 → don't restart (broken).
- Delete script → kill process. Modify → restart.

## Use cases

**Slack listener** — ping me when someone DMs me:
```bash
#!/bin/bash
slack-cli listen --channel C0123 --once
```

**Build watcher** — ping me when build output changes:
```bash
#!/bin/bash
fswatch -1 ./dist/
echo "build finished"
```

**Periodic check** — remind me every 5 minutes:
```bash
#!/bin/bash
sleep 300
echo "check your tasks"
```

**Long command** — ping me when a background job finishes:
```bash
#!/bin/bash
tail -f /tmp/build.log | grep -m1 "DONE"
```

**Another agent** — receive inter-agent messages:
```bash
#!/bin/bash
inotifywait -e create /tmp/agent-inbox/ 2>/dev/null && cat /tmp/agent-inbox/*.msg && rm /tmp/agent-inbox/*.msg
```

## License

MIT
