#!/usr/bin/env -S mise exec deno@latest -- deno run -A

async function resolveMisePath(): Promise<string> {
  const command = await new Deno.Command('sh', {
    args: ['-lc', 'command -v mise'],
    stdout: 'piped',
    stderr: 'null',
  }).output()

  return new TextDecoder().decode(command.stdout).trim()
}

const randomValue = crypto.getRandomValues(new Uint32Array(1))[0]
const miseVersion = await new Deno.Command('mise', {
  args: ['--version'],
  stdout: 'piped',
}).output()

const miseStdout = new TextDecoder().decode(miseVersion.stdout).trim()

console.log('sample_name=sa-mise-cross-plugin-session-start')
console.log('plugin_name=sa-mise-cross-plugin')
console.log(`random_value=${randomValue}`)
console.log(`resolved_mise_path=${await resolveMisePath()}`)
console.log(`mise_version=${miseStdout}`)
console.log(`deno_version=${Deno.version.deno}`)
