// ATENÇÃO: SUBSTITUA PELA URL ÚNICA DO SEU APPS SCRIPT
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwKjtj-bgxr5poQTDWAKy1m1nWAuX-S1iT54_qvFnag6WZLVYHnmfx-z6JQ7V7ujG6f/exec'; 

// Variável para rastrear o ID do acidente ativo na sessão
let currentAccidentID = null;

// --- CONFIGURAÇÃO DO INDEXEDDB ---
const DB_NAME = 'RAVPWADB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingReports'; // Onde os 6 módulos serão armazenados

/**
 * Abre a conexão com o IndexedDB e cria a Object Store se não existir.
 * @returns {Promise<IDBDatabase>} O objeto do banco de dados.
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
            // Cria a loja de objetos. A chave primária será o ID único gerado pela PWA.
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'ID_PWA_KEY' });
            }
        };
    });
}

// --- FUNÇÕES DE ARMAZENAMENTO LOCAL ---

/**
 * Salva um registro pendente no IndexedDB.
 * @param {Object} payload - O objeto de dados completo (incluindo ID_PWA_UNICO e formType).
 */
async function salvarEmIndexedDB(payload) {
    try {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Cria uma chave composta única para o IndexedDB: ID_PWA_UNICO-FORM_TYPE
        payload.ID_PWA_KEY = `${payload.ID_PWA_UNICO}-${payload.formType}`;

        const request = store.put(payload); // put atualiza se existir, adiciona se não

        await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        updatePendingCount();
        alert(`💾 Relatório Salvo Localmente: ${payload.formType}`);
    } catch (error) {
        console.error("Erro ao salvar no IndexedDB:", error);
        alert("Erro fatal ao salvar localmente. Verifique o console.");
    }
}

/**
 * Carrega todos os registros pendentes do IndexedDB.
 * @returns {Promise<Array<Object>>} Lista de registros pendentes.
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

// --- LÓGICA DO FLUXO DE TRABALHO E SINCRONIZAÇÃO ---

/** Gera um ID único provisório para rastrear o acidente. */
function gerarIdPWA() {
    return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
}

/** Inicia um novo acidente e habilita os botões. */
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

/** Atualiza a contagem de registros pendentes na interface. */
async function updatePendingCount() {
    const pendentes = await carregarPendentes();
    document.getElementById('pending-count').textContent = pendentes.length;
}

// Chamar ao carregar a página
updatePendingCount(); 

/**
 * Coleta dados do formulário e tenta enviar. Se falhar, salva localmente.
 * @param {string} formType - O nome exato da aba no Google Sheets (ex: 'RECIBO BATIDA').
 */
async function salvarOuEnviar(formType) {
    if (!currentAccidentID) {
        alert('Por favor, inicie um novo acidente primeiro (Gerar ID).');
        return;
    }

    // A PWA precisa saber qual FORM foi preenchido. Assumindo que o ID do FORM é 'form' + formType sem espaços.
    const formId = 'form' + formType.replace(/\s/g, ''); 
    const formElement = document.getElementById(formId); 
    
    if (!formElement) {
        alert(`Erro: Formulário ${formId} não encontrado.`);
        return;
    }
    
    const formData = new FormData(formElement);
    const dadosFormulario = Object.fromEntries(formData.entries());

    // Inclui campos de rastreamento obrigatórios
    const payload = {
        ...dadosFormulario,
        ID_PWA_UNICO: currentAccidentID,
        Status_Envio: 'Pendente', // Começa como pendente
        formType: formType // Chave para o roteamento no Apps Script
    };

    // 1. TENTATIVA DE ENVIO ONLINE
    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.result === 'success') {
            alert(`✅ Sucesso! Relatório ${formType} enviado.`);
            // Se foi online, não precisamos salvar, mas podemos remover qualquer versão antiga no DB
            const key = `${currentAccidentID}-${formType}`;
            await removerDoIndexedDB(key);
            
        } else {
            // Falha lógica (ex: Planilha está offline, Apps Script deu erro)
            alert(`⚠️ Falha no Apps Script (${result.message}). Salvando localmente.`);
            await salvarEmIndexedDB(payload);
        }
        
    } catch (error) {
        // 2. FALHA DE REDE: Salvar Localmente
        console.error('Falha de rede, salvando localmente:', error);
        alert('❌ Falha de Rede. Salvando localmente para sincronização futura.');
        await salvarEmIndexedDB(payload);
    }
}

// --- FUNÇÕES DE UTILIDADE (Navegação) ---

/** * Função simples para trocar de página.
 * (Ajustada para garantir que o ID do acidente seja atualizado nos campos ocultos).
 */
function loadPage(pageId) {
    document.querySelectorAll('section').forEach(section => {
        section.style.display = 'none';
    });
    
    document.getElementById(pageId).style.display = 'block';

    if (pageId === 'pending-list') {
        renderPendingList(); // Carrega a lista quando o usuário visita a página
    }
}

/** Renderiza a lista de itens pendentes na interface. */
async function renderPendingList() {
    const listElement = document.getElementById('pending-items-list');
    listElement.innerHTML = '';
    const pendentes = await carregarPendentes();

    if (pendentes.length === 0) {
        listElement.innerHTML = '<li>Nenhum registro pendente de envio.</li>';
        return;
    }

    pendentes.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `[${item.formType}] ID: ${item.ID_PWA_UNICO} - Status: Pendente`;
        // Adicionar botão para tentar reenviar
        const btn = document.createElement('button');
        btn.textContent = 'Reenviar';
        btn.onclick = () => reenviarItem(item);
        li.appendChild(btn);
        
        listElement.appendChild(li);
    });
}

/** * Tenta reenviar um item salvo localmente. 
 * Esta função precisa ser criada e será o próximo passo da sincronização.
 */
function reenviarItem(item) {
    alert(`Pronto para reenviar o item ${item.ID_PWA_UNICO} - ${item.formType}!`);
    // Próxima etapa: Criar a lógica de sincronização
}
