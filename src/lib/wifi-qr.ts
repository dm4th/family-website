import QRCode from "qrcode";

/**
 * Wi-Fi QR codes (PRD 36).
 *
 * Both iOS and Android cameras join a network natively from the standard
 * `WIFI:` payload, which is the closest honest equivalent to a "connect"
 * button from a web page. The SVG is generated on the server and inlined, so
 * there is no client JS and no external fetch (the CSP allows neither).
 */

/**
 * Escape a value for the `WIFI:` payload grammar. Per the spec, backslash,
 * semicolon, comma, colon and double-quote are escaped with a backslash —
 * otherwise a password containing `;` silently truncates the payload and the
 * scan joins the wrong network (or fails).
 */
export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * Build the payload a camera reads. An empty password means an open network,
 * which the spec expresses as `T:nopass` with no `P:` field.
 */
export function buildWifiPayload({
  network,
  password,
}: {
  network: string;
  password?: string | null;
}): string {
  const ssid = escapeWifiValue(network);
  if (!password) {
    return `WIFI:T:nopass;S:${ssid};;`;
  }
  return `WIFI:T:WPA;S:${ssid};P:${escapeWifiValue(password)};;`;
}

/**
 * Render the payload as an inline SVG string.
 *
 * Colors are fixed black-on-white rather than themed: scanners need a light
 * quiet zone and dark modules, and a QR that only reads in one theme is worse
 * than one that looks slightly out of place in the other. The caller frames it
 * on a white card.
 */
export async function wifiQrSvg(payload: string): Promise<string | null> {
  try {
    return await QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    // A payload too large for any QR version is the only realistic failure.
    // The panel still shows the network and password; the code just isn't
    // worth blowing up the page over.
    return null;
  }
}
