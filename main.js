// URL Única do Apps Script (MUITO IMPORTANTE: SUBSTITUIR)
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwKjtj-bgxr5poQTDWAKy1m1nWAuX-S1iT54_qvFnag6WZLVYHnmfx-z6JQ7V7ujG6f/exec'; 

// Variável para rastrear o ID do acidente ativo na sessão
let currentAccidentID = null;

// --- FUNÇÕES DE CONTROLE ---

/** Gera um ID único provisório para rastrear o acidente. */
function gerarIdPWA() {
    return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
}

/** Inicia um novo acidente e habilita os botões. */
function iniciarNovoAcidente() {
    currentAccidentID = gerarIdPWA();
    document.getElementById('current-id').textContent = currentAccidentID;
    
    // Habilita os botões dos formulários
    document.querySelectorAll('#main-menu button[disabled]').forEach(btn => {
        btn.disabled = false;
    });

    alert(`Novo Acidente Iniciado. ID: ${currentAccidentID}`);
    // O próximo passo seria salvar esse ID em IndexedDB
}


// --- FUNÇÃO DE ENVIO (Comunicação com Google Sheets) ---

/**
 * Coleta dados do formulário ativo e os envia ao Apps Script.
 * @param {string} formType - O nome exato da aba no Google Sheets (ex: 'RECIBO BATIDA').
 */
function salvarOuEnviar(formType) {
    if (!currentAccidentID) {
        alert('Por favor, inicie um novo acidente primeiro (Gerar ID).');
        return;
    }

    const formElement = document.getElementById('formRecibo'); // Adaptar para o formulário correto
    const formData = new FormData(formElement);
    const dadosFormulario = Object.fromEntries(formData.entries());

    // Inclui campos de rastreamento obrigatórios
    const payload = {
        ...dadosFormulario,
        ID_PWA_UNICO: currentAccidentID,
        Status_Envio: 'Pendente', // Tentaremos mudar para 'Enviado' se o fetch for ok
        formType: formType // Chave para o roteamento no Apps Script
    };

    // **LÓGICA DE ENVIO ONLINE**
    fetch(APP_SCRIPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(result => {
        if (result.result === 'success') {
            alert(`✅ Sucesso! Relatório ${formType} enviado.`);
            // AQUI OCORRERIA A LÓGICA: Atualizar status no IndexedDB para 'Enviado'
        } else {
            alert(`⚠️ Falha no Apps Script. Salvando localmente.`);
            // AQUI OCORRERIA A LÓGICA: salvarEmIndexedDB(payload);
        }
    })
    .catch(error => {
        alert('❌ Falha de Rede. Salvando localmente para sincronização futura.');
        // AQUI OCORRERIA A LÓGICA: salvarEmIndexedDB(payload);
    });
}
