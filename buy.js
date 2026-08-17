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
let currentPrice = 4.52;
let currentDay = '';
let earningRate = 0;
let isWeekend = false;
let marketOpen = true;

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
    await fetchStockPrice();
    await loadBuyOrders();
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
    const total = available + invested;
    
    document.getElementById('availableBalanceTop').textContent = `$${available.toFixed(2)}`;
    document.getElementById('investedBalanceTop').textContent = `$${invested.toFixed(2)}`;
    document.getElementById('totalBalanceTop').textContent = `$${total.toFixed(2)}`;
}

// -------------------------------------------------------------
// 4. MARKET STATUS & DAY DETECTION
// -------------------------------------------------------------
function checkMarketStatus() {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours + minutes / 60;
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    currentDay = days[day];
    isWeekend = (day === 0 || day === 6);

    // NASDAQ trading hours: 9:30 AM - 4:00 PM ET
    const marketOpenTime = 9.5;
    const marketCloseTime = 16.0;

    // Check if market is open
    marketOpen = !isWeekend && (currentTime >= marketOpenTime && currentTime < marketCloseTime);

    // Earning rates: Monday=6%, Tuesday=5%, Wednesday=4%, Thursday=3%, Friday=2%
    const rates = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 0: 0, 6: 0 };
    earningRate = rates[day] || 0;

    updateUI();
}

function updateUI() {
    const netRate = Math.max(0, earningRate - 1);
    
    // Day badge
    document.getElementById('dayBadge').textContent = `📅 ${currentDay}`;
    
    // Earning rate
    if (isWeekend) {
        document.getElementById('earningRateDisplay').textContent = '🔒 No buying on weekends';
        document.getElementById('earningRateDisplay').style.color = '#dc3545';
    } else {
        document.getElementById('earningRateDisplay').textContent = `Earning Rate: ${earningRate}% (Net: ${netRate}%)`;
        document.getElementById('earningRateDisplay').style.color = '#28a745';
    }

    // Market Status
    const statusDisplay = document.getElementById('marketStatusDisplay');
    if (isWeekend) {
        statusDisplay.textContent = '🔒 Closed (Weekend)';
        statusDisplay.className = 'value closed';
    } else if (!marketOpen) {
        statusDisplay.textContent = '⏰ After Hours';
        statusDisplay.className = 'value after-hours';
    } else {
        statusDisplay.textContent = '✅ Open';
        statusDisplay.className = 'value open';
    }

    // Buy button
    const buyBtn = document.querySelector('.btn-buy');
    const isDisabled = !marketOpen || isWeekend;
    buyBtn.disabled = isDisabled;
    buyBtn.style.opacity = isDisabled ? '0.6' : '1';
    buyBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
}

// -------------------------------------------------------------
// 5. FETCH STOCK PRICE
// -------------------------------------------------------------
async function fetchStockPrice() {
    try {
        const response = await fetch('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=ACB&apikey=demo');
        const data = await response.json();

        if (data['Global Quote']) {
            const quote = data['Global Quote'];
            currentPrice = parseFloat(quote['05. price']);
            const change = parseFloat(quote['10. change percent'].replace('%', ''));

            document.getElementById('currentPriceDisplay').textContent = `$${currentPrice.toFixed(2)}`;
            
            const changeDisplay = document.getElementById('dayChangeDisplay');
            changeDisplay.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
            changeDisplay.className = `value ${change >= 0 ? 'positive' : 'negative'}`;
        } else {
            // Fallback
            currentPrice = 4.52;
            document.getElementById('currentPriceDisplay').textContent = `$${currentPrice.toFixed(2)}`;
            document.getElementById('dayChangeDisplay').textContent = '+2.30%';
            document.getElementById('dayChangeDisplay').className = 'value positive';
        }
    } catch (error) {
        console.warn('Price fetch error:', error);
        currentPrice = 4.52;
        document.getElementById('currentPriceDisplay').textContent = `$${currentPrice.toFixed(2)}`;
        document.getElementById('dayChangeDisplay').textContent = '+2.30%';
        document.getElementById('dayChangeDisplay').className = 'value positive';
    }
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

// Refresh price every 30 seconds
setInterval(() => {
    if (marketOpen) {
        fetchStockPrice();
    }
}, 30000);

// Refresh market status every minute
setInterval(() => {
    checkMarketStatus();
}, 60000);
