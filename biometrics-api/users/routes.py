from flask import Blueprint, jsonify, request
from auth import token_required
from zk import ZK, const

users_bp = Blueprint('users', __name__)


@users_bp.route('/users', methods=['GET'])
@token_required
def get_all_users():
    ip = request.args.get('ip')
    port = request.args.get('port', default=4370, type=int)

    if not ip:
        return jsonify({'status': 'error', 'message': 'IP address is required'}), 400

    try:
        zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        conn.disable_device()

        users = conn.get_users()
        user_list = [{
            'uid': user.uid,
            'user_id': user.user_id,
            'name': user.name,
            'privilege': user.privilege,
            'password': user.password,
            'group_id': user.group_id,
            'card': user.card,
        } for user in users]

        conn.enable_device()
        conn.disconnect()

        return jsonify({'data': user_list})

    except TimeoutError:
        return jsonify({'status': 'error', 'message': 'Connection timed out. Device may be unreachable.'}), 504
    except ConnectionError:
        return jsonify({'status': 'error', 'message': f'Could not connect to device at {ip}:{port}. Connection error.'}), 502
    except Exception as e:
        message = str(e).lower()
        if "failed to connect" in message or "unreachable" in message or "timeout" in message:
            return jsonify({'status': 'error', 'message': f'Failed to connect to device at {ip}:{port}.'}), 503
        return jsonify({'status': 'error', 'message': f'Unexpected error: {str(e)}'}), 500


@users_bp.route('/users/<int:uid>', methods=['PUT'])
@token_required
def update_user(uid):
    try:
        data = request.get_json()

        required_fields = ["ip", "port", "user_id", "name", "password", "privilege"]
        missing = [field for field in required_fields if field not in data]
        if missing:
            return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

        ip = data["ip"]
        port = int(data["port"])
        new_user_id = data["user_id"]
        new_name = data["name"]
        new_password = data["password"]
        new_privilege = int(data["privilege"])
        new_card = int(data.get("card", 0))

        zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        conn.disable_device()

        users = conn.get_users()
        user_found = False

        for user in users:
            if user.user_id == new_user_id and user.uid != uid:
                conn.enable_device()
                conn.disconnect()
                return jsonify({"error": f"User ID '{new_user_id}' already exists for another user."}), 409

        for user in users:
            if user.uid == uid:
                user_found = True
                conn.set_user(
                    uid=uid,
                    user_id=new_user_id,
                    name=new_name,
                    privilege=new_privilege,
                    password=new_password,
                    card=new_card
                )
                print(f"User UID={uid} updated successfully.")
                break

        conn.enable_device()
        conn.disconnect()

        if not user_found:
            return jsonify({"error": f"User with UID {uid} not found on device"}), 404

        return jsonify({
            "message": "User updated successfully",
            "updated_user": {
                "uid": uid,
                "user_id": new_user_id,
                "name": new_name,
                "password": new_password,
                "privilege": new_privilege,
                "card": new_card
            }
        }), 200

    except Exception as e:
        print("Error processing user update:", str(e))
        return jsonify({"error": "Failed to update user", "message": str(e)}), 500


@users_bp.route('/users/<int:uid>', methods=['DELETE'])
@token_required
def delete_user(uid):
    try:
        data = request.get_json()
        ip = data.get('ip')
        port = int(data.get('port', 4370))

        if not ip:
            return jsonify({'error': 'IP address is required'}), 400

        zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        conn.disable_device()

        users = conn.get_users()
        user_found = any(user.uid == uid for user in users)

        if not user_found:
            conn.enable_device()
            conn.disconnect()
            return jsonify({'error': f'User with UID {uid} not found on device'}), 404

        conn.delete_user(uid=uid)

        conn.enable_device()
        conn.disconnect()

        return jsonify({'message': f'User UID={uid} deleted successfully'}), 200

    except Exception as e:
        print("Error deleting user:", str(e))
        return jsonify({'error': 'Failed to delete user', 'message': str(e)}), 500


@users_bp.route('/users/enroll', methods=['POST'])
@token_required
def enroll_user():
    try:
        data = request.get_json()

        required_fields = ["ip", "port", "name", "user_id", "privilege"]
        missing = [field for field in required_fields if field not in data]
        if missing:
            return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

        ip = data["ip"]
        port = int(data["port"])
        name = data["name"]
        user_id = str(data["user_id"])
        privilege = int(data["privilege"])
        password = data.get("password", "")
        card = int(data.get("card", 0))

        zk = ZK(ip, port=port, timeout=10, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        conn.disable_device()

        # Check for duplicate user_id
        users = conn.get_users()
        for user in users:
            if user.user_id == user_id:
                conn.enable_device()
                conn.disconnect()
                return jsonify({"error": f"User ID '{user_id}' already exists on this device."}), 409

        # Get next available UID
        existing_uids = [user.uid for user in users]
        uid = max(existing_uids) + 1 if existing_uids else 1

        conn.set_user(uid=uid, name=name, privilege=privilege, password=password, user_id=user_id, card=card)

        conn.enable_device()
        conn.disconnect()

        return jsonify({
            "message": f"User '{name}' enrolled successfully",
            "user": {
                "uid": uid,
                "user_id": user_id,
                "name": name,
                "privilege": privilege,
                "card": card
            }
        }), 201

    except Exception as e:
        print("Error enrolling user:", str(e))
        return jsonify({"error": "Failed to enroll user", "message": str(e)}), 500


@users_bp.route('/users/<int:uid>/enroll-finger', methods=['POST'])
@token_required
def enroll_finger(uid):
    try:
        data = request.get_json()
        ip = data.get('ip')
        port = int(data.get('port', 4370))
        finger_index = int(data.get('finger_index', 0))  # 0-9

        if not ip:
            return jsonify({'error': 'IP address is required'}), 400

        zk = ZK(ip, port=port, timeout=10, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        conn.disable_device()

        conn.enroll_user(uid=uid, temp_id=finger_index)

        conn.enable_device()
        conn.disconnect()

        return jsonify({
            "message": f"Fingerprint enrollment initiated for UID={uid}, finger {finger_index}. Ask the user to scan their finger on the device."
        }), 200

    except Exception as e:
        print("Error enrolling finger:", str(e))
        return jsonify({"error": "Failed to initiate fingerprint enrollment", "message": str(e)}), 500