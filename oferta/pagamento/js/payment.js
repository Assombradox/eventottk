(function () {
    const UID = '69adc95b77';
    let _paymentChecker = null;
    const searchString = window.location.search;
    const utms = Object.fromEntries(new URLSearchParams(searchString));
    const PARADISE_EVENT_ID = 'CKO-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100000);

    const showErrorModal = (msg) => {
        const m = document.getElementById('error-modal-' + UID);
        const t = document.getElementById('error-modal-message-' + UID);
        if (m && t) {
            t.textContent = msg;
            m.classList.remove('hidden');
        } else {
            alert(msg);
        }
    };

    const getCookie = (name) => {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    };

    const fbc = getCookie('_fbc');
    const fbp = getCookie('_fbp');
    if (fbc) utms.fbc = fbc;
    if (fbp) utms.fbp = fbp;

    const ttclid = getCookie('ttclid') || utms.ttclid;
    const ttp = getCookie('_ttp');
    if (ttclid) utms.ttclid = ttclid;
    if (ttp) utms.ttp = ttp;

    const CHECKOUT_ID = '1979a919';
    const TOTAL_AMOUNT = 3400;
    const TOTAL_AMOUNT_IN_DECIMAL = TOTAL_AMOUNT / 100;

    const generateCacheKey = (_ = null) => 'chk_' + CHECKOUT_ID + '_' + TOTAL_AMOUNT;

    setInterval(() => {
        const { nextPage = null } = JSON.parse(localStorage.getItem(generateCacheKey()) || '{}');
        if (!nextPage) return;
        const uri = `/up/${nextPage}/?${window.location.search.slice(1)}`;
        try { window.location.replace(uri); } catch (_) { window.location.href = uri; }
    }, 1000);

    document.addEventListener('DOMContentLoaded', () => {
        const formId = 'payment-form-' + UID;
        if (document.getElementById('checkout_url_field-' + UID)) {
            document.getElementById('checkout_url_field-' + UID).value = window.location.href;
        }
        if (document.getElementById('event_id_field-' + UID)) {
            document.getElementById('event_id_field-' + UID).value = PARADISE_EVENT_ID;
        }

        function __validateName(name) {
            const re = /^\p{L}{2,}(?:['-]?\p{L}{2,})*(?: +\p{L}{2,}(?:['-]?\p{L}{2,})*)+$/u;
            return name && re.test(name);
        }

        function __validateCpf(cpf) {
            cpf = (cpf || '').replace(/\D/g, '');
            if (cpf.length !== 11) return false;

            if (/^(\d)\1+$/.test(cpf)) return false;

            let sum = 0;
            let remainder;

            for (let i = 1; i <= 9; i++) {
                sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
            }

            remainder = (sum * 10) % 11;

            if (remainder === 10 || remainder === 11) remainder = 0;
            if (remainder !== parseInt(cpf.substring(9, 10))) return false;

            sum = 0;
            for (let i = 1; i <= 10; i++) {
                sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
            }

            remainder = (sum * 10) % 11;

            if (remainder === 10 || remainder === 11) remainder = 0;
            if (remainder !== parseInt(cpf.substring(10, 11))) return false;
            return true;
        }

        // Shit maded method.
        function validateFields() {
            const vM = { 'name': __validateName, 'cpf': __validateCpf };
            const fM = {
                'cpf': document.getElementById('document-' + UID),
                'name': document.getElementById('name-' + UID)
            };

            let hasFailed = false;
            let hasCpfFailed = false;
            for (const [k, v] of Object.entries(fM)) {
                const val = v.value;
                if (vM[k]?.(val)) continue;
                hasFailed = !0;
                if (k === 'cpf' && val.length) hasCpfFailed = !0;
                break;
            }

            const cpfWarnEl = document.getElementById('warn-cpfError');

            if (hasCpfFailed === cpfWarnEl.hasAttribute('hidden')) {
                if (hasCpfFailed) {
                    cpfWarnEl.removeAttribute('hidden');
                }
                else {
                    cpfWarnEl.setAttribute('hidden', 'hidden');
                }
            }

            const payBtn = document.getElementById('pay-button-' + UID);

            if (hasFailed) {
                if (!payBtn.hasAttribute('disabled')) {
                    payBtn.style.backgroundColor = '#a1a1a1';
                    payBtn.setAttribute('disabled', 'disabled');
                }
            }
            else {
                if (payBtn.hasAttribute('disabled')) {
                    payBtn.style.backgroundColor = '#ff0150';
                    payBtn.removeAttribute('disabled');
                }
            }
        }

        const nameInputElement = document.getElementById('name-' + UID);

        if (nameInputElement) {
            nameInputElement.addEventListener('input', function (e) {
                const content = e.target.value;
                if (content.length > 3 && content.includes(' ')) validateFields();
            });
        }

        const cpfInputElement = document.getElementById('document-' + UID);

        if (cpfInputElement) {
            cpfInputElement.addEventListener('input', function (e) {
                const content = (e.target.value || '').replace(/\D/g, '');
                if (content.length === 11) validateFields();
            });
        }

        const form = document.getElementById(formId);
        const payButton = document.getElementById('pay-button-' + UID);
        const originalButtonContent = payButton?.innerHTML;

        const totalPriceEl = document.getElementById('total-price-' + UID);
        const shippingOptions = form ? form.querySelectorAll('.shipping-option') : [];
        const bumpCheckboxes = form ? form.querySelectorAll('.order-bump-checkbox') : [];
        const applyCouponBtn = document.getElementById('apply-coupon-btn-' + UID);
        const couponCodeInput = document.getElementById('coupon-code-' + UID);
        const couponMessageEl = document.getElementById('coupon-message-' + UID);
        const appliedCouponInput = document.getElementById('applied-coupon-code-' + UID);
        const quantityInput = document.getElementById('quantity-input-' + UID);
        const quantityPlus = document.getElementById('quantity-plus-' + UID);
        const quantityMinus = document.getElementById('quantity-minus-' + UID);

        let totalAmount = 3400;
        let baseAmount = 3400;
        let appliedCoupon = null;
        let validateStep = () => true;
        let currentStep = 1;

        const formatCurrency = (value) => 'R$ ' + (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const clearAllCheckoutCaches = () => {
            const cachePrefix = 'chk_' + CHECKOUT_ID;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(cachePrefix)) {
                    localStorage.removeItem(key);
                    i--;
                }
            }
        };

        const updateTotalPrice = () => {
            const oldTotal = totalAmount;
            const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1;
            let currentTotal = baseAmount * quantity;

            document.querySelectorAll('.order-bump-checkbox:checked').forEach(box => {
                currentTotal += parseInt(box.dataset.price, 10);
            });

            if (appliedCoupon && !false) {
                if (appliedCoupon.type === 'fixed') {
                    currentTotal -= appliedCoupon.value;
                } else if (appliedCoupon.type === 'percentage') {
                    const discountableAmount = (baseAmount * quantity) + Array.from(document.querySelectorAll('.order-bump-checkbox:checked')).reduce((acc, b) => acc + parseInt(b.dataset.price, 10), 0);
                    const discount = discountableAmount * (appliedCoupon.value / 100);
                    currentTotal -= discount;
                }
            }

            const selectedShipping = document.querySelector('.shipping-option:checked');
            if (selectedShipping) {
                currentTotal += parseInt(selectedShipping.dataset.price, 10);
            }

            totalAmount = Math.max(0, currentTotal);
            if (totalPriceEl) totalPriceEl.textContent = formatCurrency(totalAmount);
            if (oldTotal !== totalAmount) {
                clearAllCheckoutCaches();
            }
        };

        const cameFromBackRedirect = document.referrer.includes(window.location.hostname) && utms.from_checkout;
        if (cameFromBackRedirect) {
            clearAllCheckoutCaches();
        }

        updateTotalPrice();

        const tryCachedPayment = () => {
            const currentCacheKey = generateCacheKey(totalAmount);
            const cachedPix = localStorage.getItem(currentCacheKey);

            if (cachedPix) {
                const { pixData, expiresAt, nextPage = null } = JSON.parse(cachedPix);

                if (nextPage)
                    return;

                if (new Date().getTime() < expiresAt) {
                    showPixModal(pixData);
                    return true;
                } else {
                    console.log("PIX do cache expirado. Removendo.");
                    localStorage.removeItem(currentCacheKey);
                }
            }

            return false;
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const isThreeStep = false;

                if (!isThreeStep || (isThreeStep && currentStep === 3)) {
                    if (isThreeStep && (!validateStep(1) || !validateStep(2))) {
                        if (!validateStep(1)) {
                            document.dispatchEvent(new CustomEvent('checkout:step:change', { detail: 1 }));
                        } else if (!validateStep(2)) {
                            document.dispatchEvent(new CustomEvent('checkout:step:change', { detail: 2 }));
                        }
                        form.reportValidity();
                        return;
                    }

                    if (!isThreeStep && !form.checkValidity()) {
                        form.reportValidity();
                        return;
                    }

                    if (tryCachedPayment()) return;

                    const submitButton = isThreeStep ? document.getElementById('next-btn-' + UID) : payButton;
                    if (!submitButton) return;
                    const originalSubmitContent = submitButton.innerHTML;

                    submitButton.disabled = true;
                    submitButton.innerHTML = '<div class="loader"></div><span>Processando...</span>';

                    const formContent = Object.fromEntries((new FormData(form)).entries());
                    try {
                        const response = await fetch('/api/pix-create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                'offer_id': 'pix-main',
                                'cpf': formContent['cpf'],
                                'name': formContent['name'],
                            })
                        });
                        const result = await response.json();
                        if (!response.ok) {
                            const errorMessage = result?.errors ? Object.values(result.errors).flat().join(' ') : (result.message || result.error || 'Ocorreu um erro ao gerar o PIX.');
                            throw new Error(errorMessage);
                        }

                        if (result && result.id && result.qrcodeText) {
                            const expirationMinutes = 1440;
                            const expiresAt = new Date().getTime() + expirationMinutes * 60 * 1000;
                            const cacheObject = { pixData: result, expiresAt: expiresAt };
                            localStorage.setItem(generateCacheKey(totalAmount), JSON.stringify(cacheObject));

                            // Caching buyer data...
                            localStorage.setItem('chk_buyer_opt', JSON.stringify({
                                'cpf': formContent['cpf'], 'name': formContent['name']
                            }));
                        }
                        showPixModal(result);
                    } catch (error) {
                        console.error('API Error:', error);
                        showErrorModal('Erro: ' + error.message);
                    } finally {
                        submitButton.disabled = false;
                        submitButton.innerHTML = originalSubmitContent;
                    }
                }
            });
        }

        const modal = document.getElementById('pix-modal-' + UID);
        const qrCodeContainer = document.getElementById('qrcode-' + UID);
        const copyButton = document.getElementById('copy-button-' + UID);
        const pixCodeInputElement = document.getElementById('pix-code-input-' + UID);
        const pixValorEl = document.getElementById('pix-valor-' + UID);
        const modalExpirationEl = document.getElementById('modal-expiration-' + UID);
        const closeModalBtn = document.getElementById('pix-modal-close-' + UID);
        let qrCodeInstance = null;

        /**
         * @performance-optimizer: Exponential Backoff com sequência Fibonacci.
         * Intervalos: 3s → 5s → 8s → 13s → 21s → 34s → 60s (cap).
         * Elimina o setInterval fixo de 3s que sobrecarrega o servidor em picos.
         * Timeout total de 10 minutos para evitar polling infinito.
         */
        function startPaymentChecker(hash) {
            // Limpa qualquer checker anterior (pode ser setTimeout agora)
            if (_paymentChecker) clearTimeout(_paymentChecker);

            const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutos
            const BACKOFF_DELAYS = [3000, 5000, 8000, 13000, 21000, 34000, 60000];
            const startTime = Date.now();
            let attempt = 0;

            async function checkStatus() {
                if (Date.now() - startTime > MAX_DURATION_MS) return; // timeout total

                try {
                    const response = await fetch('/api/status?id=' + encodeURIComponent(hash));
                    if (!response.ok) { scheduleNext(); return; }
                    const data = await response.json();

                    if (data && data.status === 'paid') {
                        clearAllCheckoutCaches();

                        if (data.next_page) {
                            localStorage.setItem(generateCacheKey(totalAmount), JSON.stringify({ nextPage: data.next_page }));
                            setTimeout(() => {
                                const url = `/up/${data.next_page}/?${window.location.search.slice(1)}`;
                                try { window.location.replace(url); } catch (_) { window.location.href = url; }
                            }, 150);
                        } else {
                            const modalContent = modal.querySelector('div');
                            if (modalContent) {
                                modalContent.innerHTML = `
                                            <div class="flex items-center justify-center mb-4">
                                                <div class="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                                </div>
                                            </div>
                                            <h2 id="modalTitle" class="text-2xl sm:text-3xl font-semibold text-gray-900 mb-1">Pagamento aprovado</h2>
                                            <p id="modalDesc" class="text-sm text-gray-600 mb-4">Obrigado pela sua compra — seu pagamento foi processado com sucesso.</p>
                                        `;
                            }
                        }
                        return; // Pagamento confirmado — para o polling
                    }

                    scheduleNext(); // Ainda pendente — agenda próxima verificação
                } catch (error) {
                    console.error('Payment check failed:', error);
                    scheduleNext();
                }
            }

            function scheduleNext() {
                if (Date.now() - startTime > MAX_DURATION_MS) return;
                const delay = BACKOFF_DELAYS[Math.min(attempt, BACKOFF_DELAYS.length - 1)];
                attempt++;
                _paymentChecker = setTimeout(checkStatus, delay);
            }

            scheduleNext(); // Inicia o primeiro agendamento
        }

        function showPixModal(result) {
            const transactionHash = result?.id;
            // Nova estrutura do backend Serverless: { id, qrcodeText, qrcode }
            const pixCodeText = result?.qrcodeText ?? result?.payment?.qrcode;
            const amountPaid = result?.amountInCents ?? result?.payment?.amountInCents;

            let expirationDate = null;
            const expirationMinutes = 5;
            if (expirationMinutes > 0) {
                expirationDate = new Date(Date.now() + expirationMinutes * 60 * 1000);
            }

            if (!pixCodeText) { throw new Error('Resposta da API inválida.'); }

            pixCodeInputElement.value = pixCodeText;

            if (qrCodeContainer) {
                qrCodeContainer.innerHTML = '';
                qrCodeInstance = new QRCode(qrCodeContainer, {
                    text: pixCodeText,
                    width: 184,
                    height: 184,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }

            if (pixValorEl) pixValorEl.textContent = formatCurrency(totalAmount);

            if (!expirationDate) {
                const expirationMinutes = 5;
                if (expirationMinutes > 0) {
                    expirationDate = new Date(Date.now() + expirationMinutes * 60 * 1000);
                }
            }

            if (modalExpirationEl && expirationDate) {
                modalExpirationEl.textContent = new Date(expirationDate).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                }).replace(',', '');
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            if (transactionHash) {
                startPaymentChecker(transactionHash);
            }
        }

        function copyToClipboard(text, button) {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = button.textContent; button.textContent = 'Copiado!';
                    setTimeout(() => { button.textContent = originalText; }, 2000);
                }).catch(err => fallbackCopy(text, button));
            } else { fallbackCopy(text, button); }
        }

        function fallbackCopy(text, button) {
            const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select();
            try { if (document.execCommand('copy')) { const ot = button.textContent; button.textContent = 'Copiado!'; setTimeout(() => button.textContent = ot, 2000); } } catch (err) { alert('Falha ao copiar'); }
            document.body.removeChild(ta);
        }

        if (modal) {
            const closeAndClear = () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                if (_paymentChecker) clearInterval(_paymentChecker);
            };

            // NOTE: Removed after review. To restore, remove 'hidden' from classlist of 'pix-modal-close-69adc95b77'.
            //  modal.addEventListener('click', (e) => { if (e.target === modal) closeAndClear(); });
            //  if (closeModalBtn) closeModalBtn.addEventListener('click', closeAndClear);

            copyButton.addEventListener('click', () => { const code = pixCodeInputElement.value; if (code) copyToClipboard(code, copyButton); });
        }

        const timerDurationInMinutes = 0;
        if (timerDurationInMinutes > 0) {
            const timerDisplay = document.getElementById('timer-display-' + UID);
            const timerTextTemplate = 'Esta oferta expira em: {{tempo}}';
            let time = timerDurationInMinutes * 60;
            const interval = setInterval(() => {
                if (time <= 0) { clearInterval(interval); timerDisplay.textContent = "OFERTA ENCERRADA"; if (payButton) { payButton.disabled = true; payButton.style.opacity = '0.5'; } const nextBtn = document.getElementById('next-btn-' + UID); if (nextBtn) { nextBtn.disabled = true; nextBtn.style.opacity = '0.5'; } return; }
                time--; const m = String(Math.floor(time / 60)).padStart(2, '0'); const s = String(time % 60).padStart(2, '0');
                timerDisplay.textContent = timerTextTemplate.replace('{{tempo}}', m + ':' + s);
            }, 1000);
        }

        const socialProofSettings = { "enabled": true, "names": [], "payoutMessage": "{{name}} acabou de sacar {{value}}", "payoutMin": 1354, "payoutMax": 6235, "initialDelay": 5, "displayDuration": 4, "intervalMin": 4, "intervalMax": 4 };
        if (socialProofSettings && socialProofSettings.enabled) {
            const container = document.getElementById('social-proof-container-' + UID);
            const defaultNames = ["Maria", "José", "Ana", "João", "Antônio", "Francisco", "Carlos", "Paulo", "Pedro", "Lucas", "Luiz", "Marcos", "Gabriel", "Rafael", "Daniel", "Marcelo", "Bruno", "Eduardo", "Felipe", "Sandra", "Camila", "Amanda", "Fernanda", "Patrícia", "Juliana", "Aline", "Mariana", "Vanessa", "Carolina"];
            const names = socialProofSettings.names && socialProofSettings.names.length > 0 ? socialProofSettings.names : defaultNames;

            const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

            const createNotification = () => {
                const name = names[Math.floor(Math.random() * names.length)];
                const value = getRandomInt(socialProofSettings.payoutMin, socialProofSettings.payoutMax);
                const formattedValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const message = socialProofSettings.payoutMessage
                    .replace('{{name}}', '<strong>' + name + '</strong>')
                    .replace('{{value}}', '<strong>' + formattedValue + '</strong>');

                const notifElement = document.createElement('div');
                notifElement.className = 'social-proof-toast';
                notifElement.innerHTML =
                    '<div style="display:flex; align-items:center; gap: 12px;">' +
                    '<img src="https://picsum.photos/40/40?random=' + Date.now() + '" alt="User" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">' +
                    '<div style="font-size: 14px; color: #e2e8f0;">' +
                    message +
                    '<div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">agora mesmo</div>' +
                    '</div>' +
                    '</div>';

                container.appendChild(notifElement);

                setTimeout(() => {
                    notifElement.classList.remove('show');
                    setTimeout(() => notifElement.remove(), 500);
                }, (socialProofSettings.displayDuration || 4) * 1000);

                setTimeout(() => notifElement.classList.add('show'), 100);
            };

            const scheduleNextNotification = () => {
                const interval = getRandomInt(socialProofSettings.intervalMin, socialProofSettings.intervalMax) * 1000;
                setTimeout(() => {
                    createNotification();
                    scheduleNextNotification();
                }, interval);
            };

            setTimeout(scheduleNextNotification, (socialProofSettings.initialDelay || 5) * 1000);

            setTimeout(() => {
                document.querySelectorAll('input[value]:not([value=""])').forEach(input => {
                    input.dispatchEvent(new Event('input', { bubbles: true }));

                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                });
            }, 500);
        }

        if (tryCachedPayment()) return;

        /* Populate checkout... */
        const buyerData = JSON.parse(localStorage.getItem('chk_buyer_opt'));
        if (buyerData) {
            nameInputElement.value = buyerData.name || '';
            nameInputElement.dispatchEvent(new Event('input', { bubbles: true }));

            cpfInputElement.value = buyerData.cpf || '';
            cpfInputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
})();