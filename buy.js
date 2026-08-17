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
let currentPrice = 0;
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
    await checkMarketStatus();
    await loadBuyOrders();
    
    // Listen for TradingView widget updates
    setupTradingViewListener();
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
// 4. MARKET STATUS from TradingView
// -------------------------------------------------------------
function checkMarketStatus() {
    const now = new Date();
    const day = now.getDay();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    currentDay = days[day];
    isWeekend = (day === 0 || day === 6);

    // Earning rates: Monday=6%, Tuesday=5%, Wednesday=4%, Thursday=3%, Friday=2%
    const rates = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 0: 0, 6: 0 };
    earningRate = rates[day] || 0;

    // Update UI
    updateDayInfo();
}

function updateDayInfo() {
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
// 5. TRADINGVIEW WIDGET LISTENER
// -------------------------------------------------------------
function setupTradingViewListener() {
    // Listen for TradingView widget messages
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'tv-widget') {
            const data = event.data.data;
            if (data && data.symbols) {
                const symbol = data.symbols.find(s => s.symbol === 'NASDAQ:ACB');
                if (symbol) {
                    updateMarketData(symbol);
                }
            }
        }
    });

    // Also try to get data from the widget's iframe
    const widgetContainer = document.querySelector('.tradingview-widget-container');
    if (widgetContainer) {
        // Poll for price updates from TradingView iframe
        setInterval(() => {
            const priceElement = document.querySelector('.tv-symbol-price');
            if (priceElement) {
                const priceText = priceElement.textContent;
                if (priceText) {
                    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                    if (price && price > 0) {
                        currentPrice = price;
                        document.getElementById('tvCurrentPrice').textContent = `$${price.toFixed(2)}`;
                    }
                }
            }
        }, 5000);
    }
}

function updateMarketData(symbol) {
    const price = symbol.price || 0;
    const change = symbol.change || 0;
    const changePercent = symbol.changePercent || 0;
    const marketStatus = symbol.marketStatus || 'closed';
    const exchange = symbol.exchange || 'NASDAQ';

    currentPrice = price;

    // Update UI
    document.getElementById('tvCurrentPrice').textContent = `$${price.toFixed(2)}`;
    
    const changeDisplay = document.getElementById('tvDayChange');
    changeDisplay.textContent = `${change >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
    changeDisplay.style.color = change >= 0 ? '#28a745' : '#dc3545';

    const statusDisplay = document.getElementById('tvMarketStatus');
    const statusMap = {
        'open': '✅ Open',
        'closed': '🔒 Closed',
        'pre-market': '⏰ Pre-Market',
        'after-hours': '⏰ After Hours'
    };
    statusDisplay.textContent = statusMap[marketStatus] || marketStatus;
    statusDisplay.className = `value ${marketStatus}`;

    // Update market open status
    marketOpen = marketStatus === 'open';
    isWeekend = marketStatus === 'closed' && new Date().getDay() === 0 || new Date().getDay() === 6;

    // Update buy button
    const buyBtn = document.querySelector('.btn-buy');
    buyBtn.disabled = !marketOpen || isWeekend;
    if (buyBtn.disabled) {
        buyBtn.style.opacity = '0.6';
        buyBtn.style.cursor = 'not-allowed';
    } else {
        buyBtn.style.opacity = '1';
        buyBtn.style.cursor = 'pointer';
    }

    // Calculate earnings preview if amount is entered
    calculateEarnings();
}

// -------------------------------------------------------------
// 6. SET AMOUNT
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
// 7. CALCULATE EARNINGS
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
// 8. PLACE BUY ORDER
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
// 9. GET WEEKEND DATE
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
// 10. LOAD BUY ORDERS
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
