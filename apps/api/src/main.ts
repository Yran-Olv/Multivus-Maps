import { buildApp } from './app'
import { readConfig } from './config'

const config = readConfig()
const app = await buildApp(config)
await app.listen({ port: config.port, host: config.host })
