const YOOKASSA_CIDRS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.154.128/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
];

const YOOKASSA_IPV6_PREFIX = '2a02:5180:';

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n;
}

function ipInCidr(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : ((-1 << (32 - bits)) >>> 0);
  return (ipInt & mask) === (rangeInt & mask);
}

export function isYookassaIp(ip) {
  if (!ip) return false;
  const clean = ip.replace(/^::ffff:/i, '');
  if (clean.toLowerCase().startsWith(YOOKASSA_IPV6_PREFIX)) return true;
  return YOOKASSA_CIDRS.some((cidr) => ipInCidr(clean, cidr));
}

export function extractRequestIp(req) {
  const fwd = req.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '';
}
