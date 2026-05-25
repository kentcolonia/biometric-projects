from flask import Blueprint, request, jsonify
from auth import token_required
from models.models import db, Device, AttendanceLog
from zk import ZK
import traceback

assignments_bp = Blueprint('assignments', __name__)


def get_assignment(assignment_id):
    row = db.session.execute(
        db.text("SELECT * FROM user_device_assignment WHERE id = :id"),
        {"id": assignment_id}
    ).mappings().fetchone()
    return dict(row) if row else None


def get_assignments_for_user(user_id):
    rows = db.session.execute(
        db.text("""
            SELECT uda.id, uda.user_id, uda.device_id,
                   d.ip AS device_ip, d.location AS device_location
            FROM user_device_assignment uda
            JOIN device d ON d.id = uda.device_id
            WHERE uda.user_id = :user_id
        """),
        {"user_id": str(user_id)}
    ).mappings().fetchall()
    return [dict(r) for r in rows]


# GET /assignments?user_id=xxx
@assignments_bp.route('/assignments', methods=['GET'])
@token_required
def list_assignments():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    rows = get_assignments_for_user(user_id)
    return jsonify({'data': rows}), 200


# POST /assignments  { user_id, device_id }
@assignments_bp.route('/assignments', methods=['POST'])
@token_required
def create_assignment():
    data = request.get_json()
    user_id  = str(data.get('user_id', ''))
    device_id = data.get('device_id')
    if not user_id or not device_id:
        return jsonify({'error': 'user_id and device_id are required'}), 400

    # Check duplicate
    existing = db.session.execute(
        db.text("SELECT id FROM user_device_assignment WHERE user_id = :uid AND device_id = :did"),
        {"uid": user_id, "did": device_id}
    ).fetchone()
    if existing:
        return jsonify({'error': 'Assignment already exists'}), 409

    db.session.execute(
        db.text("INSERT INTO user_device_assignment (user_id, device_id) VALUES (:uid, :did)"),
        {"uid": user_id, "did": device_id}
    )
    db.session.commit()
    rows = get_assignments_for_user(user_id)
    return jsonify({'message': 'Assigned', 'data': rows}), 201


# DELETE /assignments/<id>
@assignments_bp.route('/assignments/<int:assignment_id>', methods=['DELETE'])
@token_required
def delete_assignment(assignment_id):
    row = get_assignment(assignment_id)
    if not row:
        return jsonify({'error': 'Assignment not found'}), 404

    # Also remove the user from the physical device
    device = Device.query.get(row['device_id'])
    if device:
        try:
            zk = ZK(device.ip, port=device.port or 4370, timeout=15,
                    password=0, force_udp=False, ommit_ping=True)
            conn = zk.connect()
            conn.disable_device()
            users = conn.get_users()
            target = next((u for u in users if str(u.user_id) == str(row['user_id'])), None)
            if target:
                conn.delete_user(uid=target.uid)
                print(f"[{device.ip}] Removed user {row['user_id']} from device.", flush=True)
            conn.enable_device()
            conn.disconnect()
        except Exception as e:
            print(f"Warning: could not remove user from device {device.ip}: {e}", flush=True)

    db.session.execute(
        db.text("DELETE FROM user_device_assignment WHERE id = :id"),
        {"id": assignment_id}
    )
    db.session.commit()
    return jsonify({'message': 'Assignment removed'}), 200


# POST /assignments/transfer  { user_id, source_device_id, target_device_id }
@assignments_bp.route('/assignments/transfer', methods=['POST'])
@token_required
def transfer_user():
    data = request.get_json()
    user_id         = str(data.get('user_id', ''))
    source_device_id = data.get('source_device_id')
    target_device_id = data.get('target_device_id')

    if not all([user_id, source_device_id, target_device_id]):
        return jsonify({'error': 'user_id, source_device_id and target_device_id are required'}), 400

    source = Device.query.get(source_device_id)
    target = Device.query.get(target_device_id)
    if not source or not target:
        return jsonify({'error': 'Source or target device not found'}), 404

    try:
        # Connect to source — get user record and their finger templates
        zk_src = ZK(source.ip, port=source.port or 4370, timeout=15,
                    password=0, force_udp=False, ommit_ping=True)
        conn_src = zk_src.connect()
        conn_src.disable_device()

        src_users = conn_src.get_users()
        src_user  = next((u for u in src_users if str(u.user_id) == user_id), None)
        if not src_user:
            conn_src.enable_device()
            conn_src.disconnect()
            return jsonify({'error': f'User {user_id} not found on source device {source.ip}'}), 404

        # get_templates() returns User objects that have a .fingers list
        # find the one matching our user's uid and grab their fingers
        all_template_users = conn_src.get_templates()
        src_fingers = []
        for tu in all_template_users:
            if tu.uid == src_user.uid:
                src_fingers = tu.fingers if hasattr(tu, 'fingers') and tu.fingers else []
                break

        # Fallback: try get_user_template per finger slot (0–9)
        if not src_fingers:
            from zk.finger import Finger
            for fid in range(10):
                try:
                    tmpl = conn_src.get_user_template(uid=src_user.uid, temp_id=fid)
                    if tmpl:
                        src_fingers.append(tmpl)
                except Exception:
                    pass

        conn_src.enable_device()
        conn_src.disconnect()

        print(f"[transfer] User {user_id}: found {len(src_fingers)} finger template(s) on {source.ip}", flush=True)

        # Connect to target — write the user + all their fingers in one call
        zk_tgt = ZK(target.ip, port=target.port or 4370, timeout=15,
                    password=0, force_udp=False, ommit_ping=True)
        conn_tgt = zk_tgt.connect()
        conn_tgt.disable_device()

        if src_fingers:
            # save_user_template writes user + fingers atomically
            conn_tgt.save_user_template(src_user, src_fingers)
        else:
            # No fingerprints enrolled — just copy the user record
            conn_tgt.set_user(
                uid=src_user.uid,
                name=src_user.name,
                privilege=src_user.privilege,
                password=src_user.password,
                user_id=src_user.user_id,
            )

        conn_tgt.enable_device()
        conn_tgt.disconnect()

        # Update assignments — remove from source, add to target
        db.session.execute(
            db.text("DELETE FROM user_device_assignment WHERE user_id = :uid AND device_id = :did"),
            {"uid": user_id, "did": source_device_id}
        )
        existing = db.session.execute(
            db.text("SELECT id FROM user_device_assignment WHERE user_id = :uid AND device_id = :did"),
            {"uid": user_id, "did": target_device_id}
        ).fetchone()
        if not existing:
            db.session.execute(
                db.text("INSERT INTO user_device_assignment (user_id, device_id) VALUES (:uid, :did)"),
                {"uid": user_id, "did": target_device_id}
            )
        db.session.commit()

        return jsonify({'message': f'User {user_id} transferred from {source.location or source.ip} to {target.location or target.ip}'}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Transfer failed: {str(e)}'}), 500


# POST /assignments/sync  — enforce assignments across all devices
@assignments_bp.route('/assignments/sync', methods=['POST'])
@token_required
def sync_assignments():
    try:
        # Get all assignments
        rows = db.session.execute(
            db.text("SELECT user_id, device_id FROM user_device_assignment")
        ).mappings().fetchall()

        if not rows:
            return jsonify({'message': 'No assignments to enforce', 'synced': 0, 'errors': []}), 200

        # Group by device
        from collections import defaultdict
        device_users = defaultdict(set)
        for r in rows:
            device_users[r['device_id']].add(str(r['user_id']))

        devices = Device.query.all()
        synced = 0
        errors = []

        for device in devices:
            allowed = device_users.get(device.id)
            if not allowed:
                continue  # No restrictions for this device — skip
            try:
                zk = ZK(device.ip, port=device.port or 4370, timeout=15,
                        password=0, force_udp=False, ommit_ping=True)
                conn = zk.connect()
                conn.disable_device()
                dev_users = conn.get_users()
                for u in dev_users:
                    if str(u.user_id) not in allowed:
                        conn.delete_user(uid=u.uid)
                        print(f"[{device.ip}] Sync removed unassigned user {u.user_id}", flush=True)
                        synced += 1
                conn.enable_device()
                conn.disconnect()
            except Exception as e:
                errors.append({'device': device.ip, 'error': str(e)})
                print(f"[{device.ip}] Sync error: {e}", flush=True)

        return jsonify({'message': 'Sync complete', 'removed': synced, 'errors': errors}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Sync failed: {str(e)}'}), 500


# POST /assignments/sync-fingerprints  { user_id }
# Scans all assigned devices for this user, merges all finger templates,
# and pushes the complete set back to every assigned device.
@assignments_bp.route('/assignments/sync-fingerprints', methods=['POST'])
@token_required
def sync_fingerprints():
    data = request.get_json()
    user_id = str(data.get('user_id', ''))
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    # Get all devices this user is assigned to
    rows = db.session.execute(
        db.text("""
            SELECT uda.device_id, d.ip, d.port, d.location
            FROM user_device_assignment uda
            JOIN device d ON d.id = uda.device_id
            WHERE uda.user_id = :uid
        """),
        {"uid": user_id}
    ).mappings().fetchall()

    if not rows:
        # No assignments — try all devices
        all_devices = Device.query.all()
        rows = [{"device_id": d.id, "ip": d.ip, "port": d.port, "location": d.location} for d in all_devices]

    if not rows:
        return jsonify({'error': 'No devices found'}), 404

    # Step 1 — Collect all finger templates from every device
    # fingers_by_fid = { fid: Finger } — last-write wins per slot
    fingers_by_fid = {}
    src_user_obj = None
    collect_log = []
    errors = []

    for row in rows:
        ip = row['ip']
        port = row['port'] or 4370
        try:
            zk = ZK(ip, port=port, timeout=15, password=0, force_udp=False, ommit_ping=True)
            conn = zk.connect()
            conn.disable_device()

            dev_users = conn.get_users()
            match = next((u for u in dev_users if str(u.user_id) == user_id), None)
            if not match:
                conn.enable_device()
                conn.disconnect()
                collect_log.append(f"[{ip}] User {user_id} not found — skipped")
                continue

            # Keep first found user object as the template for set_user
            if src_user_obj is None:
                src_user_obj = match

            # Get finger templates for this user
            all_tmpl_users = conn.get_templates()
            dev_fingers = []
            for tu in all_tmpl_users:
                if tu.uid == match.uid and hasattr(tu, 'fingers') and tu.fingers:
                    dev_fingers = tu.fingers
                    break

            # Fallback: per-slot fetch
            if not dev_fingers:
                from zk.finger import Finger
                for fid in range(10):
                    try:
                        tmpl = conn.get_user_template(uid=match.uid, temp_id=fid)
                        if tmpl:
                            dev_fingers.append(tmpl)
                    except Exception:
                        pass

            for f in dev_fingers:
                fingers_by_fid[f.fid] = f  # overwrite with latest

            conn.enable_device()
            conn.disconnect()
            collect_log.append(f"[{ip}] Collected {len(dev_fingers)} finger(s)")

        except Exception as e:
            errors.append(f"[{ip}] Collect error: {str(e)}")
            print(f"[sync-fingerprints] Collect error on {ip}: {e}", flush=True)
            traceback.print_exc()

    if src_user_obj is None:
        return jsonify({'error': f'User {user_id} not found on any device', 'log': collect_log + errors}), 404

    merged_fingers = list(fingers_by_fid.values())
    print(f"[sync-fingerprints] User {user_id}: merged {len(merged_fingers)} unique finger slot(s) from {len(rows)} device(s)", flush=True)

    # Step 2 — Push merged fingerprint set to every device
    push_log = []
    for row in rows:
        ip = row['ip']
        port = row['port'] or 4370
        try:
            zk = ZK(ip, port=port, timeout=15, password=0, force_udp=False, ommit_ping=True)
            conn = zk.connect()
            conn.disable_device()

            if merged_fingers:
                conn.save_user_template(src_user_obj, merged_fingers)
            else:
                # No fingerprints at all — just ensure user record exists
                conn.set_user(
                    uid=src_user_obj.uid,
                    name=src_user_obj.name,
                    privilege=src_user_obj.privilege,
                    password=src_user_obj.password,
                    user_id=src_user_obj.user_id,
                )

            conn.enable_device()
            conn.disconnect()
            push_log.append(f"[{ip}] Pushed {len(merged_fingers)} finger(s) ✓")
            print(f"[sync-fingerprints] Pushed to {ip} ✓", flush=True)

        except Exception as e:
            errors.append(f"[{ip}] Push error: {str(e)}")
            print(f"[sync-fingerprints] Push error on {ip}: {e}", flush=True)
            traceback.print_exc()

    return jsonify({
        'message': f'Synced {len(merged_fingers)} finger(s) across {len(rows)} device(s)',
        'fingers_merged': len(merged_fingers),
        'devices': len(rows),
        'collect_log': collect_log,
        'push_log': push_log,
        'errors': errors,
    }), 200