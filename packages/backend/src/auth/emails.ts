/**
 * Envío de mails transaccionales. En producción va por Resend; en desarrollo
 * se loguea el link a la consola para poder seguir el flujo sin API key.
 *
 * TODO(resend): reemplazar por el SDK de Resend cuando haya API key.
 */
interface Mail {
  para: string;
  asunto: string;
  cuerpo: string;
}

async function enviar({ para, asunto, cuerpo }: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`\n[mail simulado] a: ${para}\n  asunto: ${asunto}\n  ${cuerpo}\n`);
    return;
  }
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "ERP PyME <onboarding@resend.dev>",
      to: para,
      subject: asunto,
      text: cuerpo,
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`Resend rechazó el envío: ${respuesta.status}`);
  }
}

function urlFrontend(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:5173";
}

export async function enviarInvitacion(datos: {
  email: string;
  organizacion: string;
  invitadoPor: string;
  invitacionId: string;
}): Promise<void> {
  const link = `${urlFrontend()}/aceptar-invitacion/${datos.invitacionId}`;
  await enviar({
    para: datos.email,
    asunto: `Te invitaron a ${datos.organizacion} en ERP PyME`,
    cuerpo: `${datos.invitadoPor} te invitó a trabajar en ${datos.organizacion}.\n\nAceptá la invitación y definí tu contraseña acá:\n${link}`,
  });
}

export async function enviarMagicLink(datos: { email: string; url: string }): Promise<void> {
  await enviar({
    para: datos.email,
    asunto: "Tu acceso a la Vista Consolidada",
    cuerpo: `Entrá con este enlace:\n${datos.url}\n\nSi no lo pediste, ignorá este mensaje.`,
  });
}

export async function enviarRecuperacion(datos: { email: string; url: string }): Promise<void> {
  await enviar({
    para: datos.email,
    asunto: "Restablecer tu contraseña",
    cuerpo: `Para elegir una contraseña nueva, entrá acá:\n${datos.url}\n\nSi no lo pediste, ignorá este mensaje.`,
  });
}
