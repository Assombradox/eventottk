/**
 * GET /api/status?id={transaction_id}
 *
 * @backend-specialist: Endpoint de polling ultra-leve para verificação de status.
 * @database-architect: Lê do Vercel KV (Upstash Redis) — operação O(1), sub-5ms.
 *
 * Este endpoint é o mais crítico em termos de volume (múltiplas requisições
 * simultâneas por usuário). Projetado para ser o mais leve possível:
 * - Apenas uma leitura de KV
 * - Zero lógica de negócio pesada
 * - Cache-Control: no-store (polling em tempo real)
 */

import { kv } from '@vercel/kv';

// Rota padrão de upsell após pagamento confirmado
const DEFAULT_NEXT_PAGE = 'obrigado';

export default async function handler(req, res) {
    // Security headers mínimos
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // ── Validação do parâmetro id ───────────────────────────────────────────────
    const { id } = req.query ?? {};

    if (!id || typeof id !== 'string' || !/^[\w\-]{4,128}$/.test(id)) {
        return res.status(400).json({ error: 'Parâmetro id inválido.' });
    }

    // ── Leitura do KV — operação principal ────────────────────────────────────
    let storedStatus;
    try {
        storedStatus = await kv.get(id);
    } catch (err) {
        // KV indisponível: retorna pending para o frontend tentar novamente
        console.error('[status] Falha ao consultar KV:', err.message);
        return res.status(200).json({ status: 'pending' });
    }

    // ── Resposta ───────────────────────────────────────────────────────────────
    if (storedStatus === 'paid') {
        return res.status(200).json({
            status: 'paid',
            next_page: DEFAULT_NEXT_PAGE,
        });
    }

    // Qualquer outro valor (pending, null, undefined) → pending
    return res.status(200).json({ status: 'pending' });
}
