/** Resolve the shared configuration directory without depending on Node APIs. */
export function configDirectory(home: string, env: Record<string, string | undefined>): string {
  return env.CUEMOL_CONFIG_DIR || `${env.XDG_CONFIG_HOME || `${home}/.config`}/cuemol`
}
