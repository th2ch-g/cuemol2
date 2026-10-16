/** Whether this process hosts a CLI/MCP session without visible windows. */
export function isHeadless(): boolean {
  return process.env.CUEMOL_HEADLESS === '1'
}
