import os
import json
import subprocess
import tempfile
from datetime import datetime
from flask import Blueprint, jsonify, request, send_file
from auth import token_required
from models.models import db, Device
from zk import ZK

backup_bp = Blueprint('backup', __name__)

# ── helpers ────────────────────────────────────────────────────────────────────

BACKUP_DIR = '/app/backups'
os.makedirs(BACKUP_DIR, exist_ok=True)

DB_HOST = 'db'
DB_PORT = '3306'
DB_USER = 'root'
DB_PASS = 'password'
DB_NAME = 'bio_api'


def get_zk_connection(ip, port):
    for force_udp in [False, True]:
        try:
            zk = ZK(ip, port=port, timeout=10, password=0, force_udp=force_udp, ommit_ping=True)
            conn = zk.connect()
            return conn
        except Exception:
            continue
    raise Exception(f"Could not connect to device at {ip}:{port}")


# ── MySQL backup ───────────────────────────────────────────────────────────────

@backup_bp.route('/backup/database', methods=['GET'])
@token_required
def backup_database():
    """Dump MySQL database to a .sql file and return it for download."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'bio_api_backup_{timestamp}.sql'
    filepath = os.path.join(BACKUP_DIR, filename)

    try:
        result = subprocess.run(
            ['mysqldump',
             f'-h{DB_HOST}',
             f'-P{DB_PORT}',
             f'-u{DB_USER}',
             f'-p{DB_PASS}',
             '--single-transaction',
             '--routines',
             '--triggers',
             DB_NAME],
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            return jsonify({'error': f'mysqldump failed: {result.stderr}'}), 500

        with open(filepath, 'w') as f:
            f.write(result.stdout)

        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='application/sql'
        )

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Database backup timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@backup_bp.route('/backup/database/list', methods=['GET'])
@token_required
def list_database_backups():
    """List all saved database backups on the server."""
    try:
        files = []
        for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
            if f.endswith('.sql'):
                path = os.path.join(BACKUP_DIR, f)
                files.append({
                    'filename': f,
                    'size_kb': round(os.path.getsize(path) / 1024, 1),
                    'created_at': datetime.fromtimestamp(os.path.getmtime(path)).isoformat(),
                })
        return jsonify({'data': files}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@backup_bp.route('/backup/database/download/<filename>', methods=['GET'])
@token_required
def download_database_backup(filename):
    """Download a specific saved backup file."""
    # Sanitize filename
    filename = os.path.basename(filename)
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Backup file not found'}), 404
    return send_file(filepath, as_attachment=True, download_name=filename, mimetype='application/sql')


@backup_bp.route('/backup/database/restore', methods=['POST'])
@token_required
def restore_database():
    """Upload a .sql file and restore the database."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.endswith('.sql'):
        return jsonify({'error': 'Only .sql files are accepted'}), 400

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filepath = os.path.join(BACKUP_DIR, f'restore_{timestamp}.sql')
    file.save(filepath)

    try:
        with open(filepath, 'r') as f:
            sql_content = f.read()

        result = subprocess.run(
            ['mysql',
             f'-h{DB_HOST}',
             f'-P{DB_PORT}',
             f'-u{DB_USER}',
             f'-p{DB_PASS}',
             DB_NAME],
            input=sql_content,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            return jsonify({'error': f'Restore failed: {result.stderr}'}), 500

        return jsonify({'message': 'Database restored successfully'}), 200

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Database restore timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up temp restore file
        if os.path.exists(filepath):
            os.remove(filepath)


# ── Device users/fingerprints backup ──────────────────────────────────────────

@backup_bp.route('/backup/device/<int:device_id>', methods=['GET'])
@token_required
def backup_device(device_id):
    """Export all users and fingerprint templates from a ZK device as JSON."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404

    try:
        conn = get_zk_connection(device.ip, device.port)
        conn.disable_device()

        # Get users
        users = conn.get_users()
        user_list = []
        for u in users:
            user_list.append({
                'uid': u.uid,
                'user_id': u.user_id,
                'name': u.name,
                'privilege': u.privilege,
                'password': u.password,
                'group_id': u.group_id,
                'card': u.card,
            })

        # Get fingerprint templates
        templates = []
        try:
            all_templates = conn.get_templates()
            for t in all_templates:
                templates.append({
                    'uid': t.uid,
                    'fid': t.fid,
                    'valid': t.valid,
                    'template': list(t.template) if t.template else [],
                })
        except Exception as e:
            print(f"Warning: Could not fetch templates: {e}")

        conn.enable_device()
        conn.disconnect()

        backup_data = {
            'device_id': device.id,
            'device_ip': device.ip,
            'device_location': device.location,
            'backup_time': datetime.now().isoformat(),
            'user_count': len(user_list),
            'template_count': len(templates),
            'users': user_list,
            'templates': templates,
        }

        # Save to server
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'device_{device_id}_{device.location.replace(" ", "_")}_{timestamp}.json'
        filepath = os.path.join(BACKUP_DIR, filename)
        with open(filepath, 'w') as f:
            json.dump(backup_data, f)

        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='application/json'
        )

    except Exception as e:
        return jsonify({'error': f'Backup failed: {str(e)}'}), 500


@backup_bp.route('/backup/device/list', methods=['GET'])
@token_required
def list_device_backups():
    """List all saved device backups on the server."""
    try:
        files = []
        for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
            if f.endswith('.json') and f.startswith('device_'):
                path = os.path.join(BACKUP_DIR, f)
                try:
                    with open(path) as fp:
                        data = json.load(fp)
                    files.append({
                        'filename': f,
                        'size_kb': round(os.path.getsize(path) / 1024, 1),
                        'device_location': data.get('device_location', '?'),
                        'device_ip': data.get('device_ip', '?'),
                        'user_count': data.get('user_count', 0),
                        'template_count': data.get('template_count', 0),
                        'backup_time': data.get('backup_time', ''),
                    })
                except Exception:
                    pass
        return jsonify({'data': files}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@backup_bp.route('/backup/device/<int:device_id>/restore', methods=['POST'])
@token_required
def restore_device(device_id):
    """Upload a device backup JSON and push all users + fingerprints to the device."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.endswith('.json'):
        return jsonify({'error': 'Only .json backup files are accepted'}), 400

    try:
        backup_data = json.load(file)
    except Exception:
        return jsonify({'error': 'Invalid JSON file'}), 400

    users = backup_data.get('users', [])
    templates = backup_data.get('templates', [])

    if not users:
        return jsonify({'error': 'No users found in backup file'}), 400

    try:
        conn = get_zk_connection(device.ip, device.port)
        conn.disable_device()

        # Get existing users on device to avoid duplicates
        existing_users = conn.get_users()
        existing_user_ids = {u.user_id for u in existing_users}
        existing_uids = {u.uid for u in existing_users}

        users_added = 0
        users_skipped = 0
        fingers_restored = 0
        uid_map = {}  # old_uid -> new_uid (in case of UID conflicts)

        for u in users:
            if u['user_id'] in existing_user_ids:
                users_skipped += 1
                # Map old uid to existing uid for template restore
                existing = next((x for x in existing_users if x.user_id == u['user_id']), None)
                if existing:
                    uid_map[u['uid']] = existing.uid
                continue

            # Find a safe UID
            new_uid = u['uid']
            while new_uid in existing_uids:
                new_uid += 1
            existing_uids.add(new_uid)
            uid_map[u['uid']] = new_uid

            conn.set_user(
                uid=new_uid,
                user_id=u['user_id'],
                name=u['name'],
                privilege=u['privilege'],
                password=u.get('password', ''),
                card=u.get('card', 0),
            )
            users_added += 1

        # Restore fingerprint templates
        for t in templates:
            old_uid = t['uid']
            new_uid = uid_map.get(old_uid)
            if new_uid is None:
                continue
            if not t.get('template'):
                continue
            try:
                from zk.finger import Finger
                finger = Finger(
                    uid=new_uid,
                    fid=t['fid'],
                    valid=t['valid'],
                    template=bytes(t['template']),
                )
                conn.save_user_template(finger)
                fingers_restored += 1
            except Exception as e:
                print(f"Warning: Could not restore finger uid={new_uid} fid={t['fid']}: {e}")

        conn.enable_device()
        conn.disconnect()

        return jsonify({
            'message': 'Device restored successfully',
            'users_added': users_added,
            'users_skipped': users_skipped,
            'fingers_restored': fingers_restored,
        }), 200

    except Exception as e:
        return jsonify({'error': f'Restore failed: {str(e)}'}), 500