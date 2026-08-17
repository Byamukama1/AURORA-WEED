// -------------------------------------------------------------
// 1. FIREBASE INIT
// -------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, increment, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    document.getElementById('availableBalance').textContent = `$${available.toFixed(2)}`;
    document.getElementById('investedBalance').textContent = `$${invested.toFixed(2)}`;
}

// -------------------------------------------------------------
// 4. MARKET STATUS & DAY DETECTION
// -------------------------------------------------------------
function checkMarketStatus() {
    const now = new Date();
    const day = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    currentDay = days[day];
    isWeekend = (day === 0 || day === 6);

    // Earning rates based on day (Monday=5%, Tuesday=4%, etc.)
    const rates = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 0: 0, 6: 0 };
    earningRate = rates[day] || 0;

    // Update UI
    const statusText = document.getElementById('marketStatusText');
    const statusIcon = document.querySelector('.status-icon i');
    const dayDisplay = document.getElementById('marketDay');

    if (isWeekend) {
        statusText.textContent = '🔒 Closed (Weekend)';
        statusText.style.color = '#dc3545';
        statusIcon.className = 'fas fa-circle closed';
        dayDisplay.textContent = `📅 ${currentDay} - Selling Day`;
        document.getElementById('dayBadge').textContent = `📅 ${currentDay} (Selling Day)`;
        document.getElementById('earningRate').textContent = '🔒 No buying on weekends';
        document.getElementById('earningRate').style.color = '#dc3545';
    } else {
        statusText.textContent = '✅ Open for Buying';
        statusText.style.color = '#28a745';
        statusIcon.className = 'fas fa-circle open';
        dayDisplay.textContent = `📅 ${currentDay} - Buying Day`;
        document.getElementById('dayBadge').textContent = `📅 ${currentDay}`;
        document.getElementById('earningRate').textContent = `Earning Rate: ${earningRate}%`;
        document.getElementById('earningRate').style.color = '#28a745';
    }

    // Disable buy button on weekends
    document.querySelector('.btn-buy').disabled = isWeekend;
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

            document.getElementById('currentPrice').textContent = `$${currentPrice.toFixed(2)}`;
            const changeDisplay = document.getElementById('priceChange');
            changeDisplay.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
            changeDisplay.style.color = change >= 0 ? '#28a745' : '#dc3545';
        } else {
            // Fallback price
            currentPrice = 4.52;
            document.getElementById('currentPrice').textContent = `$${currentPrice.toFixed(2)}`;
            document.getElementById('priceChange').textContent = '+2.30%';
            document.getElementById('priceChange').style.color = '#28a745';
        }
    } catch (error) {
        console.warn('Price fetch error:', error);
        currentPrice = 4.52;
        document.getElementById('currentPrice').textContent = `$${currentPrice.toFixed(2)}`;
        document.getElementById('priceChange').textContent = '+2.30%';
        document.getElementById('priceChange').style.color = '#28a745';
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

    if (!amount || amount <= 0 || isWeekend) {
        preview.style.display = 'none';
        return;
    }

    const netRate = Math.max(0, earningRate - 1); // Company deducts 1%
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
        alert('❌ Cannot buy on weekends. Buying is available Monday-Friday.');
        return;
    }

    const amount = parseFloat(document.getElementById('investAmount').value);
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount to invest.');
        return;
    }

    const available = userData
