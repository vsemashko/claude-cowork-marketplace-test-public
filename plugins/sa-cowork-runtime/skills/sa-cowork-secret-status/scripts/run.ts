import { formatSecretStatus } from '../../../shared/cowork-secret-store.ts'

if (import.meta.main) {
  console.log(await formatSecretStatus({ env: Deno.env.toObject(), now: new Date() }))
}
