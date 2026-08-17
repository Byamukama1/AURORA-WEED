// -------------------------------------------------------------
// 1. FIREBASE INIT
// -------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, setDoc, collection, addDoc, deleteDoc, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let wallets = [];

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
});

// -------------------------------------------------------------
// 3. LOGOUT
// -------------------------------------------------------------
window.logout = async function() {
    await signOut(auth);
    window.location.href = "login.html";
};

// -------------------------------------------------------------
// 4. LOAD USER DATA
// -------------------------------------------------------------
async function loadUserData() {
    try {
        const userDoc = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userDoc);

        if (docSnap.exists()) {
            userData = docSnap.data();
            updateUI();
            await loadWallets();
            await loadRecentActivity();
        } else {
            // Create default user document
            const defaultData = {
                username: currentUser.email?.split('@')[0] || 'User',
                email: currentUser.email,
                country: 'United States',
                currency: 'USD',
                uninvestedBalance: 0,
                investedAmount: 0,
                totalBalance: 0,
                wallets: [],
                createdAt: serverTimestamp()
            };
            await setDoc(userDoc, defaultData);
            userData = defaultData;
            updateUI();
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// -------------------------------------------------------------
// 5. UPDATE UI
// -------------------------------------------------------------
function updateUI() {
    if (!userData) return;

    // Balance
    const total = (userData.uninvestedBalance || 0) + (userData.investedAmount || 0);
    document.getElementById('totalBalance').textContent = `$${total.toFixed(2)}`;
    document.getElementById('availableBalance').textContent = `$${(userData.uninvestedBalance || 0).toFixed(2)}`;
    document.getElementById('investedBalance').textContent = `$${(userData.investedAmount || 0).toFixed(2)}`;

    // Profile
    document.getElementById('displayUsername').textContent = userData.username || 'Not set';
    document.getElementById('displayEmail').textContent = userData.email || currentUser?.email || 'Not set';
    document.getElementById('displayCountry').textContent = userData.country || 'Not set';
    document.getElementById('displayCurrency').textContent = userData.currency || 'USD';

    // Edit form
    document.getElementById('editUsername').value = userData.username || '';
    document.getElementById('editCountry').value = userData.country || '';
    document.getElementById('editCurrency').value = userData.currency || 'USD';
}

// -------------------------------------------------------------
// 6. EDIT PROFILE
// -------------------------------------------------------------
window.toggleEditProfile = function() {
    const display = document.getElementById('profileDisplay');
    const edit = document.getElementById('profileEdit');

    if (edit.style.display === 'none') {
        edit.style.display = 'block';
        display.style.display = 'none';
        // Pre-fill edit form
        document.getElementById('editUsername').value = userData.username || '';
        document.getElementById('editCountry').value = userData.country || '';
        document.getElementById('editCurrency').value = userData.currency || 'USD';
    } else {
        edit.style.display = 'none';
        display.style.display = 'block';
    }
};

window.saveProfile = async function() {
    try {
        const username = document.getElementById('editUsername').value.trim();
        const country = document.getElementById('editCountry').value.trim();
        const currency = document.getElementById('editCurrency').value;

        if (!username) {
            alert('Username is required');
            return;
        }

        const userDoc = doc(db, "users", currentUser.uid);
        await updateDoc(userDoc, {
            username: username,
            country: country,
            currency: currency,
            updatedAt: serverTimestamp()
        });

        // Update local data
        userData.username = username;
        userData.country = country;
        userData.currency = currency;
        updateUI();

        toggleEditProfile();
        alert('✅ Profile updated successfully!');
    } catch (error) {
        console.error("Error saving profile:", error);
        alert('❌ Error: ' + error.message);
    }
};

// -------------------------------------------------------------
// 7. WALLET MANAGEMENT
// -------------------------------------------------------------
async function loadWallets() {
    try {
        const walletsRef = collection(db, "users", currentUser.uid, "wallets");
        const querySnapshot = await getDocs(walletsRef);
        wallets = [];
        querySnapshot.forEach((doc) => {
            wallets.push({ id: doc.id, ...doc.data() });
        });
        renderWallets();
    } catch (error) {
        console.error("Error loading wallets:", error);
    }
}

function renderWallets() {
    const container = document.getElementById('walletList');
    if (wallets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-plus-circle"></i>
                <p>No wallet addresses added yet.</p>
            </div>
        `;
        return;
    }

    let html = '';
    wallets.forEach(wallet => {
        const address = wallet.address || '';
        const displayAddress = address.length > 20 ? address.substring(0, 12) + '...' + address.substring(address.length - 8) : address;
        html += `
            <div class="wallet-item">
                <div class="wallet-info">
                    <span class="wallet-network">${wallet.network || 'Unknown'}</span>
                    <span class="wallet-address">${displayAddress}</span>
                    ${wallet.label ? `<span class="wallet-label">${wallet.label}</span>` : ''}
                </div>
                <div class="wallet-actions">
                    <button class="btn-copy" onclick="copyAddress('${address}')" title="Copy address">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteWallet('${wallet.id}')" title="Delete wallet">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.addWallet = async function() {
    const network = document.getElementById('walletNetwork').value;
    const address = document.getElementById('walletAddress').value.trim();
    const label = document.getElementById('walletLabel').value.trim();

    if (!address) {
        alert('Please enter a wallet address');
        return;
    }

    try {
        const walletsRef = collection(db, "users", currentUser.uid, "wallets");
        await addDoc(walletsRef, {
            network: network,
            address: address,
            label: label || '',
            createdAt: serverTimestamp()
        });

        // Clear form
        document.getElementById('walletAddress').value = '';
        document.getElementById('walletLabel').value = '';

        await loadWallets();
        alert('✅ Wallet added successfully!');
    } catch (error) {
        console.error("Error adding wallet:", error);
        alert('❌ Error: ' + error.message);
    }
};

window.deleteWallet = async function(walletId) {
    if (!confirm('Delete this wallet address?')) return;

    try {
        await deleteDoc(doc(db, "users", currentUser.uid, "wallets", walletId));
        await loadWallets();
        alert('✅ Wallet deleted successfully');
    } catch (error) {
        console.error("Error deleting wallet:", error);
        alert('❌ Error: ' + error.message);
    }
};

window.copyAddress = function(address) {
    navigator.clipboard.writeText(address).then(() => {
        alert('✅ Address copied to clipboard!');
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = address;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('✅ Address copied to clipboard!');
    });
};

// -------------------------------------------------------------
// 8. RECENT ACTIVITY
// -------------------------------------------------------------
async function loadRecentActivity() {
    const container = document.getElementById('recentActivity');
    try {
        const activityRef = collection(db, "users", currentUser.uid, "activity");
        const q = query(activityRef, orderBy('createdAt', 'desc'), limit(5));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>No recent activity.</p>
                </div>
            `;
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const time = data.createdAt?.toDate?.() || new Date();
            const timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
            const amountClass = data.amount >= 0 ? 'positive' : 'negative';
            html += `
                <div class="activity-item">
                    <div class="activity-info">
                        <span class="desc">${data.description || 'Activity'}</span>
                        <span class="time">${timeStr}</span>
                    </div>
                    <span class="activity-amount ${amountClass}">${data.amount >= 0 ? '+' : ''}$${data.amount || 0}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("Error loading activity:", error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Could not load activity.</p>
            </div>
        `;
    }
}

// -------------------------------------------------------------
