/**
 * GET /api/pix-status?id={transaction_id}
 *
 * @backend-specialist: Polling proxy para verificação de status de pagamento.
 * @security-auditor:   CORS restritivo, validação do parâmetro id, sem exposição
 *                      de dados internos da BRPix para o cliente.
 *
 * Resposta para o frontend: { status: 'pending'|'approved'|'paid', next_page? }
 */

const BRPIX_API_URL = 'https://api.brpixdigital.com/functions/v1/transactions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBasicAuth() {
    const id = process.env.BRPIX_COMPANY_ID;
    const key = process.env.BRPIX_SECRET_KEY;
    if (!id || !key) throw new Error('ENV_NOT_CONFIGURED');
    return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64');
}

function corsHeaders(req) {
    const origin = req.headers?.origin || '';
    const allowed = process.env.ALLOWED_ORIGIN || '*';
    const allowOrigin = allowed === '*' || origin === allowed ? origin || '*' : '';
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };
}

// Mapeia status internos da BRPix para o contrato do frontend
function normalizeStatus(brPixStatus) {
    const map = {
        'paid': 'paid',
        'approved': 'approved',
        'complete': 'paid',
        'settled': 'paid',
        'pending': 'pending',
        'waiting_payment': 'pending',
        'waiting': 'pending',
        'expired': 'expired',
        'canceled': 'expired',
    };
    return map[String(brPixStatus).toLowerCase()] ?? 'pending';
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const headers = corsHeaders(req);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // ── Validação do parâmetro id ─────────────────────────────────────────────
    const { id } = req.query ?? {};

    if (!id || typeof id !== 'string' || !/^[\w\-]{4,128}$/.test(id)) {
        return res.status(400).json({ error: 'Parâmetro id inválido.' });
    }

    // ── Credenciais ───────────────────────────────────────────────────────────
    let authorization;
    try {
        authorization = buildBasicAuth();
    } catch {
        console.error('[pix-status] Variáveis de ambiente BRPIX não configuradas.');
        return res.status(503).json({ error: 'Serviço temporariamente indisponível.' });
    }

    // ── Consulta à BRPix Digital ──────────────────────────────────────────────
    let brPixRes;
    try {
        brPixRes = await fetch(`${BRPIX_API_URL}/${encodeURIComponent(id)}`, {
            method: 'GET',
            headers: {
                'Authorization': authorization,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(8_000),
        });
    } catch (err) {
        console.error('[pix-status] Falha na consulta à BRPix:', err.message);
        return res.status(502).json({ error: 'Falha na verificação de pagamento.' });
    }

    if (!brPixRes.ok) {
        // Transação não encontrada ou erro da BRPix — retorna pending para o frontend tentar de novo
        console.warn('[pix-status] BRPix respondeu com status:', brPixRes.status, 'para id:', id);
        return res.status(200).json({ status: 'pending' });
    }

    let data;
    try {
        data = await brPixRes.json();
    } catch {
        return res.status(200).json({ status: 'pending' });
    }

    const status = normalizeStatus(data?.status);
    // next_page pode vir do metadata da transação (configurável na BRPix)
    const nextPage = data?.metadata?.next_page ?? null;

    const responseBody = { status };
    if ((status === 'approved' || status === 'paid') && nextPage) {
        responseBody.next_page = nextPage;
    }

    return res.status(200).json(responseBody);
}
