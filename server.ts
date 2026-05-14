import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// Initialize SQLite Memory Database (Simulating MySQL for the project)
const db = new Database(':memory:');

// Create Tables
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    phone TEXT,
    city TEXT,
    address TEXT,
    blood_group TEXT,
    age INTEGER,
    gender TEXT,
    medical_history TEXT,
    aadhaar TEXT,
    profile_photo TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    specialization TEXT,
    fee INTEGER,
    available_timings TEXT,
    qualification TEXT,
    experience INTEGER,
    clinic_name TEXT,
    is_verified INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_id INTEGER,
    date TEXT,
    time TEXT,
    status TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES users(id),
    FOREIGN KEY(doctor_id) REFERENCES doctors(id)
  );
`);

// Insert Dummy Data
const insertUser = db.prepare('INSERT INTO users (name, email, password, role, phone, city, blood_group) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertDoctor = db.prepare('INSERT INTO doctors (user_id, specialization, fee, available_timings) VALUES (?, ?, ?, ?)');

insertUser.run('Admin System', 'admin@aarogya.in', 'admin123', 'admin', '0000000000', 'Delhi', 'O+');
const infoPat1 = insertUser.run('Ramesh Kumar', 'ramesh@email.com', 'password', 'patient', '9876543210', 'Bhopal', 'B+');
const infoPat2 = insertUser.run('Sita Sharma', 'sita@email.com', 'password', 'patient', '9988776655', 'Jabalpur', 'A+');

const infoDoc1 = insertUser.run('Dr. Arvind Patel', 'arvind@email.com', 'password', 'doctor', '1122334455', 'Indore', 'O+');
insertDoctor.run(infoDoc1.lastInsertRowid, 'Cardiologist', 500, '10:00 AM - 02:00 PM');

const infoDoc2 = insertUser.run('Dr. Meena Iyer', 'meena@email.com', 'password', 'doctor', '5566778899', 'Delhi', 'AB+');
insertDoctor.run(infoDoc2.lastInsertRowid, 'General Physician', 300, '04:00 PM - 08:00 PM');


// --- API ROUTES ---

// Auth Routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password) as any;
  if (user) {
    let doctorInfo = null;
    if(user.role === 'doctor') {
      doctorInfo = db.prepare('SELECT * FROM doctors WHERE user_id = ?').get(user.id);
    }
    res.json({ success: true, user: { ...user, doctorInfo } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT id, name, email, role, phone, city, address, blood_group, age, gender, medical_history, aadhaar, profile_photo FROM users WHERE id = ?').get(id) as any;
  if (user) {
    if (user.role === 'doctor') {
      const doctorInfo = db.prepare('SELECT id, specialization, fee, available_timings, qualification, experience, clinic_name FROM doctors WHERE user_id = ?').get(id);
      user.doctorInfo = doctorInfo || {};
    }
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, city, address, blood_group, age, gender, medical_history, aadhaar, profile_photo, doctorInfo } = req.body;
  try {
    db.prepare(`
      UPDATE users 
      SET name = ?, phone = ?, city = ?, address = ?, blood_group = ?, age = ?, gender = ?, medical_history = ?, aadhaar = ?, profile_photo = ?
      WHERE id = ?
    `).run(name, phone, city, address, blood_group, age, gender, medical_history, aadhaar, profile_photo, id);
    
    // Check if doctor and update doctor table
    const userRole = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as any;
    if (userRole && userRole.role === 'doctor' && doctorInfo) {
       db.prepare(`
        UPDATE doctors
        SET specialization = ?, fee = ?, available_timings = ?, qualification = ?, experience = ?, clinic_name = ?
        WHERE user_id = ?
       `).run(doctorInfo.specialization, doctorInfo.fee, doctorInfo.available_timings, doctorInfo.qualification, doctorInfo.experience, doctorInfo.clinic_name, id);
    }
    
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Patient Routes
app.get('/api/doctors', (req, res) => {
  const doctors = db.prepare(`
    SELECT d.id as doctor_id, u.name, u.city, d.specialization, d.fee, d.available_timings 
    FROM doctors d 
    JOIN users u ON d.user_id = u.id
  `).all();
  res.json(doctors);
});

app.post('/api/appointments', (req, res) => {
  const { patient_id, doctor_id, date, time, type } = req.body;
  const insert = db.prepare('INSERT INTO appointments (patient_id, doctor_id, date, time, status, type) VALUES (?, ?, ?, ?, ?, ?)');
  insert.run(patient_id, doctor_id, date, time, 'Scheduled', type);
  res.json({ success: true, message: 'Appointment booked successfully' });
});

app.get('/api/appointments/:userId', (req, res) => {
  const { userId } = req.params;
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  let appointments;
  if (user.role === 'patient') {
    appointments = db.prepare(`
      SELECT a.*, u.name as doctor_name, d.specialization 
      FROM appointments a 
      JOIN doctors d ON a.doctor_id = d.id 
      JOIN users u ON d.user_id = u.id 
      WHERE a.patient_id = ?
    `).all(userId);
  } else if (user.role === 'doctor') {
    const doc = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(userId) as any;
    if(doc) {
      appointments = db.prepare(`
        SELECT a.*, u.name as patient_name, u.phone as patient_phone
        FROM appointments a 
        JOIN users u ON a.patient_id = u.id 
        WHERE a.doctor_id = ?
      `).all(doc.id);
    } else {
      appointments = [];
    }
  }
  res.json(appointments || []);
});

app.post('/api/appointments/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);
  res.json({ success: true });
});

// Admin Routes
app.get('/api/admin/stats', (req, res) => {
  const totalPatients = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'patient'").get() as any;
  const totalDoctors = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'doctor'").get() as any;
  const totalAppointments = db.prepare("SELECT COUNT(*) as count FROM appointments").get() as any;
  
  res.json({
    patients: totalPatients.count,
    doctors: totalDoctors.count,
    appointments: totalAppointments.count,
    revenue: totalAppointments.count * 400 // mock avg fee
  });
});

app.get('/api/admin/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, phone, city, is_active, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.put('/api/admin/users/:id/status', (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const isDoctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(id) as any;
  if (isDoctor) {
    db.prepare('DELETE FROM appointments WHERE doctor_id = ?').run(isDoctor.id);
    db.prepare('DELETE FROM doctors WHERE user_id = ?').run(id);
  } else {
    db.prepare('DELETE FROM appointments WHERE patient_id = ?').run(id);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

app.get('/api/admin/doctors', (req, res) => {
  const doctors = db.prepare(`
    SELECT d.id as doctor_id, u.id as user_id, u.name, u.email, d.specialization, d.experience, d.is_verified, d.clinic_name 
    FROM doctors d 
    JOIN users u ON d.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(doctors);
});

app.put('/api/admin/doctors/:id/verify', (req, res) => {
  const { id } = req.params;
  const { is_verified } = req.body;
  db.prepare('UPDATE doctors SET is_verified = ? WHERE id = ?').run(is_verified ? 1 : 0, id);
  res.json({ success: true });
});

app.get('/api/admin/activities', (req, res) => {
  // Combine users and appointments for recent activity
  const users = db.prepare("SELECT name, role, created_at, 'joined' as action FROM users ORDER BY created_at DESC LIMIT 5").all() as any[];
  const appointments = db.prepare(`
    SELECT u.name, 'appointment' as role, a.created_at, 'booked an appointment' as action 
    FROM appointments a JOIN users u ON a.patient_id = u.id 
    ORDER BY a.created_at DESC LIMIT 5
  `).all() as any[];
  
  const activities = [...users, ...appointments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);
  res.json(activities);
});

app.post('/api/chatbot', (req, res) => {
  const { message } = req.body;
  const text = message.toLowerCase();
  let reply = "I'm a basic health bot. Please consult a real doctor for serious issues.";
  
  if(text.includes('fever')) {
    reply = "For a mild fever, rest and stay hydrated. Paracetamol can help, but if it exceeds 102°F or lasts more than 2 days, please book a doctor online.";
  } else if(text.includes('cold') || text.includes('cough')) {
    reply = "Try drinking warm ginger tea, inhaling steam, and taking rest. If breathing becomes difficult, consult immediately.";
  } else if(text.includes('when to consult')) {
    reply = "Consult a doctor if you have severe chest pain, prolonged high fever, difficulty breathing, or sudden severe pain.";
  } else if(text.includes('hello') || text.includes('hi')) {
    reply = "Namaste! How can I help you with your health today?";
  }

  res.json({ reply });
});


// Vite / Static files
function seedDoctors() {
  const dummyDoctors = [
    { name: 'Dr. Rahul Sharma', email: 'rahul.sharma@example.com', phone: '9876543210', city: 'Bhopal', gender: 'Male', specialization: 'Cardiologist', qualification: 'MBBS, MD', experience: 12, fee: 700, timings: '10:00 AM - 02:00 PM' },
    { name: 'Dr. Priya Patel', email: 'priya.patel@example.com', phone: '9876543211', city: 'Indore', gender: 'Female', specialization: 'Dermatologist', qualification: 'MBBS, DVD', experience: 8, fee: 500, timings: '04:00 PM - 08:00 PM' },
    { name: 'Dr. Amit Singh', email: 'amit.singh@example.com', phone: '9876543212', city: 'Jabalpur', gender: 'Male', specialization: 'Orthopedic', qualification: 'MBBS, MS', experience: 15, fee: 800, timings: '09:00 AM - 01:00 PM' },
    { name: 'Dr. Sneha Gupta', email: 'sneha.gupta@example.com', phone: '9876543213', city: 'Delhi', gender: 'Female', specialization: 'Pediatrician', qualification: 'MBBS, MD', experience: 10, fee: 600, timings: '11:00 AM - 03:00 PM' },
    { name: 'Dr. Vikram Desai', email: 'vikram.desai@example.com', phone: '9876543214', city: 'Mumbai', gender: 'Male', specialization: 'General Physician', qualification: 'MBBS', experience: 5, fee: 300, timings: '10:00 AM - 05:00 PM' },
    { name: 'Dr. Anjali Verma', email: 'anjali.verma@example.com', phone: '9876543215', city: 'Bhopal', gender: 'Female', specialization: 'Gynecologist', qualification: 'MBBS, DGO', experience: 20, fee: 900, timings: '10:00 AM - 01:00 PM' },
    { name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@example.com', phone: '9876543216', city: 'Indore', gender: 'Male', specialization: 'Neurologist', qualification: 'MBBS, DM', experience: 18, fee: 1000, timings: '02:00 PM - 06:00 PM' },
    { name: 'Dr. Neha Sharma', email: 'neha.sharma@example.com', phone: '9876543217', city: 'Jabalpur', gender: 'Female', specialization: 'Dentist', qualification: 'BDS, MDS', experience: 7, fee: 400, timings: '10:00 AM - 06:00 PM' },
    { name: 'Dr. Sanjay Mishra', email: 'sanjay.mishra@example.com', phone: '9876543218', city: 'Delhi', gender: 'Male', specialization: 'ENT Specialist', qualification: 'MBBS, MS', experience: 14, fee: 750, timings: '11:00 AM - 04:00 PM' },
    { name: 'Dr. Pooja Reddy', email: 'pooja.reddy@example.com', phone: '9876543219', city: 'Mumbai', gender: 'Female', specialization: 'Psychiatrist', qualification: 'MBBS, MD', experience: 9, fee: 800, timings: '10:00 AM - 02:00 PM' },
    { name: 'Dr. Arun Iyer', email: 'arun.iyer@example.com', phone: '9876543220', city: 'Bhopal', gender: 'Male', specialization: 'Cardiologist', qualification: 'MBBS, MD', experience: 22, fee: 900, timings: '10:00 AM - 01:00 PM' },
    { name: 'Dr. Kavita Joshi', email: 'kavita.joshi@example.com', phone: '9876543221', city: 'Indore', gender: 'Female', specialization: 'General Physician', qualification: 'MBBS, MD', experience: 11, fee: 500, timings: '09:00 AM - 01:00 PM' },
    { name: 'Dr. Manish Tiwari', email: 'manish.tiwari@example.com', phone: '9876543222', city: 'Jabalpur', gender: 'Male', specialization: 'Orthopedic', qualification: 'MBBS, MS', experience: 6, fee: 600, timings: '04:00 PM - 08:00 PM' },
    { name: 'Dr. Nidhi Agarwal', email: 'nidhi.agarwal@example.com', phone: '9876543223', city: 'Delhi', gender: 'Female', specialization: 'Dermatologist', qualification: 'MBBS, MD', experience: 16, fee: 700, timings: '10:00 AM - 02:00 PM' },
    { name: 'Dr. Rakesh Nair', email: 'rakesh.nair@example.com', phone: '9876543224', city: 'Mumbai', gender: 'Male', specialization: 'Pediatrician', qualification: 'MBBS, MD', experience: 13, fee: 800, timings: '03:00 PM - 07:00 PM' },
    { name: 'Dr. Smriti Singh', email: 'smriti.singh@example.com', phone: '9876543225', city: 'Bhopal', gender: 'Female', specialization: 'Gynecologist', qualification: 'MBBS, MD', experience: 8, fee: 600, timings: '11:00 AM - 03:00 PM' },
    { name: 'Dr. Tarun Jain', email: 'tarun.jain@example.com', phone: '9876543226', city: 'Indore', gender: 'Male', specialization: 'Dentist', qualification: 'BDS', experience: 3, fee: 300, timings: '10:00 AM - 06:00 PM' },
    { name: 'Dr. Uma Menon', email: 'uma.menon@example.com', phone: '9876543227', city: 'Jabalpur', gender: 'Female', specialization: 'ENT Specialist', qualification: 'MBBS, MS', experience: 19, fee: 900, timings: '09:00 AM - 01:00 PM' },
    { name: 'Dr. Vivek Bhatia', email: 'vivek.bhatia@example.com', phone: '9876543228', city: 'Delhi', gender: 'Male', specialization: 'Psychiatrist', qualification: 'MBBS, MD', experience: 15, fee: 1000, timings: '02:00 PM - 06:00 PM' },
    { name: 'Dr. Zoya Khan', email: 'zoya.khan@example.com', phone: '9876543229', city: 'Mumbai', gender: 'Female', specialization: 'Neurologist', qualification: 'MBBS, DM', experience: 12, fee: 950, timings: '10:00 AM - 02:00 PM' }
  ];

  const existingDoctorsCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('doctor') as any;
  if (existingDoctorsCount.count < 20) {
    console.log('Seeding doctors...');
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password, role, phone, city, gender, is_active, profile_photo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDoctor = db.prepare(`
      INSERT INTO doctors (user_id, specialization, qualification, experience, fee, clinic_name, available_timings, is_verified) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const checkEmail = db.prepare('SELECT id FROM users WHERE email = ?');

    db.transaction(() => {
      for (const doc of dummyDoctors) {
        if (!checkEmail.get(doc.email)) {
          const result = insertUser.run(
            doc.name, 
            doc.email, 
            'password123', 
            'doctor', 
            doc.phone, 
            doc.city, 
            doc.gender, 
            1, 
            `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(doc.name)}&backgroundColor=f0fdfa`
          );
          
          insertDoctor.run(
            result.lastInsertRowid,
            doc.specialization,
            doc.qualification,
            doc.experience,
            doc.fee,
            `${doc.name.split(' ')[1]}'s Clinic`,
            doc.timings,
            1 
          );
        }
      }
    })();
    console.log('Seeded doctors successfully.');
  }
}

async function startServer() {
  seedDoctors();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
