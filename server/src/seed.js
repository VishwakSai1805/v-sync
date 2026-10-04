/* eslint-disable no-console */
// Seeds demo data: one account per role, campus facilities, P2P items and a
// couple of civic issues. Usage:  npm run seed            (adds if missing)
//                                 npm run seed -- --reset (wipes DB first)
const mongoose = require('mongoose');
const config = require('./config');
const M = require('./models');
const karma = require('./services/karma');
const { extractKeywords } = require('./services/duplicateDetector');

const PASSWORD = 'password123';

const USERS = [
  { name: 'Admin Office', email: 'admin@vit.ac.in', role: 'admin', department: 'Administration' },
  { name: 'Dr. Proctor', email: 'proctor@vit.ac.in', role: 'faculty', department: 'SCOPE', facultyId: 'FAC1001' },
  { name: 'Hostel Warden', email: 'warden@vit.ac.in', role: 'warden', department: 'Hostel Office', hostelBlock: 'Men\'s Block A' },
  { name: 'Ravi (Electrician)', email: 'maint1@vit.ac.in', role: 'maintenance', department: 'Electrical', staffId: 'MS201' },
  { name: 'Suresh (Plumbing/Network)', email: 'maint2@vit.ac.in', role: 'maintenance', department: 'Estate', staffId: 'MS202' },
  { name: 'Aarav Student', email: 'student1@vitstudent.ac.in', role: 'student', department: 'CSE', year: 2, studentId: '24BCE0001', hostelBlock: 'A' },
  { name: 'Diya Student', email: 'student2@vitstudent.ac.in', role: 'student', department: 'ECE', year: 3, studentId: '23BEC0002', hostelBlock: 'B' },
  { name: 'Kabir Student', email: 'student3@vitstudent.ac.in', role: 'student', department: 'Mech', year: 1, studentId: '25BME0003', hostelBlock: 'A' },
];

const FACILITIES = [
  { name: 'SJT Study Room 401', category: 'Study Room', location: 'SJT, 4th floor', capacity: 1, description: 'Quiet room, 6 seats, whiteboard.' },
  { name: 'Library Discussion Pod 2', category: 'Study Room', location: 'Central Library', capacity: 1, description: 'Group pod with display screen.' },
  { name: 'Hostel A Washing Machine 1', category: 'Laundry', location: 'Hostel Block A, ground floor', capacity: 1, description: '45-minute wash cycles.' },
  { name: 'IoT Hardware Lab (after hours)', category: 'Lab', location: 'TT, 2nd floor', capacity: 1, restricted: true, description: 'Late-night access needs Proctor + Warden approval.' },
  { name: 'Robotics Workshop', category: 'Lab', location: 'GDN basement', capacity: 1, restricted: true, description: 'Restricted: power tools on site.' },
];

// Inserts demo data. Idempotent: existing users/resources are left untouched.
// Assumes mongoose is already connected (used by the CLI below and by index.js
// when SEED_DEMO_DATA=true on a fresh database).
async function seedDemoData() {
  await karma.ensureDefaultRules();

  const byEmail = {};
  for (const u of USERS) {
    let user = await M.User.findOne({ email: u.email });
    if (!user) user = await M.User.create({ ...u, password: PASSWORD });
    if (user.role === 'student') await karma.createWallet(user._id);
    byEmail[u.email] = user;
  }

  for (const f of FACILITIES) {
    await M.Resource.updateOne({ name: f.name, kind: 'facility' }, { $setOnInsert: { ...f, kind: 'facility' } }, { upsert: true });
  }

  const s1 = byEmail['student1@vitstudent.ac.in'];
  const s2 = byEmail['student2@vitstudent.ac.in'];
  const items = [
    { owner: s1, name: 'Arduino Uno R3 kit', category: 'Electronics', description: 'Board + breadboard + jumper wires + sensors.' },
    { owner: s1, name: 'Engineering Drafter', category: 'Drawing Tools', description: 'Mini drafter, good condition.' },
    { owner: s2, name: 'Let Us C — Kanetkar', category: 'Textbook', description: '16th edition.' },
    { owner: s2, name: 'Casio fx-991ES Calculator', category: 'Calculator', description: 'Exam-approved scientific calculator.' },
    { owner: s2, name: 'Raspberry Pi 4 (4GB)', category: 'Electronics', description: 'With 32GB SD card and charger.' },
  ];
  for (const it of items) {
    await M.Resource.updateOne(
      { name: it.name, owner: it.owner._id },
      { $setOnInsert: { name: it.name, category: it.category, description: it.description, kind: 'p2p', owner: it.owner._id, location: `Hostel ${it.owner.hostelBlock}` } },
      { upsert: true }
    );
  }

  if (!(await M.Issue.countDocuments())) {
    const issues = [
      { by: s1, title: 'WiFi router not working', description: 'No internet in the study room since morning.', category: 'network', building: 'SJT', room: '401' },
      { by: s2, title: 'Water leaking from washroom tap', description: 'Tap keeps leaking, floor is wet.', category: 'plumbing', building: 'Hostel A', room: 'Ground floor washroom' },
      { by: s1, title: 'AC not cooling', description: 'Classroom AC blowing warm air.', category: 'hvac', building: 'TT', room: '305' },
    ];
    for (const i of issues) {
      const issue = await M.Issue.create({
        title: i.title, description: i.description, category: i.category, building: i.building, room: i.room,
        location: `${i.building} / ${i.room}`, keywords: extractKeywords(i.title, i.description),
        createdBy: i.by._id, reporters: [i.by._id], statusHistory: [{ status: 'open', note: 'Reported', by: i.by._id }],
      });
      await M.IssueReport.create({ reporter: i.by._id, issue: issue._id, title: i.title, description: i.description, category: i.category, building: i.building, room: i.room });
    }
  }

  console.log('\nSeed complete. All demo accounts use password:', PASSWORD);
  for (const u of USERS) console.log(`  ${u.role.padEnd(12)} ${u.email}`);
}

async function main() {
  await mongoose.connect(config.mongoUri);
  if (process.argv.includes('--reset')) {
    await mongoose.connection.dropDatabase();
    console.log('Database reset');
  }
  await seedDemoData();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedDemoData };
