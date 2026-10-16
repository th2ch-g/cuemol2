/** Startup command files read from the shared configuration directory. */
export interface StartupScript {
  name: string
  cwd: string
  text: string
  error?: string
}
