// -------------------------------------------------------------
// 1. FIREBASE INIT
// -------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// -------------------------------------------------------------
// 2. AUTH GUARD
// -------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    console.log("✅ User logged in:", user.email);
    document.getElementById('userEmail').textContent = user.email;
});

// Logout function
window.logout = async function() {
    await signOut(auth);
    window.location.href = "login.html";
};

// -------------------------------------------------------------
// 3. FETCH LIVE ACB STOCK PRICE
// -------------------------------------------------------------
async function fetchACBPrice() {
    const priceDisplay = document.getElementById('acbPrice');
    const changeDisplay = document.getElementById('acbChange');

    try {
        const response = await fetch('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=ACB&apikey=demo');
        const data = await response.json();

        if (data['Global Quote']) {
            const quote = data['Global Quote'];
            const price = parseFloat(quote['05. price']).toFixed(2);
            const change = parseFloat(quote['10. change percent'].replace('%', '')).toFixed(2);

            priceDisplay.textContent = `$${price}`;
            changeDisplay.textContent = `${change}%`;
            changeDisplay.style.color = change >= 0 ? '#28a745' : '#dc3545';
            document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();

            return { price: parseFloat(price), change: parseFloat(change) };
        } else {
            throw new Error('No data available');
        }
    } catch (error) {
        console.warn('Price fetch error:', error);
        priceDisplay.textContent = '$4.52';
        changeDisplay.textContent = '+2.30%';
        changeDisplay.style.color = '#28a745';
        return { price: 4.52, change: 2.3 };
    }
}

// -------------------------------------------------------------
// 4. INITIALIZE CHART
// -------------------------------------------------------------
let priceChart = null;

function initChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['9:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'],
            datasets: [{
                label: 'ACB Stock Price (USD)',
                data: [4.38, 4.42, 4.45, 4.41, 4.43, 4.48, 4.50, 4.47, 4.52, 4.55, 4.53, 4.56, 4.52, 4.52],
                borderColor: '#1f4f1f',
                backgroundColor: 'rgba(31, 79, 31, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#1f4f1f'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });

    // Simulate real-time updates
    setInterval(() => {
        if (priceChart) {
            const lastValue = priceChart.data.datasets[0].data[priceChart.data.datasets[0].data.length - 1];
            const change = (Math.random() - 0.48) * 0.3;
            const newValue = Math.max(3.5, Math.min(6.5, lastValue + change));
            priceChart.data.datasets[0].data.push(newValue);
            priceChart.data.datasets[0].data.shift();
            priceChart.update('none');
        }
    }, 5000);
}

// -------------------------------------------------------------
// 5. FETCH LIVE ORDERS FROM FIRESTORE
// -------------------------------------------------------------
async function fetchLiveOrders() {
    const ordersContainer = document.getElementById('liveOrders');
    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, orderBy('createdAt', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            ordersContainer.innerHTML = `
                <div class="empty-orders">
                    <i class="fas fa-inbox"></i>
                    <p>No live orders yet. Be the first!</p>
                </div>
            `;
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const time = data.createdAt?.toDate?.() || new Date();
            const timeStr = time.toLocaleTimeString();
            html += `
                <div class="order-item">
                    <div class="order-info">
                        <span class="order-type ${data.type || 'buy'}">${data.type || 'BUY'}</span>
                        <span class="order-amount">${data.amount || 0}g</span>
                        <span class="order-price">$${data.price || 0}</span>
                    </div>
                    <div class="order-time">${timeStr}</div>
                </div>
            `;
        });

        ordersContainer.innerHTML = html;
    } catch (error) {
        console.warn('Orders fetch error:', error);
        ordersContainer.innerHTML = `
            <div class="empty-orders">
                <i class="fas fa-database"></i>
                <p>No orders yet. Place your first order!</p>
            </div>
        `;
    }
}

// -------------------------------------------------------------
// 6. COMPANY INFO
// -------------------------------------------------------------
const companyInfo = {
    name: 'Aurora Cannabis Inc.',
    ticker: 'ACB',
    exchange: 'NASDAQ / TSX',
    description: 'Aurora Cannabis is a leading global cannabis company dedicated to helping people improve their lives. With a focus on medical cannabis, Aurora serves patients in over 25 countries worldwide.',
    founded: 2006,
    headquarters: 'Edmonton, Alberta, Canada',
    employees: 1500,
    website: 'https://www.auroracannabis.com'
};

function renderCompanyInfo() {
    const container = document.getElementById('companyInfo');
    container.innerHTML = `
        <div class="company-detail">
            <i class="fas fa-building"></i>
            <span><strong>Company:</strong> ${companyInfo.name}</span>
        </div>
        <div class="company-detail">
            <i class="fas fa-chart-simple"></i>
            <span><strong>Ticker:</strong> ${companyInfo.ticker} (${companyInfo.exchange})</span>
        </div>
        <div class="company-detail">
            <i class="fas fa-calendar-alt"></i>
            <span><strong>Founded:</strong> ${companyInfo.founded}</span>
        </div>
        <div class="company-detail">
            <i class="fas fa-map-marker-alt"></i>
            <span><strong>HQ:</strong> ${companyInfo.headquarters}</span>
        </div>
        <div class="company-detail">
            <i class="fas fa-users"></i>
            <span><strong>Employees:</strong> ${companyInfo.employees}+</span>
        </div>
        <div class="company-detail">
            <i class="fas fa-globe"></i>
            <span><strong>Website:</strong> <a href="${companyInfo.website}" target="_blank">${companyInfo.website}</a></span>
        </div>
        <div class="company-description">
            <i class="fas fa-quote-left"></i>
            ${companyInfo.description}
        </div>
    `;
}

// -------------------------------------------------------------
// 7. YOUTUBE VIDEOS
// -------------------------------------------------------------
const staticVideoIds = [
    'IBW34r4JbWA', '00J4SlIUU4A', 'lTRyjP80n_k', 'RNgh1umo1NM',
    'fUHNFyQe7PI', 'odMBQr_oamk', 'y3iTrTiisAU', 'q2ukQZGN8LQ',
    'rY5zqsqfBx4', '1v9Tpc_sqZY', 'wpx6iZS-qxU', 'RGcvOgySEIA',
    'AF-gGGmCvjE', 'GOcU97Asg2I', 'Zs4YXmt4Jn4', 'wi4rJWH8SjU',
    'kAfUKe-UXwM', 'Y9Q9oxz8S0w', '8a1V3wcsWvo', 'cSX30exGiko',
    'CnhnXKPizDE'
];

function renderStaticVideos() {
    const container = document.getElementById('static-videos');
    if (!container) return;
    let html = '';
    staticVideoIds.forEach(id => {
        html += `
            <div class="video-item" data-video-id="${id}">
                <div class="video-thumb" style="background-image: url('https://img.youtube.com/vi/${id}/hqdefault.jpg');">
                    <div class="play-icon"><i class="fas fa-play-circle"></i></div>
                </div>
                <div class="video-title">Aurora Spotlight</div>
                <div class="video-embed-wrapper" style="display:none;">
                    <iframe src="https://www.youtube.com/embed/${id}?rel=0" 
                            frameborder="0" allow="encrypted-media" allowfullscreen></iframe>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// -------------------------------------------------------------
// 8. FETCH FIRESTORE VIDEOS
// -------------------------------------------------------------
async function fetchFirestoreVideos() {
    const container = document.getElementById('firestore-videos');
    if (!container) return;
    try {
        const querySnapshot = await getDocs(collection(db, "updates"));
        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const title = data.title || 'Aurora Update';
            let link = data.link || '';
            const videoId = extractYouTubeId(link);
            if (videoId) {
                html += `
                    <div class="video-item" data-video-id="${videoId}">
                        <div class="video-thumb" style="background-image: url('https://img.youtube.com/vi/${videoId}/hqdefault.jpg');">
                            <div class="play-icon"><i class="fas fa-play-circle"></i></div>
                        </div>
                        <div class="video-title">${title}</div>
                        <div class="video-embed-wrapper" style="display:none;">
                            <iframe src="https://www.youtube.com/embed/${videoId}?rel=0" 
                                    frameborder="0" allow="encrypted-media" allowfullscreen></iframe>
                        </div>
                    </div>
                `;
            }
        });
        if (html) {
            container.innerHTML = html;
            if (window.videoObserver) {
                window.videoObserver.disconnect();
            }
            setupVideoObserver();
        } else {
            container.innerHTML = '<div class="no-videos"><i class="fas fa-video"></i> No updates yet. Check back soon.</div>';
        }
    } catch (error) {
        console.warn("Firestore fetch error:", error);
        container.innerHTML = '<div class="no-videos"><i class="fas fa-exclamation-circle"></i> Could not load updates.</div>';
    }
}

function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\?\/#]+)/,
        /youtube\.com\/live\/([^&\?\/#]+)/
    ];
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

// -------------------------------------------------------------
// 9. VIDEO OBSERVER (click to play, no autoplay)
// -------------------------------------------------------------
function setupVideoObserver() {
    const videoItems = document.querySelectorAll('.video-item');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const item = entry.target;
            const wrapper = item.querySelector('.video-embed-wrapper');
            const iframe = wrapper?.querySelector('iframe');
            const thumb = item.querySelector('.video-thumb');

            if (entry.isIntersecting) {
                if (wrapper) wrapper.style.display = 'block';
                if (thumb) thumb.style.display = 'none';
            } else {
                if (wrapper) wrapper.style.display = 'none';
                if (thumb) thumb.style.display = 'flex';
                if (iframe) {
                    const src = iframe.getAttribute('src');
                    if (src) {
                        const cleanSrc = src.replace(/[?&]autoplay=1/g, '').replace(/\?$/, '');
                        iframe.setAttribute('src', cleanSrc);
                    }
                }
            }
        });
    }, { threshold: 0.5 });

    videoItems.forEach(item => observer.observe(item));
    window.videoObserver = observer;

    // Click to toggle play
    videoItems.forEach(item => {
        item.addEventListener('click', function() {
            const wrapper = this.querySelector('.video-embed-wrapper');
            const thumb = this.querySelector('.video-thumb');
            const iframe = wrapper?.querySelector('iframe');

            if (wrapper && wrapper.style.display === 'block') {
                wrapper.style.display = 'none
