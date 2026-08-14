import { spawn } from 'node:child_process'
import readline from 'node:readline'

function pipeWithPrefix(stream, prefix) {
  if (!stream) return
  const rl = readline.createInterface({ input: stream })
  rl.on('line', (line) => {
    console.log(`${prefix}${line}`)
  })
}

export function startManagedDsh(command) {
  if (!command) return null

  const child = spawn(command, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  pipeWithPrefix(child.stdout, '[remote-gateway:dsh] ')
  pipeWithPrefix(child.stderr, '[remote-gateway:dsh] ')

  child.on('exit', (code, signal) => {
    console.log(`[remote-gateway] managed dsh exited (code=${String(code)}, signal=${String(signal)})`)
  })

  return {
    async close() {
      if (child.killed || child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 5_000)
        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    },
  }
}
