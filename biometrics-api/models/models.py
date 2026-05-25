from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class Device(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(100), unique=True, nullable=False)
    port = db.Column(db.Integer, nullable=False)
    location = db.Column(db.String(255), nullable=False)
    isActive = db.Column(db.Boolean, default=False)


class AttendanceLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.Integer, nullable=False)
    punch = db.Column(db.Integer, nullable=False)
    device_id = db.Column(db.Integer, db.ForeignKey('device.id'), nullable=False)
    device = db.relationship('Device', backref='logs')

    def to_dict(self):
        return {
            'id': self.id,
            'uid': self.uid,
            'user_id': self.user_id,
            'timestamp': self.timestamp.isoformat(),
            'status': self.status,
            'punch': self.punch,
            'device_id': self.device_id
        }


class Company(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    address = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    departments = db.relationship('Department', backref='company', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'address': self.address,
            'created_at': self.created_at.isoformat(),
        }


class Department(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    employees = db.relationship('Employee', backref='department', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'company_id': self.company_id,
            'company_name': self.company.name if self.company else None,
            'created_at': self.created_at.isoformat(),
        }


class ShiftSchedule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    time_in = db.Column(db.Time, nullable=False)           # expected check-in
    time_out = db.Column(db.Time, nullable=False)          # expected check-out (Mon–Fri)
    break_start = db.Column(db.Time, nullable=True)        # optional mid-day break start
    break_end = db.Column(db.Time, nullable=True)          # optional mid-day break end
    has_break = db.Column(db.Boolean, default=False)
    saturday_time_out = db.Column(db.Time, nullable=True)  # half-day Saturday end; None = no Saturday
    grace_period = db.Column(db.Integer, default=15)       # minutes
    is_night_shift = db.Column(db.Boolean, default=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    employees = db.relationship('Employee', backref='shift', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'time_in': self.time_in.strftime('%H:%M'),
            'time_out': self.time_out.strftime('%H:%M'),
            'break_start': self.break_start.strftime('%H:%M') if self.break_start else None,
            'break_end': self.break_end.strftime('%H:%M') if self.break_end else None,
            'has_break': bool(self.has_break),
            'saturday_time_out': self.saturday_time_out.strftime('%H:%M') if self.saturday_time_out else None,
            'grace_period': self.grace_period,
            'is_night_shift': self.is_night_shift,
            'company_id': self.company_id,
            'created_at': self.created_at.isoformat(),
        }


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), nullable=False, unique=True)  # matches biometric user_id
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=True)
    shift_id = db.Column(db.Integer, db.ForeignKey('shift_schedule.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    company = db.relationship('Company', backref='employees')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'email': self.email,
            'company_id': self.company_id,
            'company_name': self.company.name if self.company else None,
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
            'shift_id': self.shift_id,
            'shift_name': self.shift.name if self.shift else None,
            'shift_time_in': self.shift.time_in.strftime('%H:%M') if self.shift else None,
            'shift_time_out': self.shift.time_out.strftime('%H:%M') if self.shift else None,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
        }