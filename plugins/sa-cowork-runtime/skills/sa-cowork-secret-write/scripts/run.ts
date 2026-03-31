import { writePersistedSecret } from '../../../shared/cowork-secret-store.ts'

if (import.meta.main) {
  const [secret] = Deno.args
  if (!secret) {
    throw new Error('Usage: run.ts <secret>')
  }

  console.log(await writePersistedSecret(secret, { env: Deno.env.toObject(), now: new Date() }))
}
