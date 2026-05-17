// ============================================================================
// EVM Native Balance Checker
// ============================================================================

// Global state
let allChains = [];
let mainnetChains = [];
let testnetChains = [];
let isChecking = false;
let totalChecked = 0;
let totalWithBalance = 0;

// CORS-friendly RPC provider patterns (prioritized)
const CORS_FRIENDLY_PATTERNS = [
    'publicnode.com',
    'drpc.org',
    'llamarpc.com',
    'ankr.com',
    '1rpc.io',
    'meowrpc.com',
    'blastapi.io',
    'cloudflare-eth.com',
    'gateway.tenderly.co',
    'rpc.thirdweb.com',
    'gateway.fm',
    'omniatech.io',
    'nodereal.io',
    'chainstacklabs.com',
    'blockpi.network',
    'onfinality.io',
    'unifra.io',
    'pokt.network',
    'rpc.io',
];

// DOM elements (populated after DOM ready)
let mainnetList, testnetList, walletInput, checkBtn;
let progressContainer, progressBar, progressText;
let mainnetCountEl, testnetCountEl, checkedCountEl, withBalanceEl;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isTestnet(chain) {
    if (chain.slip44 === 1) return true;

    const text = ((chain.name || '') + ' ' + (chain.title || '')).toLowerCase();
    const keywords = [
        'testnet', 'devnet', 'sepolia', 'goerli', 'rinkeby', 'ropsten',
        'kovan', 'mumbai', 'fuji', 'alfajores', 'chapel', 'holesky',
        'amoy', 'baobab', 'bakerloo', 'preview', 'staging'
    ];
    if (keywords.some(k => text.includes(k))) return true;
    if (chain.faucets && chain.faucets.length > 0) return true;
    if (chain.status === 'deprecated') return true;
    return false;
}

function getUsableRPCs(chain) {
    if (!chain.rpc || chain.rpc.length === 0) return [];

    const cleaned = chain.rpc
        .map(r => (typeof r === 'object' ? (r.url || '') : r))
        .filter(r => typeof r === 'string')
        .filter(r => r.startsWith('http'))
        .filter(r => !r.includes('${'))
        .filter(r => !r.includes('YOUR-API-KEY'));

    // Prioritize CORS-friendly providers
    const prioritized = [];
    const others = [];
    for (const rpc of cleaned) {
        if (CORS_FRIENDLY_PATTERNS.some(p => rpc.includes(p))) {
            prioritized.push(rpc);
        } else {
            others.push(rpc);
        }
    }
    return [...prioritized, ...others];
}

function formatBalance(weiBigInt, decimals) {
    if (weiBigInt === 0n) return '0';
    const divisor = 10n ** BigInt(decimals);
    const intPart = weiBigInt / divisor;
    const remainder = weiBigInt % divisor;
    if (remainder === 0n) return intPart.toString();

    let rem = remainder.toString().padStart(decimals, '0');
    rem = rem.slice(0, 6).replace(/0+$/, '');
    return rem === '' ? intPart.toString() : `${intPart}.${rem}`;
}

function shortBalance(balanceStr) {
    // Truncate long numbers for display
    if (!balanceStr) return balanceStr;
    if (balanceStr.length > 12) {
        const dot = balanceStr.indexOf('.');
        if (dot > 0 && dot < 10) {
            return balanceStr.slice(0, 10);
        }
    }
    return balanceStr;
}

// ----------------------------------------------------------------------------
// Data loading
// ----------------------------------------------------------------------------

async function fetchChains() {
    try {
        setLoadingState('Loading chains from chainlist.org...');
        const res = await fetch('https://chainid.network/chains.json');
        allChains = await res.json();

        mainnetChains = [];
        testnetChains = [];

        for (const chain of allChains) {
            const rpcs = getUsableRPCs(chain);
            if (rpcs.length === 0) continue;
            if (isTestnet(chain)) testnetChains.push(chain);
            else mainnetChains.push(chain);
        }

        mainnetChains.sort((a, b) => a.chainId - b.chainId);
        testnetChains.sort((a, b) => a.chainId - b.chainId);

        // Render all chains immediately so user sees the list
        renderChainCards(mainnetChains, mainnetList, 'idle');
        renderChainCards(testnetChains, testnetList, 'idle');
        updateStats();
    } catch (err) {
        console.error('Failed to fetch chains:', err);
        mainnetList.innerHTML =
            '<div class="placeholder error-placeholder">Failed to load chains. Check your internet connection and reload.</div>';
        testnetList.innerHTML =
            '<div class="placeholder error-placeholder">Failed to load chains. Check your internet connection and reload.</div>';
    }
}

function setLoadingState(msg) {
    const html = `<div class="placeholder">${msg}</div>`;
    mainnetList.innerHTML = html;
    testnetList.innerHTML = html;
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

function createChainCard(chain, status = 'idle') {
    const card = document.createElement('div');
    card.className = `chain-card ${status}`;
    card.id = `chain-${chain.chainId}`;
    card.dataset.chainId = chain.chainId;
    card.dataset.name = chain.name.toLowerCase();

    const symbol = chain.nativeCurrency ? chain.nativeCurrency.symbol : '???';

    let balanceHTML;
    if (status === 'idle') {
        balanceHTML = `<span class="balance-value idle">—</span><div class="balance-symbol">${symbol}</div>`;
    } else if (status === 'pending') {
        balanceHTML = `<span class="balance-value loading">Pending</span>`;
    } else {
        balanceHTML = `<span class="balance-value loading">…</span>`;
    }

    card.innerHTML = `
        <div class="chain-info">
            <div class="chain-name" title="${chain.name}">${chain.name}</div>
            <div class="chain-details">
                <span class="chain-id-badge">#${chain.chainId}</span>
                <span class="chain-symbol-text">${symbol}</span>
            </div>
        </div>
        <div class="balance-info">${balanceHTML}</div>
    `;
    return card;
}

function renderChainCards(chains, container, status) {
    if (chains.length === 0) {
        container.innerHTML = '<div class="placeholder">No chains found</div>';
        return;
    }
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const chain of chains) frag.appendChild(createChainCard(chain, status));
    container.appendChild(frag);
}

function updateChainCard(chainId, balance, error, symbol) {
    const card = document.getElementById(`chain-${chainId}`);
    if (!card) return;

    card.classList.remove('checking', 'pending', 'idle');
    const info = card.querySelector('.balance-info');

    if (error) {
        card.classList.add('error');
        info.innerHTML = `<span class="balance-value error-text">RPC fail</span>`;
    } else if (balance === '0') {
        info.innerHTML = `
            <span class="balance-value zero">0</span>
            <div class="balance-symbol">${symbol}</div>`;
    } else {
        card.classList.add('has-balance');
        info.innerHTML = `
            <span class="balance-value" title="${balance} ${symbol}">${shortBalance(balance)}</span>
            <div class="balance-symbol">${symbol}</div>`;
    }
}

function updateStats() {
    mainnetCountEl.textContent = `Mainnets: ${mainnetChains.length}`;
    testnetCountEl.textContent = `Testnets: ${testnetChains.length}`;
    checkedCountEl.textContent = `Checked: ${totalChecked}`;
    withBalanceEl.textContent = `With Balance: ${totalWithBalance}`;
}

// ----------------------------------------------------------------------------
// Balance checking
// ----------------------------------------------------------------------------

// Race multiple RPCs in parallel — first to respond wins
async function checkBalance(chain, address) {
    const rpcs = getUsableRPCs(chain).slice(0, 5);
    const symbol = chain.nativeCurrency?.symbol || '???';
    const decimals = chain.nativeCurrency?.decimals ?? 18;

    if (rpcs.length === 0) return { balance: null, error: true, symbol };

    const tryRpc = (rpc) => new Promise(async (resolve, reject) => {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => {
                ctrl.abort();
                reject(new Error('timeout'));
            }, 3500);

            const res = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1,
                }),
                signal: ctrl.signal,
            });
            clearTimeout(t);

            if (!res.ok) return reject(new Error('http ' + res.status));
            const data = await res.json();
            if (!data?.result) return reject(new Error('no result'));
            resolve(BigInt(data.result));
        } catch (e) {
            reject(e);
        }
    });

    try {
        const wei = await Promise.any(rpcs.map(tryRpc));
        return { balance: formatBalance(wei, decimals), error: null, symbol };
    } catch (_) {
        return { balance: null, error: true, symbol };
    }
}

async function checkAllBalances() {
    const address = walletInput.value.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        alert('Please enter a valid EVM wallet address (0x followed by 40 hex chars)');
        return;
    }
    if (isChecking) return;

    isChecking = true;
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    totalChecked = 0;
    totalWithBalance = 0;

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    // Reset cards to pending
    renderChainCards(mainnetChains, mainnetList, 'pending');
    renderChainCards(testnetChains, testnetList, 'pending');

    const all = [...mainnetChains, ...testnetChains];
    const total = all.length;

    // Mark all as checking up front
    for (const chain of all) {
        const card = document.getElementById(`chain-${chain.chainId}`);
        if (card) {
            card.classList.remove('pending');
            card.classList.add('checking');
            const v = card.querySelector('.balance-value');
            if (v) v.textContent = '…';
        }
    }

    // High-concurrency worker pool
    const CONCURRENCY = 60;
    let cursor = 0;

    const worker = async () => {
        while (cursor < all.length) {
            const idx = cursor++;
            const chain = all[idx];
            const r = await checkBalance(chain, address);
            totalChecked++;
            if (r.balance && r.balance !== '0') totalWithBalance++;
            updateChainCard(chain.chainId, r.balance, r.error, r.symbol);

            const pct = Math.round((totalChecked / total) * 100);
            progressBar.style.width = `${pct}%`;
            progressText.textContent = `${pct}% (${totalChecked}/${total})`;
            updateStats();
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    isChecking = false;
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check Balances';

    applyFilters();
    sortByBalance(mainnetList);
    sortByBalance(testnetList);
}

function sortByBalance(container) {
    const cards = Array.from(container.querySelectorAll('.chain-card'));
    cards.sort((a, b) => {
        const aHas = a.classList.contains('has-balance') ? 0 : 1;
        const bHas = b.classList.contains('has-balance') ? 0 : 1;
        return aHas - bHas;
    });
    for (const c of cards) container.appendChild(c);
}

function applyFilters() {
    const hideZero = document.getElementById('hideZero').checked;
    const hideErrors = document.getElementById('hideErrors').checked;
    const search = document.getElementById('searchChain').value.toLowerCase().trim();

    document.querySelectorAll('.chain-card').forEach(card => {
        let visible = true;
        const isIdle = card.classList.contains('idle') || card.classList.contains('pending') || card.classList.contains('checking');
        const hasBal = card.classList.contains('has-balance');
        const isErr = card.classList.contains('error');

        if (hideZero && !hasBal && !isIdle) visible = false;
        if (hideErrors && isErr) visible = false;
        if (search && !card.dataset.name.includes(search)) visible = false;

        card.style.display = visible ? 'flex' : 'none';
    });
}

// ----------------------------------------------------------------------------
// Init
// ----------------------------------------------------------------------------

function init() {
    mainnetList = document.getElementById('mainnetList');
    testnetList = document.getElementById('testnetList');
    walletInput = document.getElementById('walletAddress');
    checkBtn = document.getElementById('checkBtn');
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    progressText = document.getElementById('progressText');
    mainnetCountEl = document.getElementById('mainnetCount');
    testnetCountEl = document.getElementById('testnetCount');
    checkedCountEl = document.getElementById('checkedCount');
    withBalanceEl = document.getElementById('withBalance');

    checkBtn.addEventListener('click', checkAllBalances);
    walletInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') checkAllBalances();
    });
    document.getElementById('hideZero').addEventListener('change', applyFilters);
    document.getElementById('hideErrors').addEventListener('change', applyFilters);
    document.getElementById('searchChain').addEventListener('input', applyFilters);

    fetchChains();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
