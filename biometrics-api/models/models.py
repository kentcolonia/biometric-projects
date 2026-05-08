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


