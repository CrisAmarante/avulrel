// ====================================================================
// 1. CONFIGURAÇÕES GLOBAIS
// ====================================================================

// ATENÇÃO: SUBSTITUA PELA URL ÚNICA DO SEU APPS SCRIPT
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxY70lbXdS_I_OUiCoY3Z4EQ7sgO4q2M8zTicEAl0vKlsQzWh-bDB_YNFBwhHxvDqI/exec'; 

// Variável global para rastrear o ID do acidente ativo na sessão
let currentAccidentID = null;

// --- CONFIGURAÇÃO DO INDEXEDDB ---
const DB_NAME = 'RAVPWADB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingReports'; // Onde os 6 módulos serão armazenados

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

// ====================================================================
// 3. FLUXO PRINCIPAL DA APLICAÇÃO
// ====================================================================

/** Gera um ID único provisório para rastrear o acidente. */
function gerarIdPWA() {
    // Ex: 1678886400000-q1w2e3r4t
    return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
}

/** Inicia um novo acidente, gera o ID e habilita os botões. */
function iniciarNovoAcidente() {
    currentAccidentID = gerarIdPWA();
    document.getElementById('current-id').textContent = currentAccidentID;
    
    // Habilita os botões dos módulos
    document.querySelectorAll('#module-buttons button').forEach(btn => {
        btn.disabled = false;
    });

    alert(`Novo Acidente Iniciado. ID: ${currentAccidentID}`);
    loadPage('main-menu');
}

/**
 * Coleta dados do formulário e tenta enviar. Se falhar, salva localmente.
 * @param {string} formType - O nome exato da aba no Google Sheets (ex: 'RECIBO BATIDA').
 */
async function salvarOuEnviar(formType) {
    if (!currentAccidentID) {
        alert('Por favor, inicie um novo acidente primeiro (Gerar ID).');
        return;
    }

    // Convenção: O ID do FORM deve ser 'form' + formType sem espaços (ex: formRECIBOBATIDA)
    const formId = 'form' + formType.replace(/\s/g, ''); 
    const formElement = document.getElementById(formId); 
    
    if (!formElement) {
        alert(`Erro: Formulário ${formId} não encontrado.`);
        return;
    }
    
    const formData = new FormData(formElement);
    const dadosFormulario = Object.fromEntries(formData.entries());

    // Monta o objeto inicial (Status_Envio será 'Enviado' se o fetch for ok)
    const payload = {
        ...dadosFormulario,
        ID_PWA_UNICO:
