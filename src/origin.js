export function requestOrigin(request) {
  const forwarded = String(request.headers.forwarded || '').split(',')[0];
  const forwardedValues = Object.fromEntries(forwarded.split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key?.toLowerCase(), rest.join('=').replace(/^"|"$/g, '')];
  }).filter(([key, value]) => key && value));
  const protocol = forwardedValues.proto || String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (request.socket?.encrypted ? 'https' : 'http');
  const host = forwardedValues.host || String(request.headers['x-forwarded-host'] || '').split(',')[0].trim() || request.headers.host;
  if (!host || !['http', 'https'].includes(protocol) || /[\s/\\]/.test(host)) throw new Error('Invalid request origin');
  return `${protocol}://${host}`;
}
