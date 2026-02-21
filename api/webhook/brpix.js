/**
 * POST /api/webhook/brpix
 *
 * @backend-specialist: Listener de webhook assíncrono da BRPix Digital.
 * @database-architect: Persiste status no Vercel KV (Upstash Redis) com TTL 24h.
 *
 * Regra crítica: responder 200 ANTES de qualquer processamento pesado
 * para evitar retries desnecessários da BRPix (timeout ~5s).
 *
 * Idempotência: kv.set sobrescreve o mesmo valor sem efeitos colaterais.
 */

import { kv } from '@vercel/kv';

// TTL das chaves no KV: 24 horas em segundos
const KV_TTL_SECONDS = 86_400;

// Status que consideramos como "pagamento confirmado"
const PAID_STATUSES = new Set(['paid', 'approved', 'complete', 'settled']);

export default async function handler(req, res) {
    // ── Responder 200 IMEDIATAMENTE para satisfazer o timeout da BRPix ─────────
    // O processamento ocorre em background após o response ser enviado.
    res.status(200).json({ received: true });

    // A partir daqui, Vercel mantém a função viva até o event loop esvaziar.
    // Usamos setImmediate para garantir que o response seja enviado primeiro.
    setImmediate(async () => {
        if (req.method !== 'POST') return;

        try {
            const body = req.body ?? {};

            // Suporte a payloads aninhados: { data: { id, status } } ou { id, status }
            const payload = body?.data ?? body;
            const id = String(payload?.id ?? '').trim();
            const status = String(payload?.status ?? '').toLowerCase().trim();

            if (!id || !status) {
                console.warn('[webhook/brpix] Payload sem id ou status:', JSON.stringify(body));
                return;
            }

            // Apenas persiste status de pagamento confirmado ou pending — ignora outros
            if (PAID_STATUSES.has(status)) {
                // Idempotente: sobrescrever 'paid' com 'paid' não causa efeitos colaterais
                await kv.set(id, 'paid', { ex: KV_TTL_SECONDS });
                console.log(`[webhook/brpix] Transação ${id} marcada como paid no KV.`);
            } else {
                // Qualquer outro status (pending, waiting, etc.) — ignora se já existe
                // para não sobrescrever um 'paid' já registrado (garantia de idempotência)
                const existing = await kv.get(id);
                if (existing === null) {
                    await kv.set(id, 'pending', { ex: KV_TTL_SECONDS });
                }
            }
        } catch (err) {
            // Não deixar exceções internas causarem novas requisições de retry
            console.error('[webhook/brpix] Erro ao processar evento:', err.message);
        }
    });
}
