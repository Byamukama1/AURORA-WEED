// -------------------------------------------------------------
// 1. FIREBASE INIT
// -------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, increment, runTransaction, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAiC0kYQY5EUzjrqHuU4GNdVEjsIp61tEI",
    authDomain: "aurora-weed.firebaseapp.com",
    projectId: "aurora-weed",
    storageBucket: "aurora-weed.firebasestorage.app",
    messagingSenderId: "306985359795",
    appId: "1:306985359795:web:0c6178fe5579797bd213c6",
    measurementId: "G-R3V55M351H"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("✅ Firebase initialized");

let currentUser = null;
let userData = null;
let currentPrice = 4.52; // Default fallback price
let currentDay = '';
let earningRate = 0;
let isWeekend = false;
let marketOpen = false;

// -------------------------------------------------------------
// 2. AUTH GUARD
// -------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;
    console.log("✅ User logged in:", user.email);
    await loadUserData();
    checkMarketStatus();
    await loadBuyOrders();
    
    // Start monitoring TradingView data
    setTimeout(extractTradingViewData, 3000);
    setInterval(extractTradingViewData, 10000);
    
    // Fallback: fetch from Alpha Vantage if TradingView doesn't load
    setTimeout(() => {
        if (document.getElementById('tvCurrentPrice').textContent === '⏳ Loading...') {
            fetchStockPriceFallback();
        }
    }, 5000);
});

// -------------------------------------------------------------
// 3. LOAD USER DATA
// -------------------------------------------------------------
async function loadUserData() {
    try {
        const userDoc = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userDoc);

        if (docSnap.exists()) {
            userData = docSnap.data();
            updateBalanceUI();
        } else {
            console.warn("User document not found");
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

function updateBalanceUI() {
    if (!userData) return;
    const available = userData.uninvestedBalance || 0;
    const invested = userData.investedAmount || 0;
    document.getElementById('availableBalance').textContent = `$${available.toFixed(2)}`;
    document.getElementById('investedBalance').textContent = `$${invested.toFixed(2)}`;
}

// -------------------------------------------------------------
// 4. EXTRACT DATA FROM TRADINGVIEW WIDGET
// -------------------------------------------------------------
function extractTradingViewData() {
    try {
        // Try to find price data in the TradingView widget
        const widgetContainer = document.querySelector('.tradingview-widget-container');
        if (!widgetContainer) return;

        // Look for price elements within the widget
        const allElements = widgetContainer.querySelectorAll('*');
        let foundPrice = false;
        let priceText = '';
        let changeText = '';
        let statusText = '';

        for (const el of allElements) {
            const text = el.textContent || '';
            // Look for price pattern (e.g., $4.52 or 4.52)
            if (text.match(/\$\d+\.\d{2}/) || text.match(/^\d+\.\d{2}$/)) {
                const match = text.match(/\d+\.\d{2}/);
                if (match) {
                    priceText = match[0];
                    foundPrice = true;
                }
            }
            // Look for change percentage
            if (text.includes('%') && (text.includes('+') || text.includes('-'))) {
                const match = text.match(/[+-]\d+\.\d{2}%/);
                if (match) {
                    changeText = match[0];
                }
            }
            // Look for market status
            if (text.includes('Open') || text.includes('Closed') || text.includes('Pre-Market') || text.includes('After Hours')) {
                if (text.includes('Open')) statusText = 'Open';
                else if (text.includes('Closed')) statusText = 'Closed';
                else if (text.includes('Pre-Market')) statusText = 'Pre-Market';
                else if (text.includes('After Hours')) statusText = 'After Hours';
            }
        }

        // Update UI with found data
        if (foundPrice && priceText) {
            const price = parseFloat(priceText);
            if (price > 0) {
                currentPrice = price;
                document.getElementById('tvCurrentPrice').textContent = `$${price.toFixed(2)}`;
                document.getElementById('tvCurrentPrice').style.color = '#1a3f1a';
            }
        }

        if (changeText) {
            document.getElementById('tvDayChange').textContent = changeText;
            const isPositive = changeText.includes('+');
            document.getElementById('tvDayChange').style.color = isPositive ? '#28a745' : '#dc3545';
        }

        if (statusText) {
            document.getElementById('tvMarketStatus').textContent = statusText;
            const statusMap = {
                'Open': '#28a745',
                'Closed': '#dc3545',
                'Pre-Market': '#ffc107',
                'After Hours': '#ffc107'
            };
            document.getElementById('tvMarketStatus').style.color = statusMap[statusText] || '#1a3f1a';
            
            // Update market state
            marketOpen = statusText === 'Open';
            isWeekend = statusText === 'Closed' && (new Date().getDay() === 0 || new Date().getDay() === 6);
            updateBuyButton();
        }

        // Also try to get data from TradingView's iframe via postMessage
        const iframes = widgetContainer.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                iframe.contentWindow.postMessage({
                    type: 'tv-widget-request',
                    data: { action: 'getData' }
                }, '*');
            } catch (e) {
                // Silently fail - cross-origin restrictions
            }
        }

    } catch (error) {
        console.warn('Error extracting TradingView data:', error);
    }
}

// -------------------------------------------------------------
// 5. FALLBACK: Fetch from Alpha Vantage
// -------------------------------------------------------------
async function fetchStockPriceFallback() {
    try {
        const response = await fetch('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=ACB&apikey=demo');
        const data = await response.json();

        if (data['Global Quote']) {
            const quote = data['Global Quote'];
            const price = parseFloat(quote['05. price']);
            const change = parseFloat(quote['10. change percent'].replace('%', ''));

            if (price > 0) {
                currentPrice = price;
                document.getElementById('tvCurrentPrice').textContent = `$${price.toFixed(2)}`;
                document.getElementById('tvCurrentPrice').style.color = '#1a3f1a';
                
                const changeDisplay = document.getElementById('tvDayChange');
                changeDisplay.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
                changeDisplay.style.color = change >= 0 ? '#28a745' : '#dc3545';
                
                document.getElementById('tvMarketStatus').textContent = 'Open (via API)';
                document.getElementById('tvMarketStatus').style.color = '#28a745';
                marketOpen = true;
                updateBuyButton();
            }
        }
    } catch (error) {
        console.warn('Fallback price fetch error:', error);
    }
}

// -------------------------------------------------------------
// 6. MARKET STATUS & DAY DETECTION
// -------------------------------------------------------------
function checkMarketStatus() {
    const now = new Date();
    const day = now.getDay();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    currentDay = days[day];
    isWeekend = (day === 0 || day === 6);

    const rates = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 0: 0, 6: 0 };
    earningRate = rates[day] || 0;

    // Update day info
    document.getElementById('dayBadge').textContent = `📅 ${currentDay}`;
    const netRate = Math.max(0, earningRate - 1);
    if (isWeekend) {
        document.getElementById('earningRate').textContent = '🔒 No buying on weekends';
        document.getElementById('earningRate').style.color = '#dc3545';
    } else {
        document.getElementById('earningRate').textContent = `Earning Rate: ${earningRate}% (Net: ${netRate}%)`;
        document.getElementById('earningRate').style.color = '#28a745';
    }
}

// -------------------------------------------------------------
// 7. UPDATE BUY BUTTON
// -------------------------------------------------------------
function updateBuyButton() {
    const buyBtn = document.querySelector('.btn-buy');
    const isDisabled = !marketOpen || isWeekend;
    buyBtn.disabled = isDisabled;
    buyBtn.style.opacity = isDisabled ? '0.6' : '1';
    buyBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
    
    if (isDisabled) {
        buyBtn.title = marketOpen ? 'Market is closed' : 'Weekend - No trading';
    } else {
        buyBtn.title = 'Click to buy ACB shares';
    }
}

// -------------------------------------------------------------
// 8. SET AMOUNT
// -------------------------------------------------------------
window.setAmount = function(amount) {
    document.getElementById('investAmount').value = amount;
    calculateEarnings();
};

window.setMaxAmount = function() {
    const available = userData?.uninvestedBalance || 0;
    document.getElementById('investAmount').value = available.toFixed(2);
    calculateEarnings();
};

// -------------------------------------------------------------
// 9. CALCULATE EARNINGS
// -------------------------------------------------------------
document.getElementById('investAmount').addEventListener('input', calculateEarnings);

function calculateEarnings() {
    const amount = parseFloat(document.getElementById('investAmount').value);
    const preview = document.getElementById('earningsPreview');

    if (!amount || amount <= 0 || isWeekend || !marketOpen) {
        preview.style.display = 'none';
        return;
    }

    const netRate = Math.max(0, earningRate - 1);
    const earnings = amount * (netRate / 100);
    const total = amount + earnings;

    preview.style.display = 'block';
    document.getElementById('previewAmount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('previewDay').textContent = currentDay;
    document.getElementById('previewRate').textContent = `${earningRate}% (Net: ${netRate}%)`;
    document.getElementById('previewEarnings').textContent = `$${earnings.toFixed(2)}`;
    document.getElementById('previewTotal').textContent = `$${total.toFixed(2)}`;
}

// -------------------------------------------------------------
// 10. PLACE BUY ORDER
// -------------------------------------------------------------
window.placeBuyOrder = async function() {
    if (isWeekend) {
        alert('❌ Cannot buy on weekends. Market is closed.');
        return;
    }

    if (!marketOpen) {
        alert('❌ Market is currently closed. Please trade during market hours (9:30 AM - 4:00 PM ET).');
        return;
    }

    const amount = parseFloat(document.getElementById('investAmount').value);
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount to invest.');
        return;
    }

    const available = userData?.uninvestedBalance || 0;
    if (amount > available) {
        alert(`❌ Insufficient balance. You have $${available.toFixed(2)} available.`);
        return;
    }

    if (!currentPrice || currentPrice <= 0) {
        alert('❌ Unable to fetch current stock price. Please try again.');
        return;
    }

    const shares = amount / currentPrice;
    const netRate = Math.max(0, earningRate - 1);
    const expectedEarnings = amount * (netRate / 100);
    const totalReturn = amount + expectedEarnings;

    const confirmMsg = `📊 Order Summary:
------------------------
Investment: $${amount.toFixed(2)}
Buy Day: ${currentDay}
Price per share: $${currentPrice.toFixed(2)}
Shares: ${shares.toFixed(4)}
Earning Rate: ${earningRate}% (Net: ${netRate}%)
Expected Earnings: $${expectedEarnings.toFixed(2)}
Total Return (Weekend): $${totalReturn.toFixed(2)}

⚠️ You will receive your investment + earnings on Saturday/Sunday.
Do you want to proceed?`;

    if (!confirm(confirmMsg)) return;

    try {
        const buyBtn = document.querySelector('.btn-buy');
        buyBtn.disabled = true;
        buyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", currentUser.uid);
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists()) {
                throw new Error("User document not found");
            }

            const userData = userSnap.data();
            const currentAvailable = userData.uninvestedBalance || 0;

            if (amount > currentAvailable) {
                throw new Error(`Insufficient balance. Available: $${currentAvailable.toFixed(2)}`);
            }

            transaction.update(userRef, {
                uninvestedBalance: increment(-amount),
                investedAmount: increment(amount)
            });

            const orderRef = doc(collection(db, "users", currentUser.uid, "orders"));
            transaction.set(orderRef, {
                type: 'buy',
                amount: amount,
                pricePerShare: currentPrice,
                shares: shares,
                day: currentDay,
                dayIndex: new Date().getDay(),
                earningRate: earningRate,
                netRate: netRate,
                expectedEarnings: expectedEarnings,
                totalReturn: totalReturn,
                status: 'pending',
                marketOpen: marketOpen,
                createdAt: serverTimestamp(),
                expectedSettlement: getWeekendDate()
            });

            const activityRef = doc(collection(db, "users", currentUser.uid, "activity"));
            transaction.set(activityRef, {
                type: 'buy',
                description: `Bought ACB shares - $${amount.toFixed(2)} at $${currentPrice.toFixed(2)}`,
                amount: -amount,
                status: 'pending',
                createdAt: serverTimestamp()
            });
        });

        await loadUserData();
        await loadBuyOrders();

        alert(`✅ Buy order placed successfully!
Investment: $${amount.toFixed(2)}
Expected Earnings: $${expectedEarnings.toFixed(2)}
Total Return: $${totalReturn.toFixed(2)}
Settlement: ${getWeekendDate().toLocaleDateString()}`);

        document.getElementById('investAmount').value = '';
        document.getElementById('earningsPreview').style.display = 'none';

    } catch (error) {
        console.error("Error placing buy order:", error);
        alert(`❌ ${error.message}`);
    } finally {
        const buyBtn = document.querySelector('.btn-buy');
        buyBtn.disabled = !marketOpen || isWeekend;
        buyBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Buy ACB Shares';
    }
};

// -------------------------------------------------------------
// 11. GET WEEKEND DATE
// -------------------------------------------------------------
function getWeekendDate() {
    const now = new Date();
    const day = now.getDay();
    let daysToAdd = 0;
    if (day === 0) daysToAdd = 6;
    else if (day === 1) daysToAdd = 5;
    else if (day === 2) daysToAdd = 4;
    else if (day === 3) daysToAdd = 3;
    else if (day === 4) daysToAdd = 2;
    else if (day === 5) daysToAdd = 1;
    else if (day === 6) daysToAdd = 0;

    const weekendDate = new Date(now);
    weekendDate.setDate(now.getDate() + daysToAdd);
    return weekendDate;
}

// -------------------------------------------------------------
// 12. LOAD BUY ORDERS
// -------------------------------------------------------------
async function loadBuyOrders() {
    const container = document.getElementById('buyOrders');
    try {
        const ordersRef = collection(db, "users", currentUser.uid, "orders");
        const q = query(ordersRef, where("type", "==", "buy"), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No buy orders yet.</p>
                </div>
            `;
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const time = data.createdAt?.toDate?.() || new Date();
            const timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
            const status = data.status || 'pending';
            const statusClass = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'pending';

            html += `
                <div class="order-item">
                    <div class="order-info">
                        <span class="amount">$${data.amount?.toFixed(2) || '0.00'}</span>
                        <span class="details">${data.day || 'N/A'} · ${data.shares?.toFixed(4) || 0} shares @ $${data.pricePerShare?.toFixed(2) || '0.00'}</span>
                        <span class="details">Expected: $${data.expectedEarnings?.toFixed(2) || '0.00'} (${data.netRate || 0}% net)</span>
                    </div>
                    <span class="order-status ${statusClass}">${status.toUpperCase()}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("Error loading orders:", error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Could not load orders.</p>
            </div>
        `;
    }
}
