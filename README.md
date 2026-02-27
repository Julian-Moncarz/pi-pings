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
- Scripts should **loop internally** if they want to keep running
- Delete the script file → process is killed
- Modify the script file → process is killed and restarted

## Use cases

**Slack listener** — ping me when someone DMs me:
```bash
#!/bin/bash
while true; do
  slack-cli listen --channel C0123 --once
done
```

**Build watcher** — ping me when build output changes:
```bash
#!/bin/bash
while true; do
  fswatch -1 ./dist/
  echo "build finished"
done
```

**Periodic check** — remind me every 5 minutes:
```bash
#!/bin/bash
while true; do
  sleep 300
  echo "check your tasks"
done
```

**One-shot** — ping me when a specific thing happens, then stop:
```bash
#!/bin/bash
tail -f /tmp/build.log | grep -m1 "DONE"
```

## License

MIT
