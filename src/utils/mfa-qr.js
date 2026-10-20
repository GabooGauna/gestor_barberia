// This only transports Supabase's existing image in an <img>; it never creates
// a QR matrix or encodes an otpauth URI as another QR.
export function mfaQrImageSource(qrCode) {
  if (typeof qrCode !== "string" || !qrCode) throw new Error("missing_mfa_qr");
  if (/^data:image\/(?:svg\+xml|png)[;,]/i.test(qrCode)) {
    const comma = qrCode.indexOf(",");
    if (comma < 0) throw new Error("invalid_mfa_qr");
    const payload = qrCode.slice(comma + 1);
    // auth-js prefixes the raw SVG without escaping URL fragments such as #.
    if (/^data:image\/svg\+xml[;,]/i.test(qrCode) && payload.trimStart().startsWith("<")) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(payload)}`;
    }
    // Already escaped or base64 data URLs must not be encoded again.
    return qrCode;
  }
  if (qrCode.trimStart().startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`;
  }
  throw new Error("invalid_mfa_qr");
}
