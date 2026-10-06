// Únicamente los metadatos administrados por el servidor conceden este rol.
export function hasAdminRole(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return Boolean(user && (user.app_metadata?.is_admin === true || user.app_metadata?.role === 'admin'));
}
