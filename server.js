require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
sing port 3002 as 3001 is in use

// --- MIDDLEWARE ---
// Allow cross-origin requests during local development. In production restrict this.
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Session & passport for OAuth
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));
app.use(passport.initialize());
app.use(passport.session());

// Ensure uploads directory exists and serve it statically
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use('/uploads', express.static(UPLOAD_DIR));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safe = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
        cb(null, `${unique}-${safe}`);
    }
});
const upload = multer({ storage });

// Serve index.html at root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DATABASE SETUP (Using SQLite) ---
const db = new sqlite3.Database('./skillhub.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
    } else {
        console.log("Database connected successfully.");
        
        // Create tables if they don't exist and seed initial data
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fullName TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'student'
            )`);

            // Courses table
            db.run(`CREATE TABLE IF NOT EXISTS courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                level TEXT,
                instructor TEXT
            )`);

            // Course videos table
            db.run(`CREATE TABLE IF NOT EXISTS course_videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                courseId INTEGER,
                title TEXT,
                url TEXT,
                type TEXT CHECK(type IN ('youtube', 'file')),
                order_index INTEGER,
                FOREIGN KEY(courseId) REFERENCES courses(id)
            )`);

            // Enrollments table
            db.run(`CREATE TABLE IF NOT EXISTS enrollments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                courseId INTEGER,
                progress INTEGER DEFAULT 0,
                status TEXT DEFAULT 'In Progress',
                UNIQUE(userId, courseId),
                FOREIGN KEY(userId) REFERENCES users(id),
                FOREIGN KEY(courseId) REFERENCES courses(id)
            )`);

            // Seed courses table if it's empty
            const courses = [
                { name: 'Graphic Design Learning Path', description: 'A comprehensive guide to becoming a graphic designer.' },
                { name: 'Basic Computer Course', description: 'Learn the fundamentals of computer operation, hardware, and software.' },
                { name: 'Art Design Fundamentals', description: 'Explore principles of art, including color theory and composition.' }
            ];
            db.get("SELECT count(*) as count FROM courses", (err, row) => {
                if (!err && row && row.count === 0) {
                    const stmt = db.prepare("INSERT INTO courses (name, description) VALUES (?, ?)");
                    courses.forEach(course => {
                        stmt.run(course.name, course.description);
                    });
                    stmt.finalize();
                    console.log("Courses seeded to database.");
                }
            });

            // Ensure courses table has a video_url column (for backwards compatibility)
            db.all("PRAGMA table_info(courses)", (err, cols) => {
                if (err) return;
                const hasVideo = cols.some(c => c.name === 'video_url');
                if (!hasVideo) {
                    db.run("ALTER TABLE courses ADD COLUMN video_url TEXT", (err) => {
                        if (!err) console.log('Added video_url column to courses table');
                    });
                }
            });

            // Create default admin if it doesn't exist
            const adminEmail = 'admin@skillhub.com';
            const adminPassword = 'admin123';
            db.get("SELECT * FROM users WHERE email = ?", [adminEmail], (err, user) => {
                if (err) return console.error('Error checking admin user:', err);
                if (!user) {
                    bcrypt.hash(adminPassword, 10, (err, hashedPassword) => {
                        if (err) return console.error('Error hashing admin password:', err);
                        db.run(
                            "INSERT INTO users (fullName, email, password, role) VALUES (?, ?, ?, ?)",
                            ['System Admin', adminEmail, hashedPassword, 'admin'],
                            (err) => {
                                if (err) console.error('Error creating admin user:', err);
                                else console.log('Default admin user created successfully');
                            }
                        );
                    });
                }
            });
        });
    }
});

// --- Simple in-memory password reset tokens (development only) ---
const passwordResetTokens = new Map(); // email -> token

const JWT_SECRET = 'your-super-secret-key-that-should-come-from-env';

// FRONTEND and SERVER roots (used for OAuth redirects). Override via env in production.
const FRONTEND_ROOT = process.env.FRONTEND_ROOT || 'http://localhost:3002';
const SERVER_ROOT = process.env.SERVER_ROOT || `http://localhost:${PORT}`;

// --- Passport Google OAuth setup (scaffold) ---
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.get("SELECT id, fullName, email, role FROM users WHERE id = ?", [id], (err, row) => {
        done(err, row);
    });
});

const googleClientID = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

if (googleClientID && googleClientSecret) {
    passport.use(new GoogleStrategy({
        clientID: googleClientID,
        clientSecret: googleClientSecret,
        callbackURL: `${SERVER_ROOT}/auth/google/callback`
    }, (accessToken, refreshToken, profile, cb) => {
        // Find or create user using Google profile
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        const fullName = profile.displayName || (profile.name && `${profile.name.givenName} ${profile.name.familyName}`) || 'Google User';
        if (!email) return cb(new Error('No email found on Google profile'));

        db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
            if (err) return cb(err);
            if (user) {
                // existing user
                return cb(null, user);
            }
            // create a new user with a random password (they'll log in with Google)
            bcrypt.genSalt(10).then(salt => bcrypt.hash(Math.random().toString(36).slice(2, 10), salt)).then(hashed => {
                db.run("INSERT INTO users (fullName, email, password, role) VALUES (?, ?, ?, ?)", [fullName, email, hashed, 'student'], function(err) {
                    if (err) return cb(err);
                    db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, newUser) => cb(err, newUser));
                });
            }).catch(cb);
        });
    }));
}

// --- AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401); // Unauthorized
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = userPayload.user;
        next();
    });
};

// check admin by looking up user's role in DB
const requireAdmin = (req, res, next) => {
    const user = req.user;
    if (!user) return res.sendStatus(401);
    db.get("SELECT role FROM users WHERE id = ?", [user.id], (err, row) => {
        if (err) return res.sendStatus(500);
        if (!row || row.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
        next();
    });
};

// --- OAuth routes ---
app.get('/auth/google', (req, res, next) => {
    if (!googleClientID || !googleClientSecret) return res.status(500).send('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    next();
}, passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login.html' }), (req, res) => {
    // Successful authentication, issue JWT and redirect back to frontend app
    const user = req.user;
    const payload = { user: { id: user.id, email: user.email, fullName: user.fullName } };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    // Redirect to frontend oauth-redirect page which will store token in localStorage
    const redirectUrl = `${FRONTEND_ROOT}/oauth-redirect.html?token=${token}&name=${encodeURIComponent(user.fullName)}`;
    res.redirect(redirectUrl);
});

// --- API ROUTES ---

// 1. User Registration
app.post('/api/auth/register', async (req, res) => {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
        return res.status(400).json({ message: 'Please provide all required fields.' });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        if (row) return res.status(400).json({ message: 'An account with this email already exists.' });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // default role is 'student'
        db.run("INSERT INTO users (fullName, email, password, role) VALUES (?, ?, ?, ?)", [fullName, email, hashedPassword, 'student'], function(err) {
            if (err) return res.status(500).json({ message: 'Server error during registration.' });
            res.status(201).json({ message: 'Registration successful!' });
        });
    });
});

// Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.get("SELECT id, fullName, email, role FROM users WHERE id = ?", [userId], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        if (!row) return res.status(404).json({ message: 'User not found.' });
        res.json({ user: row });
    });
});

// Forgot password - development placeholder: generate token and store in memory
app.post('/api/auth/forgot', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required.' });
    db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        if (!row) return res.status(400).json({ message: 'No account with that email.' });
        const token = Math.random().toString(36).slice(2, 12);
        passwordResetTokens.set(email, token);
        // In prod: send email with reset link containing token. For dev, return token so you can test.
        return res.json({ message: 'Password reset token generated (dev).', token });
    });
});

// Reset password using token (development)
app.post('/api/auth/reset', async (req, res) => {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ message: 'Email, token and newPassword required.' });
    const saved = passwordResetTokens.get(email);
    if (!saved || saved !== token) return res.status(400).json({ message: 'Invalid or expired token.' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    db.run("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, email], function(err) {
        if (err) return res.status(500).json({ message: 'Could not reset password.' });
        passwordResetTokens.delete(email);
        res.json({ message: 'Password reset successful.' });
    });
});

// 2. User Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ message: 'Server error.' });
        if (!user) return res.status(400).json({ message: 'Invalid email or password.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid email or password.' });

        // include role in JWT payload so client can know permissions immediately
        const payload = { user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            // return role in response for immediate client-side UI changes
            res.json({ message: 'Login successful!', token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });
        });
    });
});

// 3. Get all courses
app.get('/api/courses', (req, res) => {
    // Support search and filtering: ?search=&category=&level=&instructor=
    const { search, category, level, instructor } = req.query;
    let sql = `
        SELECT c.id, c.name, c.description, c.category, c.level, c.instructor,
               json_group_array(
                   CASE WHEN v.id IS NOT NULL 
                   THEN json_object(
                       'id', v.id,
                       'title', v.title,
                       'url', v.url,
                       'type', v.type,
                       'order_index', v.order_index
                   )
                   ELSE NULL END
               ) as videos
        FROM courses c
        LEFT JOIN course_videos v ON c.id = v.courseId
        WHERE 1=1`;
    const params = [];
    if (search) {
        sql += " AND (name LIKE ? OR description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }
    if (category) { sql += " AND category = ?"; params.push(category); }
    if (level) { sql += " AND level = ?"; params.push(level); }
    if (instructor) { sql += " AND instructor = ?"; params.push(instructor); }

    sql += " GROUP BY c.id ORDER BY c.name";
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ message: 'Could not retrieve courses.' });
        // Parse the JSON string of videos for each course
        rows.forEach(row => {
            try {
                row.videos = JSON.parse(row.videos).filter(v => v !== null);
            } catch (e) {
                row.videos = [];
            }
        });
        res.json(rows);
    });
});

// 4. Enroll in a course
app.post('/api/enroll/:courseId', authenticateToken, (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    const userId = req.user.id;

    db.get("SELECT * FROM enrollments WHERE userId = ? AND courseId = ?", [userId, courseId], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error.' });
        if (row) return res.status(400).json({ message: 'You are already enrolled in this course.' });

        db.run("INSERT INTO enrollments (userId, courseId) VALUES (?, ?)", [userId, courseId], function(err) {
            if (err) return res.status(500).json({ message: 'Could not enroll in course.' });
            res.status(201).json({ message: 'Successfully enrolled!' });
        });
    });
});

// --- Admin: Create a new course ---
app.post('/api/admin/courses', authenticateToken, requireAdmin, (req, res) => {
    // Handle multiple file uploads
    const uploadFields = multer({ storage }).array('videoFile', 10); // Allow up to 10 videos
    
    uploadFields(req, res, function (err) {
        if (err) return res.status(500).json({ message: 'File upload failed.' });
        
        const { name, description, category, level, instructor } = req.body;
        if (!name) return res.status(400).json({ message: 'Course name required.' });

        // First create the course
        db.run("INSERT INTO courses (name, description, category, level, instructor) VALUES (?, ?, ?, ?, ?)", 
            [name, description || '', category || '', level || '', instructor || ''], 
            function(err) {
                if (err) return res.status(500).json({ message: 'Could not create course.' });
                const courseId = this.lastID;

                // Process videos (both files and URLs)
                const videos = [];
                let videoIndex = 0;

                // Process uploaded files
                if (req.files) {
                    req.files.forEach((file, index) => {
                        if (req.body[`videoTitle_${index}`]) {
                            videos.push({
                                title: req.body[`videoTitle_${index}`],
                                url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`,
                                type: 'file',
                                order_index: videoIndex++
                            });
                        }
                    });
                }

                // Process YouTube URLs
                Object.keys(req.body).forEach(key => {
                    if (key.startsWith('videoUrl_')) {
                        const index = key.split('_')[1];
                        const url = req.body[key];
                        const title = req.body[`videoTitle_${index}`];
                        if (url && title) {
                            videos.push({
                                title: title,
                                url: url,
                                type: 'youtube',
                                order_index: videoIndex++
                            });
                        }
                    }
                });

                // Insert all videos
                if (videos.length > 0) {
                    const stmt = db.prepare("INSERT INTO course_videos (courseId, title, url, type, order_index) VALUES (?, ?, ?, ?, ?)");
                    videos.forEach(video => {
                        stmt.run([courseId, video.title, video.url, video.type, video.order_index]);
                    });
                    stmt.finalize();
                }

                res.status(201).json({ id: courseId, message: 'Course created with videos.' });
        });
    });
});

// --- Admin: Update an existing course ---
app.put('/api/admin/courses/:id', authenticateToken, requireAdmin, (req, res) => {
    const courseId = parseInt(req.params.id, 10);
    // Allow updating video via file upload or videoUrl
    upload.single('videoFile')(req, res, function (err) {
        if (err) return res.status(500).json({ message: 'File upload failed.' });
        const { name, description, category, level, instructor, videoUrl } = req.body;
        let finalVideoUrl = videoUrl || null;
        if (req.file) {
            finalVideoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }
        db.run("UPDATE courses SET name = ?, description = ?, category = ?, level = ?, instructor = ?, video_url = ? WHERE id = ?", [name, description, category, level, instructor, finalVideoUrl, courseId], function(err) {
            if (err) return res.status(500).json({ message: 'Could not update course.' });
            if (this.changes === 0) return res.status(404).json({ message: 'Course not found.' });
            res.json({ message: 'Course updated.' });
        });
    });
});

// --- Admin: Delete a course ---
app.delete('/api/admin/courses/:id', authenticateToken, requireAdmin, (req, res) => {
    const courseId = parseInt(req.params.id, 10);
    db.run("DELETE FROM courses WHERE id = ?", [courseId], function(err) {
        if (err) return res.status(500).json({ message: 'Could not delete course.' });
        if (this.changes === 0) return res.status(404).json({ message: 'Course not found.' });
        res.json({ message: 'Course deleted.' });
    });
});

// --- Admin: List users ---
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    db.all("SELECT id, fullName, email, role FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Could not retrieve users.' });
        res.json(rows);
    });
});

// --- Admin: Update user role ---
app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body;
    if (!['student', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role.' });
    db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId], function(err) {
        if (err) return res.status(500).json({ message: 'Could not update user role.' });
        if (this.changes === 0) return res.status(404).json({ message: 'User not found.' });
        res.json({ message: 'User role updated.' });
    });
});

// 5. Get Dashboard Data
app.get('/api/dashboard', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const sql = `
        SELECT c.id, c.name, e.status, e.progress
        FROM enrollments e
        JOIN courses c ON e.courseId = c.id
        WHERE e.userId = ?
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Could not fetch dashboard data.' });
        
        const enrolledCourses = rows.map(r => ({
             id: r.id,
             name: r.name,
             progress: r.progress,
             status: r.progress >= 80 ? 'Completed' : 'In Progress'
        }));

        let totalProgress = 0;
        rows.forEach(e => { totalProgress += e.progress; });
        const overallProgress = rows.length > 0 ? totalProgress / rows.length : 0;
        const certificatesEarned = rows.filter(e => e.progress >= 80).length;

        res.json({ enrolledCourses, overallProgress, certificatesEarned });
    });
});

// 6. Get details for a single course (for course-details.html)
app.get('/api/course/:courseId/details', authenticateToken, (req, res) => {
    const { courseId } = req.params;
    const { id: userId } = req.user;

    const courseSql = "SELECT * FROM courses WHERE id = ?";
    const enrollmentSql = "SELECT * FROM enrollments WHERE userId = ? AND courseId = ?";

    db.get(courseSql, [courseId], (err, course) => {
        if (err || !course) return res.status(404).json({ message: "Course not found." });
        
        db.get(enrollmentSql, [userId, courseId], (err, enrollment) => {
            if (err) return res.status(500).json({ message: "Database error." });
            
            // **** THIS IS THE LINE I FIXED ****
            // It was "res.status(4D)" before. It is now correct.
            if (!enrollment) return res.status(403).json({ message: "You are not enrolled in this course." });
            
            // In a real application, you would also fetch the course steps/content here
            res.json({ course, enrollment });
        });
    });
});


// 7. Update course progress
app.post('/api/course/:courseId/progress', authenticateToken, (req, res) => {
    const { courseId } = req.params;
    const { id: userId } = req.user;
    const { progress } = req.body;

    if (progress === undefined || progress < 0 || progress > 100) {
        return res.status(400).json({ message: "Invalid progress value." });
    }

    const newStatus = progress >= 80 ? 'Completed' : 'In Progress';
    const sql = "UPDATE enrollments SET progress = ?, status = ? WHERE userId = ? AND courseId = ?";

    db.run(sql, [progress, newStatus, userId, courseId], function(err) {
        if (err) return res.status(500).json({ message: "Failed to update progress." });
        if (this.changes === 0) return res.status(404).json({ message: "Enrollment not found." });
        res.status(200).json({ message: "Progress updated successfully." });
    });
});


// --- START THE SERVER ---
const PORT = process.env.PORT || 3002;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SkillHub NG backend is running on port ${PORT}`);
    console.log(`Access it via Render public URL (not localhost).`);
});




