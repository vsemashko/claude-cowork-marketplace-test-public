#!/usr/bin/env -S mise exec deno@latest -- deno run -A

async function resolveMisePath(): Promise<string> {
  const configuredPath = Deno.env.get('SA_MISE_RESOLVED_PATH')
  if (configuredPath) {
    return configuredPath
  }

  const command = await new Deno.Command('sh', {
    args: ['-lc', 'command -v mise'],
    stdout: 'piped',
    stderr: 'null',
  }).output()

  return new TextDecoder().decode(command.stdout).trim()
}

const miseVersion = await new Deno.Command('mise', {
  args: ['--version'],
  stdout: 'piped',
}).output()

const miseStdout = new TextDecoder().decode(miseVersion.stdout).trim()

console.log('sample_name=sa-mise-forwarder-session-start')
console.log('plugin_name=sa-mise-forwarder')
console.log(
  `path_strategy=${Deno.env.get('SA_MISE_PATH_STRATEGY') ?? 'forwarder-shim'}`,
)
console.log(`resolved_mise_path=${await resolveMisePath()}`)
console.log(`mise_version=${miseStdout}`)
console.log(`deno_version=${Deno.version.deno}`)
