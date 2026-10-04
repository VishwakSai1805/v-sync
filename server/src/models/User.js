const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// USER entity (ER diagram). STUDENT / FACULTY ISA sub-types are modelled
// with the `role` discriminator field plus role-specific attributes
// (department, year, studentId / facultyId). Admin, Warden and
// Maintenance Staff are also `role` values on USER.
const ROLES = ['student', 'faculty', 'warden', 'maintenance', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional: accounts created through Google sign-in have no password.
    password: { type: String, minlength: 6, select: false },
    // Google account subject id ("sub" claim) once the user has signed in with Google.
    // Left unset (not null) for password accounts so the sparse unique index skips them.
    googleId: { type: String },
    avatarUrl: { type: String, default: null },
    role: { type: String, enum: ROLES, default: 'student' },
    // STUDENT attributes
    studentId: { type: String, trim: true },
    year: { type: Number, min: 1, max: 6 },
    // FACULTY / MAINTENANCE_STAFF attributes
    facultyId: { type: String, trim: true },
    staffId: { type: String, trim: true },
    department: { type: String, trim: true },
    hostelBlock: { type: String, trim: true },
    // Trust & Rating algorithm output (0-100), see services/trust.js
    trustScore: { type: Number, default: 50, min: 0, max: 100 },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    onTimeReturns: { type: Number, default: 0 },
    lateReturns: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.googleId;
  return obj;
};

userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
