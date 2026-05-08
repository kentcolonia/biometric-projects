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
        zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=False)
        conn = zk.connect()
        conn.disable_device()

        users = conn.get_users()
        user_list = [user.__dict__ for user in users]

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
            return jsonify({'status': 'error', 'message': f'Failed to connect to device at {ip}:{port}. Check IP, port, and device status.'}), 503

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
        new_card = int(data["card"])

        zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=False)
        conn = zk.connect()
        conn.disable_device()

        users = conn.get_users()
        user_found = False

        for user in users:
            if user.user_id == new_user_id and user.uid != uid:
                conn.enable_device()
                conn.disconnect()
                return jsonify({
                    "error": f"User ID '{new_user_id}' already exists for another user."
                }), 409

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

