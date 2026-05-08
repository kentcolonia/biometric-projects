from zk import ZK, const
import time

def get_next_uid(conn):
    users = conn.get_users()
    if not users:
        return 1
    existing_uids = [user.uid for user in users]
    return max(existing_uids) + 1

def enroll_user_with_fingerprint(ip, port, name, user_id, password='', user_role=0, department=''):
    zk = ZK(ip, port=port, timeout=10, password=0, force_udp=False, ommit_ping=False)
    conn = None
    response = {}

    try:
        conn = zk.connect()
        response['connection'] = "Connected to device"

        uid = get_next_uid(conn)
        response['assigned_uid'] = uid

        conn.set_user(uid=uid, name=name, privilege=user_role, password=password, user_id=user_id)
        response['user'] = f"User {name} (ID: {user_id}) added with UID {uid}"

        conn.enroll_user(uid)
        response['enrollment'] = "Fingerprint enrollment initiated. Please use the device sensor."

        time.sleep(10)

        conn.enable_device()
        response['status'] = "Enrollment completed successfully"

    except Exception as e:
        response['error'] = str(e)

    finally:
        if conn:
            conn.disconnect()
            response['device'] = "Disconnected"

    return response
