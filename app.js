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

// Hand-picked CORS-friendly fallback RPCs by chainId
// These are known to work from browser
const FALLBACK_RPCS = {
    1:        ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://rpc.ankr.com/eth', 'https://1rpc.io/eth'],
    10:       ['https://optimism.llamarpc.com', 'https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org', 'https://rpc.ankr.com/optimism', 'https://1rpc.io/op'],
    56:       ['https://binance.llamarpc.com', 'https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org', 'https://rpc.ankr.com/bsc', 'https://1rpc.io/bnb'],
    100:      ['https://gnosis-rpc.publicnode.com', 'https://gnosis.drpc.org', 'https://rpc.ankr.com/gnosis', 'https://1rpc.io/gnosis'],
    137:      ['https://polygon.llamarpc.com', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://rpc.ankr.com/polygon', 'https://1rpc.io/matic'],
    250:      ['https://fantom-rpc.publicnode.com', 'https://fantom.drpc.org', 'https://rpc.ankr.com/fantom', 'https://1rpc.io/ftm'],
    1101:     ['https://polygon-zkevm-rpc.publicnode.com', 'https://polygon-zkevm.drpc.org', 'https://1rpc.io/polygon/zkevm'],
    8453:     ['https://base.llamarpc.com', 'https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://1rpc.io/base'],
    42161:    ['https://arbitrum.llamarpc.com', 'https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org', 'https://rpc.ankr.com/arbitrum', 'https://1rpc.io/arb'],
    42220:    ['https://celo-rpc.publicnode.com', 'https://1rpc.io/celo'],
    43114:    ['https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org', 'https://rpc.ankr.com/avalanche', 'https://1rpc.io/avax/c'],
    59144:    ['https://linea-rpc.publicnode.com', 'https://linea.drpc.org', 'https://1rpc.io/linea'],
    81457:    ['https://blast-rpc.publicnode.com', 'https://blast.drpc.org'],
    324:      ['https://zksync-era-rpc.publicnode.com', 'https://zksync.drpc.org', 'https://1rpc.io/zksync2-era'],
    534352:   ['https://scroll-rpc.publicnode.com', 'https://scroll.drpc.org', 'https://1rpc.io/scroll'],
    5000:     ['https://mantle-rpc.publicnode.com', 'https://mantle.drpc.org', 'https://1rpc.io/mantle'],
    25:       ['https://cronos-evm-rpc.publicnode.com', 'https://cronos.drpc.org', 'https://1rpc.io/cro'],
    1284:     ['https://moonbeam-rpc.publicnode.com', 'https://moonbeam.drpc.org', 'https://1rpc.io/glmr'],
    1285:     ['https://moonriver-rpc.publicnode.com', 'https://moonriver.drpc.org'],
    169:      ['https://manta-pacific.drpc.org', 'https://1rpc.io/manta'],
    34443:    ['https://mode.drpc.org'],
    7777777:  ['https://zora.drpc.org'],
    480:      ['https://worldchain-mainnet.g.alchemy.com/public', 'https://worldchain.drpc.org'],
    // Testnets
    11155111: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org', 'https://rpc.ankr.com/eth_sepolia', 'https://1rpc.io/sepolia'],
    17000:    ['https://ethereum-holesky-rpc.publicnode.com', 'https://holesky.drpc.org', 'https://rpc.ankr.com/eth_holesky'],
    97:       ['https://bsc-testnet-rpc.publicnode.com', 'https://bsc-testnet.drpc.org'],
    80002:    ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://polygon-amoy.drpc.org'],
    421614:   ['https://arbitrum-sepolia-rpc.publicnode.com', 'https://arbitrum-sepolia.drpc.org'],
    11155420: ['https://optimism-sepolia-rpc.publicnode.com', 'https://optimism-sepolia.drpc.org'],
    84532:    ['https://base-sepolia-rpc.publicnode.com', 'https://base-sepolia.drpc.org'],
    43113:    ['https://avalanche-fuji-c-chain-rpc.publicnode.com', 'https://avalanche-fuji.drpc.org'],
    59141:    ['https://linea-sepolia-rpc.publicnode.com', 'https://linea-sepolia.drpc.org'],
    534351:   ['https://scroll-sepolia-rpc.publicnode.com', 'https://scroll-sepolia.drpc.org'],
};

// Track failed RPCs in this session so we don't retry obviously dead ones
const deadRPCs = new Set();

// DOM elements (populated after DOM ready)
let mainnetList, testnetList, walletInput, checkBtn, retryBtn;
let progressContainer, progressBar, progressText;
let mainnetCountEl, testnetCountEl, checkedCountEl, withBalanceEl;

// Currently held address (used for retry)
let currentAddress = '';

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
    const fromChain = (chain.rpc || [])
        .map(r => (typeof r === 'object' ? (r.url || '') : r))
        .filter(r => typeof r === 'string')
        .filter(r => r.startsWith('http'))
        .filter(r => !r.includes('${'))
        .filter(r => !r.includes('YOUR-API-KEY'));

    // Always merge in our hand-picked fallbacks (front of the list)
    const fallbacks = FALLBACK_RPCS[chain.chainId] || [];

    // Combine: fallbacks first, then chain RPCs (deduped)
    const seen = new Set();
    const all = [...fallbacks, ...fromChain].filter(r => {
        if (seen.has(r)) return false;
        seen.add(r);
        return true;
    });

    // Drop ones we already know are dead in this session
    const alive = all.filter(r => !deadRPCs.has(r));

    // Prioritize CORS-friendly providers
    const prioritized = [];
    const others = [];
    for (const rpc of alive) {
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

// Try a single RPC; return BigInt balance or throw
async function tryRpc(rpc, address, timeoutMs = 4000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
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
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        if (data?.error) throw new Error(data.error.message || 'rpc error');
        if (!data?.result) throw new Error('no result');
        return BigInt(data.result);
    } catch (e) {
        clearTimeout(t);
        throw e;
    }
}

// Race a small group of RPCs in parallel, return the first success.
// On full failure, mark all that failed as dead and move to the next group.
async function checkBalance(chain, address) {
    const rpcs = getUsableRPCs(chain);
    const symbol = chain.nativeCurrency?.symbol || '???';
    const decimals = chain.nativeCurrency?.decimals ?? 18;

    if (rpcs.length === 0) return { balance: null, error: true, symbol };

    const GROUP = 4;
    for (let i = 0; i < rpcs.length; i += GROUP) {
        const group = rpcs.slice(i, i + GROUP);
        const wrapped = group.map(rpc =>
            tryRpc(rpc, address).catch(err => {
                // Remember this RPC failed so future chains skip it
                deadRPCs.add(rpc);
                throw err;
            })
        );
        try {
            const wei = await Promise.any(wrapped);
            return { balance: formatBalance(wei, decimals), error: null, symbol };
        } catch (_) {
            // entire group failed — try next group
        }
    }

    return { balance: null, error: true, symbol };
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
    retryBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    totalChecked = 0;
    totalWithBalance = 0;
    currentAddress = address;
    // Reset dead RPC list for this scan
    deadRPCs.clear();

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    // Reset cards to pending
    renderChainCards(mainnetChains, mainnetList, 'pending');
    renderChainCards(testnetChains, testnetList, 'pending');

    const all = [...mainnetChains, ...testnetChains];
    const total = all.length;
    const failedChains = [];

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

            if (r.error) {
                failedChains.push(chain);
            } else {
                totalChecked++;
                if (r.balance && r.balance !== '0') totalWithBalance++;
                updateChainCard(chain.chainId, r.balance, r.error, r.symbol);
            }

            const done = totalChecked + failedChains.length;
            const pct = Math.round((done / total) * 100);
            progressBar.style.width = `${pct}%`;
            progressText.textContent = `${pct}% (${done}/${total})`;
            updateStats();
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // ---- Retry pass for failed chains ----
    // Clear dead RPC list so we give failed RPCs a fresh chance
    if (failedChains.length > 0) {
        checkBtn.textContent = `Retrying ${failedChains.length}...`;
        deadRPCs.clear();

        let retryCursor = 0;
        const retryWorker = async () => {
            while (retryCursor < failedChains.length) {
                const idx = retryCursor++;
                const chain = failedChains[idx];

                // Mark card as checking again
                const card = document.getElementById(`chain-${chain.chainId}`);
                if (card) {
                    card.classList.remove('error');
                    card.classList.add('checking');
                    const v = card.querySelector('.balance-value');
                    if (v) v.textContent = 'retry…';
                }

                const r = await checkBalance(chain, address);
                totalChecked++;
                if (r.balance && r.balance !== '0') totalWithBalance++;
                updateChainCard(chain.chainId, r.balance, r.error, r.symbol);

                const done = totalChecked;
                const pct = Math.round((done / total) * 100);
                progressBar.style.width = `${pct}%`;
                progressText.textContent = `Retry ${done}/${total}`;
                updateStats();
            }
        };

        await Promise.all(Array.from({ length: 30 }, retryWorker));
    }

    isChecking = false;
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check Balances';
    progressText.textContent = `Done ${totalChecked}/${total}`;

    // Enable retry if any chain still in error state
    const errorCards = document.querySelectorAll('.chain-card.error');
    retryBtn.disabled = errorCards.length === 0;
    retryBtn.textContent = errorCards.length > 0
        ? `Retry Failed (${errorCards.length})`
        : 'Retry Failed';

    applyFilters();
    sortByBalance(mainnetList);
    sortByBalance(testnetList);
}

// Manual retry: re-attempt only the chains currently in error state
async function retryFailedChains() {
    if (isChecking || !currentAddress) return;

    const failedCards = Array.from(document.querySelectorAll('.chain-card.error'));
    if (failedCards.length === 0) return;

    const failedChainIds = new Set(failedCards.map(c => parseInt(c.dataset.chainId, 10)));
    const failedChains = [...mainnetChains, ...testnetChains]
        .filter(c => failedChainIds.has(c.chainId));

    isChecking = true;
    checkBtn.disabled = true;
    retryBtn.disabled = true;
    deadRPCs.clear();

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = `Retrying ${failedChains.length} chains...`;

    // Mark cards as checking
    for (const chain of failedChains) {
        const card = document.getElementById(`chain-${chain.chainId}`);
        if (card) {
            card.classList.remove('error');
            card.classList.add('checking');
            const v = card.querySelector('.balance-value');
            if (v) {
                v.textContent = 'retry…';
                v.className = 'balance-value loading';
            }
        }
    }

    let cursor = 0;
    let completed = 0;
    const total = failedChains.length;

    const worker = async () => {
        while (cursor < failedChains.length) {
            const idx = cursor++;
            const chain = failedChains[idx];
            const r = await checkBalance(chain, currentAddress);
            completed++;

            if (r.balance && r.balance !== '0') totalWithBalance++;
            if (!r.error) totalChecked++;

            updateChainCard(chain.chainId, r.balance, r.error, r.symbol);

            const pct = Math.round((completed / total) * 100);
            progressBar.style.width = `${pct}%`;
            progressText.textContent = `Retry ${pct}% (${completed}/${total})`;
            updateStats();
        }
    };

    await Promise.all(Array.from({ length: 30 }, worker));

    isChecking = false;
    checkBtn.disabled = false;

    const stillFailed = document.querySelectorAll('.chain-card.error');
    retryBtn.disabled = stillFailed.length === 0;
    retryBtn.textContent = stillFailed.length > 0
        ? `Retry Failed (${stillFailed.length})`
        : 'Retry Failed';
    progressText.textContent = stillFailed.length > 0
        ? `Done. ${stillFailed.length} still failed.`
        : `Done ${totalChecked}/${mainnetChains.length + testnetChains.length}`;

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
    retryBtn = document.getElementById('retryBtn');
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    progressText = document.getElementById('progressText');
    mainnetCountEl = document.getElementById('mainnetCount');
    testnetCountEl = document.getElementById('testnetCount');
    checkedCountEl = document.getElementById('checkedCount');
    withBalanceEl = document.getElementById('withBalance');

    checkBtn.addEventListener('click', checkAllBalances);
    retryBtn.addEventListener('click', retryFailedChains);
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
