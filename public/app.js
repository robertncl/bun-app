const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const dashboard = document.getElementById('dashboard');
let chartInstance = null;
let currentSymbol = null;
let updateInterval = null;

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Search Stocks
const handleSearch = async (e) => {
    const query = e.target.value;
    if (query.length < 1) {
        searchResults.classList.add('hidden');
        return;
    }

    try {
        const res = await fetch(`/api/search?q=${query}`);
        const data = await res.json();

        searchResults.innerHTML = '';
        if (data.length > 0) {
            data.forEach(stock => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `
                    <span class="font-bold">${stock.symbol}</span>
                    <span class="text-sm text-gray-400">${stock.name}</span>
                `;
                div.onclick = () => loadStock(stock.symbol);
                searchResults.appendChild(div);
            });
            searchResults.classList.remove('hidden');
        } else {
            searchResults.classList.add('hidden');
        }
    } catch (err) {
        console.error('Search failed:', err);
    }
};

searchInput.addEventListener('input', debounce(handleSearch, 300));

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.add('hidden');
    }
});

// Load Stock Data
async function loadStock(symbol) {
    currentSymbol = symbol;
    searchResults.classList.add('hidden');
    searchInput.value = '';

    if (updateInterval) clearInterval(updateInterval);

    await updateStockData();
    updateInterval = setInterval(updateStockData, 3000);
}

async function updateStockData() {
    if (!currentSymbol) return;

    try {
        const [quoteRes, historyRes] = await Promise.all([
            fetch(`/api/quote/${currentSymbol}`),
            fetch(`/api/history/${currentSymbol}`)
        ]);

        const quote = await quoteRes.json();
        const history = await historyRes.json();

        renderDashboard(quote, history);
    } catch (err) {
        console.error('Failed to load stock data:', err);
    }
}

function renderDashboard(quote, history) {
    const isUp = quote.change >= 0;
    const changeClass = isUp ? 'price-up' : 'price-down';
    const changeSign = isUp ? '+' : '';

    dashboard.innerHTML = `
        <div class="stock-card">
            <div class="stock-header">
                <div class="stock-info">
                    <h1>${quote.symbol}</h1>
                    <div class="stock-name">${quote.name}</div>
                </div>
                <div class="stock-price">
                    <span class="current-price">$${quote.price.toFixed(2)}</span>
                    <span class="price-change ${changeClass}">
                        ${changeSign}${quote.change.toFixed(2)}%
                    </span>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="stockChart"></canvas>
            </div>
        </div>
    `;

    renderChart(history, isUp);
}

function renderChart(data, isUp) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const color = isUp ? '#4ade80' : '#f87171';
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, isUp ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)');
    gradient.addColorStop(1, 'rgba(30, 41, 59, 0)');

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (context) => `$${context.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}
