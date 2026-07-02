# 🛡️ DamruBet Secure Backend Server (Express.js)

Yeh DamruBet ka official Express.js backend server hai. Yeh ek **Security, Traffic-Management, aur Middleware Layer** ki tarah kaam karta hai taaki aapke application par bots, hacker requests, aur automatic scripts ko roka ja sake.

---

## 🎯 Is Backend Ka Kya Role Hai?

Aapne humare project ko double-secured banaya hai:
1. **Game Logic (RNG, Server Seeds, Hashing) ➡️ Supabase Database me (SECURE):** Limbo game ka primary calculation (RNG, result multipliers, server seed rotation, database transaction) safe tarike se **Supabase SQL Functions (RPC)** me database level par chalta hai. Isse users browser developer tools se game ke multipliers aur results ko manipulate nahi kar sakte.
2. **Outer Traffic Gatekeeper ➡️ Express Server me (SECURE):** Yeh Node/Express backend us security ko protect karta hai. Iska kaam API requests par high-security headers lagana (Helmet), valid website sources se connection filter karna (CORS), aur limit se zyada calls karne wale users ko block karna hai (Rate Limiting).

---

## 📁 Folder Structure (Fayde ke Saath)

```text
backend/
├── middleware/
│   └── rateLimiters.js   # ⏱️ General aur Strict betting rate limits handle karta hai
├── .env.example          # ⚙️ Env configuration template (PORT, secret keys)
├── package.json          # 📦 Sabhi dependencies aur npm run scripts
├── server.js             # 🧠 Humare server ka primary logic aur entry point
└── README.md             # 📖 Yeh guidance file
```

---

## 🚀 Setup Aur Run Kaise Karein? (Detailed Steps)

Aapko code aane ki bilkul zarurat nahi hai! Bas niche diye steps follow karein:

### Step 1: Install Node.js
Ensure karein aapke laptop ya server par Node.js installed hai. [Node.js Official Website](https://nodejs.org) se download kar sakte hain.

### Step 2: Open Terminal & Navigate
Apne computer me terminal ya command prompt open karein aur `backend` directory me jayein:
```bash
cd backend
```

### Step 3: Install Dependencies
Sari secure libraries install karne ke liye run karein:
```bash
npm install
```

### Step 4: Configure Env variables (Secured)
1. Ek nayi file banayein jiska naam ho `.env` (bina kisi name/extension ke).
2. `.env.example` ke content ko copy karke `.env` me paste karein.
3. Apne values daalein:
   - `PORT=5000` (Server ka chalne ka port)
   - `FRONTEND_URL=http://localhost:3000` (Aapka frontend jahan chal raha hai)
   - `SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` (Supabase setting se copy karein).

### Step 5: Start Server!

* **Development (Auto-Restart Mode):**
  Agar aap code me change kar rahe hain toh nodemon mode use karein (ye automatic code update hone par server restart kar dega):
  ```bash
  npm run dev
  ```

* **Production (Live Server Mode):**
  Real deployment par server run karne ke liye:
  ```bash
  npm start
  ```

---

## 🛡️ Security Features Explained (Detailed Hindi)

Humne is backend me world-class industry practices use kari hain:

### 1. Helmet Integration (`helmet`)
* **Kaam:** Yeh aapke API server par bohot saare security headers automatic lagata hai.
* **Fayda:** Yeh browsers ko direct instruct karta hai ki clickjacking, cross-site scripting (XSS), aur code-injection jaisi vulnerabilities ko seedhe block kar de.

### 2. CORS Strictly Configured (`cors`)
* **Kaam:** Cross-Origin Resource Sharing. Yeh block karta hai aisi request ko jo kisi unauthorized website ya mobile app se aayi ho.
* **Fayda:** Agar humne frontend URL `.env` me `http://localhost:3000` set kiya hai, toh uske alawa kisi bhi dusri generic domain se request aayegi toh server use block karke `CORS blocked` error throw karega.

### 3. Smart Rate Limiting (`express-rate-limit`)
Aapke API server ko crashing ya overloading se bachane ke liye humne do alag limits lagayi hain:
* **Globally (General Route Limiter):** Ek single IP address se 15 minutes me maximum 100 requests bhej sakte hain. Agar isse upar requests aayengi toh use limit error dikhega. Isse direct backend crash hone ka risk zero ho jata hai.
* **Strict (Bet-Related Activity Limiter):** critical endpoints par 10 seconds me maximum 10 requests ki limitation lagayi gayi hai. Isse automatic computer scripts aur spam bots bohot tezi se transactions/bets nahi lagane payenge.

---

## 🧪 Api Endpoints Test Kaise Karein?

Apna server start karne ke baad aap check kar sakte hain:

1. **Health Check endpoint:**
   Open browser at: `http://localhost:5000/api/health`
   * **Result:** `{ "status": "ok", "timestamp": "...", "environment": "development" }`

2. **Bet Activity Protection test:**
   Yeh endpoint check karta hai ki kya rate limits trigger ho rahi hain ya nahi.
