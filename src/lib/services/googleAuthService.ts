/**
 * Google Auth Service — stub
 * Full implementation pending Google OAuth integration.
 */

export async function initiateGoogleAuth(_scopes: string[]): Promise<void> {
  throw new Error('Google Auth not yet configured');
}

export async function handleGoogleCallback(_code: string): Promise<{ accessToken: string; refreshToken: string }> {
  throw new Error('Google Auth not yet configured');
}

export async function revokeGoogleAccess(): Promise<void> {
  throw new Error('Google Auth not yet configured');
}
