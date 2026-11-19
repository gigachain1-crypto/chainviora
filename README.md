
# 🚀 Gigachain - Next-Gen Crypto & Layer-1 Web3 Platform

A high-performance crypto ecosystem frontend created for **Gigachain**, featuring a **luxurious light golden/white aesthetic** paired with vibrant **multi-color (RGB/Rainbow) glowing borders** and interactive Web3 dApp simulations.

---

## 🎨 Design System

- **Background**: Premium light golden silk (`#FAF6ED` / `#FFFDF9`) with ambient golden glow and subtle multi-color lighting gradients.
- **Borders (Sabhi Colors / Multi-Color Rainbow)**:
  - Multi-color animated gradient borders (`Pink -> Purple -> Blue -> Cyan -> Gold`).
  - Rotating conic multi-color glowing borders on key interactive components like the DEX Swap & Wallet Modal.
  - Rainbow divider lines and multi-color glow buttons.
- **Typography**: Space Grotesk (Headings) & Plus Jakarta Sans (Body).

---

## ⚡ Features Included in this Frontend

1. **Top Announcement Bar**:
   - Mainnet 2.0 live badge with animated ping.
   - Quick link to Ecosystem Dashboard.

2. **Smart Navigation Bar**:
   - Custom SVG Logo for **GIGACHAIN**.
   - Dynamic real-time $GIGA live price pill with micro-ticker.
   - Multi-color glowing **"Connect Wallet"** button with Web3 modal trigger.
   - Mobile responsive drawer navigation.

3. **Live Crypto Price Ticker Marquee**:
   - Infinite animated ticker featuring GIGA, ETH, BTC, SOL, AVAX, and BNB with simulated market fluctuation.

4. **Hero Section**:
   - Catchy Web3 headline with gradient text.
   - Dual Call-to-Actions (Login & Sign Up).
   - Official Contract Address badge with one-click copy to clipboard and toast feedback.
   - 4 Live Network Metrics:
     - 125,000+ TPS
     - <$0.0001 Gas Fee
     - 400ms Block Finality
     - $2.48B Total Value Locked (TVL)

5. **Instant DEX Swap Widget**:
   - Exchange calculator (USDT <-> GIGA) with real-time math.
   - Pair reversal toggle.
   - Routing details and simulated transaction execution with loading states.

6. **Roadmap Timeline**:
   - 4-phase strategic journey with status tags (Completed, In Progress, Upcoming, Vision).

7. **Interactive FAQ Accordion**:
   - Smooth expand/collapse answers addressing common user concerns.

8. **Web3 Wallet Connection Modal**:
   - Connection flow for MetaMask, Phantom, Coinbase Wallet, and Trust Wallet.
   - Updates navbar to show connected status.

9. **Interactive Background Blockchain Particle Web**:
   - HTML5 Canvas drawing moving interconnected crypto nodes with multi-colored connections.

---

## 📁 File Structure

```
d:\A Website tools\GIGA Website\
├── index.html           # Main frontend landing page & dApp interface
├── dashboard.html       # Member portal & portfolio management
├── css\
│   └── style.css        # Multi-color borders, glowing animations & golden theme
├── js\
│   ├── main.js          # Interactive swap, wallet modal, ticker, particles & FAQ
│   ├── dashboard.js     # User dashboard, balance tracking & queue orders
│   └── charts.js        # Analytics and performance charts
├── assets\
│   └── logo.svg         # Gigachain official vector logo
└── README.md            # Documentation & setup guide
```

---

## 🖥️ How to Run & View

You can view the website in two easy ways:

### Option 1: Direct File Open
Simply double-click `index.html` in Windows Explorer or open it in Google Chrome, Microsoft Edge, or Brave.

### Option 2: Local HTTP Server (Recommended)
Open PowerShell in the folder and run:
```powershell
npx serve .
# or
python -m http.server 3000
```
Then visit `http://localhost:3000` in your browser.

