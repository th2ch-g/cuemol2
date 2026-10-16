/** @file mcp.test.ts @description Exercise the stdio bridge against a real HTTP MCP server. */
import { afterEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { serveMcp } from './mcp'

const cleanups: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

it('forwards initialization, tools and errors, and releases the HTTP client on EOF', async () => {
  const upstream = new Server({ name: 'test-app', version: '1' }, {
    capabilities: { tools: {} }, instructions: 'Inspect the scene before editing.',
  })
  upstream.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'echo', inputSchema: { type: 'object' as const } }],
  }))
  upstream.setRequestHandler(CallToolRequestSchema, async (request) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(request.params.arguments ?? {}) }],
    isError: request.params.name === 'fail',
  }))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'test-session', enableJsonResponse: true })
  await upstream.connect(transport)
  const http = createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(401).end(); return }
    void transport.handleRequest(req, res)
  })
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  cleanups.push(async () => {
    await upstream.close()
    http.closeAllConnections()
    await new Promise<void>((resolve) => http.close(() => resolve()))
  })
  const input = new PassThrough()
  const output = new PassThrough()
  const replies = new Map<number, (value: any) => void>()
  let buffer = ''
  output.on('data', (chunk) => {
    buffer += String(chunk)
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      replies.get(message.id)?.(message)
    }
  })
  const done = serveMcp({ port: (http.address() as { port: number }).port, token: 'test-token', pid: process.pid, endpoints: ['mcp'] }, '2.4.0.546', input, output)
  cleanups.push(async () => { input.end(); await done })
  const request = (id: number, method: string, params: object = {}) => new Promise<any>((resolve) => {
    replies.set(id, resolve)
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  const init = await request(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  expect(init.result.instructions).toBe('Inspect the scene before editing.')
  input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  expect((await request(2, 'tools/list')).result.tools[0].name).toBe('echo')
  expect((await request(3, 'tools/call', { name: 'echo', arguments: { value: 7 } })).result.content[0].text).toBe('{"value":7}')
  expect((await request(4, 'tools/call', { name: 'fail' })).result.isError).toBe(true)
  input.end()
  await done
  expect(buffer).toBe('')
})
