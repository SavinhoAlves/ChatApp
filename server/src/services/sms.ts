import { config } from '../config.js';

/** Envia o código de ativação por SMS. Em desenvolvimento ('console') só registra no log. */
export async function sendSms(phone: string, text: string) {
  if (config.sms.provider === 'console') {
    console.log(`[sms:dev] para ${phone}: ${text}`);
    return;
  }

  if (config.sms.provider === 'smsgate') {
    // O app SMS Gate no seu Android recebe o pedido pela nuvem e envia o SMS pelo chip do aparelho.
    const { smsgateUrl, smsgateUser, smsgatePass } = config.sms;
    const res = await fetch(`${smsgateUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${smsgateUser}:${smsgatePass}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [phone] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error('Falha ao enviar SMS (SMS Gate):', res.status, await res.text().catch(() => ''));
      throw new Error('sms_failed');
    }
    return;
  }

  const { twilioSid, twilioToken, twilioFrom } = config.sms;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: twilioFrom!, Body: text }),
  });
  if (!res.ok) {
    console.error('Falha ao enviar SMS:', res.status, await res.text().catch(() => ''));
    throw new Error('sms_failed');
  }
}

/**
 * Liga para o número e dita o código (fixo, 0800 e 400x não recebem SMS). Com Twilio, a ligação lê
 * os dígitos devagar e repete. Em desenvolvimento ('console') só registra no log.
 */
export async function sendVoiceCode(phone: string, code: string) {
  if (config.sms.provider === 'console') {
    console.log(`[ligação:dev] para ${phone}: código ${code}`);
    return;
  }

  const spoken = code.split('').join(', ');
  const say = `Olá! Seu código do Zynko é: ${spoken}. Repetindo: ${spoken}.`;
  const twiml = `<Response><Pause length="1"/><Say language="pt-BR" voice="Polly.Camila">${say}</Say><Pause length="1"/><Say language="pt-BR" voice="Polly.Camila">${say}</Say></Response>`;

  const { twilioSid, twilioToken, twilioFrom } = config.sms;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: twilioFrom!, Twiml: twiml }),
  });
  if (!res.ok) {
    console.error('Falha ao ligar com o código:', res.status, await res.text().catch(() => ''));
    throw new Error('call_failed');
  }
}

/**
 * Modo 'whatsapp-admin': o código vai para o WhatsApp do administrador pelo CallMeBot (grátis, uso pessoal),
 * e ele repassa à pessoa. Serve para poucos cadastros sem precisar de SMS.
 */
export async function sendAdminCode(phone: string, code: string) {
  const { callmebotPhone, callmebotApiKey } = config.sms;
  const text = `*Zynko* — código de ativação para ${phone}: *${code}*`;
  const url = `https://api.callmebot.com/whatsapp.php?${new URLSearchParams({ phone: callmebotPhone!, text, apikey: callmebotApiKey! })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  // O CallMeBot às vezes responde 200 com o erro no corpo (ex.: apikey inválida).
  const body = await res.text().catch(() => '');
  if (!res.ok || /invalid|error|not allowed/i.test(body)) {
    console.error('Falha ao enviar código pelo WhatsApp (CallMeBot):', res.status, body.replace(/<[^>]+>/g, ' ').trim().slice(0, 300));
    throw new Error('whatsapp_failed');
  }
}
