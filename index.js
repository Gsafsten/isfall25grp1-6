require('dotenv').config(); // Load environment variables from .env
const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");
const knex = require("knex");

const app = express();

// --- PostgreSQL connection using Knex ---
const db = knex({
    client: "pg",
    connection: {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "admin",
        database: process.env.DB_NAME || "sewingmadesimple",
    },
});

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

// Registration page
app.get("/registration", (req, res) => {
    res.render("registration", { success_message: "", error_message: "" });
});

// Handle registration form submission
app.post("/registration", async (req, res) => {
    const { first_name, last_name, email, phone, age_group, special_requests } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email) {
        return res.render("registration", { 
            success_message: "", 
            error_message: "First name, last name, and email are required." 
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

        res.render("registration", { 
            success_message: "Registration successful! See you at camp!", 
            error_message: "" 
        });
    } catch (err) {
        console.error("Error inserting registration:", err.message);
        res.render("registration", { 
            success_message: "", 
            error_message: "Unable to save registration. Please try again." 
        });
    }
});

// --- Start server ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
