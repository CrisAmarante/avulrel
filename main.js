// ====================================================================
// 1. CONFIGURAÇÕES GLOBAIS
// ====================================================================

// ATENÇÃO: SUBSTITUA PELA URL ÚNICA DO SEU APPS SCRIPT
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyThRicyiLhf8_pI8gpiM7bv0GvAQYX-KZQwhU7DeHEif9hVDBMo3tSfHrT66UHTimP/exec'; 

// Variável global para rastrear o ID do acidente ativo na sessão
let currentAccidentID = null;

// --- CONFIGURAÇÃO DO INDEXEDDB ---
const DB_NAME = 'RAVPWADB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingReports'; // Onde os 6 módulos serão armazenados

// Mapeamento de formTypes para IDs de formulário no HTML
// Exemplo: 'RECIBO BATIDA' -> 'recibo-form' (ajuste conforme seu HTML)
const FORM_ID_MAP = {
    'RECIBO BATIDA': 'recibo-form',
    'RELATORIO CHEFIA': 'relatorio-chefia-form',
    'DADOS ONIBUS': 'dados-onibus-form',
    'DADOS ACIDENTE': 'dados-acidente-form',
    'DADOS TERCEIRO': 'dados-terceiro-form',
    'DADOS TESTEMUNHA': 'dados-testemunha-form'
};

// ====================================================================
// 2. FUNÇÕES DE SUPORTE DO INDEXEDDB
// ====================================================================

/**
 * Abre a conexão com o IndexedDB e cria a Object Store se não existir.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = event => {
            console.error("Erro ao abrir IndexedDB:", event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = event => {
            resolve(event.target.result);
        };

        // É chamado se a versão do banco de dados for nova ou alterada
        request.onupgradeneeded = event => {
            const db = event.target.result;
            // Chave composta para ID_PWA_UNICO e formType (permite vários relatórios/ID)
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'ID_PWA_KEY' });
            }
        };
    });
}

/**
 * Salva ou atualiza um registro pendente no IndexedDB.
 */
async function salvarEmIndexedDB(payload) {
    try {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Cria a chave composta (ID_PWA_UNICO-FORM_TYPE)
        payload.ID_PWA_KEY = `${payload.ID_PWA_UNICO}-${payload.formType}`;
        payload.Status_Envio = 'Pendente'; // Garante que o status salvo é pendente

        const request = store.put(payload);

        await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        updatePendingCount();
        alert(`💾 Relatório Salvo Localmente: ${payload.formType}`);
    } catch (error) {
        console.error("Erro ao salvar no IndexedDB:", error);
        alert('Erro ao salvar localmente: ' + error.message);
    }
}

/**
 * Carrega todos os registros pendentes do IndexedDB.
 */
async function carregarPendentes() {
    try {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Erro ao carregar pendentes:", error);
        return [];
    }
}

/** Remove um registro do IndexedDB após o envio bem-sucedido. */
async function removerDoIndexedDB(key) {
    try {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.delete(key);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                updatePendingCount();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Erro ao remover do IndexedDB:", error);
    }
}

/**
 * Atualiza o contador de pendentes na UI.
 */
async function updatePendingCount() {
    const pendings = await carregarPendentes();
    const countElement = document.getElementById('pending-count');
    if (countElement) {
        countElement.textContent = `Pendentes: ${pendings.length}`;
    }
    // Atualiza status de conexão
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = `Status: ${navigator.onLine ? 'Conectado' : 'Desconectado'} | `;
    }
}

/**
 * Carrega uma página específica (esconde todas, mostra a ativa).
 * @param {string} pageId - ID da página a mostrar.
 */
function loadPage(pageId) {
    document.querySelectorAll('.form-page, .data-page').forEach(page => {
        page.style.display = 'none';
    });
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'block';
    }
    // Volta ao menu principal se não encontrar
    else {
        loadPage('main-menu');
    }
}

/**
 * Mostra o módulo de formulário.
 * @param {string} formType - Tipo do formulário (ex: 'RECIBO BATIDA').
 */
function showModule(formType) {
    if (!currentAccidentID) {
        alert('Por favor, inicie um novo acidente primeiro.');
        return;
    }
    const pageId = formType.replace(/\s/g, '').toLowerCase() + '-page'; // Ex: 'recibo-batida-page'
    loadPage(pageId);
}

// ====================================================================
// 3. FLUXO PRINCIPAL DA APLICAÇÃO
// ====================================================================

/** Inicialização da app ao carregar. */
async function initApp() {
    updatePendingCount();
    registerServiceWorker();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', () => updatePendingCount());
    // Carrega menu principal
    loadPage('main-menu');
}

/** Registra o Service Worker. */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('SW registrado:', reg))
            .catch(err => console.error('Erro no SW:', err));
    }
}

/** Gera um ID único provisório para rastrear o acidente. */
function gerarIdPWA() {
    // Ex: 1678886400000-q1w2e3r4t
    return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
}

/** Inicia um novo acidente, gera o ID e habilita os botões. */
function iniciarNovoAcidente() {
    currentAccidentID = gerarIdPWA();
    const idElement = document.getElementById('current-id');
    if (idElement) {
        idElement.textContent = currentAccidentID;
    }
    
    // Habilita os botões dos módulos
    document.querySelectorAll('#module-buttons button').forEach(btn => {
        btn.disabled = false;
    });

    alert(`Novo Acidente Iniciado. ID: ${currentAccidentID}`);
    loadPage('main-menu');
}

/**
 * Mostra registros pendentes.
 */
async function verPendentes() {
    const pendings = await carregarPendentes();
    const pendentesPage = document.getElementById('pendentes-page');
    if (pendentesPage) {
        let html = '<ul>';
        pendings.forEach(p => {
            html += `<li>${p.formType} - ID: ${p.ID_PWA_UNICO} <button onclick="reenviar('${p.ID_PWA_KEY}')">Reenviar</button></li>`;
        });
        html += '</ul>';
        pendentesPage.innerHTML = html || '<p>Nenhum registro pendente.</p>';
        loadPage('pendentes-page');
    }
}

/**
 * Reenvia um pendente específico.
 * @param {string} key - Chave do IndexedDB.
 */
async function reenviar(key) {
    // Carrega o payload do pendente (simplificado; ajuste se necessário)
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    const payload = await new Promise(resolve => {
        request.onsuccess = () => resolve(request.result);
    });
    if (payload) {
        await salvarOuEnviar(payload.formType, payload); // Reusa a função
    }
}

/**
 * Manipulador de online: Tenta reenviar pendentes automaticamente.
 */
async function handleOnline() {
    updatePendingCount();
    if (navigator.onLine) {
        const pendings = await carregarPendentes();
        for (let pending of pendings) {
            try {
                await salvarOuEnviar(pending.formType, pending);
            } catch (e) {
                console.error('Falha no reenvio:', e);
            }
        }
    }
}

/**
 * Coleta dados do formulário e tenta enviar. Se falhar, salva localmente.
 * @param {string} formType - O nome exato da aba no Google Sheets (ex: 'RECIBO BATIDA').
 * @param {object} existingPayload - Payload existente (para reenvios); opcional.
 */
async function salvarOuEnviar(formType, existingPayload = null) {
    if (!currentAccidentID && !existingPayload) {
        alert('Por favor, inicie um novo acidente primeiro (Gerar ID).');
        return;
    }

    // Pega o ID do form do mapeamento
    const formId = FORM_ID_MAP[formType];
    const formElement = document.getElementById(formId); 
    
    if (!formElement && !existingPayload) {
        alert(`Erro: Formulário ${formId} não encontrado.`);
        return;
    }
    
    // Coleta dados do form se não for reenvio
    let dadosFormulario;
    if (!existingPayload) {
        const formData = new FormData(formElement);
        dadosFormulario = Object.fromEntries(formData.entries());
    } else {
        dadosFormulario = existingPayload;
    }

    // Monta o objeto payload
    const payload = {
        ...dadosFormulario,
        ID_PWA_UNICO: currentAccidentID || dadosFormulario.ID_PWA_UNICO,
        formType: formType,
        Status_Envio: 'Enviado' // Tentativa de envio
    };

    // Tenta enviar para Apps Script
    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        if (result.result === 'success') {
            alert(`✅ Enviado com sucesso: ${formType}`);
            // Remove de IndexedDB se era um pendente
            if (payload.ID_PWA_KEY) {
                await removerDoIndexedDB(payload.ID_PWA_KEY);
            }
            // Limpa o form se novo
            if (formElement) {
                formElement.reset();
            }
            return;
        } else {
            throw new Error(result.message || 'Resposta inválida do servidor');
        }
    } catch (error) {
        console.error('Erro no envio:', error);
        // Salva localmente se falhar (apenas para novos)
        if (!existingPayload) {
            await salvarEmIndexedDB(payload);
        } else {
            alert('Falha no reenvio: ' + error.message);
        }
    }
}

// ====================================================================
// 4. INICIALIZAÇÃO
// ====================================================================

// Chama init ao carregar a página
document.addEventListener('DOMContentLoaded', initApp);
