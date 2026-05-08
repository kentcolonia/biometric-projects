from flask import Flask, request, jsonify
from flask_cors import CORS
from zk import ZK
import threading
import time
import subprocess
import platform
import socket

from config import DATABASE_URI
from auth import token_required, authenticate_user, generate_token
from enroll import enroll_user_with_fingerprint
from models.models import db, Device, AttendanceLog
from devices.routes import devices_bp
from logs.routes import logs_bp
from users.routes import users_bp

app = Flask(__name__)
CORS(app)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize DB
db.init_app(app)

with app.app_context():
    db.create_all()

# Register Blueprints
app.register_blueprint(devices_bp)
app.register_blueprint(logs_bp)
app.register_blueprint(users_bp)

# ---------- Login Endpoint ----------
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

# ---------- Enroll User Endpoint ----------
@app.route('/user', methods=['POST'])
@token_required
def enroll():
    data = request.get_json()
    required_fields = ['ip', 'port', 'name', 'user_id', 'user_role', 'department']
    missing = [field for field in required_fields if field not in data]

    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    result = enroll_user_with_fingerprint(
        ip=data['ip'],
        port=int(data['port']),
        name=data['name'],
        user_id=str(data['user_id']),
        user_role=int(data['user_role']),
        department=data.get('department', 'General')
    )

    return jsonify(result)

MAX_RETRIES = 3
capture_threads = []


def is_device_online(ip):
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
    timeout = '1'
    try:
        result = subprocess.run(
            ['ping', param, '1', timeout_param, timeout, ip],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return result.returncode == 0
    except Exception:
        return False


class LiveCaptureThread(threading.Thread):
    def __init__(self, ip, device_id, port=4370):
        super().__init__(daemon=True)
        self.ip = ip
        self.device_id = device_id
        self.port = port
        self.zk = ZK(ip, port=port, timeout=5, password=0)
        self.conn = None
        self.running = False

    def update_device_status(self, status: bool):
        with app.app_context():
            device = db.session.get(Device, self.device_id)
            if device and device.isActive != status:
                device.isActive = status
                db.session.commit()
                print(f"[{self.ip}] Device status updated: isActive = {status}")

    def check_socket_online(self):
        try:
            with socket.create_connection((self.ip, self.port), timeout=2):
                return True
        except Exception:
            return False

    def run(self):
        retries = 0
        connected = False

        while retries < MAX_RETRIES:
            if not is_device_online(self.ip):
                print(f"[{self.ip}] Ping failed, device offline.")
                self.update_device_status(False)
                retries += 1
                time.sleep(5)
                continue

            if not self.check_socket_online():
                print(f"[{self.ip}] Socket connection failed, device offline.")
                self.update_device_status(False)
                retries += 1
                time.sleep(5)
                continue

            try:
                print(f"[{self.ip}] Attempting zk connection (try {retries + 1})...")
                self.conn = self.zk.connect()
                self.conn.disable_device()

                self.update_device_status(True)
                self.running = True
                connected = True
                print(f"[{self.ip}] Live capture started...")

                live_capture_gen = self.conn.live_capture()

                try:
                    for attendance in live_capture_gen:
                        if not self.running:
                            break
                        if attendance is None:
                            continue

                        data = {
                            'uid': attendance.uid,
                            'user_id': str(attendance.user_id),
                            'timestamp': attendance.timestamp,
                            'status': attendance.status,
                            'punch': attendance.punch,
                            'device_id': self.device_id,
                        }

                        print(f"[{self.ip}] Attendance recorded: {data}")

                        with app.app_context():
                            new_log = AttendanceLog(
                                uid=data['uid'],
                                user_id=data['user_id'],
                                timestamp=data['timestamp'],
                                status=data['status'],
                                punch=data['punch'],
                                device_id=data['device_id'],
                            )
                            db.session.add(new_log)
                            db.session.commit()

                except Exception as live_err:
                    print(f"[{self.ip}] Live capture disconnected: {live_err}")
                    self.update_device_status(False)
                    self.running = False

                break

            except Exception as e:
                print(f"[{self.ip}] Connection error on attempt {retries + 1}: {e}")
                if retries == 0:
                    self.update_device_status(False)
                retries += 1
                time.sleep(5)

        if not connected:
            self.update_device_status(False)

        self.running = False

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
        print(f"🔍 Found {len(devices)} total devices.")

        for device in devices:
            thread = LiveCaptureThread(ip=device.ip, device_id=device.id, port=device.port or 4370)
            thread.start()
            capture_threads.append(thread)

        print(f"✅ Started live capture threads for {len(capture_threads)} devices.")


def monitor_threads():
    while True:
        for i, thread in enumerate(capture_threads):
            if not is_device_online(thread.ip):
                print(f"[Monitor] Device {thread.ip} offline. Updating status and stopping thread.")
                thread.update_device_status(False)
                if thread.is_alive():
                    thread.stop()
                    thread.join(timeout=2)
            else:
                # Device is online
                thread.update_device_status(True)
                if not thread.is_alive():
                    print(f"[Monitor] Thread for {thread.ip} stopped. Restarting...")
                    new_thread = LiveCaptureThread(ip=thread.ip, device_id=thread.device_id, port=thread.port)
                    new_thread.start()
                    capture_threads[i] = new_thread
        time.sleep(10)


def run_capture_service():
    start_all_live_captures()

    monitoring_thread = threading.Thread(target=monitor_threads, daemon=True)
    monitoring_thread.start()

    app.run(host='0.0.0.0', port=5000)


if __name__ == '__main__':
    run_capture_service()