/**
 * @file mcp.ts
 * @description Bridge MCP stdio to the app's authenticated HTTP endpoint.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { LocalApiInfoFile } from '@cuemol/console-kit'
import type { Readable, Writable } from 'node:stream'

/** Serve tools until stdin closes. Only MCP messages are written to stdout. */
export async function serveMcp(
  info: LocalApiInfoFile,
  version: string,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const client = new Client({ name: 'cuemol-stdio', version })
  const upstream = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${info.port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${info.token}` } },
  })
  await client.connect(upstream)
  const server = new Server({ name: 'cuemol', version }, {
    capabilities: { tools: {} },
    instructions: client.getInstructions(),
  })
  server.setRequestHandler(ListToolsRequestSchema, (request, extra) =>
    client.listTools(request.params, { signal: extra.signal }),
  )
  server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
    client.callTool(request.params, undefined, { signal: extra.signal, timeout: 30 * 60 * 1000 }),
  )
  try {
    await new Promise<void>((resolve, reject) => {
      let closing = false
      const close = () => {
        if (closing) return
        closing = true
        input.off('end', close)
        process.off('SIGINT', close)
        process.off('SIGTERM', close)
        void server.close().then(resolve, reject)
      }
      input.once('end', close)
      process.once('SIGINT', close)
      process.once('SIGTERM', close)
      server.onclose = close
      void server.connect(new StdioServerTransport(input, output)).catch((error) => {
        close()
        reject(error)
      })
    })
  } finally {
    await client.close()
  }
}
