from flask import Flask, request, jsonify
from flask_cors import CORS
from zk import ZK
import threading
import time
import socket

from config import DATABASE_URI
from auth import token_required, authenticate_user, generate_token
from enroll import enroll_user_with_fingerprint
from models.models import db, Device, AttendanceLog
from devices.routes import devices_bp
from logs.routes import logs_bp
from users.routes import users_bp
from hr.routes import hr_bp
from assignments.routes import assignments_bp

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    db.create_all()

app.register_blueprint(devices_bp)
app.register_blueprint(logs_bp)
app.register_blueprint(users_bp)
app.register_blueprint(hr_bp)
app.register_blueprint(assignments_bp)


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if authenticate_user(username, password):
        token = generate_token(username)
        return jsonify({'token': token})
    else:
        return jsonify({'error': 'Invalid credentials'}), 401


@app.route('/user', methods=['POST'])
@token_required
def enroll():
    data = request.get_json()
    required_fields = ['ip', 'port', 'name', 'user_id', 'user_role', 'department']
    missing = [field for field in required_fields if field not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400
    result = enroll_user_with_fingerprint(
        ip=data['ip'], port=int(data['port']), name=data['name'],
        user_id=str(data['user_id']), user_role=int(data['user_role']),
        department=data.get('department', 'General')
    )
    return jsonify(result)


capture_threads = []


def is_device_online(ip, port=4370):
    try:
        with socket.create_connection((ip, port), timeout=2):
            return True
    except Exception:
        return False


def sync_historical_logs(conn, device_id, ip):
    """Pull all existing logs from device and save any that aren't in DB yet."""
    import traceback
    try:
        print(f"[{ip}] Syncing historical logs from device...", flush=True)
        attendances = conn.get_attendance()
        if not attendances:
            print(f"[{ip}] No historical logs found on device.", flush=True)
            return
        print(f"[{ip}] Fetched {len(attendances)} records from device, saving new ones...", flush=True)
        new_count = 0
        with app.app_context():
            for att in attendances:
                exists = AttendanceLog.query.filter_by(
                    user_id=str(att.user_id),
                    timestamp=att.timestamp,
                    device_id=device_id
                ).first()
                if not exists:
                    log = AttendanceLog(
                        uid=att.uid,
                        user_id=str(att.user_id),
                        timestamp=att.timestamp,
                        status=att.status,
                        punch=att.punch,
                        device_id=device_id,
                    )
                    db.session.add(log)
                    new_count += 1
            db.session.commit()
        print(f"[{ip}] Synced {new_count} new historical logs (skipped {len(attendances) - new_count} duplicates).", flush=True)
    except Exception as e:
        print(f"[{ip}] Failed to sync historical logs: {e}", flush=True)
        traceback.print_exc()


def save_attendance(attendance, device_id, ip):
    """Save a single attendance record, avoiding duplicates."""
    with app.app_context():
        exists = AttendanceLog.query.filter_by(
            user_id=str(attendance.user_id),
            timestamp=attendance.timestamp,
            device_id=device_id
        ).first()
        if not exists:
            new_log = AttendanceLog(
                uid=attendance.uid,
                user_id=str(attendance.user_id),
                timestamp=attendance.timestamp,
                status=attendance.status,
                punch=attendance.punch,
                device_id=device_id,
            )
            db.session.add(new_log)
            db.session.commit()
            print(f"[{ip}] Attendance saved: {attendance.user_id} at {attendance.timestamp}", flush=True)


class LiveCaptureThread(threading.Thread):
    def __init__(self, ip, device_id, port=4370):
        super().__init__(daemon=True)
        self.ip = ip
        self.device_id = device_id
        self.port = port
        self.zk = ZK(ip, port=port, timeout=15, password=0, force_udp=False, ommit_ping=True)
        self.conn = None
        self.running = False
        self.use_polling = False  # fallback mode for devices that don't support live capture

    def update_device_status(self, status: bool):
        try:
            with app.app_context():
                device = db.session.get(Device, self.device_id)
                if device and device.isActive != status:
                    device.isActive = status
                    db.session.commit()
                    print(f"[{self.ip}] Device status updated: isActive = {status}", flush=True)
        except Exception as e:
            print(f"[{self.ip}] Failed to update device status: {e}", flush=True)

    def run_live_capture(self, conn):
        """Try live capture mode."""
        live_fail_count = 0
        for attendance in conn.live_capture():
            if not self.running:
                break
            if attendance is None:
                continue
            live_fail_count = 0
            save_attendance(attendance, self.device_id, self.ip)

    def run_polling(self, conn):
        """Poll for new logs every 30 seconds — fallback for devices that don't support live capture."""
        print(f"[{self.ip}] Using polling mode (live capture not supported).", flush=True)
        last_sync_count = 0
        while self.running:
            try:
                attendances = conn.get_attendance()
                if attendances and len(attendances) > last_sync_count:
                    new_entries = attendances[last_sync_count:]
                    for att in new_entries:
                        save_attendance(att, self.device_id, self.ip)
                    last_sync_count = len(attendances)
            except Exception as e:
                print(f"[{self.ip}] Polling error: {e}", flush=True)
                raise  # let the outer loop handle reconnect
            time.sleep(30)

    def run(self):
        print(f"[{self.ip}] Thread started.", flush=True)
        live_fail_streak = 0

        while True:
            if not is_device_online(self.ip, self.port):
                print(f"[{self.ip}] Offline. Retrying in 10s...", flush=True)
                self.update_device_status(False)
                time.sleep(10)
                continue

            try:
                print(f"[{self.ip}] Connecting...", flush=True)
                self.conn = self.zk.connect()
                self.conn.disable_device()
                self.update_device_status(True)
                self.running = True

                # Always sync historical logs on connect
                sync_historical_logs(self.conn, self.device_id, self.ip)

                self.conn.enable_device()

                if self.use_polling:
                    self.run_polling(self.conn)
                else:
                    print(f"[{self.ip}] Live capture started...", flush=True)
                    try:
                        self.run_live_capture(self.conn)
                        live_fail_streak = 0
                    except Exception as live_err:
                        live_fail_streak += 1
                        print(f"[{self.ip}] Live capture failed ({live_fail_streak}x): {live_err}", flush=True)
                        # After 3 consecutive live capture failures, switch to polling
                        if live_fail_streak >= 3:
                            print(f"[{self.ip}] Switching to polling mode permanently.", flush=True)
                            self.use_polling = True
                        raise  # reconnect

            except Exception as e:
                print(f"[{self.ip}] Disconnected: {e}. Reconnecting in 10s...", flush=True)
                self.update_device_status(False)
                self.running = False
                try:
                    if self.conn:
                        self.conn.disconnect()
                except Exception:
                    pass
                time.sleep(10)

    def stop(self):
        self.running = False
        if self.conn:
            try:
                self.conn.enable_device()
                self.conn.disconnect()
            except Exception:
                pass


def start_all_live_captures():
    with app.app_context():
        devices = Device.query.all()
        print(f"🔍 Found {len(devices)} total devices.", flush=True)
        for device in devices:
            print(f"  Starting thread for {device.ip}:{device.port}", flush=True)
            thread = LiveCaptureThread(ip=device.ip, device_id=device.id, port=device.port or 4370)
            thread.start()
            capture_threads.append(thread)
        print(f"✅ Started live capture threads for {len(capture_threads)} devices.", flush=True)


def start_capture_for_device(device_id, ip, port):
    """Start a live capture thread for a single newly added device."""
    for thread in capture_threads:
        if thread.ip == ip and thread.is_alive():
            print(f"[{ip}] Thread already running, skipping.", flush=True)
            return
    print(f"[{ip}] Starting new capture thread for device {device_id}...", flush=True)
    thread = LiveCaptureThread(ip=ip, device_id=device_id, port=port or 4370)
    thread.start()
    capture_threads.append(thread)


def monitor_threads():
    while True:
        time.sleep(30)
        for i, thread in enumerate(capture_threads):
            if not thread.is_alive():
                print(f"[Monitor] Thread for {thread.ip} died. Restarting...", flush=True)
                new_thread = LiveCaptureThread(ip=thread.ip, device_id=thread.device_id, port=thread.port)
                new_thread.use_polling = thread.use_polling  # preserve polling mode
                new_thread.start()
                capture_threads[i] = new_thread


def run_capture_service():
    def delayed_start():
        time.sleep(3)
        try:
            start_all_live_captures()
        except Exception as e:
            print(f"[Startup] Failed to start captures: {e}", flush=True)

    threading.Thread(target=delayed_start, daemon=True).start()
    threading.Thread(target=monitor_threads, daemon=True).start()
    app.run(host='0.0.0.0', port=5002)


if __name__ == '__main__':
    run_capture_service()