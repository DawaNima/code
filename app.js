const express = require('express');
const bodyParser = require('body-parser');
const { pool } = require('./db');
const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // serve static files (your HTML frontend)

// ──────────────────────────────────────────────
//                STUDENT ENDPOINTS
// ──────────────────────────────────────────────

// 1. Бүх оюутны жагсаалтыг авах 
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                student_id as studentid,
                first_name as fname,
                last_name as lname,
                dob,
                email,
                address,
                enrollment_score
            FROM student
            ORDER BY last_name, first_name
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Database error while fetching students' });
    }
});

// 3. Оюутныг нэрээр нь хайх (MOVED BEFORE /:id route)
app.get('/api/students/search', async (req, res) => {
    const { name } = req.query; // ?name=john
    if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name query parameter is required (min 2 characters)' });
    }
    try {
        const searchPattern = `%${name.trim()}%`;
        const result = await pool.query(`
            SELECT 
                student_id as studentid,
                first_name as fname,
                last_name as lname,
                dob,
                email,
                address,
                enrollment_score
            FROM student
            WHERE first_name ILIKE $1 
               OR last_name ILIKE $1
            ORDER BY last_name, first_name
            LIMIT 50
        `, [searchPattern]);
        res.json(result.rows);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// 2. Нэг оюутны мэдээллийг ID дугаараар нь хайж олох
app.get('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT 
                student_id as studentid,
                first_name as fname,
                last_name as lname,
                dob,
                email,
                address,
                enrollment_score
            FROM student 
            WHERE student_id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching student:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 4. Шинэ оюутны мэдээлэл оруулах
app.post('/api/students', async (req, res) => {
    const { FName, Lname, dob, Email, Address, enrollment_score } = req.body;

    // мэдээлэлд шалгалт хийх
    if (!FName || !Lname || !Email) {
        return res.status(400).json({ error: 'First name, last name and email are required' });
    }
    try {
        const result = await pool.query(`
            INSERT INTO student (first_name, last_name, dob, email, address, enrollment_score)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING 
                student_id as studentid,
                first_name as fname,
                last_name as lname,
                dob,
                email,
                address,
                enrollment_score
        `, [FName, Lname, dob || null, Email, Address || null, enrollment_score || null]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique violation
            return res.status(409).json({ error: 'Email already exists' });
        }
        console.error('Error creating student:', err);
        res.status(400).json({ error: err.message || 'Failed to create student' });
    }
});

// 5. Оюутны мэдээлэлд хэсэгчилсэн өөрчлөлт хийх
app.put('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    const { FName, Lname, dob, Email, Address, enrollment_score } = req.body;
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'No fields provided to update' });
    }
    try {
        const result = await pool.query(`
            UPDATE student
            SET 
                first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                dob = COALESCE($3::date, dob),
                email = COALESCE($4, email),
                address = COALESCE($5, address),
                enrollment_score = COALESCE($6::numeric, enrollment_score)
            WHERE student_id = $7
            RETURNING 
                student_id as studentid,
                first_name as fname,
                last_name as lname,
                dob,
                email,
                address,
                enrollment_score
        `, [FName, Lname, dob, Email, Address, enrollment_score, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Email already in use' });
        }
        console.error('Error updating student:', err);
        res.status(400).json({ error: err.message });
    }
});

// 6. Оюутны мэдээлэл устгах
app.delete('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM student WHERE student_id = $1',
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        if (err.code === '23503') { // foreign key violation
            return res.status(409).json({
                error: 'Cannot delete student — they are enrolled in programs or courses'
            });
        }
        console.error('Error deleting student:', err);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

// Simple root route to check server is running
app.get('/', (req, res) => {
    res.send('University API is running. Use /api/students endpoints.');
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
});

// Сервер эхлүүлэх
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);

    // Test database connection on startup
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✓ Database connected successfully');
    } catch (err) {
        console.error('✗ Database connection failed:', err.message);
    }
});
