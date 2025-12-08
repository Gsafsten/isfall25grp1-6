require('dotenv').config(); // Load environment variables from .env
const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");
const knex = require("knex");
let bcrypt = null;
let bcryptAvailable = false;
try {
    bcrypt = require('bcryptjs');
    bcryptAvailable = true;
} catch (e) {
    console.warn('Optional dependency bcryptjs is not installed. Login will attempt plain-text comparison if user passwords are stored unhashed. Run `npm install` to enable secure password hashing.');
}

const app = express();

// --- PostgreSQL connection using Knex ---
let db = null;
let dbConnected = false;

try {
    db = knex({
        client: "pg",
        connection: {
            host: process.env.DB_HOST || "localhost",
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || "postgres",
            password: process.env.DB_PASSWORD || "admin",
            database: process.env.DB_NAME || "sewingmadesimple",
        },
        pool: { min: 0, max: 10 },
    });

    // Test the connection
    db.raw('SELECT 1').then(() => {
        dbConnected = true;
        console.log('Database connected successfully.');
    }).catch((err) => {
        console.warn('Database connection failed:', err.message);
        console.warn('Server will continue running without database. Some features may not work.');
    });
} catch (err) {
    console.warn('Failed to initialize database:', err.message);
    console.warn('Server will continue running without database. Some features may not work.');
}

// --- Middleware ---

// Serve static files (CSS, JS, images) from /public
app.use('/images', express.static(path.join(__dirname, 'images')));

// EJS template engine
app.set("view engine", "ejs");

// Body parser for form submissions
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'fallback-secret-key',
        resave: false,
        saveUninitialized: false,
    })
);

// Make session user available in all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Optional: global authentication middleware for protected pages
app.use((req, res, next) => {
    // Example: only protect registration page if needed
    // Remove or customize for other pages
    next();
});

// --- Routes ---

// Home page
app.get("/", (req, res) => {
    res.render("index");
});

// Camp Info page
app.get("/campinfo", (req, res) => {
    res.render("campinfo");
});

// Camp Schedule page
app.get("/campschedule", (req, res) => {
    res.render("campschedule");
});

// Contact Us page
app.get("/contactus", (req, res) => {
    res.render("contactus");
});

// Registrations info page
app.get("/registrations", (req, res) => {
    res.render("registrations");
});

// Registration form page (old route for backward compatibility)
app.get("/registration", (req, res) => {
    res.redirect("/register");
});

// Register form page
app.get("/register", (req, res) => {
    res.render("register", { success_message: "", error_message: "" });
});

// Handle registration form submission
app.post("/register", async (req, res) => {
    const { first_name, last_name, email, phone, age_group, special_requests } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email) {
        return res.render("register", { 
            success_message: "", 
            error_message: "First name, last name, and email are required." 
        });
    }

    if (!db || !dbConnected) {
        return res.render("register", { 
            success_message: "", 
            error_message: "Database is not available. Please try again later." 
        });
    }

    try {
        // Insert registration into the database
        await db("registrations").insert({
            first_name,
            last_name,
            email,
            phone: phone || null,
            age_group: age_group || null,
            special_requests: special_requests || null,
            created_at: new Date(),
        });

        res.render("register", { 
            success_message: "Registration successful! See you at camp!", 
            error_message: "" 
        });
    } catch (err) {
        console.error("Error inserting registration:", err.message);
        res.render("register", { 
            success_message: "", 
            error_message: "Unable to save registration. Please try again." 
        });
    }
});

// Handle old /registration POST for backward compatibility
app.post("/registration", async (req, res) => {
    res.redirect(307, "/register");
});

// Login page (display)
app.get('/login', (req, res) => {
    // If already logged in, redirect to home
    if (req.session && req.session.user) {
        return res.redirect('/');
    }
    res.render('login', { success_message: '', error_message: '' });
});

// Handle login submission
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.render('login', { success_message: '', error_message: 'Username and password are required.' });
    }

    if (!db || !dbConnected) {
        return res.render('login', { success_message: '', error_message: 'Database is not available. Please try again later.' });
    }

    try {
        const user = await db('authentication').where({ username }).first();
        if (!user) {
            return res.render('login', { success_message: '', error_message: 'Invalid username or password.' });
        }

        // Support common password column names
        const hash = user.password_hash || user.password || user.pw || user.pass;
        if (!hash) {
            console.error('User exists but no password/hash found for user:', username);
            return res.render('login', { success_message: '', error_message: 'Login not available for this account.' });
        }

        let match = false;
        if (bcryptAvailable) {
            try {
                match = await bcrypt.compare(password, hash);
            } catch (e) {
                console.warn('bcrypt.compare failed:', e && e.message ? e.message : e);
            }
        }

        // If bcrypt compare didn't match, try a plain-text fallback (in case your DB stores plain passwords).
        // This is insecure and only a compatibility fallback; log a warning so it can be fixed.
        if (!match && password === hash) {
            match = true;
            console.warn('Authenticated using plain-text fallback. Please store hashed passwords and enable bcryptjs for secure authentication.');
        }

        if (!match) {
            return res.render('login', { success_message: '', error_message: 'Invalid username or password.' });
        }

        // Successful login: store minimal info in session
        req.session.user = {
            id: user.id,
            username: user.username,
            is_admin: !!user.is_admin
        };

        return res.redirect('/');
    } catch (err) {
        console.error('Login error:', err && err.message ? err.message : err);
        return res.render('login', { success_message: '', error_message: 'An error occurred during login.' });
    }
});

// Admin page (protected)
app.get('/admin', (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.status(403).send('Forbidden');
    }
    res.render('admin');
});

// Logout route
app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {});
    }
    res.redirect('/');
});

// --- Start server ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
