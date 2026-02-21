/**
 * POST /api/pix-create
 *
 * @backend-specialist: Proxy Serverless para criação de cobranças PIX.
 * @security-auditor:   Credenciais via env vars, amount fixado no servidor,
 *                      CORS restritivo, validação de entrada, fail-secure.
 * @database-architect: Persiste status 'pending' no Vercel KV após criação.
 *
 * Payload esperado do frontend: { name, cpf, offer_id }
 * Resposta para o frontend:     { id, qrcodeText, qrcode }
 */

import { kv } from '@vercel/kv';

const BRPIX_API_URL = 'https://api.brpixdigital.com/functions/v1/transactions';
const FIXED_AMOUNT = 3400;    // R$ 34,00 em centavos — nunca aceitar do cliente
const PIX_EXPIRES_IN_SECONDS = 3600; // 1 hora
const KV_TTL_SECONDS = 86_400;  // 24 horas

// ─── Validação de entrada ─────────────────────────────────────────────────────

function sanitizeCpf(raw) {
    return String(raw || '').replace(/\D/g, '');
}

function isValidCpf(cpf) {
    if (cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
    let rem = (sum * 10) % 11;
    if (rem === 10 || rem === 11) rem = 0;
    if (rem !== parseInt(cpf[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
    rem = (sum * 10) % 11;
    if (rem === 10 || rem === 11) rem = 0;
    return rem === parseInt(cpf[10]);
}

function isValidName(name) {
    return typeof name === 'string' && /^\p{L}{2,}(?: \p{L}{2,})+$/u.test(name.trim());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBasicAuth() {
    const id = process.env.BRPIX_COMPANY_ID;
    const key = process.env.BRPIX_SECRET_KEY;

    // Fail-secure: rejeitar se credenciais ausentes (não deixar requisição vazar)
    if (!id || !key) {
        throw new Error('ENV_NOT_CONFIGURED');
    }

    return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64');
}

function corsHeaders(req) {
    // Permitir apenas o próprio domínio (ou qualquer origem em dev)
    const origin = req.headers?.origin || '';
    const allowed = process.env.ALLOWED_ORIGIN || '*';
    const allowOrigin = allowed === '*' || origin === allowed ? origin || '*' : '';

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };
}

function jsonResponse(res, status, body) {
    res.status(status).json(body);
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const headers = corsHeaders(req);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

    // Preflight CORS
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return jsonResponse(res, 405, { error: 'Método não permitido.' });
    }

    // ── Validação das credenciais de backend ─────────────────────────────────
    let authorization;
    try {
        authorization = buildBasicAuth();
    } catch {
        // Não revelar ao cliente que as credenciais faltam
        console.error('[pix-create] Variáveis de ambiente BRPIX não configuradas.');
        return jsonResponse(res, 503, { error: 'Serviço temporariamente indisponível.' });
    }

    // ── Validação do corpo da requisição ─────────────────────────────────────
    const { name, cpf: rawCpf, offer_id } = req.body || {};
    const cpf = sanitizeCpf(rawCpf);

    if (!isValidName(name)) {
        return jsonResponse(res, 400, { error: 'Nome inválido. Informe nome e sobrenome.' });
    }

    if (!isValidCpf(cpf)) {
        return jsonResponse(res, 400, { error: 'CPF inválido.' });
    }

    if (!offer_id || typeof offer_id !== 'string' || offer_id.length > 64) {
        return jsonResponse(res, 400, { error: 'offer_id inválido.' });
    }

    // ── Construção do payload anti-fraude ────────────────────────────────────
    // E-mail dinâmico por CPF evita bloqueios por requisições repetidas com mesmo e-mail.
    // Telefone genérico preenche campo obrigatório da BRPix sem expor dados reais.
    const dynamicEmail = `${cpf}@checkout-verificado.com`;
    const genericPhone = '11999999999';

    // ─── postbackUrl: BRPix enviará o webhook para este endpoint ao confirmar pagamento
    const postbackUrl = process.env.ALLOWED_ORIGIN
        ? `${process.env.ALLOWED_ORIGIN}/api/webhook/brpix`
        : null;

    const brPixPayload = {
        amount: FIXED_AMOUNT,
        currency: 'BRL',
        description: 'Confirmação de Identidade',
        expires_in: PIX_EXPIRES_IN_SECONDS,
        ...(postbackUrl && { postback_url: postbackUrl }),
        customer: {
            name: name.trim(),
            email: dynamicEmail,
            phone: genericPhone,
            tax_id: cpf,
        },
        metadata: {
            offer_id,
        },
    };

    // ── Chamada para a BRPix Digital ─────────────────────────────────────────
    let brPixRes;
    try {
        brPixRes = await fetch(BRPIX_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': authorization,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(brPixPayload),
            signal: AbortSignal.timeout(10_000), // timeout de 10s
        });
    } catch (err) {
        console.error('[pix-create] Falha na chamada à BRPix:', err.message);
        return jsonResponse(res, 502, { error: 'Falha ao conectar com o serviço de pagamento. Tente novamente.' });
    }

    let brPixData;
    try {
        brPixData = await brPixRes.json();
    } catch {
        console.error('[pix-create] BRPix retornou resposta inválida. Status:', brPixRes.status);
        return jsonResponse(res, 502, { error: 'Resposta inválida do serviço de pagamento.' });
    }

    if (!brPixRes.ok) {
        // Logar detalhes internos, mas retornar mensagem genérica ao cliente
        console.error('[pix-create] BRPix recusou a transação:', JSON.stringify(brPixData));
        const friendlyMsg = brPixData?.message || 'Não foi possível gerar o PIX. Verifique seus dados.';
        return jsonResponse(res, 422, { error: friendlyMsg });
    }

    // ── Extrair e retornar apenas o necessário para o frontend ───────────────
    const { id, pix } = brPixData;

    if (!id || !pix?.qrcodeText) {
        console.error('[pix-create] Resposta BRPix sem campos esperados:', JSON.stringify(brPixData));
        return jsonResponse(res, 502, { error: 'PIX gerado sem código. Tente novamente.' });
    }

    // ── Persistir status inicial no KV ───────────────────────────────────────
    // O webhook atualizará de 'pending' → 'paid' quando o pagamento for confirmado.
    // Fire-and-forget: não bloqueia a resposta ao cliente se o KV falhar.
    kv.set(id, 'pending', { ex: KV_TTL_SECONDS }).catch((err) => {
        console.error('[pix-create] Falha ao salvar status no KV:', err.message);
    });

    return jsonResponse(res, 200, {
        id,
        qrcodeText: pix.qrcodeText,   // Pix Copia e Cola (camelCase — documentação BRPix)
        qrcode: pix.qrcode ?? null, // Link imagem do QR Code
    });
}
