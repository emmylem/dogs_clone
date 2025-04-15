// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // <-- **FIX: IMPORTED CRYPTO MODULE**
const admin = require('firebase-admin');
const { nanoid } = require('nanoid');

// --- Firebase Admin SDK Setup ---
// Make sure the path './serviceAccountKey.json' is correct and the file exists
try {
    const serviceAccount = require('./serviceAccountKey.json'); // Load the key
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    console.error("CRITICAL ERROR: Failed to load 'serviceAccountKey.json' or initialize Firebase Admin SDK.");
    console.error("Ensure 'serviceAccountKey.json' is in the 'backend' directory and is valid.");
    console.error(error);
    process.exit(1); // Exit if Firebase Admin cannot be initialized
}

const db = admin.firestore(); // Get a reference to the Firestore database
// --- End Firebase Setup ---


// --- Telegram InitData Validation Function ---
function isValidTelegramData(initData, botToken) {
    if (!initData || !botToken) {
        console.error("Validation Error: Missing initData or botToken");
        return { valid: false, user: null };
    }

    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        if (!hash) {
             console.warn("Validation Warning: Hash parameter missing in initData.");
             return { valid: false, user: null, error: "Hash missing" };
        }
        urlParams.delete('hash'); // Remove hash before sorting and checking

        // Check if data might be too old (e.g., older than 1 hour)
        const authDate = urlParams.get('auth_date');
        if (authDate) {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const timeDiff = currentTimestamp - parseInt(authDate, 10);
            // Set expiration time (e.g., 24 hours for more tolerance during testing, 1 hour for production)
            const EXPIRATION_SECONDS = 24 * 3600; // 24 hours
            if (timeDiff > EXPIRATION_SECONDS) {
                console.warn(`Validation Warning: initData is older than ${EXPIRATION_SECONDS / 3600} hours.`);
                // return { valid: false, user: null, error: "Data expired" }; // Uncomment to enforce expiration
            }
        } else {
             console.warn("Validation Warning: auth_date parameter missing in initData.");
             // You might want to reject if auth_date is critical
        }

        const dataCheckArr = [];
        urlParams.sort(); // Sort keys alphabetically
        urlParams.forEach((value, key) => {
            dataCheckArr.push(`${key}=${value}`);
        });

        const dataCheckString = dataCheckArr.join('\n');

        // Calculate secret key using bot token
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        // Calculate hash of the data check string using the secret key
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        // Compare calculated hash with the hash from initData
        if (calculatedHash === hash) {
            // Data is valid, extract user data
            const userJson = urlParams.get('user');
            if (userJson) {
                try {
                    const user = JSON.parse(userJson); // Parse the user JSON string
                    console.log(`Validation Successful for user ID: ${user?.id}`);
                    return { valid: true, user: user };
                } catch (parseError) {
                     console.error("Validation Error: Failed to parse user JSON from initData.", parseError);
                     return { valid: false, user: null, error: "Invalid user data format" };
                }
            } else {
                console.error("Validation Error: User data missing in initData");
                return { valid: false, user: null, error: "User data missing" };
            }
        } else {
            console.warn("Validation Failed: Hash mismatch.");
            // Avoid logging hashes or dataCheckString in production for security, but keep for debugging
            // console.log("Received Hash:", hash);
            // console.log("Calculated Hash:", calculatedHash);
            // console.log("Data Check String:", dataCheckString);
            return { valid: false, user: null, error: "Hash mismatch" };
        }
    } catch (error) {
        console.error("Error during validation:", error);
        return { valid: false, user: null, error: "Internal validation error" };
    }
}
// --- End Validation Function ---

const app = express();
const port = process.env.PORT || 3001; // Use environment variable or default

// --- Middlewares ---
// **FIX: APPLY CORS FIRST with Explicit Options**
const allowedOrigins = [
    'http://localhost:5173',                       // Vite dev server
    'http://127.0.0.1:5173',                     // Vite dev server alternate
    'https://mywdogsclonebot.web.app',          // Your Firebase Hosting URL
    'https://44f2-102-215-57-145.ngrok-free.app' // Your CURRENT ngrok URL (UPDATE IF IT CHANGES)
];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests) during dev? Check implications.
        // For stricter security, remove '!origin' check in production.
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS Rejected Origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Explicitly allow methods including OPTIONS
    allowedHeaders: ['Content-Type', 'Authorization'] // Allow common headers (add 'X-Requested-With' etc. if needed)
}));

// Apply other middleware AFTER CORS
app.use(express.json());

// --- Basic Routes ---
app.get('/api', (req, res) => {
    res.json({ message: 'Hello from wDogs Clone Backend!' }); // Send JSON response
});

// --- Telegram Authentication Route ---
app.post('/api/auth/validate', async (req, res) => { // Make the handler async
    console.log(`Received /api/auth/validate request from: ${req.headers.origin || 'Unknown origin'}`); // Log origin
    const { initData } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!initData) {
        console.warn("Validation rejected: Missing initData");
        return res.status(400).json({ message: "Missing initData" });
    }
    if (!botToken) {
        console.error("CRITICAL: TELEGRAM_BOT_TOKEN is not configured in .env");
        return res.status(500).json({ message: "Server configuration error" });
    }

    // 1. Validate initData
    const validationResult = isValidTelegramData(initData, botToken);

    if (!validationResult.valid || !validationResult.user) {
        console.warn(`Validation failed for received initData. Reason: ${validationResult.error || 'Unknown'}`);
        return res.status(401).json({ message: "Invalid or expired initData", error: validationResult.error || "Validation failed" });
    }

    // 2. Validation successful, proceed with Firestore
    const telegramUser = validationResult.user;
    const userIdString = String(telegramUser.id); // Use String ID for Firestore docs
    const userRef = db.collection('users').doc(userIdString);

    try {
        console.log(`Validation successful for user ID: ${userIdString}. Checking Firestore...`);
        const userDoc = await userRef.get();

        let userProfileData;

        if (userDoc.exists) {
            // --- User Exists ---
            console.log(`User ${userIdString} found in Firestore. Updating last login.`);
            const existingData = userDoc.data();
            const updateData = {
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                username: telegramUser.username || existingData.username || null,
                firstName: telegramUser.first_name || existingData.firstName,
                lastName: telegramUser.last_name || existingData.lastName || null,
                languageCode: telegramUser.language_code || existingData.languageCode,
            };
            // Use update for existing doc
            await userRef.update(updateData);
            // Prepare response data: merge existing with updated fields
            userProfileData = { ...existingData, ...updateData };
            // Ensure defaults if somehow missing (belt-and-suspenders)
            userProfileData.tokens = userProfileData.tokens ?? 0;
            userProfileData.referralsMade = userProfileData.referralsMade ?? 0;

        } else {
            // --- New User ---
            console.log(`User ${userIdString} not found. Creating new user document...`);
            const newUserProfile = {
                userId: telegramUser.id, // Store numeric ID as well
                username: telegramUser.username || null,
                firstName: telegramUser.first_name || 'User',
                lastName: telegramUser.last_name || null,
                languageCode: telegramUser.language_code || 'en',
                tokens: 0, // Starting balance
                referralCode: nanoid(8), // Generate an 8-character referral code
                referredBy: null, // TODO: Implement referral capture logic
                referralsMade: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                connectedWallet: null,
                // Example daily tasks structure (optional, can be added when needed)
                // dailyTasks: {
                //    lastReset: admin.firestore.FieldValue.serverTimestamp(),
                //    completed: []
                // }
            };
            // Use set for new doc
            await userRef.set(newUserProfile);
            userProfileData = newUserProfile; // Response data is the new profile
            console.log(`New user ${userIdString} created with referral code: ${userProfileData.referralCode}`);
        }

        // 3. Send back the full user profile
        console.log(`Sending success response with user profile for ${userIdString}.`);
        res.status(200).json({
            message: "User validated and profile retrieved/created.",
            user: userProfileData, // Send the data from Firestore
        });

    } catch (error) {
        console.error(`Firestore error for user ${userIdString}:`, error);
        res.status(500).json({ message: "Internal server error interacting with database." });
    }
});

// --- Error Handling Middleware (Basic Example) ---
// Add this *after* all your routes
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack || err);
    // Specifically handle CORS errors triggered by the check function
    if (err.message === 'Not allowed by CORS') {
         res.status(403).json({ message: "Origin not allowed by CORS policy." });
    } else {
         res.status(500).json({ message: 'Something broke on the server!' });
    }
});


// --- Start the Server ---
app.listen(port, () => {
    console.log(`Backend server listening on port ${port}`);
    console.log(`CORS allowing origins: ${allowedOrigins.join(', ')}`); // Log allowed origins
});