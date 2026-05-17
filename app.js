// Global state
let allChains = [];
let mainnetChains = [];
let testnetChains = [];
let results = {};
let isChecking = false;
let totalChecked = 0;
let totalWithBalance = 0;

// DOM elements
const mainnetList = document.getElementById('mainnetList');
const testnetList = document.getElementById('testnetList');
const walletInput = document.getElementById('walletAddress');
const checkBtn = document.getElementById('checkBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const mainnetCountEl = document.getElementById('mainnetCount');
const testnetCountEl = document.getElementById('testnetCount');
const checkedCountEl = document.getElementById('checkedCount');
const withBalanceEl = document.getElementById('withBalance');

// Determine if a chain is a testnet
function isTestnet(chain) {
    // slip44 = 1 is the coin type for testnets
    if (chain.slip44 === 1) return true;
    
    // Check name/title for testnet indicators
    const name = (chain.name || '').toLowerCase();
    const title = (chain.title || '').toLowerCase();
    const combined = name + ' ' + title;
    
    const testnetKeywords = ['testnet', 'devnet', 'sepolia', 'goerli', 'rinkeby', 
                            'ropsten', 'kovan', 'mumbai', 'fuji', 'alfajores',
                            'bakerloo', 'chapel', 'test'];
    
    for (const keyword of testnetKeywords) {
        if (combined.includes(keyword)) return true;
    }
    
    // Check if it has faucets (testnets usually have faucets)
    if (chain.faucets && chain.faucets.length > 0) return true;
    
    // Check status
    if (chain.status === 'deprecated') return true;
    
    return false;
}

// Get a working RPC URL (filter out ones with API keys and websockets)
function getUsableRPCs(chain) {
    if (!chain.rpc || chain.rpc.length === 0) return [];
    
    return chain.rpc.filter(rpc => {
        if (typeof rpc === 'object') rpc = rpc.url || '';
        if (typeof rpc !== 'string') return false;
        // Skip websocket, skip ones needing API keys
        if (rpc.startsWith('wss://')) return false;
        if (rpc.includes('${')) return false;
        if (rpc.includes('{')) return false;
        return rpc.startsWith('http');
    }).map(rpc => typeof rpc === 'object' ? rpc.url : rpc);
}

// Fetch all chains from chainid.network
async function fetchChains() {
    try {
        const response = await fetch('https://chainid.network/chains.json');
        allChains = await response.json();
        
        // Separate mainnet and testnet
        mainnetChains = [];
        testnetChains = [];
        
        allChains.forEach(chain => {
            // Only include chains that have usable RPCs
            const rpcs = getUsableRPCs(chain);
            if (rpcs.length === 0) return;
            
            if (isTestnet(chain)) {
                testnetChains.push(chain);
            } else {
                mainnetChains.push(chain);
            }
        });
        
        // Sort by chain ID
        mainnetChains.sort((a, b) => a.chainId - b.chainId);
        testnetChains.sort((a, b) => a.chainId - b.chainId);
        
        updateStats();
        console.log(`Loaded ${mainnetChains.length} mainnets and ${testnetChains.length} testnets`);
    } catch (error) {
        console.error('Failed to fetch chains:', error);
        mainnetList.innerHTML = '<div class="placeholder">Failed to load chain data. Please refresh.</div>';
        testnetList.innerHTML = '<div class="placeholder">Failed to load chain data. Please refresh.</div>';
    }
}

// Update statistics display
function updateStats() {
    mainnetCountEl.textContent = `Mainnets: ${mainnetChains.length}`;
    testnetCountEl.textContent = `Testnets: ${testnetChains.length}`;
    checkedCountEl.textContent = `Checked: ${totalChecked}`;
    withBalanceEl.textContent = `With Balance: ${totalWithBalance}`;
}

// Create a chain card HTML
function createChainCard(chain, status = 'pending') {
    const card = document.createElement('div');
    card.className = `chain-card ${status}`;
    card.id = `chain-${chain.chainId}`;
    card.dataset.chainId = chain.chainId;
    card.dataset.name = chain.name.toLowerCase();
    
    const symbol = chain.nativeCurrency ? chain.nativeCurrency.symbol : '???';
    
    let balanceHTML = '';
    if (status === 'checking') {
        balanceHTML = `<span class="balance-value loading">Checking...</span>`;
    } else if (status === 'pending') {
        balanceHTML = `<span class="balance-value loading">Pending</span>`;
    }
    
    card.innerHTML = `
        <div class="chain-info">
            <div class="chain-name">${chain.name}</div>
            <div class="chain-details">
                <span class="chain-id-badge">ID: ${chain.chainId}</span>
                ${symbol}
            </div>
        </div>
        <div class="balance-info">
            ${balanceHTML}
        </div>
    `;
    
    return card;
}

// Update a chain card with balance result
function updateChainCard(chainId, balance, error, symbol) {
    const card = document.getElementById(`chain-${chainId}`);
    if (!card) return;
    
    card.classList.remove('checking', 'pending');
    
    const balanceInfo = card.querySelector('.balance-info');
    
    if (error) {
        card.classList.add('error');
        balanceInfo.innerHTML = `<span class="balance-value error-text">RPC Error</span>`;
    } else if (balance === '0' || balance === '0.0') {
        balanceInfo.innerHTML = `
            <span class="balance-value zero">0</span>
            <div class="balance-symbol">${symbol}</div>
        `;
    } else {
        card.classList.add('has-balance');
        balanceInfo.innerHTML = `
            <span class="balance-value">${balance}</span>
            <div class="balance-symbol">${symbol}</div>
        `;
    }
}

// Check balance for a single chain
async function checkBalance(chain, address) {
    const rpcs = getUsableRPCs(chain);
    const symbol = chain.nativeCurrency ? chain.nativeCurrency.symbol : '???';
    const decimals = chain.nativeCurrency ? chain.nativeCurrency.decimals : 18;
    
    for (const rpc of rpcs.slice(0, 3)) { // Try up to 3 RPCs
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
            
            const response = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            const data = await response.json();
            
            if (data.result) {
                const balanceWei = BigInt(data.result);
                const balanceFormatted = formatBalance(balanceWei, decimals);
                return { balance: balanceFormatted, error: null, symbol };
            } else if (data.error) {
                continue; // Try next RPC
            }
        } catch (e) {
            continue; // Try next RPC
        }
    }
    
    return { balance: null, error: true, symbol };
}

// Format balance from wei to human-readable
function formatBalance(balanceWei, decimals) {
    if (balanceWei === 0n) return '0';
    
    const divisor = 10n ** BigInt(decimals);
    const integerPart = balanceWei / divisor;
    const remainder = balanceWei % divisor;
    
    if (remainder === 0n) return integerPart.toString();
    
    let remainderStr = remainder.toString().padStart(decimals, '0');
    // Trim trailing zeros, keep up to 6 decimal places
    remainderStr = remainderStr.slice(0, 6).replace(/0+$/, '');
    
    if (remainderStr === '') return integerPart.toString();
    return `${integerPart}.${remainderStr}`;
}

// Main function to check all balances
async function checkAllBalances() {
    const address = walletInput.value.trim();
    
    // Validate address
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        alert('Please enter a valid EVM wallet address (0x...)');
        return;
    }
    
    if (isChecking) return;
    isChecking = true;
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    totalChecked = 0;
    totalWithBalance = 0;
    results = {};
    
    // Show progress
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    
    // Render initial cards
    renderChainCards(mainnetChains, mainnetList, 'pending');
    renderChainCards(testnetChains, testnetList, 'pending');
    
    const totalChains = mainnetChains.length + testnetChains.length;
    const allChainsToCheck = [...mainnetChains, ...testnetChains];
    
    // Process in batches of 20 concurrent requests
    const batchSize = 20;
    
    for (let i = 0; i < allChainsToCheck.length; i += batchSize) {
        const batch = allChainsToCheck.slice(i, i + batchSize);
        
        // Mark batch as checking
        batch.forEach(chain => {
            const card = document.getElementById(`chain-${chain.chainId}`);
            if (card) {
                card.classList.remove('pending');
                card.classList.add('checking');
                const balInfo = card.querySelector('.balance-value');
                if (balInfo) balInfo.textContent = 'Checking...';
            }
        });
        
        const promises = batch.map(async (chain) => {
            const result = await checkBalance(chain, address);
            results[chain.chainId] = result;
            
            totalChecked++;
            if (result.balance && result.balance !== '0' && result.balance !== '0.0') {
                totalWithBalance++;
            }
            
            // Update UI
            updateChainCard(chain.chainId, result.balance, result.error, result.symbol);
            updateStats();
            
            // Update progress
            const progress = Math.round((totalChecked / totalChains) * 100);
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${progress}% (${totalChecked}/${totalChains})`;
        });
        
        await Promise.all(promises);
    }
    
    // Done
    isChecking = false;
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check Balances';
    
    // Apply filters
    applyFilters();
    
    // Sort: put chains with balance on top
    sortByBalance(mainnetList);
    sortByBalance(testnetList);
}

// Render chain cards in a list
function renderChainCards(chains, container, status) {
    container.innerHTML = '';
    chains.forEach(chain => {
        const card = createChainCard(chain, status);
        container.appendChild(card);
    });
}

// Sort cards to put ones with balance on top
function sortByBalance(container) {
    const cards = Array.from(container.querySelectorAll('.chain-card'));
    cards.sort((a, b) => {
        const aHasBalance = a.classList.contains('has-balance') ? 0 : 1;
        const bHasBalance = b.classList.contains('has-balance') ? 0 : 1;
        return aHasBalance - bHasBalance;
    });
    cards.forEach(card => container.appendChild(card));
}

// Apply filters (hide zero, hide errors, search)
function applyFilters() {
    const hideZero = document.getElementById('hideZero').checked;
    const hideErrors = document.getElementById('hideErrors').checked;
    const search = document.getElementById('searchChain').value.toLowerCase();
    
    document.querySelectorAll('.chain-card').forEach(card => {
        let visible = true;
        
        if (hideZero && !card.classList.contains('has-balance') && !card.classList.contains('checking') && !card.classList.contains('pending')) {
            visible = false;
        }
        
        if (hideErrors && card.classList.contains('error')) {
            visible = false;
        }
        
        if (search && !card.dataset.name.includes(search)) {
            visible = false;
        }
        
        card.style.display = visible ? 'flex' : 'none';
    });
}

// Allow Enter key to trigger check
walletInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAllBalances();
});

// Load chains on page load
fetchChains();
